---
name: twelve-factor-app
description: Reference guide to the Twelve-Factor App methodology — twelve principles for building portable, scalable, cloud-native SaaS apps, each with its practices plus a quick-reference table.
---

# The Twelve-Factor App

A methodology for building software-as-a-service apps that are portable, scalable, and easy to deploy on modern cloud platforms. Originally formulated by Adam Wiggins and the team at Heroku (2011), it remains a strong baseline for designing web apps and services regardless of language or backing services.

**Core goals:** minimize the cost of onboarding new developers, keep dev/prod parity high, deploy cleanly to cloud platforms, and scale up without significant re-architecture.

---

## I. Codebase
*One codebase tracked in revision control, many deploys.*

- One app = one codebase (in Git, etc.), with a one-to-one relationship between codebase and app.
- Multiple codebases means it's a distributed system, not one app — each component is its own twelve-factor app.
- Many **deploys** (production, staging, per-developer local) all share the same codebase, though they may run different versions.
- Shared code belongs in libraries pulled in via the dependency manager, not copied between codebases.

## II. Dependencies
*Explicitly declare and isolate dependencies.*

- Never rely on system-wide packages being present. Declare all dependencies precisely in a manifest (`package.json`, `requirements.txt`, `go.mod`, `pom.xml`).
- Use dependency isolation so no implicit dependencies leak in from the surrounding system (virtualenvs, `node_modules`, containers).
- This also applies to system tools (e.g. `curl`, ImageMagick) — vendor them rather than assuming they exist.

## III. Config
*Store config in the environment.*

- Config is everything that varies between deploys: credentials, hostnames, resource handles, per-deploy values.
- Keep it strictly separate from code — the litmus test is whether the codebase could be open-sourced right now without leaking secrets.
- Store config in **environment variables**, not in config files checked into the repo or grouped into named "environments" (that pattern doesn't scale as deploys multiply).

## IV. Backing Services
*Treat backing services as attached resources.*

- A backing service is anything the app consumes over the network: databases, message queues, caches, SMTP, third-party APIs.
- Make no distinction between local and third-party services — both are attached resources referenced by a URL/handle in config.
- Resources can be attached and detached without code changes. Swapping a local Postgres for a managed one should be a config change only.

## V. Build, Release, Run
*Strictly separate build and run stages.*

- **Build:** convert code into an executable bundle (compile, fetch dependencies, bundle assets).
- **Release:** combine the build with the current config to produce an immutable, uniquely-versioned release.
- **Run:** execute the release in the target environment.
- Releases are immutable and append-only; any change means a new release. This enables easy rollback and prevents runtime code edits.

## VI. Processes
*Execute the app as one or more stateless processes.*

- Processes are **stateless** and **share-nothing**. Any data that must persist goes to a stateful backing service (database, object store).
- Never assume anything cached in memory or on local disk survives to a future request — it may be served by a different process.
- Sticky sessions are a violation; keep session state in a datastore like Redis with expiry.

## VII. Port Binding
*Export services via port binding.*

- The app is self-contained and exports HTTP (or another protocol) by binding to a port — it doesn't rely on runtime injection of a webserver (no Apache/Tomcat requirement baked into the runtime).
- One app can become the backing service for another simply by pointing at a URL/port.

## VIII. Concurrency
*Scale out via the process model.*

- Scale horizontally by running more processes, not just by making one process bigger.
- Organize work into **process types** (web, worker, scheduler) and scale each independently based on load.
- Rely on the OS/platform process manager for the process formation; don't daemonize or write PID files.

## IX. Disposability
*Maximize robustness with fast startup and graceful shutdown.*

- Processes should **start fast** (seconds) — this aids rapid scaling and deploys.
- Shut down **gracefully** on `SIGTERM`: stop accepting new work, finish current requests, release resources.
- Be robust against sudden death (hardware failure). Use queues that return unfinished jobs, and design operations to be idempotent/re-runnable.

## X. Dev/Prod Parity
*Keep development, staging, and production as similar as possible.*

- Minimize three gaps:
  - **Time:** ship code hours after it's written, not weeks.
  - **Personnel:** the people who write code deploy and operate it.
  - **Tools:** use the same backing service types in every environment.
- Resist using lightweight local substitutes (SQLite locally, Postgres in prod) — subtle incompatibilities surface only in production. Containers make parity cheap.

## XI. Logs
*Treat logs as event streams.*

- The app never concerns itself with routing or storing its output — it writes an unbuffered stream of events to `stdout`.
- The execution environment captures, aggregates, and routes the stream (to files, a log indexer like ELK/Loki, etc.).
- This keeps the app decoupled from log infrastructure and works identically in every environment.

## XII. Admin Processes
*Run admin/management tasks as one-off processes.*

- One-off tasks (database migrations, console/REPL sessions, one-time scripts) run in an identical environment to the app's long-running processes — same codebase, same config, same release.
- Ship admin code with the app code to stay in sync and avoid drift.
- Favor languages with a built-in REPL to make one-off tasks convenient.

---

## Quick Reference

| # | Factor | One-liner |
|---|--------|-----------|
| I | Codebase | One codebase, many deploys |
| II | Dependencies | Declare and isolate them |
| III | Config | Store in the environment |
| IV | Backing Services | Treat as attached resources |
| V | Build, Release, Run | Keep the stages separate |
| VI | Processes | Stateless, share-nothing |
| VII | Port Binding | Self-contained, export via a port |
| VIII | Concurrency | Scale out with processes |
| IX | Disposability | Fast startup, graceful shutdown |
| X | Dev/Prod Parity | Keep environments similar |
| XI | Logs | Treat as event streams |
| XII | Admin Processes | Run as one-off processes |

---

*Reference: [12factor.net](https://12factor.net) by Adam Wiggins.*
