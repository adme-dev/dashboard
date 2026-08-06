# Cloudflare Platform Operations Admin Plan

**Status:** Proposed
**Date:** 2026-08-06
**Scope:** XeroFlow Agency admin control plane for Cloudflare-hosted runtime operations
**Primary route:** `/admin/platform-ops`
**Implementation posture:** Read-only first; guarded remediation later

## 1. Executive decision

Create one top-level **Platform Operations** section in the XeroFlow admin area. It should provide an operational cockpit for production health, incidents, Workers, Pages deployments, Queues, Durable Objects, Cloudflare alerts, telemetry readiness, and developer notifications.

Cloudflare Email Service is the primary provider for all new XeroFlow transactional email, including Platform Operations alerts, board notifications/replies, and employee-adoption messages. These products share normalized `transactional_messages`, `transactional_message_attempts`, and `transactional_quota_reservations` records for cross-channel deduplication, retry/DLQ, suppression, and quota. Existing Resend paths remain legacy-only during a controlled migration and are not an automatic fallback.

Do not attempt to reproduce Cloudflare's complete dashboard. XeroFlow should embed the information needed to decide whether the platform is healthy, identify ownership, coordinate an incident, and correlate a failure with a deployment. Full log searches, trace waterfalls, live tailing, bindings, secrets, routes, and advanced Cloudflare configuration should deep-link to Cloudflare.

Do not introduce Workers for Platforms or a "dynamic Workers" abstraction for this work. Cloudflare dynamic dispatch Workers are for products that allow customers to upload and execute their own Worker code. XeroFlow's current internal agents, cron Workers, Queues, Workflows, and Durable Objects do not require that architecture.

## 2. Problem

XeroFlow is moving an increasing amount of application execution, asynchronous work, real-time collaboration, agent execution, storage, and deployment activity onto Cloudflare. The repository already contains a substantial Cloudflare runtime estate, but operational visibility is fragmented across:

- the Cloudflare dashboard;
- Wrangler configuration files;
- ad hoc health endpoints;
- application notifications;
- the AI Model Ops page;
- individual queues, Workers, and Durable Object namespaces;
- email and developer knowledge.

This creates five operational risks:

1. A production failure can be visible in Cloudflare without becoming an owned XeroFlow incident.
2. Queue failures can enter a DLQ without a durable, searchable XeroFlow record or a development-team notification.
3. Deployment, version, runtime-error, and queue-lag data are not correlated.
4. Telemetry configuration can drift because only 4 of 31 Wrangler manifests declare observability settings in repository configuration; the remaining 27 do not.
5. A broad Cloudflare API token or future in-app remediation control could create an unnecessarily large blast radius.

The target outcome is a single, permissioned control plane that answers:

- Is production healthy?
- What changed?
- Which client-facing capabilities are affected?
- Who owns the affected runtime?
- Is work accumulating or being discarded?
- Has the development team been notified?
- Where should an engineer go for full forensic detail?
- Can an approved operator safely retry or roll back?

## 3. Goals and non-goals

### 3.1 Goals

- Show a normalized health view across Pages, Workers, Queues, Workflows, Durable Objects, agents, and AI Gateway.
- Create durable, deduplicated incidents from relevant Cloudflare and application events.
- Notify the development team according to severity, ownership, suppression, and escalation rules.
- Correlate incidents with active versions and recent deployments.
- Make operational ownership and runbooks visible.
- Detect missing observability, stale resources, unhealthy Logpush jobs, unconsumed DLQs, and other configuration drift.
- Preserve least privilege and a complete audit trail.
- Establish a safe path to later retry, replay, and rollback controls.
- Provide one provider-neutral logical-parent/attempt/reservation view shared by Platform Operations, board email, and employee adoption.
- Expose an executable Monday-retirement readiness profile before that migration can pass Gate 0.

### 3.2 Non-goals

- Rebuilding Cloudflare Query Builder, live tail, trace exploration, R2 object browsing, WAF, Zero Trust, or account settings.
- Displaying or editing Worker secrets, plaintext environment variables, provider keys, or raw authorization headers.
- Automatically changing production traffic or rolling back deployments in the first release.
- Using Analytics Engine as an exact event store.
- Treating Durable Object isolate memory as exact per-object memory usage.
- Allowing clients to upload and execute arbitrary Worker code.
- Replacing the existing `/admin/ai/model-ops` model-routing and AI-surface controls.

## 4. Repository findings

These findings are based on the repository state on 2026-08-06. They do not prove the live Cloudflare account has identical configuration; the first implementation phase must reconcile repository intent with the live account.

### 4.1 Runtime estate

- The root [`wrangler.toml`](../../wrangler.toml) configures the `agency-dashboard` Pages deployment and multiple Queue producers and Durable Object service bindings.
- The `workers/` directory contains standalone Workers for jobs, cron tasks, email, delivery, agents, real-time rooms, media processing, and rate limiting.
- Across the root and `workers/*` source configurations there are 31 Wrangler manifests: 29 `wrangler.toml` files and 2 `wrangler.jsonc` files. Generated `dist` output is excluded.
- The repository declares Durable Object-backed chat, board, banner, office, inbox, rate-limiter, render-container, MCP, and platform-agent workloads.
- [`workers/platform-agents/wrangler.toml`](../../workers/platform-agents/wrangler.toml) declares four agent classes: Spend Controller, Publishing Planner, Financial Watch, and Traffic Controller.

### 4.2 Observability configuration gap

Four of the 31 source manifests explicitly declare observability today:

- [`workers/agency-workflows/wrangler.toml`](../../workers/agency-workflows/wrangler.toml)
- [`workers/email-worker/wrangler.toml`](../../workers/email-worker/wrangler.toml)
- [`workers/email-lead-intake/wrangler.jsonc`](../../workers/email-lead-intake/wrangler.jsonc)
- [`workers/search-authority-publisher/wrangler.jsonc`](../../workers/search-authority-publisher/wrangler.jsonc)

The remaining 27 manifests may have observability enabled through Cloudflare account or dashboard settings, but that state is not expressed in repository configuration and cannot be reliably reviewed or reproduced. Drift reporting must preserve the format split—29 TOML plus 2 JSONC—rather than scanning only `wrangler.toml`.

This should be treated as **configuration drift/readiness**, not as proof that logging is disabled. Phase 0 must compare live settings and repository declarations before changing sampling.

### 4.3 Queue and DLQ gap

The repository declares ten DLQs across agency jobs, lead delivery, measurement delivery, send scanning, asset intelligence, video generation, music generation, timeline rendering, video rendering, and banner rendering.

No corresponding active DLQ consumer is declared in the repository. Retention must be derived from the actual Cloudflare Queues plan and each queue's live configuration:

- Free plan: 24-hour message retention, non-configurable.
- Paid plan: four days by default, configurable per queue up to 14 days.

Phase 0 must record the plan and observed retention for every source Queue and DLQ; the plan must not assume four or seven days. Because any Queue can expire before an incident is reviewed, XeroFlow needs either:

- an active DLQ consumer that immediately persists a redacted failure envelope; or
- a documented external pull consumer verified during live-account reconciliation.

### 4.4 Admin overlap and gap

- [`app/pages/admin/security/audit.vue`](../../app/pages/admin/security/audit.vue) is currently a placeholder.
- [`app/pages/admin/ai/model-ops.vue`](../../app/pages/admin/ai/model-ops.vue) already covers model routing, provider readiness, agent checks, and AI invocation telemetry.
- [`app/layouts/admin.vue`](../../app/layouts/admin.vue) currently exposes Dashboard, Teams, Users, Roles & Permissions, and Settings only.

Platform Operations should be a new top-level navigation item. It should link to AI Model Ops for model-specific controls and should supply operational events to the eventual unified admin audit view.

### 4.5 MCP lifecycle gap

[`workers/mcp-server/src/index.ts`](../../workers/mcp-server/src/index.ts) extends `McpAgent` and serves a Durable Object-backed MCP route. Current Cloudflare documentation marks `McpAgent` deprecated and feature-frozen and recommends the stateless `createMcpHandler()` path for new MCP servers.

Do not add control-plane functionality to the legacy MCP lifecycle. Plan a staged migration to a stateless handler, keeping business state behind authenticated Durable Object, D1, KV, R2, or Postgres boundaries when required.

### 4.6 No Workers for Platforms requirement

There is no dispatch namespace or dynamic dispatch binding in the repository. That is correct for the current product. If XeroFlow later offers customer-authored executable automations, Workers for Platforms should be evaluated as a separate security and product-design initiative.

## 5. Recommended information architecture

Add `/admin/platform-ops` with the following tabs.

### 5.1 Overview

The default view should answer whether the system requires attention in under 30 seconds.

Cards and sections:

- Overall status: healthy, degraded, critical, or telemetry incomplete.
- Production Pages deployment: active deployment, branch, commit, age, status.
- Runtime fleet: healthy/total resources and configuration-drift count.
- Incidents: open critical/high/warning counts and oldest unacknowledged incident.
- Queues: total backlog, oldest message, retry trend, and non-zero DLQs.
- Scheduled work: missed or stale cron/workflow executions.
- AI spend: month-to-date estimate, budget percentage, forecast, and blocked/fallback requests.
- Notification delivery: most recent successful development-team notification and any delivery failures.
- Recent changes: deployments, rollbacks, configuration changes, and Cloudflare audit events.

### 5.2 Incidents

- Filter by status, severity, environment, resource, type, owner, deployment, and time.
- Show fingerprint, summary, affected resource/version, first seen, last seen, occurrence count, affected routes or event types, and notification state.
- Support acknowledge, assign, comment, snooze, resolve, and reopen.
- Provide links to the Cloudflare log query, trace, deployment, Queue, or Durable Object view.
- Show redacted sample evidence only; raw payloads remain outside the application.

### 5.3 Runtime

- Inventory Pages projects, Workers, Workflows, cron Workers, Queue consumers, Durable Object namespaces, and agent classes.
- Show environment, owner, criticality, runbook, current version/deployment, last seen, recent error rate, p95/p99 latency, CPU trend, and telemetry readiness.
- Present Durable Object metrics at namespace level. Clearly label memory as isolate-level even when filtered to an object identifier.
- Cross-link agent resources to `/admin/ai/model-ops`.

### 5.4 Queues

- Backlog messages/bytes, oldest-message timestamp, lag, retry rate, consumer concurrency, and recent operation outcomes.
- DLQ state, persisted failure count, first/last failure, owner, and runbook.
- Phase 1 is read-only.
- Phase 4 may provide replay of a persisted, schema-validated envelope, never an arbitrary raw payload.

### 5.5 Deployments

- Pages production and preview deployments with branch, commit, trigger, stage, status, URL, and timestamps.
- Worker versions and deployments with creator, source, annotations, compatibility date, and traffic split.
- Correlate new or reopened incidents to the active deployment window.
- Phase 1 deep-links to Cloudflare for retry/rollback.
- Phase 4 may add guarded retry and rollback actions.

### 5.6 Alerts & Delivery

- Cloudflare notification policies and dispatch history.
- XeroFlow-derived alert rules and thresholds.
- Destinations, allowlists, escalation delays, quiet-hour behavior, and last test result.
- Logpush job state including `enabled`, `last_complete`, `last_error`, and `error_message`.
- Notification suppression and deduplication history.
- Cloudflare Email Service provider/webhook health, shared transactional quota consumption, legacy Resend migration state, and provider-neutral delivery outcomes.

### 5.7 Audit & Configuration

- XeroFlow operator actions and Cloudflare Audit Logs v2 events.
- Live-versus-repository configuration readiness.
- API-token capability status without displaying token material.
- Webhook validation readiness.
- Retention and R2 lifecycle readiness.
- Sampling configuration and cost projection.
- Feature flags for notification and mutation paths.

## 6. Embed versus deep-link decision

| Capability | Embed in XeroFlow | Deep-link to Cloudflare | Rationale |
|---|---:|---:|---|
| Overall health and SLA state | Yes | Optional | Requires XeroFlow ownership and business context. |
| Normalized incidents | Yes | Evidence link | Assignment, notification, and resolution are XeroFlow workflows. |
| Resource inventory and ownership | Yes | Yes | XeroFlow adds owner, criticality, feature, and runbook metadata. |
| Deployment summary and incident correlation | Yes | Yes | Summary is useful in-app; full Cloudflare view remains authoritative. |
| Queue backlog, lag, retries, DLQ state | Yes | Yes | Needed for daily operations and escalation. |
| Cloudflare notification history | Yes | Yes | Useful for unified incident context. |
| Logpush job health | Yes | Yes | A failed Logpush job creates a forensic gap. |
| Full Query Builder | No | Yes | Cloudflare already supports saved queries, filters, groupings, and percentiles. |
| Live tail and raw invocation logs | No | Yes | High-volume and may contain sensitive data. |
| Trace waterfall | No | Yes | Complex native experience; no value in recreating it. |
| Durable Object raw logs | No | Yes | Keep full per-instance debugging in Cloudflare. |
| Secrets, bindings, routes, WAF, Zero Trust | No | Yes | Sensitive configuration and broad blast radius. |
| R2 object browser | No | Yes | Raw forensic storage should not be generally exposed. |
| Production rollback/traffic split | Phase 4 | Yes | Requires separate credentials, recent auth, confirmation, and audit. |

## 7. System design and data flow

```text
Cloudflare GraphQL API ---- scheduled aggregate poll ----+
Cloudflare REST APIs ------ scheduled inventory poll -----+
Cloudflare Notifications -- authenticated webhook --------+--> Normalizer
Tail Worker --------------- sanitized error envelope --> Ops Queue --> Consumer
Application health events - structured internal event ----+        |
                                                                   v
                                                  Neon operational store
                                                    |             |
                                                    v             v
                                         Platform Ops APIs   transactional email Queue
                                                                    |
                                                         Cloudflare Email Service
                                                    |
                                                    v
                                          Admin UI + deep links

Workers Trace Events Logpush --> Pipelines/R2 --> retained forensic data
Cloudflare Audit Logs v2 ------> API/Logpush ----> audit correlation
```

### 7.1 Scheduled collectors

Use a dedicated scheduled Worker or the existing safe cron pattern to collect:

- Worker request, invocation outcome, CPU, duration, and error aggregates through GraphQL;
- Queue aggregate metrics through GraphQL;
- real-time queue backlog through the Queue REST metrics endpoint;
- Durable Object namespace/request/storage/periodic metrics through GraphQL;
- Pages deployment state through REST;
- Worker versions and deployment state through REST;
- Cloudflare notification policies/history through REST;
- Logpush job health through REST;
- AI Gateway analytics/cost summaries through its analytics APIs.

Persist normalized snapshots. The UI must call XeroFlow APIs, not Cloudflare directly. Use a short cache window, normally 60 seconds, and show both `observed_at` and `stale_after`.

### 7.2 Cloudflare notification webhook

Create `POST /api/integrations/cloudflare/notifications` with these controls:

1. Read the raw request body.
2. Require and constant-time compare `cf-webhook-auth` with the configured secret.
3. Validate the expected `account_id` when supplied.
4. Validate schema and reject oversized bodies.
5. Reject implausibly old timestamps except for explicit test events.
6. Deduplicate using `alert_correlation_id`, `alert_event`, `policy_id`, and timestamp.
7. Store the normalized event and map start/end events onto an incident lifecycle.
8. Never trust the human-readable `text` field as executable or HTML content.

### 7.3 Tail Worker incident feed

Use a Tail Worker only for workloads where near-real-time, custom in-app error grouping is required. Cloudflare recommends native OpenTelemetry export for standard external observability destinations and positions Tail Workers as the advanced custom-processing option.

The Tail Worker should:

- immediately discard successful/noise events;
- redact authorization, cookies, request bodies, prompts, query-string secrets, and configured sensitive keys;
- produce a bounded error envelope;
- derive a stable fingerprint from environment, script, entrypoint, outcome, exception class, normalized message, top source-mapped frame, and version where available;
- attach Ray ID/correlation ID only when safe;
- send the envelope to `platform-ops-events` Queue;
- avoid outbound email or database writes in the tail handler.

Start with critical production Workers. Expand after measuring invocation and CPU cost.

### 7.4 Queue consumer and DLQ persistence

The `platform-ops-events` consumer should:

- be idempotent by event ID/fingerprint bucket;
- create, update, reopen, or resolve an incident;
- persist a redacted sample event;
- correlate active deployment and known owner;
- enqueue notification delivery rather than sending inline;
- use a DLQ with an active consumer.

Each existing application DLQ should gain an active consumer that writes a minimal failure record into `platform_dlq_events`. The record must include resource, schema version, message ID if available, attempt/retry data, timestamp, safe business reference, and redacted error. Raw replay payloads should be encrypted or omitted unless explicitly required.

### 7.5 Monday-retirement readiness profile

Before the Monday retirement program can pass its Gate 0, Platform Operations must expose a versioned executable readiness profile, not a prose checklist. Register every relevant Monday webhook/reconciliation/outbound Queue and DLQ, Worker, R2 bucket/lifecycle or scan dependency, Cloudflare Email Service sending path and webhook, and shared message-attempt consumer with:

- stable resource ID, environment, owner, criticality, feature key, and runbook;
- expected heartbeat/freshness, SLO, alert threshold, retry policy, observed Queue retention, and escalation destination;
- dependency links and feature/kill-switch state;
- last controlled-test time, incident ID, logical-parent/attempt/reservation evidence IDs, result, and expiry.

The readiness evaluator returns one immutable revision ID and `ready=false` unless every required resource is current and these controlled tests pass end to end:

1. Queue retry and DLQ landing creates one durable redacted failure record and one deduplicated incident.
2. R2 denied write or failed scan creates one incident without losing or falsely accepting work.
3. Cloudflare Email Service controlled rejection/defer/bounce is recorded once on the intended `transactional_message_attempts` child with one attempt-bound quota reservation, retried according to policy, and alerts the development destination without falling back to Resend.
4. Invalid email-provider webhook authentication/replay is rejected and audited without altering delivery state.
5. Worker exception and missed-heartbeat tests correlate to the correct resource, owner, deployment, and runbook.

The Monday plan records the readiness revision it consumed. Expired evidence, an unowned resource, an unconsumed DLQ, stale telemetry, or a failed controlled test invalidates the revision and blocks Gate 0.

### 7.6 Forensic export

Use Workers Trace Events Logpush to R2 or, where useful, Cloudflare Pipelines to transform account-level trace events to Parquet or Iceberg in R2. Monitor job health because Logpush does not backfill missed periods.

Upload source maps for production Workers so Cloudflare can map minified exceptions back to TypeScript file and line information.

## 8. Data schema outline

Names are proposed and may be adjusted to existing migration conventions.

### 8.1 `platform_resources`

| Column | Purpose |
|---|---|
| `id` | Internal UUID. |
| `provider` | `cloudflare`. |
| `provider_resource_id` | Cloudflare ID or stable composite key. |
| `resource_type` | `pages_project`, `worker`, `workflow`, `queue`, `dlq`, `durable_object_namespace`, `agent`, `r2_bucket`, `email_service`, `provider_webhook`, `delivery_consumer`, `ai_gateway`. |
| `name` | Display/provider name. |
| `environment` | `production`, `preview`, `staging`, `development`. |
| `owner_team_id`, `owner_user_id` | Operational ownership. |
| `criticality` | `critical`, `high`, `standard`, `low`. |
| `feature_key` | Link to product/AI feature where relevant. |
| `runbook_url` | Approved runbook. |
| `cloudflare_url` | Allowlisted Cloudflare deep link. |
| `expected_config` | Redacted repository-derived configuration JSON. |
| `last_seen_at`, `last_synced_at` | Freshness. |
| `enabled` | Inventory state. |

Unique constraint: `(provider, provider_resource_id, environment)`.

### 8.2 `platform_resource_snapshots`

Store bounded periodic summaries: requests, errors, CPU/duration quantiles, backlog, lag, retries, concurrency, storage, active version/deployment, and readiness. Partition or expire aggressively.

### 8.3 `platform_deployments`

| Column | Purpose |
|---|---|
| `provider_deployment_id` | Cloudflare deployment ID. |
| `resource_id` | Target Page/Worker. |
| `environment` | Production/preview/etc. |
| `status`, `stage` | Normalized lifecycle. |
| `version_ids` | Active version IDs and percentages. |
| `branch`, `commit_hash`, `commit_message` | Source correlation. |
| `trigger_type`, `author_email` | Origin; email may require restricted display. |
| `started_at`, `completed_at` | Timeline. |
| `annotations` | Redacted provider annotations. |

Never persist or return deployment `env_vars`, secrets, tokens, or complete raw provider responses.

### 8.4 `platform_incidents`

Core fields: fingerprint, title, type, severity, status, resource, deployment, first/last seen, occurrence count, affected route/event type, owner, acknowledged/resolved metadata, suppression state, and last-notified state.

Unique active-incident constraint should prevent duplicate open incidents for the same fingerprint/resource/environment.

### 8.5 `platform_incident_events`

Store redacted samples and lifecycle events. Suggested fields: incident, provider event ID, event type, outcome, exception class, normalized message, source frame, Ray/correlation ID, occurrence time, ingest time, and redaction version.

### 8.6 `platform_dlq_events`

Store DLQ arrival, redacted failure details, source queue, safe business reference, replay eligibility, schema version, attempts, status, and replay audit linkage.

### 8.7 Shared normalized transactional message model

Use the same three provider-neutral records for new Platform Operations, board, and employee-adoption transactional messages:

- `transactional_messages` is the immutable channel-neutral parent. Store tenant, immutable logical event key, canonical recipient hash/reference, template/purpose ID, source feature, incident/business reference, content/template revision and creation time. Enforce uniqueness on `(tenant_id, logical_event_key, canonical_recipient_id, template_purpose_id)`. Do not put channel, provider, delivery status, provider attempt or quota reservation on this parent, and never include channel in parent uniqueness.
- `transactional_message_attempts` is an append-only set of channel/provider delivery children: never delete or repurpose a child. Store parent ID, channel, provider, pre-submission attempt idempotency key, provider message ID, and an idempotent status/error/timestamp projection backed by append-only webhook/worker evidence. Enforce uniqueness on `(transactional_message_id, channel, provider, attempt_idempotency_key)`; provider retries and worker replays reuse the same child identity.
- `transactional_quota_reservations` attaches one reservation to the intended outbound attempt. Enforce unique `transactional_message_attempt_id` and unique reservation key, with tenant, channel, quota bucket/window and reserve/release timestamps, so retry/replay cannot double-reserve.

Do not duplicate recipient secrets or use provider-specific tables as the deduplication authority. Cloudflare Email Service is primary. A provider failure leaves the same Cloudflare child attempt retryable/deferred or dead-lettered under policy; the parent remains immutable. It never automatically reroutes to legacy Resend, because an unrecorded provider switch can duplicate delivery and split quota/evidence.

### 8.8 `platform_ops_audit`

Append-only audit for XeroFlow actions: actor, capability, action, resource, before/after redacted summary, reason, approval, request/correlation ID, IP/user agent where policy permits, and timestamp.

### 8.9 `platform_collector_state`

Store collector name, cursor, last attempt/success, next run, error summary, consecutive failures, and rate-limit state.

### 8.10 `platform_ai_budget_revisions`

Store immutable named revisions with owner approval, effective/expiry time, gateway/environment/feature/model scope, monthly/daily/per-feature limits, warning/hard behavior, rate limits, pricing catalogue version and coverage, credit/reserve forecast, provider reconciliation timestamp/result, spend/rate controlled-test evidence, and status. A feature references the exact approved revision ID; mutable environment variables alone are not sufficient evidence.

## 9. Internal API outline

All admin endpoints require authenticated server-side authorization. Cloudflare credentials remain server-only.

### 9.1 Read APIs

- `GET /api/admin/platform-ops/overview`
- `GET /api/admin/platform-ops/resources`
- `GET /api/admin/platform-ops/resources/:id`
- `GET /api/admin/platform-ops/incidents`
- `GET /api/admin/platform-ops/incidents/:id`
- `GET /api/admin/platform-ops/queues`
- `GET /api/admin/platform-ops/deployments`
- `GET /api/admin/platform-ops/alerts`
- `GET /api/admin/platform-ops/audit`
- `GET /api/admin/platform-ops/readiness`
- `GET /api/admin/platform-ops/readiness/monday-retirement`
- `GET /api/admin/platform-ops/ai-budget`

All list endpoints use cursor pagination, bounded date ranges, typed filters, stable sorting, and response field allowlists.

### 9.2 Triage APIs

- `PATCH /api/admin/platform-ops/incidents/:id`
- `POST /api/admin/platform-ops/incidents/:id/comments`
- `POST /api/admin/platform-ops/incidents/:id/notify`
- `POST /api/admin/platform-ops/alerts/test`

Triage mutations require `PLATFORM_OPS_TRIAGE`, idempotency keys, and an audit entry.

### 9.3 Internal ingestion APIs

- `POST /api/integrations/cloudflare/notifications`
- `POST /api/internal/platform-ops/events`
- `POST /api/internal/platform-ops/collector-heartbeat`

Prefer Queue or service bindings for trusted internal delivery. Where HTTP is necessary, require a dedicated secret or service token, replay protection, strict schemas, and request-size limits.

### 9.4 Phase 4 remediation APIs

- `POST /api/admin/platform-ops/deployments/:id/retry`
- `POST /api/admin/platform-ops/deployments/:id/rollback`
- `POST /api/admin/platform-ops/workers/:id/deployments`
- `POST /api/admin/platform-ops/dlq-events/:id/replay`

These routes remain unavailable unless `PLATFORM_OPS_MUTATIONS_ENABLED=true`. They require recent authentication, `PLATFORM_OPS_DEPLOY`, a typed confirmation value, an operator reason, optimistic concurrency/current-state recheck, and immutable audit.

## 10. RBAC and security

### 10.1 Capability model

Add granular capabilities rather than placing every action behind the existing broad `ADMIN` permission.

| Capability | Default roles | Actions |
|---|---|---|
| `PLATFORM_OPS_READ` | owner, admin, developer; approved custom roles | View summaries, incidents, deployments, queues, and readiness. |
| `PLATFORM_OPS_TRIAGE` | owner, admin, on-call custom roles | Acknowledge, assign, comment, snooze, resolve, test notifications. |
| `PLATFORM_OPS_DEPLOY` | owner/super-admin only initially | Retry, replay, rollback, change Worker deployment percentage. |
| `PLATFORM_OPS_CONFIGURE` | owner only | Destinations, retention, thresholds, provider integration. |

Server handlers must use the dynamic role resolver so custom roles work. UI visibility is not authorization.

### 10.2 Cloudflare credentials

Use separate, account-scoped tokens:

1. **Read token**: Workers Scripts Read, Pages Read, Queues Read, Account Analytics Read, Notifications Read, and only other required read permissions.
2. **Logpush health token**: isolated because current Cloudflare API documentation requires Logs Write even for listing Logpush jobs.
3. **Mutation token**: Workers Scripts Write and/or Pages Write. Do not make it available to read routes, UI rendering, collectors that do not need it, or the browser.

Apply account/resource restrictions, IP restrictions, and expiry/rotation where supported. Store tokens as Cloudflare secrets, never plaintext variables or database fields. Track token presence and last successful validation, not token values.

### 10.3 Response and log safety

- Whitelist fields from every Cloudflare API response.
- Never expose `env_vars`, bindings containing secret material, webhook secrets, API tokens, provider keys, cookies, authorization headers, request bodies, prompts, or completions.
- Redact before Queueing or persistence, not only before rendering.
- Escape notification text and log messages as untrusted data.
- Validate all Cloudflare resource IDs/names against the resource registry before constructing API paths or dashboard deep links.
- Do not accept arbitrary URLs for deep links or callbacks.
- Add SSRF controls to any server-side external request path.

### 10.4 Webhook safety

Cloudflare generic Notifications sends the configured secret in `cf-webhook-auth`. Reject missing or mismatched values. Also validate account, timestamp, type, and correlation identity because a shared secret alone does not provide business-level replay protection.

### 10.5 Remediation safety

- No automatic production rollback in initial releases.
- Re-fetch current provider state immediately before a mutation.
- Require a successful production target for Pages rollback.
- Require compatibility and migration checks before Worker traffic splitting.
- Record operator, reason, target, prior state, new state, provider response ID, and verification result.
- Use two-person approval for critical resources when workflow support is available.
- Never offer a generic "restart Worker" action; Workers do not use a server restart lifecycle.

## 11. Alert and development-team notification matrix

Thresholds must be configurable per resource criticality. Percentage-based alerts require a minimum event volume to avoid noise.

### 11.1 Transactional email provider and delivery contract

Cloudflare Email Service is the primary provider for all new Platform Operations, board, and employee-adoption transactional email. All three use immutable `transactional_messages` parents for logical-event/recipient/template-purpose deduplication, append-only `transactional_message_attempts` for channel/provider status and webhook reconciliation, and attempt-bound unique `transactional_quota_reservations` for daily quota. One delivery service applies retry/jitter, suppression, DLQ, and audit.

Existing Resend sending remains legacy-only while callers are migrated deliberately. It is neither a hidden nor automatic fallback. If Cloudflare Email Service is unavailable, the selected Cloudflare child attempt remains queued/deferred or fails visibly according to its SLA; switching provider requires an owner-approved migration/replay decision against the existing logical parent so a recipient cannot receive both copies.

| Severity | Trigger examples | In-app | Email development team | Escalation |
|---|---|---:|---:|---|
| Critical | Production deployment failure; DLQ arrival on a critical flow; oldest-message SLA breached; sustained exception/resource-exceeded spike; production unavailable; critical scheduled job misses two expected executions; Logpush forensic gap during an active incident | Immediate | Immediate | Repeat after configured interval until acknowledged; optional Slack/PagerDuty later |
| High | Error fingerprint reopens after deployment; queue retries or lag rise materially; webhook/collector unavailable; critical Worker telemetry disappears; Durable Object isolate-memory trend approaches limit | Immediate | Immediate or 15-minute grouped window | Escalate if unacknowledged |
| Warning | Elevated p95/p99 latency or CPU; non-critical stale heartbeat; missing source map; repository/live observability drift; AI budget reaches warning threshold | Yes | Hourly digest by default | Promote if persistent |
| Info | Successful deployment; resolved Cloudflare alert; acknowledged incident; configuration change | Feed/audit | No by default | None |

### 11.2 Fingerprinting and deduplication

Fingerprint runtime failures using:

- environment;
- script/resource;
- entrypoint/event type;
- Worker outcome;
- exception class;
- normalized message with volatile IDs removed;
- top source-mapped application frame;
- active version when version-specific grouping is useful.

Notification behavior:

- notify immediately for a new critical/high incident;
- suppress duplicate emails while an incident remains acknowledged unless severity rises;
- reopen and notify when a resolved fingerprint returns after the quiet period;
- group bursts into one incident and include occurrence counts;
- use the existing notification allowlist pattern during rollout;
- record every attempted delivery and failure;
- provide a global `PLATFORM_OPS_NOTIFICATIONS_DISABLED=true` kill switch.

### 11.3 Initial derived checks

- Latest production Pages deployment failed or remains active beyond expected build duration.
- Worker outcomes include exception, exceeded CPU/resources, or elevated internal errors.
- Queue `backlog_count`, oldest-message age, lag, retry count, or DLQ outcomes breach resource SLA.
- Scheduled Worker or Workflow has no success heartbeat within two expected intervals plus grace.
- Logpush job is disabled unexpectedly, has `last_error`, or `last_complete` is stale.
- Cloudflare notification webhook has not successfully ingested a test/current event.
- Critical manifest lacks declared observability/source-map policy.
- AI Gateway estimated spend crosses 50%, 75%, 90%, or 100% of configured budget.

## 12. AI Gateway budget and privacy guardrails

AI Model Ops remains the authority for model assignments. Platform Operations owns budget health, gateway availability, and operational alerts.

### 12.1 Live AI Gateway account snapshot — 2026-08-06

This is a read-only Cloudflare MCP audit snapshot and may change independently of the repository.

- The credit-balance API succeeded and returned a raw balance of `4873`. Cloudflare billing endpoints use cents, so this is presented as **approximately USD $48.73**; the currency conversion is an inference and should be verified before any billing action.
- A payment method is present and the first top-up succeeded.
- Auto top-up is off: threshold and amount are both `0`.
- The account spending limit is disabled. A stale configuration value shows `$10` monthly, but it is not enforced.
- Unified Billing has no usage records in the previous 30 days.
- Gateway `default` has authentication and logging enabled, with no rate limit and no cache.
- Gateway `agency-dashboard-pilot` has logging enabled and a limit of 150 requests per 60 seconds, with no cache, but is **unauthenticated**.

Do not top up before completing the gateway/model/feature inventory and producing a usage forecast. Preserve an owner-defined reserve, then require explicit owner approval and an audited reason for any billing mutation. Harden `agency-dashboard-pilot` by enabling authentication before broader or production use; retain its rate limit and validate whether a stricter per-identity limit is required.

### 12.2 Named budget configuration revision

Every AI-enabled production feature must reference an approved immutable `platform_ai_budget_revisions` ID. The revision is admissible only when:

- gateway authentication and feature/model scope are explicit;
- monthly, daily, per-feature, rate, warning, and hard-limit behavior is approved;
- pricing coverage is 100% for every permitted model/provider route, or the uncovered route is disabled;
- provider-cost reconciliation completed at a recorded timestamp within the feature's approved freshness window;
- controlled spend-limit and rate-limit tests passed and reference incident/audit evidence;
- credit, owner reserve, 30-day forecast, fallback policy, and top-up trigger use the same pricing/reconciliation snapshot.

Any changed limit, model, price, route, reserve, or fallback creates a new revision. An expired/stale revision, failed spend/rate test, missing price, or reconciliation outside the approved freshness window makes optional AI fail closed. The Monday retirement program must name its consumed revision; if none is active, its deterministic migration continues with optional AI disabled.

### 12.3 Required request metadata

Send at most five non-sensitive custom metadata values, reflecting Cloudflare's current per-request limit:

- `org_id`: pseudonymous internal organization ID;
- `feature_key`: stable model-feature key;
- `environment`: production/preview/development;
- `risk_tier`: low/medium/high;
- `actor_key` or `team_key`: pseudonymous bucket used only where per-user/team controls are needed.

Do not send email addresses, client names, prompt text, or other PII as metadata.

### 12.4 Layered controls

1. **Global gateway spend limit** per month.
2. **Production daily spend limit** to contain sudden runaway cost.
3. **Per-feature budget** using `feature_key`, with high-cost generation separated from lightweight assistants.
4. **Per-model/provider cap** for premium or experimental models.
5. **Per-actor/team rate or spend limit** only where abuse/runaway loops are plausible.
6. **Count-based sliding rate limit** as a second control because cost enforcement is eventually consistent.
7. **Dynamic route fallback** to an approved lower-cost model when product behavior allows it.
8. **Fail closed** for high-risk actions when the approved model/budget is unavailable; never silently downgrade financial, publishing, or privileged decision flows to an unapproved model.

Budget dollar values must come from an owner-approved configuration, not be hard-coded in the PRD. Store:

- `AI_OPS_MONTHLY_BUDGET_USD`;
- `AI_OPS_DAILY_BUDGET_USD`;
- per-feature budgets in the existing model assignment/configuration store;
- warning thresholds of 50%, 75%, and 90%;
- hard-limit behavior at 100%.

Cloudflare spend limits are eventually consistent, so concurrent requests may briefly exceed a limit. Rate limits, application-level concurrency limits, and a daily provider-cost reconciliation are required as defense in depth.

### 12.5 Cost accuracy

AI Gateway cost is an estimate based on model identity, token reporting, and known/custom pricing. Provider billing remains authoritative. Platform Operations must show:

- `estimated` labeling;
- last reconciliation time;
- missing-price/model count;
- variance from provider invoice/export where available;
- fallback, blocked, and rate-limited request counts.

### 12.6 Prompt and response logging

Default to metadata-only logging for client or sensitive workflows using `cf-aig-collect-log-payload: false`; this preserves token, model, status, cost, and duration metadata without storing raw prompts/responses. Allow payload logging only for explicitly approved, low-risk debugging windows with expiry and audit.

Monitor gateway log-storage limits. Reaching the configured limit can stop new logs unless automatic oldest-log deletion is selected.

## 13. Retention

| Data | Default retention | Notes |
|---|---:|---|
| Cloudflare Workers Logs/traces | Native plan retention: currently 3 days Free, 7 days Paid | Quick investigation only. |
| Worker/Queue/DO aggregate metric snapshots in Neon | 90 days | Downsample older points before deletion if trend reporting is required. |
| Analytics Engine custom aggregates | Cloudflare native 3 months | Aggregate/statistical use only; adaptive sampling applies. |
| Queue and DLQ messages | Free: 24 hours, non-configurable. Paid: four days by default, configurable per queue up to 14 days. | Phase 0 records the actual account plan and live setting per Queue/DLQ. Never depend on Queue retention as incident storage. |
| DLQ failure records in Neon | 90 days | Redacted; resolved record summary may live longer. |
| Incident sample events | 30–90 days by severity | Minimize client and request data. |
| Incident summaries | 12 months | Keep ownership, timeline, cause, and resolution; not raw payloads. |
| XeroFlow Platform Ops audit | 18 months | Align with Cloudflare Audit Logs retention where practical. |
| Cloudflare Audit Logs v2 | Cloudflare native 18 months | UI queries may have a shorter practical window; API/Logpush for full retention. |
| Raw Workers Trace Event Logpush in R2 | 30 days default; 90 days for approved critical/error prefixes | Apply lifecycle rules. |
| Notification delivery records | 12 months | Store destination reference, not secrets. |
| AI request metadata | 90 days default | Raw prompts/responses off by default. |

Use R2 lifecycle rules to expire raw logs. Use bucket locks only for explicitly designated audit evidence because locks override lifecycle deletion and increase operational/compliance obligations.

## 14. Delivery phases and tasks

### Phase 0 — Inventory and safety baseline

- [ ] Create the canonical resource inventory from repository manifests.
- [ ] Assert the source baseline is 31 Wrangler manifests—29 TOML and 2 JSONC—with explicit observability in exactly the four listed manifests; treat the other 27 as repository-undeclared until live reconciliation proves their state.
- [ ] Reconcile inventory with live Cloudflare Pages, Workers, Queues, Workflows, DO namespaces, and AI Gateway.
- [ ] Assign owner, criticality, feature key, environment, and runbook to every production resource.
- [ ] Document live observability, sampling, source-map, Logpush, alert, and retention configuration.
- [ ] Verify the Cloudflare Queues plan and record the live retention setting for every Queue and DLQ: Free 24 hours non-configurable, or Paid default four days/configurable up to 14 days.
- [ ] Add explicit observability/source-map policy to critical manifests after measuring expected log volume.
- [ ] Verify every existing DLQ and add or document its active consumer.
- [ ] Provision separate Cloudflare read, Logpush-health, and future mutation tokens.
- [ ] Add `PLATFORM_OPS_*` capabilities to the dynamic role system.
- [ ] Define alert thresholds and the initial development-team allowlist.

### Phase 0A — Executable Monday-retirement Gate 0 readiness slice

This vertical slice is delivered before the broader Platform Operations UI phases because the Monday migration cannot pass Gate 0 without it.

- [ ] Register every relevant Monday Queue/DLQ/Worker/R2/Cloudflare Email Service webhook and shared message-attempt consumer with owner, SLO, alert, retry/retention, escalation, and runbook.
- [ ] Implement incident paths plus immutable `transactional_messages`, append-only `transactional_message_attempts`, and attempt-bound `transactional_quota_reservations` needed by the readiness tests.
- [ ] Implement `GET /api/admin/platform-ops/readiness/monday-retirement` with immutable readiness revision, evidence expiry, and fail-closed blockers.
- [ ] Run controlled Queue/DLQ, R2 failure, Cloudflare Email Service failure/webhook replay, and Worker exception/heartbeat tests.
- [ ] Record one deduplicated incident plus logical-parent/attempt/reservation evidence for each controlled failure, then resolve the test incidents without deleting evidence.
- [ ] Configure the development-team destination and validate the global notification kill switch.

### Phase 1 — Read-only Platform Operations cockpit

- [ ] Add the `/admin/platform-ops` navigation item and route shell.
- [ ] Implement Overview, Runtime, Queues, Deployments, Alerts, and Readiness views.
- [ ] Implement GraphQL and REST collectors with bounded queries, pagination, caching, and rate-limit backoff.
- [ ] Add normalized schema migrations and repositories.
- [ ] Add Cloudflare deep-link builders using an allowlisted resource registry.
- [ ] Show freshness/staleness on every metric and resource view.
- [ ] Add live-versus-repository drift findings.
- [ ] Cross-link agents to AI Model Ops.

### Phase 2 — Incident and developer-notification pipeline

- [ ] Add authenticated Cloudflare notification webhook ingestion.
- [ ] Add `platform-ops-events` Queue, consumer, and actively consumed DLQ.
- [ ] Add a redacting/fingerprinting Tail Worker for selected critical producers.
- [ ] Implement incident creation, grouping, acknowledge, assign, snooze, resolve, and reopen.
- [ ] Add deployment correlation.
- [ ] Add Cloudflare Email Service development-team notifications using the normalized parent/attempt/reservation model, suppression, escalation, delivery audit, test mode, and kill switch; migrate legacy Resend callers separately with no automatic fallback.
- [ ] Add active DLQ persistence consumers for existing Queues.

### Phase 3 — Forensics, audit, and budget controls

- [ ] Enable Workers Trace Events Logpush to R2/Pipelines for approved datasets.
- [ ] Add R2 lifecycle rules and Logpush-health alerts.
- [ ] Upload production source maps and validate a mapped test exception.
- [ ] Ingest Cloudflare Audit Logs v2 summaries.
- [ ] Add AI Gateway spend, error, token, cache, block, fallback, and rate-limit summaries.
- [ ] Configure owner-approved spend limits, dynamic-route fallbacks, and metadata-only logging defaults.
- [ ] Add provider-cost reconciliation and missing-price warnings.
- [ ] Persist and approve a named AI budget revision with 100% enabled-route pricing coverage, reconciliation timestamp, and controlled spend/rate test evidence.

### Phase 4 — Guarded remediation

- [ ] Add schema-validated replay of persisted DLQ events.
- [ ] Add Pages deployment retry and rollback.
- [ ] Add Worker deployment controls only after version-skew and Durable Object migration review.
- [ ] Require mutation feature flag, recent authentication, typed confirmation, reason, re-fetch/current-state check, and audit.
- [ ] Add post-action verification and automatic incident comment.
- [ ] Add two-person approval for critical resources if supported by workflow primitives.

### Phase 5 — Read-only operations copilot

- [ ] Migrate the XeroFlow MCP server from deprecated `McpAgent` to `createMcpHandler()`.
- [ ] Evaluate Cloudflare managed Observability, Logpush, Audit Logs, and GraphQL MCP servers using scoped OAuth.
- [ ] Expose a small set of goal-oriented, read-only tools rather than mirroring the Cloudflare API.
- [ ] Require citations/deep links in copilot findings.
- [ ] Add evals for false-positive incident summaries, permission isolation, sensitive-data leakage, and stale telemetry.
- [ ] Keep mutation tools disabled until a separate approval and evaluation milestone.

## 15. Acceptance criteria

### 15.1 Phase 0

- Every live production Cloudflare resource has a matching registry record or a documented exclusion.
- Every critical resource has an owner, criticality, environment, feature key, and runbook.
- Every declared DLQ has a verified active consumer and a tested durable failure record.
- The actual Cloudflare Queues plan and each Queue/DLQ retention are recorded and match either Free 24-hour non-configurable or Paid four-day default/configurable up to 14-day behavior.
- Cloudflare credentials are separated by capability and no token value is returned by an API or UI.
- Repository inventory reports exactly 31 source Wrangler manifests—29 TOML and 2 JSONC—and identifies the four explicit observability declarations in `agency-workflows`, `email-worker`, `email-lead-intake`, and `search-authority-publisher`; drift treats the remaining 27 as undeclared in repository configuration.
- Live observability configuration and repository intent are reconciled and drift is visible.
- The Monday-retirement readiness endpoint returns an immutable `ready=true` revision only after every relevant Queue/DLQ/Worker/R2/email webhook is registered with owner/SLO/alert/runbook and all controlled failures have incident plus logical-parent/attempt/reservation evidence.

### 15.2 Phase 1

- An authorized operator can identify overall production status, latest production deployment, open incidents, queue backlog, and stale telemetry from one page.
- A user without `PLATFORM_OPS_READ` receives a server-side 403 from every Platform Operations API.
- Metrics show observed time and stale state.
- Pages and Worker deployments are correctly normalized without persisting or returning environment variables.
- Queue backlog and oldest-message values match Cloudflare within the documented polling delay.
- Each detailed forensic action opens the correct allowlisted Cloudflare page.
- Cloudflare rate limits and transient failures produce stale/degraded indicators, not false healthy states.

### 15.3 Phase 2

- A valid Cloudflare test webhook creates one event; invalid secret, account, schema, or replay attempts are rejected.
- A controlled Worker exception creates or updates one fingerprinted incident and links the active deployment.
- A burst of identical failures sends one notification according to policy, not one email per event.
- A critical DLQ test message creates a durable DLQ record and alerts the configured development allowlist.
- A resolved incident reopens and re-notifies after the configured quiet period.
- Notification failure is visible and retried without duplicating successful delivery.
- New Platform Operations transactional mail uses Cloudflare Email Service and the normalized parent/attempt/reservation model; a provider failure does not automatically fall back to Resend.
- `transactional_messages` is unique by immutable logical event + recipient + template/purpose without channel; all channel/provider/status fields live on append-only `transactional_message_attempts`, and each intended outbound attempt can own at most one quota reservation even under retry/replay.
- No test event stores authorization headers, cookies, request bodies, prompts, or configured sensitive fields.

### 15.4 Phase 3

- Logpush health is monitored and a deliberate destination failure raises an alert.
- R2 lifecycle configuration demonstrably applies the approved retention policy.
- A production test exception is source-mapped to the original application file/line in Cloudflare.
- Audit events can be correlated with a resource and incident without exposing secret material.
- AI spend cards distinguish estimated from reconciled cost and identify unknown pricing.
- Spend/rate limits and fallback behavior are tested for a non-critical feature.
- Every enabled AI feature references an approved named budget revision with 100% enabled-route pricing coverage, current reconciliation timestamp, and passing spend/rate test evidence.
- Sensitive AI flows produce metadata-only gateway logs.

### 15.5 Phase 4

- Mutation routes do not exist operationally when the feature flag is off.
- Unauthorized or stale-session mutation attempts fail closed.
- Rollback only targets a verified successful production deployment.
- Replay only accepts a stored, replay-eligible, schema-versioned event.
- Every mutation records actor, reason, before/after state, provider identifier, and verification result.
- Failed remediation creates/updates an incident instead of reporting success.

## 16. Rollback and kill switches

This feature must be independently reversible from the runtime it observes.

### 16.1 Immediate noise containment

- Set `PLATFORM_OPS_NOTIFICATIONS_DISABLED=true` to stop email/webhook fan-out while continuing ingestion and incident grouping.
- Disable the Cloudflare notification destination or policy if inbound event volume is incorrect.
- Detach the Tail Worker from producer Workers if it causes cost, latency, or volume concerns.
- Pause the `platform-ops-events` producer/consumer only after confirming messages will not expire unnoticed.
- Do not switch Platform Operations email to legacy Resend as an automatic incident workaround; pause/defer in the shared ledger or execute an owner-approved provider migration against existing deduplication keys.

### 16.2 UI and collector rollback

- Hide the admin navigation and routes behind `PLATFORM_OPS_ENABLED=false`.
- Disable collector schedules while preserving the last known snapshot as stale.
- Revoke Cloudflare API tokens to fail closed.
- Keep additive database tables in place; do not destructively remove incident or audit history during rollback.

### 16.3 Remediation rollback

- Keep `PLATFORM_OPS_MUTATIONS_ENABLED=false` by default.
- Revoke/remove the mutation token independently of the read token.
- Deep-link operators to Cloudflare while in-app mutation controls are disabled.
- For a failed Pages rollback, use Cloudflare's deployment history to select a verified successful production deployment and record the action outside the disabled control path.

### 16.4 Forensic export rollback

- Disable the Logpush job if destination behavior is unsafe, then explicitly mark the forensic coverage gap because Logpush cannot backfill missed events.
- Lifecycle rules should remain unless the data owner approves longer retention.
- Remove bucket locks only through a reviewed change; locks can prevent lifecycle deletion and bucket emptying.

## 17. Official Cloudflare sources

Only Cloudflare primary documentation was used for the platform recommendations in this plan.

### Observability, logs, traces, and metrics

- [Workers Observability overview](https://developers.cloudflare.com/workers/observability/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)
- [Workers tracing](https://developers.cloudflare.com/workers/observability/traces/)
- [Exporting OpenTelemetry data](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
- [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)
- [Workers errors and exceptions](https://developers.cloudflare.com/workers/observability/errors/)
- [Source maps and stack traces](https://developers.cloudflare.com/workers/observability/source-maps/)
- [Workers metrics and analytics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
- [Querying Workers metrics with GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)
- [GraphQL Analytics API limits](https://developers.cloudflare.com/analytics/graphql-api/limits/)

### Deployments and Pages

- [Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Workers gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/)
- [Workers Deployments API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/)
- [Workers Versions API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/)
- [Pages deployments API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/)
- [Pages rollback API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/)
- [Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

### Queues and Durable Objects

- [Queues metrics](https://developers.cloudflare.com/queues/observability/metrics/)
- [Queue real-time metrics API](https://developers.cloudflare.com/api/resources/queues/methods/get_metrics)
- [Dead Letter Queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)
- [Queue pricing and retention](https://developers.cloudflare.com/queues/platform/pricing/)
- [Durable Objects metrics and analytics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)

### Analytics Engine, Logpush, Notifications, and audit

- [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Analytics Engine limits and retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/)
- [Analytics Engine sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)
- [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [Workers Trace Events Logpush](https://developers.cloudflare.com/workers/observability/logs/logpush/)
- [Workers Trace Events fields](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/workers_trace_events/)
- [Logpush behavior and limitations](https://developers.cloudflare.com/logs/logpush/)
- [Logpush to R2](https://developers.cloudflare.com/logs/logpush/logpush-job/enable-destinations/r2/)
- [Logpush to Pipelines](https://developers.cloudflare.com/logs/logpush/logpush-job/enable-destinations/pipelines/)
- [Cloudflare Notifications](https://developers.cloudflare.com/notifications/)
- [Available notification types](https://developers.cloudflare.com/notifications/notification-available/)
- [Notification webhook schema and validation](https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/)
- [Alerting API](https://developers.cloudflare.com/api/resources/alerting/)
- [Cloudflare Audit Logs v2](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/)

### R2 retention

- [R2 object lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

### Email Service

- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)
- [Sending transactional email](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)

### AI Gateway and MCP

- [AI Gateway analytics](https://developers.cloudflare.com/ai-gateway/observability/analytics/)
- [AI Gateway logging and payload controls](https://developers.cloudflare.com/ai-gateway/observability/logging/)
- [AI Gateway costs](https://developers.cloudflare.com/ai-gateway/observability/costs/)
- [AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)
- [AI Gateway rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)
- [AI Gateway dynamic routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)
- [AI Gateway limits](https://developers.cloudflare.com/ai-gateway/reference/limits/)
- [Cloudflare MCP overview](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Cloudflare managed MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- [MCP handler APIs and migration direction](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)
- [MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
- [Dynamic dispatch Workers](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/)
