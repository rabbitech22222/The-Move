# Validation record — 2026-10-11

Validated in the current cloud workspace using Node 24, local PostgreSQL 17, Redis 7 and Chromium. This records observed execution, not external provider readiness.

| Check                         | Observed result                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repeatable cloud installation | `bash scripts/cloud-install.sh` completed: locked dependency installation, existing `.env` preserved, Prisma generated, typecheck, unit suite and production build                                                                                     |
| Unit suite                    | 95 tests passed across 6 files; security, provenance, SSRF, approvals, template constraints, ambiguous publishing, missing metrics and concurrent demo persistence                                                                                     |
| Browser suite                 | 14 tests passed: both operators, all seven pages, persistent editorial edits, approval guards, assets, disconnected integrations, honest Office, reporting periods, themes/motion, channel creation and manual Canva copy review                       |
| PostgreSQL                    | Real migrations/checksums, failed-migration rollback, non-destructive reseeding, concurrent normalized writes, assets, audit records and credential-table structure verified in a separate test database                                               |
| Redis worker                  | Deduplication and weekly reports completed with persisted QUEUED/RUNNING/SUCCEEDED events and actual results                                                                                                                                           |
| Docker                        | Proxy/CA-aware image build passed with TLS verification intact; isolated non-demo app verified login, no synthetic metrics, project/asset/audit persistence after restart; isolated worker completed both jobs; temporary services/database cleaned up |
| Dependency audit              | No vulnerabilities reported after updating test tooling and the Prisma configuration dependency                                                                                                                                                        |
| RSS ingestion                 | GitHub Next.js release Atom feed fetched successfully; 10 real normalized items, repeated ingestion added 0 and recognized 10 duplicates; run in an isolated demo directory                                                                            |

Canva Connect, Meta metrics/publishing and OpenAI credentialed end-to-end execution remain unverified. Unit mocks do not establish provider success. OAuth scopes, Brand Template datasets/eligibility, authorized Instagram accounts and provider-specific media constraints need verification with the intended accounts.

The environment configuration draft was saved. Publishing and restoration in a fresh cloud task have not been tested. App/worker processes must restart in each task; installed files and dependency snapshots do not constitute service readiness.
