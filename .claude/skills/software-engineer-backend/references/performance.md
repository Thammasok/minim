# Performance Reference

## Redis Caching

```typescript
// lib/cache.ts
import { redis } from './redis'

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const val = await redis.get(key)
    return val ? JSON.parse(val) : null
  },
  async set(key: string, value: unknown, ttlSeconds = 300) {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  },
  async del(key: string) {
    await redis.del(key)
  }
}

// Cache-aside pattern in service
async getProduct(id: string) {
  const cacheKey = `product:${id}`
  const cached = await cache.get<Product>(cacheKey)
  if (cached) return cached

  const product = await prisma.product.findUniqueOrThrow({ where: { id } })
  await cache.set(cacheKey, product, 600)  // 10 min TTL
  return product
}

// Invalidate on update
async updateProduct(id: string, data: UpdateProductDto) {
  const updated = await prisma.product.update({ where: { id }, data })
  await cache.del(`product:${id}`)
  return updated
}
```

## Database Indexing (PostgreSQL)

```sql
-- Index for filtering
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite index (order matters — most selective first)
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Partial index (only index active records)
CREATE INDEX idx_users_active ON users(email) WHERE deleted_at IS NULL;

-- Check query plan
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = '123' AND status = 'pending';
-- Look for "Index Scan" vs "Seq Scan"
```

In Prisma schema:
```prisma
model Order {
  userId String
  status String
  @@index([userId, status])
}
```

## Connection Pooling

```typescript
// Prisma uses connection pool by default
// Tune via DATABASE_URL params:
// postgresql://user:pass@host/db?connection_limit=10&pool_timeout=20

// For Serverless (Vercel, Lambda):
// Use @prisma/adapter-neon or PgBouncer to avoid connection exhaustion
```

## Pagination — always paginate lists

```typescript
// Cursor-based (preferred for large datasets / infinite scroll)
async getOrders(cursor?: string, limit = 20) {
  return prisma.order.findMany({
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { createdAt: 'desc' },
  })
}

// Offset-based (simpler, good for paginated UIs with page numbers)
async getOrders(page = 1, pageSize = 20) {
  const [data, total] = await prisma.$transaction([
    prisma.order.findMany({ skip: (page - 1) * pageSize, take: pageSize }),
    prisma.order.count(),
  ])
  return { data, total, pages: Math.ceil(total / pageSize) }
}
```

## Avoid blocking the event loop

```typescript
// ❌ CPU-intensive work blocks all requests
app.get('/compress', (req, res) => {
  const result = heavyCpuWork(req.body)  // blocks
  res.json(result)
})

// ✅ Offload to worker thread
import { Worker } from 'worker_threads'
app.get('/compress', (req, res) => {
  const worker = new Worker('./workers/compress.js', { workerData: req.body })
  worker.on('message', (result) => res.json(result))
  worker.on('error', (err) => res.status(500).json({ error: err.message }))
})

// Or offload to queue (BullMQ) for async processing
```
