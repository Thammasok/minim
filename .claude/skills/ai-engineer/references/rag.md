# RAG — Retrieval-Augmented Generation

RAG = give the model the right *knowledge* at answer time instead of hoping it memorized it.
Use it for private, large, or changing corpora. **Retrieval quality is the whole game** —
generation is easy once the right chunks are in context; garbage retrieval guarantees a garbage
answer no matter how good the model is.

> Boundary: this file owns the *AI design* — what to embed, how to chunk, how to rank, how to
> measure retrieval. The *infrastructure* — running Qdrant, creating collections, indexing,
> payload filtering, upsert code, connection handling — is `software-engineer-backend`'s
> `vector-db-qdrant.md`. Decide the strategy here; implement the DB there.

## Contents
- When RAG is (and isn't) the answer
- The pipeline
- Chunking strategy
- Embedding-model selection
- Retrieval: dense, hybrid, reranking
- Query transformation
- Evaluating retrieval (do not skip)
- Failure modes & fixes

---

## When RAG is (and isn't) the answer

RAG **when:** the knowledge is private / too large for the window / changes often, and the model
must ground answers in it (support docs, internal wiki, a codebase, a book library).

**Not** RAG when:
- The whole corpus fits comfortably in context and rarely changes → just put it in the prompt
  with prompt caching. Simpler, no retrieval failure surface.
- You need *behavior/format/style*, not facts → that's prompting or fine-tuning
  (`model-engineering.md`).
- The task needs multi-step reasoning over tools, not lookup → that's an agent (`agents.md`).
  (An agent may *use* RAG as one tool.)

---

## The pipeline

Two phases.

**Indexing (offline):** load → clean → **chunk** → embed → store (vector + payload/metadata).
**Query (online):** transform query → embed → retrieve (dense/hybrid) → **rerank** → assemble
context → generate → (optionally) cite.

Every arrow is a place quality leaks. Most teams over-invest in the DB and under-invest in
chunking, reranking, and evaluation — which is backwards.

---

## Chunking strategy

The highest-leverage and most-neglected decision. A chunk is the unit of retrieval: too big and
you dilute the embedding and blow the budget; too small and you sever context.

- **Chunk on structure, not character count.** Split on semantic boundaries — headings,
  paragraphs, code blocks, sections — not every N characters mid-sentence. Markdown/HTML/AST
  structure is a gift; use it.
- **Overlap** a little (~10–20%) so a fact spanning a boundary survives in at least one chunk.
- **Right-size to the content.** Dense reference text → smaller chunks; narrative/explanatory →
  larger. Typical starting range 200–800 tokens, but *tune against your eval set*, don't cargo-cult.
- **Attach metadata to every chunk** (source, title, section, date, permissions). It powers
  filtering, citation, and freshness — and lets you enforce access control at retrieval time.
- **Contextualize chunks** ("contextual retrieval"): prepend a short chunk-specific summary of
  where it sits in the doc before embedding, so an out-of-context snippet is still findable.
  Big recall win for structured/long docs.
- **Consider multi-representation:** embed a summary for retrieval but return the full chunk to
  the model; or index at multiple granularities (sentence + section).

If retrieval is bad, re-examine chunking *before* swapping the vector DB or the model.

---

## Embedding-model selection

The embedding model decides what "similar" means — it matters as much as the LLM.

- **Match the domain and language.** A general English model underperforms on code, legal, or
  Thai/multilingual text. For Thai or mixed Thai/English corpora, pick a strong multilingual
  embedding model and verify on your own data.
- **Dimensions & cost trade off.** Higher dims → better recall, more storage/compute. Some models
  support Matryoshka truncation (shorten vectors with graceful quality loss).
- **The query and the documents must use the same embedding model.** Changing the model means
  re-embedding the entire corpus — plan for it.
- **Self-hosted vs API:** for privacy/on-prem, host an open embedding model (see
  `model-engineering.md`); for convenience, a hosted embeddings API. Same swap-ability principle
  as LLMs.
- Check current model IDs, dimensions, and benchmarks via Context7 / MTEB at build time — the
  leaderboard moves.

---

## Retrieval: dense, hybrid, reranking

- **Dense (vector) search** finds semantic matches but can miss exact terms — names, IDs, error
  codes, rare keywords.
- **Keyword/lexical (BM25)** nails exact terms but misses paraphrase.
- **Hybrid = both, fused** (e.g. reciprocal rank fusion). Almost always beats either alone;
  make it the default for real corpora. (Fusion mechanics: backend's qdrant reference.)
- **Reranking** is the biggest quality lever after chunking. Retrieve a wide net (top 20–50) with
  fast vector/hybrid search, then re-score with a cross-encoder reranker and keep the top 3–8.
  The reranker reads query+chunk *together*, so it's far more precise than embedding similarity.
  Adds latency/cost on a small candidate set — usually worth it.
- **Retrieve wide, feed narrow.** Get many candidates, rerank hard, put only the best few in the
  prompt. Stuffing 20 mediocre chunks lowers accuracy (distraction) and cost.

---

## Query transformation

The user's raw question is often a poor search query.

- **Rewriting / expansion:** turn a terse or conversational question into a retrieval-friendly
  one; add synonyms.
- **Multi-query:** generate several query variants, retrieve for each, dedupe/fuse — improves
  recall for under-specified questions.
- **HyDE:** generate a hypothetical answer and embed *that* to retrieve — the answer often sits
  closer to the target chunks than the question does.
- **Decomposition:** split a compound question into sub-questions, retrieve per sub-question.
  (When this gets dynamic, you're building an agent — see `agents.md`.)
- **Conversational RAG:** resolve pronouns/context from history into a standalone query before
  retrieving, or you'll retrieve for "what about the second one?" literally.

Each adds latency/cost — add only what your eval shows you need.

---

## Evaluating retrieval (do not skip)

You cannot improve retrieval you don't measure, and end-to-end answer quality hides *where* it
broke. Evaluate the two stages separately.

- **Retrieval metrics** (needs a small labeled set: query → which chunks are relevant):
  - *Recall@k* — did the relevant chunk make it into the top k? If recall is low, no prompt will
    save you; fix chunking/embedding/hybrid/rerank.
  - *Precision@k / MRR / nDCG* — are the right chunks ranked high?
- **Generation metrics** (given good context, is the answer good?):
  - *Faithfulness / groundedness* — is the answer supported by the retrieved context, or
    hallucinated? (LLM-as-judge — see `evaluation-and-llmops.md`.)
  - *Answer relevance* — does it address the question?
- **Diagnose by splitting:** bad answer + good retrieval → generation/prompt problem. Bad answer +
  bad retrieval → retrieval problem. Fix the right one.

Build ~20–50 golden Q/A/relevant-chunk examples early; regression-test every change against them.

---

## Failure modes & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Right doc exists but never retrieved | chunking severs context; wrong embedding model; no hybrid | fix chunking; add keyword/hybrid; contextual chunks |
| Retrieves related-but-wrong chunks | no reranking; chunks too big | add cross-encoder rerank; smaller chunks |
| Answer ignores good context | context buried in middle; weak prompt | reorder best chunks to edges; instruct "answer only from context" |
| Confidently makes things up | no "I don't know" fallback; low-relevance chunks passed anyway | add abstention instruction; threshold on rerank score |
| Exact terms/IDs never found | pure vector search | add BM25/hybrid |
| Stale answers | no freshness metadata / re-index | timestamp chunks; re-index on change; filter by date |
| Fine at 10 docs, wrong at 10k | no reranking; naive top-k | wide retrieve → rerank → narrow feed |
