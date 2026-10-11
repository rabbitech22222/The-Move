# Integrations and verification boundaries

All provider integrations run on the server. API credentials are never included in workspace JSON responses or client bundles. OAuth credentials are encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`; direct access-token environment variables are an optional development alternative. OAuth implementations exist, but actual Canva, OpenAI, and Meta authorization and end-to-end provider operations have **not been tested with live credentials**. Unit tests mock provider responses and verify guardrails; they do not establish provider access or successful real publishing.

## Implemented versus pending

| Component    | Implemented                                                                                                                                                                                  | Pending / requires authorization                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intelligence | RSS and manual source ingestion, canonical URLs, publisher-aware deduplication, timestamps, rights, explainable relevance, uncertainty, source-restricted AI drafts and topic proposals      | Live OpenAI test; authorized news API and Google Trends adapters; cross-article fact checking beyond feed metadata                                             |
| Canva        | Read-only reference inspection, actual Brand Template dataset inspection, supported text/image autofill job creation, job reconciliation, new editable design validation, human-review queue | Approved Brand Template setup, Enterprise/autofill access where required, live provider test, upload interface, video replacement and arbitrary page insertion |
| Instagram    | Authorized Graph API follower/account/post insights synchronization, nullable unavailable metrics, exact media classification, daily idempotent snapshots                                    | Live authorized-account test; provider-dependent metric/scope compatibility                                                                                    |
| Publishing   | Reviewed reel container creation, processing polling, explicit revision-and-media approval, real media_publish confirmation, duplicate protection after ambiguity                            | Live publishing test; carousel ordered assets and child containers; manual provider reconciliation UI                                                          |
| Automation   | BullMQ queue, Redis, retries/backoff, job limiter, recurring schedules, persistent actual task events, real local demo dedup/report                                                          | Provider-level quota tuning, recurring schedule UI, external alert delivery                                                                                    |
| Learning     | Size-aware engagement/reach comparison, complete metric sample sizes, weekly proposals, human approval requirement                                                                           | More extensive schedule/topic analysis and statistically controlled experiment design                                                                          |

## News sources and AI

Add an RSS source in Intelligence with an HTTPS URL and explicit rights notes. Retrieval is bounded to 2 MB and 15 seconds; redirects are limited to three. Private, loopback, link-local, reserved and special-purpose IP ranges are denied. Every DNS answer must be public, and the validated address is pinned to the HTTPS connection, preventing rebinding. TLS verification remains enabled. Source URLs may be stored as HTTP references, but automated RSS retrieval requires HTTPS.

Only feed metadata is ingested: publication/retrieval dates, headlines, links and attribution. Relevance scores are deterministic keyword/recency heuristics with explanations. Confidence reflects the available reference metadata, not a fact-checked probability or a prediction of virality. Independent publisher references are preserved; matching headlines alone do not establish independent corroboration. Rights notes do not imply permission to reuse media.

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default configured in the service). Draft generation sends selected stored topic references and versioned channel guidelines to OpenAI Responses with strict JSON output. Unknown or omitted references, unsourced embedded URLs and invalid output are rejected. Output carries research uncertainty and requires human review; it cannot create an approval. Topic recommendations are sourced proposals and cannot change editorial rules. Review your OpenAI data policy before sending unpublished material.

## Canva setup and source preservation

Approved reference designs:

| Purpose                       | Source design ID |
| ----------------------------- | ---------------- |
| THE MOVE carousel, operator 1 | `DAHPXU1IGDI`    |
| THE MOVE carousel, operator 2 | `DAHXJGy8do8`    |
| THE MOVE landscape-video reel | `DAHPcvVkH8k`    |

These are **design IDs**, not assumed Brand Template IDs. The integration never modifies source designs. Creating a new autofill design uses a separately configured, approved Brand Template. In Canva, use **Make a copy** on the reference, preserve the brand hierarchy and 1080 × 1350 carousel canvas, configure named dataset fields, publish it as a Brand Template, and review it before mapping its ID. Eligible Canva account/API access is required.

You can set `CANVA_BRAND_TEMPLATE_DAHPXU1IGDI` and `CANVA_BRAND_TEMPLATE_DAHXJGy8do8` to the corresponding real Brand Template IDs. For explicit page-count metadata, use JSON:

```dotenv
CANVA_BRAND_TEMPLATE_MAP={"DAHPXU1IGDI":{"brandTemplateId":"YOUR_APPROVED_BRAND_TEMPLATE_ID","pageCount":5}}
```

Map configuration is a human assertion that the duplicate preserves the reference; the application cannot visually prove equivalent design layouts. Inspect the actual dataset first via `GET /rest/v1/brand-templates/{id}/dataset`. Recognized text field names (`HEADLINE`/`TITLE`, `BODY`/`COPY`/`CAPTION`, `SOURCE_CREDIT`/`SOURCES`/`CREDIT`) can be populated from the project. Other field names require explicit mappings in the generation request. Image fields require existing authorized Canva `asset_id` values; assets are not fabricated. Unsupported dataset types return an actionable error.

`POST /rest/v1/autofills` creates a job. `GET /rest/v1/autofills/{jobId}` reconciles it. Only a provider-returned, new design ID and editable Canva URL become READY. An accepted but incomplete job stays QUEUED; a GET reconciliation does not create another design. Ambiguous submissions remain blocked until the provider result is inspected. Estimated text-length and line limits are preflight checks only: exact wrapping, overflow, image placement and brand fidelity require human preview in Canva.

Autofill preserves template page count. For variable page counts, prepare approved Brand Templates with the required counts; this integration cannot append/remove arbitrary pages. The service supports page-count configuration and detects requested mismatches.

Current autofill dataset support does not provide automatic video replacement. THE MOVE reels therefore return **SETUP_REQUIRED**: duplicate **only `DAHPcvVkH8k`**, preserve its 1080 × 1920 canvas and landscape-video frame/aspect ratio, replace the headline and video manually, retain THE MOVE branding, add source credit, and submit the new editable link for human review using **Record a new Canva copy** in Canva Factory. The service validates the link host and rejects original source IDs; the design remains MANUAL_REVIEW, explicitly operator-submitted and API-unverified. No alternate reel template is substituted. Canva production never triggers Instagram publishing.

Official references: [Connect API](https://www.canva.dev/docs/connect/), [Autofill](https://www.canva.dev/docs/connect/autofill-guide/), [Brand Template dataset](https://www.canva.dev/docs/connect/api-reference/brand-templates/get-brand-template-dataset/), [Create autofill job](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/).

## Meta Instagram Graph API

The implementation uses Facebook Login for Instagram professional accounts, connected to an authorized Facebook Page. Configure `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default `v23.0`) and OAuth redirect URL derived from `APP_URL`, then connect in Settings. App review/appropriate access levels may be needed. Requested scopes are `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`, and `pages_read_engagement`. An environment `META_ACCESS_TOKEN` may alternatively provide an existing authorized token. Configure each channel's professional account ID; page/account autodiscovery is not assumed.

Account `followers_count`, account insights (`views`, `reach`, `total_interactions`) and individual post insights (`views`, `reach`, `likes`, `comments`, `saved`, `shares`) are requested separately. Unsupported or unavailable insight values remain null. Authorization, rate limiting and connectivity failures stop synchronization rather than manufacture data. An actual observed zero remains zero. Daily snapshots reflect the current UTC day up to synchronization; followers are observed at `syncedAt`. The dashboard shows source and synchronization time.

Media pagination is bounded to 100 items; daily post counts remain unavailable if the entire current-day window cannot be established. Post metrics are synchronized for the latest 20 returned posts per run, so broader history requires subsequent ingestion work. Pagination uses the provider cursor and rebuilds the fixed official endpoint; token-bearing next URLs are never followed. A post's metrics are lifetime observations at a snapshot time and must not be summed across snapshot dates. `REELS`, `CAROUSEL_ALBUM`, ordinary `IMAGE`, and non-reel `VIDEO` are recorded separately.

The worker uses only supported API access. No competitor scraping, password-based account access, private endpoint extraction, or invented synchronization success is provided. API availability depends on Meta account type, permissions and version. Validate authorized account/metric compatibility before relying on production reports.

Official references: [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/), [Insights](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/insights), [Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing).

## Human-approved publishing

Demo mode cannot publish real Instagram media. Live publishing requires both editorial and publication approvals from a human, matching the project's current revision. Publication approval also stores a SHA-256 fingerprint of the exact final `{mediaUrl, caption}` payload. Changes invalidate approval; legacy approvals without the fingerprint are rejected. A scheduled job waits until its approved scheduled time.

The media URL must resolve to a public HTTPS destination. The current single-media scheduler supports reels. Carousel publishing needs ordered child assets and is deliberately blocked with an actionable message.

The sequence is `POST /{igUserId}/media` → persist returned container ID → `GET /{containerId}?fields=status_code` → wait for `FINISHED` → reserve the publish attempt → `POST /{igUserId}/media_publish`. Only a successful real response containing the post ID records PUBLISHED. Processing retries reuse the existing container. Network uncertainty, malformed responses or server errors after a submission never cause automatic duplication.

After an ambiguous outcome, inspect the authorized Instagram account and reconcile the real provider container/post ID. Do not reset RUNNING or delete audit markers merely to retry. A dedicated reconciliation UI is pending; review and record the actual provider result through an administrator-controlled workflow before any new approved publication.

## Automation

Start Redis and set `REDIS_URL`, then run `npm run worker` alongside the web process. The worker validates real prerequisites; missing credentials appear as failed tasks in Office. Office animation is derived only from persisted QUEUED/RUNNING/result events. Idle agents have no synthetic activity. Demo mode without Redis can directly run deterministic topic deduplication and weekly report creation; these are actual operations and remain labeled DEMO.

Recurring jobs use **Asia/Seoul**: news ingestion every two hours, deduplication ten minutes later, account metrics daily at 01:00, snapshots daily at 13:00, AI topic recommendations daily at 00:30, and weekly reports Monday at 00:00. Demo worker scheduling enables only deduplication and weekly reports. Redis scheduling and PostgreSQL persistence must use the same environment configuration as the web application.

Retries use exponential backoff for ordinary jobs and five-second polling for existing processing publication containers. A job limiter starts at most 12 jobs per minute with concurrency two; provider read requests also respect rate-limit responses and bounded retries. Non-idempotent writes are not silently retried after uncertain outcomes. Actual provider quotas still require deployment-specific tuning. Source ingest, daily metrics, weekly proposals and recurring task IDs are idempotent; significant operations are audited. All worker/database errors must be investigated, and a failed task is never presented as a completed external operation.

## Cloud proxy transport

Official fixed API/OAuth endpoints and OpenAI requests use the environment egress proxy when configured; TLS verification remains on. If direct DNS is unavailable, RSS sources require an exact administrator-verified public hostname in `SOURCE_PROXY_ALLOWED_HOSTS` (comma-separated; no wildcard or IP). Each redirect is revalidated and response-size limits remain active. Publishing media uses a separate `MEDIA_PROXY_ALLOWED_HOSTS` list for trusted, publicly accessible asset hosts. These lists complement the platform network policy; they do not replace it. Known private DNS answers are rejected even if a host is listed. In proxy mode the trusted egress service resolves the approved public hostname; the application does not fabricate a locally resolved IP.

A real read-only validation retrieved GitHub’s public Next.js releases Atom feed, normalized 10 entries with source/retrieval timestamps, and confirmed a second ingest added zero duplicate topics. This verifies RSS transport/ingestion, not OpenAI, Canva, Meta authorization or publishing.
