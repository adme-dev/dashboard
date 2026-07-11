# HR/Monday Production Handoff

## Delivered

- Owner-approved board, field, date, exclusion, and retention scopes.
- Owner-approved board-to-department/project destination mappings; approved scopes cannot omit a landing destination.
- Idempotent Monday task, comment, and file mapping behavior.
- Read-only discovery manifest and evidence preview.
- Governed sync trigger with per-board state and migration-session reconciliation.
- Incremental cutoff using the earliest complete board watermark; failed or incomplete boards cannot advance the scope checkpoint.
- Participant-only evidence disclosure filtered by assignee and scope.
- Private HR knowledge records with provenance, retention, access policy, and optional Vectorize IDs.
- Owner-only first-pass indexing of approved Monday item titles.
- OAuth start/callback with HR authorization, one-time state cookie, server-side token storage, and least-privilege scopes.
- Idempotent signed-app webhook registration for approved boards.
- Automatic Cloudflare `waitUntil` migration execution and post-migration reconciliation.
- Hourly scope-bound reconciliation, five-minute signed-webhook queue draining, and hourly owner/assignee health notifications through the production cron worker.
- Canonical health alerts deduplicate historical mappings per local task, preserve separate Monday/local identities, retain the local task as the primary action, and expose a validated `Open in Monday` source action when Monday supplies an item URL.
- Structured item webhooks mark only the latest mapping pending/current/archived/deleted without changing the local task timestamp. Comment/update webhooks remain excluded, stale queue events cannot reopen a newer reconciliation, and terminal source states never delete local tasks.
- The owner sync dashboard reports pending source changes, Monday-newer/local-newer timestamp drift, and archived/deleted source counts with a bounded review list. These are operational reconciliation signals, not employee performance scores.
- Owner-facing governed sync dashboard with durable board checkpoints, recent sessions, and independently scrollable Scope, Evidence, and Sync pages.
- Scope revocation also revokes related knowledge records and removes their vectors.

## Production gates

1. Apply migrations 228, 229, and 232 after database backup/rollback verification.
2. Confirm Monday OAuth credentials, signing secret, integration storage, `AI`, and `VECTORIZE` bindings.
3. Run discovery against one representative board.
4. Approve a narrow scope and run one governed sync.
5. Reconcile the session and verify board counts, failed records, and source watermark.
6. Run indexing with a small batch and verify provenance/vector IDs.
7. Repeat sync and confirm no duplicate tasks, comments, files, or knowledge records.
8. Confirm participant evidence visibility and challenge workflow.

## Production state — 2026-07-11

- Migrations 228, 229, 232, 233, and 234 are active. Migration 233 formalizes source-link fields and canonical health indexes; migration 234 adds durable source state, exact source/observation timestamps, reconciliation state, and scoped drift indexes.
- Stable production aliases are `https://app.xeroflow.io` and `https://agency-dashboard-6cm.pages.dev`.
- Final Pages release for this push: `https://3a29e634.agency-dashboard-6cm.pages.dev` (production branch `main`).
- The `XeroFlow Operations` Monday app version is live and installed for all workspaces.
- Monday OAuth owner consent completed successfully. The production integration is stored with `authMethod=oauth`; its client ID, client secret, app version ID, and signing secret remain server-only Cloudflare secrets.
- OAuth callback: `https://app.xeroflow.io/api/agency/monday/oauth/callback`.
- Read-only discovery succeeded for the `ADME ReelMotion` canary board (`18419440327`): one active board, one group, two columns, and one sampled item.
- Approved canary scope `52cdbb6e-dde5-4303-8baa-13eef061b39c` is limited to that board, `name` and `status`, a 90-day retention period, explicit surveillance/content exclusions, and the `ADME Testing Account` destination.
- Governed sync session `5139abb4-39bb-41c7-8b1d-4aaa2135f204` completed one board and one linked task with zero failures. The durable board checkpoint is `completed` with `records_seen=1`, `records_created=1`, and `records_failed=0`.
- Private indexing contains exactly one active canonical record keyed by `18419440327:12376268790`. Two canary duplicates discovered during validation were removed from Vectorize and marked revoked relationally.
- HR-owner evidence returns one deduplicated, allowlisted item. The current-user participant view returns no item because the canary task is unassigned, proving the assignee boundary, and includes the correction/challenge notice.
- Nine supported signed webhook types are registered on the canary board. Monday rejects six subitem webhook types on this board because it has no subitem capability; registration now preserves successes and reports failures per event.
- Production webhook queue smoke: one signed synthetic event processed successfully; queue is now `processed=1`, `queued=0`, `failed=0`.
- Scheduled reconciliation sessions `a280fe5d-8884-4ca2-b5e7-7321467015d3` and `f8853c60-ae45-418c-a716-bb3a92db69d8` completed the approved board with zero changed items and advanced incremental checkpoints without duplicating the canary task.
- The `pages-cron` worker is deployed with seven schedules at version `50d74892-8ece-4ed2-9ea2-b9b1aa035fb4`; Monday reconciliation and health notifications run hourly, while signed webhook events drain every five minutes.
- Production cron route smokes returned clean results: webhook queue `scanned=0, processed=0, failed=0` and health notifications `scanned=0, sent=0` after the canary run.
- The authenticated owner dashboard/API smoke returned HTTP 200 with one active sync state and one current canonical mapping; pending, archived, deleted, Monday-newer, local-newer, and issue counts were all zero. The Monday import page exposed the reconciliation labels and its content container scrolled from `0` to its `673px` maximum with `overflow-y: auto`.
- The focused Monday/HR verification suite passed 27 files and 59 tests. The production build completed successfully. Repository-wide typechecking still reports 223 inherited errors, with none referencing the files changed in this reconciliation slice.
- Post-release canonical health smoke also returned `scanned=0, sent=0`, proving the migration/index/query path without creating synthetic production notifications.
- Wrangler is upgraded and locked at `4.110.0`.

## Explicit limitations

- The current incremental cutoff still scans Monday pages and filters changed items locally; signed webhooks provide freshness signals but the full content repair remains reconciliation-driven.
- First-pass indexing embeds item titles only. Comments, files, private messages, and questionnaire answers remain excluded.
- General operational Monday import routes remain separate from HR-governed routes.
- Authenticated browser smoke verified all three sibling routes at `app.xeroflow.io`, the approved board checkpoint, recent session data, and independent content scrolling on a constrained viewport.
- Dependency audit currently reports inherited critical/high findings (including Nuxt and transitive packages); this is a release-risk backlog and must not be represented as a clean security gate.

## Verification

- The broader HR/Monday suite previously passed 53 files / 118 tests; the final Monday UI, scope, sync, health, webhook, client-schema, URL-security, and migration contract run passes 25 files / 52 tests.
- The production Nuxt build and worker wrapping pass, and Pages plus the scheduled worker deploy successfully with Wrangler 4.110.0.
- The scoped HR/Monday files are clean under filtered Nuxt typecheck. The full repository typecheck remains red because of an inherited cross-project backlog in unrelated modules and legacy Monday import utilities; this release does not represent that global gate as clean.
- OAuth connection, discovery, approved scope creation, signed webhook registration, governed sync, reconciliation, task landing, private Vectorize indexing, owner evidence, participant boundary, webhook challenge, and database audit were exercised against production.
- Authenticated inbox smoke confirmed the deployed `Open in Monday` action and its strict HTTPS `monday.com`/subdomain host guard. No eligible live Monday health alert existed, so the release did not insert synthetic notification data.
- Read-only landing smoke harness: `node scripts/check-monday-import-landing.mjs` (requires `DATABASE_URL` and `MONDAY_API_TOKEN`; set `MONDAY_SMOKE_BOARD_ID` to target a board).
