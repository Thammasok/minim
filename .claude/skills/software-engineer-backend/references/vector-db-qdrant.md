# Qdrant — Vector Database & Semantic Search

A vector database stores high-dimensional embeddings and finds the *nearest* ones to a query
vector. Use it for **semantic** problems where meaning matters, not exact matches.

## When you actually need a vector DB

Reach for it when the task is "find things *similar in meaning*":
- **RAG** — retrieve relevant document chunks to ground an LLM answer
- **Semantic / "search by meaning"** — query "how do I cancel" matches "subscription termination"
- **Recommendations / "find similar"** — related products, articles, images
- **Deduplication / clustering** — near-duplicate detection

Do **not** use it for exact lookups, filtering, or transactional data — that's still
PostgreSQL/Prisma. A vector DB complements the relational DB; it rarely replaces it.

### Qdrant vs alternatives
| Option | Pick when |
|---|---|
| **pgvector** (Postgres extension) | Already on Postgres, < a few million vectors, want one DB to operate |
| **Qdrant** | Need a dedicated, fast vector service with rich payload filtering + hybrid search, scaling to many millions |
| Pinecone / Weaviate / Milvus | Managed SaaS preference, or existing standardization |

Rule of thumb: start with **pgvector** if you're already on Postgres and small; graduate to
**Qdrant** when vector volume, filtering complexity, or latency needs outgrow it.

## Core concepts

- **Embedding** — a fixed-length float vector from a model (e.g. OpenAI `text-embedding-3-small`
  → 1536 dims). Similar meaning ⇒ vectors close together.
- **Collection** — like a table; has a fixed vector `size` (dimension) and `distance` metric.
- **Point** — one record: `{ id, vector, payload }`.
- **Payload** — arbitrary JSON metadata stored with the vector (source, tags, timestamps) used
  for filtering and for citing sources back to the user.
- **Distance metric** — `Cosine` (default for normalized text embeddings), `Dot`, or `Euclid`.
  Must match what the embedding model expects (OpenAI/most sentence models → Cosine).

**Critical invariant:** the embedding model and its dimension are fixed *per collection*. Every
vector you upsert and every query vector must come from the **same model**. Change the model ⇒
new collection + re-embed everything.

## Setup

```bash
# Run Qdrant as a service (own container, not embedded in your app)
docker run -p 6333:6333 -p 6334:6334 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant

npm install @qdrant/js-client-rest
npm install openai   # or any embedding provider
```

### Client singleton
```typescript
// lib/qdrant.ts
import { QdrantClient } from '@qdrant/js-client-rest'

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,   // required for Qdrant Cloud
})
```

### Create a collection (once, idempotently)
```typescript
const COLLECTION = 'documents'
const VECTOR_SIZE = 1536   // must equal your embedding model's dimension

const exists = await qdrant.collectionExists(COLLECTION)
if (!exists.exists) {
  await qdrant.createCollection(COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
  })
  // Index payload fields you'll filter on — filtering is far faster with an index
  await qdrant.createPayloadIndex(COLLECTION, { field_name: 'source', field_schema: 'keyword' })
  await qdrant.createPayloadIndex(COLLECTION, { field_name: 'tenant_id', field_schema: 'keyword' })
}
```

## Embedding helper

```typescript
// lib/embed.ts
import OpenAI from 'openai'
const openai = new OpenAI()

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',   // 1536 dims — must match VECTOR_SIZE
    input: texts,
  })
  return res.data.map((d) => d.embedding)
}
```

## Upsert points

```typescript
import { randomUUID } from 'crypto'

async function indexChunks(chunks: { text: string; source: string }[]) {
  const vectors = await embed(chunks.map((c) => c.text))   // batch, don't loop 1-by-1

  await qdrant.upsert(COLLECTION, {
    wait: true,
    points: chunks.map((c, i) => ({
      id: randomUUID(),                 // UUID or unsigned int; deterministic id ⇒ idempotent re-index
      vector: vectors[i],
      payload: { text: c.text, source: c.source, indexed_at: Date.now() },
    })),
  })
}
```
Store the original `text` in the payload so retrieval returns usable content (and a source to
cite) without a second DB round-trip.

## Search (k-NN)

```typescript
async function search(query: string, k = 5) {
  const [qVector] = await embed([query])

  const results = await qdrant.search(COLLECTION, {
    vector: qVector,
    limit: k,
    score_threshold: 0.3,     // drop weak matches; tune per model/data
    with_payload: true,
  })

  return results.map((r) => ({
    score: r.score,
    text: r.payload?.text as string,
    source: r.payload?.source as string,
  }))
}
```

## Filtering by payload

Combine semantic similarity with hard metadata constraints (multi-tenancy, permissions, recency):

```typescript
const results = await qdrant.search(COLLECTION, {
  vector: qVector,
  limit: 5,
  filter: {
    must: [{ key: 'tenant_id', match: { value: tenantId } }],       // AND
    should: [{ key: 'source', match: { value: 'handbook' } }],      // OR (boosts)
    must_not: [{ key: 'archived', match: { value: true } }],        // NOT
  },
  with_payload: true,
})
```
Always filter `tenant_id` / user scope in multi-tenant apps — never rely on similarity alone
to keep tenants' data separate.

## Hybrid search (dense + keyword)

Pure vector search can miss exact keywords, IDs, or rare terms. Hybrid combines dense
(semantic) with sparse/keyword (BM25-style) and fuses the rankings. Qdrant supports this via
named vectors + the Query API with fusion:

```typescript
// Collection with both a dense and a sparse vector, queried and fused (RRF)
const results = await qdrant.query(COLLECTION, {
  prefetch: [
    { query: denseVector, using: 'dense', limit: 20 },
    { query: sparseVector, using: 'sparse', limit: 20 },
  ],
  query: { fusion: 'rrf' },   // reciprocal rank fusion
  limit: 5,
  with_payload: true,
})
```
Reach for hybrid when users search by names/codes/jargon that embeddings alone rank poorly.

## RAG pipeline (the common end-to-end)

```
Ingest (offline):   docs → chunk → embed → upsert to Qdrant (with source payload)
Query  (per req):   question → embed → search (+filter) → top-k chunks
                    → build prompt (context + question) → LLM → answer + cite sources
```

```typescript
async function answer(question: string, tenantId: string) {
  const [qVec] = await embed([question])
  const hits = await qdrant.search(COLLECTION, {
    vector: qVec,
    limit: 5,
    filter: { must: [{ key: 'tenant_id', match: { value: tenantId } }] },
    with_payload: true,
  })

  const context = hits.map((h, i) => `[${i + 1}] ${h.payload?.text}`).join('\n\n')
  const prompt = `Answer using ONLY the context. Cite sources as [n].\n\nContext:\n${context}\n\nQ: ${question}`
  // → send prompt to your LLM; return answer + the source list from hits' payloads
  return { prompt, sources: hits.map((h) => h.payload?.source) }
}
```

### Chunking (matters more than the DB choice)
- Split on semantic boundaries (paragraphs/headings), not fixed byte counts.
- Target ~200–500 tokens per chunk with ~10–15% overlap so context isn't cut mid-thought.
- Keep source metadata (doc id, section, url) on every chunk for citation + filtering.
- Too-large chunks dilute relevance; too-small chunks lose context. Tune on real queries.

## Best practices

- **One embedding model per collection.** Store the model name/version in config; re-embed on change.
- **Batch upserts and embeddings** (hundreds per call) — never one network round-trip per chunk.
- **Index payload fields** you filter on (`createPayloadIndex`) — unindexed filters get slow.
- **Deterministic point IDs** (hash of source+chunk) make re-indexing idempotent instead of duplicating.
- **Normalize + threshold**: use Cosine for text models and a `score_threshold` to cut noise.
- **Quantization** (scalar/binary) cuts memory ~4–32× at large scale with minor recall loss — enable when RAM-bound.
- **Snapshots** for backup; Qdrant state is not in your Postgres backups.
- **Separate the service** in deploy (its own container/pod + volume); size RAM to vector count × dims.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Wrong vector dimension` error | Query/point vector size ≠ collection size | Match `VECTOR_SIZE` to the model's output dims |
| Irrelevant results | Mixed embedding models, or no threshold | One model per collection; add `score_threshold` |
| Slow filtered queries | Filtering on unindexed payload | `createPayloadIndex` on filtered fields |
| Duplicates after re-index | Random IDs each run | Use deterministic IDs (content hash) |
| Cross-tenant data leak | Similarity without a scope filter | Always add a `tenant_id`/user `must` filter |
| Good keyword matches missed | Pure dense search | Add sparse vector + hybrid fusion |
| Retrieval returns no usable text | Only stored the vector | Keep original `text` + `source` in payload |
