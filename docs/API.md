# Local API

All workspace endpoints require the signed session cookie from `POST /api/auth`. Every mutation requires `Content-Type: application/json` and an `Origin` matching `APP_URL`. Replies are `{data:...}` on success and `{error,code}` on failure. IDs must belong to the fixed workspace; the data layer only reads its scoped records. Never expose these internal routes as an unprotected integration API.

| Route                                   | Method              | Operations                                                                                                                                                  |
| --------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`                           | GET                 | Process health and explicit demo/connected mode (does not claim provider readiness)                                                                         |
| `/api/auth`                             | POST / GET / DELETE | Email/password sign-in; current operator; sign-out                                                                                                          |
| `/api/workspace`                        | GET                 | Full non-secret workspace view                                                                                                                              |
| `/api/projects`                         | POST                | `create`, `update`, `transition`, `approve`, `track-time`                                                                                                   |
| `/api/assets`                           | POST                | `add` projectId/kind/url/credit plus reported dimensions; `approve` / `remove` assetId                                                                      |
| `/api/intelligence`                     | POST                | `add-source` with nested `{name,url,rights,type}`, `ingest` with sourceId, `save`, `dismiss`, `research`, `create-project` with topicId and optional format |
| `/api/canva`                            | POST                | `inspect` templateId; `generate` projectId/templateId; `refresh` designId; `register-manual` projectId/templateId/editUrl/pageCount/preservedLayout         |
| `/api/jobs`                             | POST                | Supported `kind` and sourceId/channelId/projectId/templateId as required; publication is deliberately not accepted here                                     |
| `/api/analytics`                        | POST                | `recommend` queues a weekly report; `approve`, `reject`, `record-experiment` with recommendationId/result                                                   |
| `/api/settings`                         | GET / POST          | Secret presence/status; admin-only `create-channel`, versioned `guidelines` and verified `connect-meta-account` mapping                                     |
| `/api/publications`                     | POST                | `approve` projectId/mediaUrl/caption; `schedule` identical payload plus future scheduledAt; `cancel` publicationId                                          |
| `/api/oauth/canva` or `/api/oauth/meta` | GET                 | Admin-authorized OAuth start                                                                                                                                |
| `/api/oauth/{provider}/callback`        | GET                 | Session/state-bound code exchange and encrypted token storage                                                                                               |

API jobs create real persisted tasks. A queue acknowledgment is not task completion. Inspect `/api/workspace` tasks/events and Office; inspect designs/publications for provider confirmation.

Editorial transitions proceed through the recorded stages. `APPROVED` is only reached with the explicit human approval action; `SCHEDULED`/`PUBLISHED` are controlled by the publication workflow. Editing an approved draft returns it to Review and removes stale approvals. Production time is manually recorded and does not represent inferred worker activity.

Reel publishing only is implemented. Carousels need ordered assets/child containers and return an actionable unsupported-operation response. Demo publishing is blocked server-side. Missing API metrics are null, and unknown external submission outcomes require human reconciliation.

Manual Canva copies are operator submissions, marked `MANUAL_REVIEW`. The server refuses source-design links and requires sourced content in Design/Review. No provider success, actual page count or brand-layout verification is inferred from a submitted URL.

Canva `generate` also accepts optional `pageCount` and `fields`, keyed by the inspected dataset field names. A text value has `{type:"text",text:"..."}`; an image value has `{type:"image",asset_id:"..."}` using an existing Canva asset the authorized account can access. These inputs are validated and retained in the background job. Unsupported video fields or layouts return a setup requirement; a public image URL is not treated as a Canva asset ID.
