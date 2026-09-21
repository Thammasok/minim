# CI/CD Reference

## Pipeline structure — universal pattern

```
lint/format check
  → unit tests (with coverage gate)
  → build artifact / Docker image
  → security scan (SAST + image CVE scan)
  → push to registry
  → deploy to staging (auto)
  → integration / smoke tests
  → deploy to production (manual gate or PR merge)
```

---

## GitHub Actions — Production workflow

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE: ${{ github.repository }}

jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage

      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build-scan-push:
    needs: lint-test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      security-events: write

    outputs:
      image-digest: ${{ steps.push.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE }}
          tags: |
            type=sha,prefix=sha-
            type=semver,pattern={{version}}

      - name: Build and push
        id: push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE }}:sha-${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          exit-code: 1
          severity: HIGH,CRITICAL

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

  deploy-staging:
    needs: build-scan-push
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging (Helm)
        run: |
          helm upgrade --install my-service ./charts/my-service \
            --namespace staging \
            --set image.tag=sha-${{ github.sha }} \
            --set image.digest=${{ needs.build-scan-push.outputs.image-digest }} \
            --wait --timeout=5m

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://my-service.example.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          helm upgrade --install my-service ./charts/my-service \
            --namespace production \
            --set image.tag=sha-${{ github.sha }} \
            --wait --timeout=10m
```

---

## GitLab CI — equivalent pipeline

```yaml
stages: [lint, test, build, scan, deploy-staging, deploy-production]

variables:
  IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

.docker:
  image: docker:24
  services: [docker:24-dind]

lint:
  stage: lint
  image: node:20-alpine
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths: [node_modules/]
  script: [npm ci, npm run lint]

test:
  stage: test
  image: node:20-alpine
  script: [npm ci, npm test -- --coverage]
  coverage: '/Lines\s*:\s*(\d+(?:\.\d+)?)%/'

build:
  extends: .docker
  stage: build
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker buildx build --push --tag $IMAGE .

scan:
  stage: scan
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $IMAGE
  allow_failure: false

deploy-staging:
  stage: deploy-staging
  environment: staging
  script:
    - helm upgrade --install my-service ./charts/my-service --set image.tag=$CI_COMMIT_SHORT_SHA --wait
  only: [main]

deploy-production:
  stage: deploy-production
  environment: production
  script:
    - helm upgrade --install my-service ./charts/my-service --set image.tag=$CI_COMMIT_SHORT_SHA --wait
  when: manual
  only: [main]
```

---

## Key CI/CD patterns

### Cache strategies (GitHub Actions)
```yaml
# Node.js
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-npm-

# Docker layer cache — use BuildKit gha cache (shown in main example)
```

### Matrix builds (test across multiple versions)
```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, windows-latest]
```

### Reusable workflows (GitHub Actions)
```yaml
# .github/workflows/reusable-deploy.yml
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image-tag:
        required: true
        type: string
```

### Secrets — never hardcode
- GitHub: Settings → Secrets and Variables → Actions
- GitLab: Settings → CI/CD → Variables (mask sensitive values)
- Vault dynamic secrets: use `vault-action` to fetch short-lived credentials at runtime

### Branch protection rules (always enforce)
- Require PR review before merge
- Require status checks (CI must pass)
- Require signed commits for production-facing repos
- No direct push to `main`/`release/*`
