# GraphQL — Server-Side

GraphQL exposes one endpoint where clients ask for exactly the fields they need. On the
backend the work shifts from designing endpoints to designing a **schema + resolvers**, and
the defining challenge is the **N+1 query problem** (solved with DataLoader).

## When GraphQL vs REST

| Use REST | Use GraphQL |
|---|---|
| Simple/public API, clear resources | Clients need flexible field selection |
| HTTP caching is critical | Many clients (web + mobile) with different needs |
| File up/download, webhooks | Deeply nested/related data, over/under-fetching is a pain |

Don't add GraphQL by reflex — it moves caching, rate limiting, and query-cost control from
free (HTTP) to your responsibility.

## Stack

```
Server:      GraphQL Yoga (light) | Apollo Server (ecosystem)
Schema:      Pothos (code-first, type-safe) | SDL-first with @graphql-tools
Batching:    DataLoader (mandatory for relations)
Validation:  graphql-armor / envelop plugins (depth + cost limits)
```

Prefer **code-first (Pothos)** on TypeScript backends — the schema is derived from typed
builders so types can't drift from resolvers.

## Schema design (SDL for illustration)

```graphql
type User {
  id: ID!
  email: String!
  posts: [Post!]!            # relation — the N+1 risk
}

type Post {
  id: ID!
  title: String!
  author: User!
}

type Query {
  user(id: ID!): User
  posts(first: Int!, after: String): PostConnection!   # cursor pagination
}

input CreatePostInput { title: String!, authorId: ID! }

type Mutation {
  createPost(input: CreatePostInput!): Post!
}

type Subscription {
  postCreated: Post!
}
```

Rules: non-null (`!`) by default, relax only when a field can truly be absent. Use `input`
types for mutation args. One mutation = one business operation, named `verbNoun`.

## Resolvers

```typescript
const resolvers = {
  Query: {
    user: (_parent, { id }, ctx) => ctx.db.user.findUnique({ where: { id } }),
  },
  User: {
    // Field resolver — runs once PER user in a list ⇒ N+1 without batching
    posts: (user, _args, ctx) => ctx.loaders.postsByAuthor.load(user.id),
  },
  Mutation: {
    createPost: (_p, { input }, ctx) => {
      if (!ctx.userId) throw new GraphQLError('Unauthenticated', { extensions: { code: 'UNAUTHENTICATED' } })
      return ctx.db.post.create({ data: input })
    },
  },
}
```

## The N+1 problem + DataLoader (the key backend concern)

A query for 100 users with their posts naively fires 1 query for users + 100 for posts.
DataLoader **batches** all `.load(id)` calls in one tick into a single query and caches within
the request.

```typescript
// loaders.ts — created fresh PER REQUEST (never shared across requests)
import DataLoader from 'dataloader'

export function createLoaders(db) {
  return {
    postsByAuthor: new DataLoader<string, Post[]>(async (authorIds) => {
      const posts = await db.post.findMany({ where: { authorId: { in: [...authorIds] } } })
      const byAuthor = new Map<string, Post[]>()
      for (const p of posts) {
        ;(byAuthor.get(p.authorId) ?? byAuthor.set(p.authorId, []).get(p.authorId)!).push(p)
      }
      // MUST return results in the SAME ORDER as the input keys
      return authorIds.map((id) => byAuthor.get(id) ?? [])
    }),
  }
}
```
Two non-negotiables: build loaders **per request** (stale cache/data leak otherwise) and
**return the batch in input-key order** (DataLoader maps positionally).

## Context (auth + loaders per request)

```typescript
const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const userId = token ? verifyAccessToken(token).sub : null
    return { db, userId, loaders: createLoaders(db) }   // fresh loaders each request
  },
})
```

## Errors

- Throw `GraphQLError` with an `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
  `BAD_USER_INPUT`) — clients switch on the code, not the message string.
- Never leak stack traces / internal messages in production (mask via envelop `maskedErrors`).
- Partial data + `errors[]` is normal in GraphQL — design clients to handle it.

## Cursor pagination (Relay connections)

```graphql
type PostConnection { edges: [PostEdge!]!, pageInfo: PageInfo! }
type PostEdge { node: Post!, cursor: String! }
type PageInfo { hasNextPage: Boolean!, endCursor: String }
```
Prefer cursor (keyset) over offset for large lists — stable under inserts and faster deep in
the list. Encode the cursor (e.g. base64 of `created_at,id`).

## Subscriptions (realtime)

Use for server-push events. Transport is WebSocket (`graphql-ws`) or SSE. Back the PubSub with
Redis in multi-instance deploys so events fan out across pods.

```typescript
Subscription: {
  postCreated: { subscribe: (_p, _a, ctx) => ctx.pubsub.subscribe('POST_CREATED') },
}
// in createPost: ctx.pubsub.publish('POST_CREATED', { postCreated: post })
```

## Security (GraphQL-specific — easy to forget)

- **Query depth limit** + **cost/complexity analysis** — a nested query can DoS you; cap it.
- **Disable introspection in production** (or restrict to authenticated internal tools).
- **Persisted queries** (allowlist) for public apps — clients send a hash, not arbitrary queries.
- **Rate limit** at the HTTP layer *and* per-field for expensive resolvers.
- Enforce **authz in resolvers/field level**, never rely on the client not asking for a field.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Hundreds of queries per request | Relation resolver without batching | DataLoader per relation |
| Data from another user appears | Loader shared across requests | Create loaders in `context` per request |
| Wrong rows mapped to keys | Loader didn't preserve input order | Return array aligned to `keys` |
| Server hangs on a crafted query | No depth/cost limit | Add depth + complexity plugins |
| Internal errors leak to client | Unmasked errors in prod | `maskedErrors`, coded `GraphQLError` |
