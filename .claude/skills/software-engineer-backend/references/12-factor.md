# 12-Factor App — Audit Checklist

A lens for reviewing a backend's architecture, not just its code. Most factors are cheap to get
right up front and expensive to retrofit once an app is deployed as more than one instance. Several
factors are already covered in depth elsewhere in this skill — this file is the checklist that ties
them together and names the violation pattern to grep for.

## I. Codebase
One codebase tracked in version control, many deploys (dev/staging/prod all built from the same
repo/tag). Multiple apps sharing code is a sign to extract a shared package — never fork the repo.

## II. Dependencies
Explicitly declare every dependency in `package.json`; never rely on a globally installed tool
being present. Commit the lockfile (`package-lock.json` / `pnpm-lock.yaml`) so builds are
reproducible. Don't vendor dependencies by hand.

## III. Config — the one most often half-done
Store config in env vars, validated **once**, at startup, fail-fast (see SKILL.md §Config
validation). The common violation isn't "config isn't in env vars" — it's that a proper config
module exists and validates correctly, but other files read `process.env` directly anyway, each
with its own silently-diverging fallback default. Grep for it:

```bash
grep -rn "process\.env\." src | grep -v "config"
```

Any hit outside the config module is a candidate for dependency injection instead — pass the
validated value down as a parameter/constructor arg rather than re-reading and re-defaulting it.
Two concrete symptoms this produces:
- The same env var re-validated ad hoc in N call sites (e.g. every controller doing
  `if (!process.env.JWT_SECRET) return res.status(500)...`) instead of once at boot.
- The same fallback literal (`?? 'http://localhost:3000'`) duplicated in multiple files, which
  silently drifts out of sync when only some of the copies get updated.

## IV. Backing services
Treat the database, cache, queue, and SMTP relay as attached resources, reachable purely via a
URL/credential in config — swappable without a code change (local Postgres ↔ managed Postgres,
MailHog ↔ real SMTP relay). Never hardcode a host/port for a backing service.

## V. Build, release, run
Strictly separate: **build** (compile once into an immutable artifact) → **release** (that
artifact + config, tagged) → **run** (execute, no code changes at this stage). A single-stage
Dockerfile that installs devDependencies and never prunes them blurs this and ships build tooling
into production — see `references/deployment.md` §Multi-stage Dockerfile.

## VI. Processes — the one that breaks silently under scale
Execute as stateless, share-nothing processes. Anything that must persist goes to a backing store
(VI depends on IV), never to local memory or disk. The classic silent violation:
in-memory rate limiting or caching with no shared store. It works fine on one instance in dev, and
keeps "working" (i.e. not erroring) after a second replica is added — it just quietly stops
enforcing the limit correctly, since each replica counts independently and every restart resets
the counters for free. If a rate limiter or cache doesn't name a shared backing store (Redis),
assume it's process-local and ask whether that's intentional.

## VII. Port binding
The app is self-contained and exports its service via port binding (`app.listen(PORT)`) — it
doesn't depend on a runtime-injected webserver (e.g. Apache/IIS hosting the app).

## VIII. Concurrency
Scale out via more processes/replicas, not more threads inside one process. This only actually
works if VI holds — stateless processes are what make horizontal scaling safe rather than
silently lossy.

## IX. Disposability
Fast startup, and graceful shutdown on `SIGTERM`: stop accepting new connections, finish in-flight
work, close DB/queue/cache connections, then exit — with a hard timeout so a hung shutdown doesn't
block a deploy forever. Full pattern → `references/deployment.md` §Graceful shutdown. Also covers
crash safety: a process that dies mid-request should leave no corrupted state (idempotent job
handlers, transactional writes) since it will be killed and restarted without warning.

## X. Dev/prod parity
Keep dev, staging, and prod as similar as possible — same *types* of backing services everywhere
(real Postgres via docker-compose in dev, not SQLite-in-dev/Postgres-in-prod), and keep the gap
between writing code and deploying it small. A mocked backing service in dev that isn't even the
same technology as prod is where parity bugs hide.

## XI. Logs
Write logs as an unbuffered event stream to stdout; never manage log files, rotation, or routing
from inside the app itself — that's the execution environment's job (container runtime, log
aggregator). Full pattern → `references/observability.md` §Structured logging.

## XII. Admin processes
One-off tasks (migrations, backfills, a console/REPL) run as one-off processes in the same
environment, against the same config, as the long-running app — never folded into app boot (that
causes N replicas to race the same migration on every deploy). Full pattern →
`references/deployment.md` §Migrations run as their own step.

## Quick audit

When asked to review a backend against 12-factor, don't just read the code — grep it:

| Factor | Check | Red flag |
|---|---|---|
| III. Config | `grep -rn "process\.env\." src \| grep -v config` | Any hit outside the config module |
| III. Config | Search for repeated `?? 'fallback'` literals | Same default duplicated in 2+ files |
| VI. Processes | Does the rate limiter / cache declare a `store`? | No store option → in-memory, breaks under N replicas |
| V. Build/release | Does the Dockerfile have 2+ `FROM` stages? | Single-stage → devDeps ship to prod |
| IX. Disposability | Is there a `SIGTERM`/`SIGINT` handler? | Missing → deploys drop in-flight requests |
| XII. Admin processes | Do migrations run in a separate step/container? | Migrations run from app `server.ts`/boot |
| XI. Logs | Does the app write to a file or manage log rotation itself? | Any `fs.write`/rotation logic for logs |

## Checklist

- [ ] All config read from env vars, validated once at startup — no `process.env` reads outside
      the config module
- [ ] No hardcoded fallback defaults for required config duplicated across files
- [ ] Backing services (DB, cache, queue, SMTP) addressed only via config, never hardcoded
- [ ] Multi-stage Docker build; final image has no devDependencies
- [ ] No process-local state that must be consistent across replicas (rate limits, caches, sessions)
- [ ] `SIGTERM`/`SIGINT` handled: graceful drain, backing-service cleanup, timeout-forced exit
- [ ] Migrations run as a separate one-off step, not on app boot
- [ ] Logs go to stdout as structured JSON; nothing in-app manages log files/rotation
