# Containers Reference

## Dockerfile — Production Template

```dockerfile
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20.14-alpine AS builder
WORKDIR /app

# Copy dependency manifests first (layer cache optimization)
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20.14-alpine AS runtime

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

# Copy only built artifacts
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

ENTRYPOINT ["node", "dist/server.js"]
```

## Language-specific base images

| Stack | Recommended base |
|---|---|
| Node.js | `node:20-alpine` |
| Python | `python:3.12-slim` |
| Go | `golang:1.22-alpine` (build) → `gcr.io/distroless/static` (runtime) |
| Java | `eclipse-temurin:21-jre-alpine` |
| Rust | `rust:1.78-alpine` (build) → `gcr.io/distroless/static` (runtime) |

## Security hardening

```dockerfile
# Drop all capabilities, add only what's needed
# (set in K8s securityContext, not Dockerfile)

# Read-only root filesystem pattern — create explicit writable dirs
RUN mkdir -p /app/tmp /app/logs
VOLUME ["/app/tmp", "/app/logs"]
```

## Image size reduction checklist
- Use Alpine or Distroless as runtime base
- Multi-stage: don't ship build tools
- `.dockerignore` — exclude `node_modules`, `.git`, test files, docs
- Combine `RUN` commands with `&&` to reduce layers
- `--no-cache` flag for package managers in CI

## Image scanning

```bash
# Trivy (open source)
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:v1.2.3

# Grype
grype myapp:v1.2.3 --fail-on high

# In CI — fail the build on HIGH/CRITICAL, report MEDIUM
```

## Docker Compose (local dev only — not for production)

```yaml
version: "3.9"
services:
  app:
    build:
      context: .
      target: runtime          # target the runtime stage
    environment:
      - NODE_ENV=development
    env_file: .env.local        # never commit .env files
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d mydb"]
      interval: 10s
      retries: 5
```

## Container registry best practices
- Tag with git SHA + semantic version: `myapp:v1.2.3-abc1234`
- Never use `latest` in production deployments
- Enable vulnerability scanning in the registry (ECR, GAR, ACR all have native scanning)
- Set up image lifecycle policies to delete untagged images older than N days
- Use cosign to sign images: `cosign sign --key cosign.key myapp:v1.2.3`
