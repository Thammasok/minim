# Deployment — Docker & Ship Checklist

Getting a Node/TS backend to production reliably: a lean image, clean local orchestration,
shutdowns that don't drop requests, and migrations that run as their own step.

## Multi-stage Dockerfile

Build (with dev deps + TS) in one stage, ship only the compiled output + prod deps in the next.
Result is smaller, faster to pull, and has less attack surface.

```dockerfile
# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                        # includes devDeps for the build
COPY . .
RUN npm run build                 # tsc → dist/
RUN npm prune --omit=dev          # drop devDeps from node_modules

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node                         # never run as root
EXPOSE 3000
# exec form ⇒ node is PID 1 and receives SIGTERM (needed for graceful shutdown)
CMD ["node", "dist/server.js"]
```

Key points: `npm ci` (not `install`) for reproducible builds; copy `package*.json` before
source so the deps layer caches; `USER node`; **exec-form `CMD`** so signals reach the process.

### .dockerignore
```
node_modules
dist
.env
.git
*.log
Dockerfile
docker-compose.yml
```
Prevents secrets/local junk from entering the image and busting the build cache.

## docker-compose (local dev)

```yaml
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/app
      REDIS_URL: redis://redis:6379
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }
  db:
    image: postgres:16
    environment: { POSTGRES_USER: dev, POSTGRES_PASSWORD: dev, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      retries: 5
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```
`depends_on: condition: service_healthy` waits for Postgres to actually accept connections,
not just for the container to start.

## Graceful shutdown (don't drop in-flight requests)

On deploy the orchestrator sends `SIGTERM`. Stop accepting new connections, finish in-flight
work, close DB/Redis/queue, then exit. Skipping this drops live requests and leaks connections.

```typescript
// server.ts
const server = app.listen(config.PORT)

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(async () => {          // stop accepting new requests, drain existing
    await worker?.close()             // let running jobs finish
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()  // hard cap if drain hangs
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

## Migrations run as their own step — never on app boot

Running migrations in app startup causes races (N replicas migrate at once) and couples deploy
to boot. Run them as a **separate pipeline step / init job** before the new version serves.

```bash
# CI/CD deploy sequence
npx prisma migrate deploy      # or: knex migrate:latest — one runner, before rollout
# then roll out the new app image
```
- Prefer **backward-compatible (expand/contract)** migrations so old + new code run during rollout.
- Never auto-run `migrate dev` in production (it can reset/prompt). Use `migrate deploy`.

## Config & secrets

- 12-factor: **all config via env vars**, validated at startup (`references` §Config — fail fast).
- Secrets from the platform's secret manager (Railway/Render/AWS SSM/Vault) — **never baked into
  the image or committed**.
- Keep a `.env.example` (keys only, no values) in the repo.

## Production checklist

- [ ] Multi-stage image, `NODE_ENV=production`, runs as non-root
- [ ] Exec-form `CMD`; graceful `SIGTERM` handling verified
- [ ] `/health` (liveness) + `/ready` (deep-checks DB/Redis) wired to the orchestrator
- [ ] Migrations run as a separate step, backward-compatible
- [ ] Secrets from a manager, not the image; `.dockerignore` excludes `.env`
- [ ] Resource limits (CPU/mem) + replica count set; restart policy defined
- [ ] Structured logs to stdout (see `references/observability.md`)
- [ ] `npm audit` / image scan clean before promote

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Container ignores Ctrl-C / SIGTERM | Shell-form `CMD` (node not PID 1) | Use exec-form `CMD ["node", ...]` |
| Requests dropped on every deploy | No graceful shutdown | `server.close()` + drain on SIGTERM |
| Random migration failures on deploy | Replicas migrate concurrently on boot | Migrate in one pre-rollout step |
| Secrets leaked in image | Copied `.env` / no `.dockerignore` | Exclude `.env`, inject at runtime |
| Huge image / slow pulls | Single-stage with devDeps | Multi-stage + `npm prune --omit=dev` |
