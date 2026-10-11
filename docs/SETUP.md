# Setup and operations

Use the existing isolated checkout. A Codex cloud task already has an isolated environment; do not create worktrees unless explicitly requested.

## Environment

Node 24, npm and Docker Compose are required for the full development stack. The labeled JSON demo works without PostgreSQL. Every mutation requires login and a same-origin request. `.env.example` lists variable names; `.env` and `.move-data` are ignored and must never be committed.

`npm run setup:local` creates `.env` only if absent, generating fresh random session and encryption keys; it never overwrites an existing user configuration. `APP_URL` must match the actual app origin. HTTPS origins produce secure session/OAuth cookies. Sessions expire after 12 hours. Two non-demo passwords are required before database seeding. Do not reuse demo credentials in a live workspace.

## Repeatable installation and start

Run `npm ci`, `npm run db:generate`, and `npm run setup:local` from the checkout (setup before generate if DATABASE_URL is not otherwise set). For the demo start `npm run dev`; for configured Redis actions start `docker compose up -d postgres redis` and `npm run worker`. For PostgreSQL mode set up operator passwords, run `npm run db:migrate` and `npm run db:seed` before starting app/worker. To serve a production bundle run `npm run build` and `npm run start`.

Readiness: request `/api/health`, sign in, request `/api/workspace`, open Dashboard/Studio/Office, and perform a sourced project edit or an actual deduplication job. A PID or open port alone is not readiness. `npm run test:e2e` covers the demo. `npm run test:db` must target a disposable migrated/seeded database; it briefly creates and removes projects and checks migration rollback/idempotency, retaining audit history.

## Migrations

`npm run db:migrate` uses the checked-in SQL and PostgreSQL directly, maintaining checksum-protected `_prisma_migrations` records. Historical migrations cannot change after application. Transactions roll back failed migrations. `prisma/schema.prisma` remains the source schema. Future schema changes should generate a new migration using `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` with appropriate shadow database configuration, or review a generated diff against a known schema snapshot. Do not use `db push` as a substitute for the deploy ledger or alter old migration checksums. Prisma native CLI migration commands are not the cloud-tested path for this version.

## Queues and scheduling

BullMQ stores queue state in Redis, while database/JSON stores tasks and audit events. The worker concurrency is 2 and provider work is rate limited. Recurring schedules use Asia/Seoul. Demo recurrence enables only real dedup and observational weekly analysis. A disconnected provider fails explicitly; credentials do not establish an integration succeeded. Application start does not execute Instagram publishing without an approved future schedule.

Keep app/worker in the same persistence mode and workspace. Do not start a demo worker alongside a live app sharing the same Redis queue. A separate Redis database/URL is required for each isolated environment. Restart only processes you own. Cancel a scheduled publication through Studio; provider work already running cannot be cancelled by changing a UI label.

## Recovery

Back up PostgreSQL, Redis and encrypted OAuth bindings before deployment changes. Preserve TOKEN_ENCRYPTION_KEY; rotating it without decrypting/re-encrypting stored tokens prevents access. Missing/expired token bindings require Settings reconnection. Provider submission ambiguity is recorded and blocks automatic duplicates; reconcile externally before manually preparing a new schedule. Clearing `.move-data` resets local demo edits and may remove local encrypted authorizations. Never delete it while the app or worker is writing.

For cloud publication review and save the draft in environment settings, then publish. Publication snapshots files/dependencies; app/worker processes and runtime authentication must be reestablished in future tasks. No localhost preview link is supplied by onboarding.

## Docker behind the cloud proxy

Use `npm run docker:build:cloud` when the build container cannot resolve the platform proxy or needs its trusted CA. The helper forwards the existing proxy by name and supplies `NODE_EXTRA_CA_CERTS` as a temporary BuildKit secret. The CA is not copied into the image, and verification is not disabled. Normal local networks can use `docker compose build`. For provider traffic inside containers, supply the platform-supported proxy route and trusted CA mount in your deployment; raw host environment paths are not assumed to exist inside the container. The host app/worker already inherit that runtime trust.

`npm run test:docker` verifies the built `the-move-os:local` image against the existing local Compose PostgreSQL service. It creates its own temporary database, Redis and Compose project on port 3100, checks login, empty non-demo metrics, project/media/audit persistence through an app restart, and genuine worker task completion. It cleans up only its own containers and database. Set `DOCKER_CHECK_PORT` if 3100 is occupied. No external provider credentials are needed or inspected.

For a cloud task, `bash scripts/cloud-install.sh` installs, generates Prisma, typechecks, tests and builds without overwriting `.env`. Start long-running services with stdout/stderr redirected to ignored `.move-runtime` logs so a closed tool output pipe does not interrupt the server. Check an existing service before launching another instance.
