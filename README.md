# THE MOVE OS

A working editorial workspace for THE MOVE, Korea-coded and The Standard.

**Discover → Research → Draft → Design → Review → Publish → Measure**

Built with Next.js 16, React 19, TypeScript, Tailwind 4, shadcn-style Radix UI components, Recharts, Framer Motion, PostgreSQL/Prisma and BullMQ/Redis. Phase 1 is runnable; later-phase adapters are authorization-gated and do not claim provider success.

## Quick start — labeled demo

For a browser-based local demo with automatic setup, run **START-WINDOWS.bat** on Windows or **START-MAC.command** on Mac. Node 24 or later is required. See [한국어 실행 안내](START-HERE.md). The launcher installs dependencies as needed, generates local keys and Prisma, verifies login and workspace access, then opens the browser. Docker and external API credentials are not required for this demo.

Local setup calls npm directly through Node, reports elapsed time and downloads, and records `.move-runtime/setup.log`. It skips dependency lifecycle scripts and explicitly generates Prisma's JavaScript client, avoiding unused native-engine downloads while retaining npm integrity and TLS checks. Interrupted installations are retried; successful installations are reused for the same lockfile. A Windows CI job validates a fresh demo install and login in a directory with spaces.

Requires Node.js 24 (see `.node-version`) and npm. No external API credentials are needed.

```sh
npm ci
npm run setup:local
npm run db:generate
npm run dev
```

Open the application on your local machine at port 3000. Demo login fields are prefilled. Demo-only accounts:

- `operator1@themove.local` / `move-demo-2026` — Admin
- `operator2@themove.local` / `move-demo-2026` — Operator

These test credentials are intentionally public and only work with `DEMO_MODE=true`. Demo data is stored in ignored `.move-data/workspace.json`; restart preserves edits. To reset, stop the app and worker and move that directory aside; it may contain encrypted local OAuth bindings if you authorized integrations. Never expose a demo deployment publicly.

The UI labels sample statistics. Source fixtures use example.com and are not research evidence. Agents start idle; tasks appear only when actual operations run. Without Redis, genuine demo deduplication and weekly analysis run inline. To use a worker:

```sh
docker compose up -d postgres redis
npm run worker
```

The generated `.env` points `REDIS_URL` at local Redis. When Redis is configured it must be running for queue actions. Clear REDIS_URL only if you intentionally want the two inline demo jobs. Docker processes, Next.js and the worker must restart in a fresh cloud task; files and dependencies alone are retained.

## PostgreSQL workspace

1. Copy `.env.example` to `.env` using `npm run setup:local` (preserves an existing file); keep the random session/encryption keys.
2. Set `DEMO_MODE=false` and enter distinct, secure `OPERATOR_1_PASSWORD` and `OPERATOR_2_PASSWORD` values (at least 12 characters). Do not put secrets in Git or chat.
3. Start infrastructure and apply migrations:

```sh
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
# Another terminal:
npm run worker
```

PostgreSQL seed creates the two local-email operators, channel guidelines and exact Canva references. Existing operators/passwords are preserved on rerun. It creates no sample performance data. Production mode never falls back to demo on DB failure. For real deployments change local database password, use HTTPS APP_URL and a protected database/Redis network. The Docker local password is a public development-only default.

### Complete Docker development stack

With `.env` set up, non-demo operator passwords filled, and port 3000 free:

```sh
docker compose up --build
```

The app applies migrations and seeds idempotently before starting; the worker waits for readiness. PostgreSQL and Redis ports bind to loopback. API authorization remains optional until the corresponding integration is used. See [setup details](docs/SETUP.md).

## Verification

```sh
npm run typecheck
npm test
npm run build
# Browser tests run the labeled demo workflow; use DEMO_MODE=true and configured local keys.
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# Alternatively install Playwright Chromium on a supported host:
npx playwright install chromium
npm run test:e2e
# PostgreSQL check requires DEMO_MODE=false and a migrated/seeded disposable test DB:
npm run test:db
# With the local infrastructure running and the Docker image built:
npm run test:docker
```

Unit tests exercise approval invalidation, token tampering, source provenance/SSRF guards, template rules, missing metrics, idempotency and concurrency. Browser tests exercise login, navigation, persistence, editorial approvals and role/origin guardrails. PostgreSQL checks test real normalized writes, migration checksum checks/rollback, and non-destructive seeding. External provider calls require separate credentialed E2E validation.

## Integrations and feature status

- [Integration contracts and limitations](docs/INTEGRATIONS.md)
- [Implemented vs pending by phase](docs/FEATURES.md)
- [Setup and operating instructions](docs/SETUP.md)
- [API endpoints](docs/API.md)
- [Observed validation and remaining integration checks](docs/VALIDATION.md)

The source designs `DAHPXU1IGDI`, `DAHXJGy8do8`, and `DAHPcvVkH8k` are preserved. A design ID is not an autofill dataset. THE MOVE reels only use the landscape-video reference `DAHPcvVkH8k`. Creating a Canva draft never publishes it. Instagram publication requires separate approval of the current project **and the exact final media URL/caption**.

## Project layout

```text
app/                  App Router pages and authenticated API routes
components/           Workspace UI and reusable Radix/shadcn-style primitives
lib/domain.ts         Typed shared entities
lib/data.ts           PostgreSQL and explicit local-demo persistence
lib/services/         Editorial, intelligence, Canva, analytics, publishing
lib/integrations/     Provider APIs, source fetching, HTTP transport
lib/jobs.ts           BullMQ queue, real task/event lifecycle and schedules
prisma/               Schema, SQL migrations and secure seed
scripts/              Worker, migration runner and database verification
tests/                Unit and browser tests
```

Prisma uses its supported JavaScript query compiler and `@prisma/adapter-pg`. The checked-in SQL migrations are generated from the Prisma schema. A transactional `pg` runner applies them to the compatible `_prisma_migrations` ledger with checksums and an advisory lock, avoiding native engine downloads and a Prisma 6.19 JS migration adapter PostgreSQL `name`-type issue. `npm run db:migrate` is the tested deploy path; no TLS or checksum verification is disabled.
