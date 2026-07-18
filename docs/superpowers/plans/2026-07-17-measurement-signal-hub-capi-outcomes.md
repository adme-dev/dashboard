# Zero Measurement Signal Hub — CAPI, Outcome Feedback, and Delivery Health Plan

**Date:** 18 July 2026
**Status:** Controlled production pilot in progress — the dormant control plane and delivery foundation are deployed; provider certification, soak, and board cutover remain open
**Primary owner:** Digital / Media Operations
**Primary users:** ADME media/ops staff; client portal users
**Current incumbent job board:** [Meta CAPI Rollout — Monday board 18422459929](https://adme2.monday.com/boards/18422459929)
**Source PRD:** `/Users/paulgiurin/Downloads/meta-capi-rollout-prd.md`
**Parent/subtask execution backlog:** [Measurement Signal Hub execution backlog](./2026-07-17-measurement-signal-hub-execution-backlog.md)

**Production implementation update (18 July 2026):** Big Garage Subaru is the approved controlled pilot. Zero is the canonical configuration and delivery-health source for its disabled test profile, active first-party hostname, consent policy, exact Meta dataset and Google conversion action, capability matrix, mappings, audit history, and readiness blockers. The dedicated Queue/Worker/Hyperdrive/DLQ foundation and the internal/client health surfaces are deployed. Google still requires `datamanager` re-consent, and Zero currently has no Big Garage lead, tracking event, valid Meta lead ID, or Google click ID. Therefore provider test delivery, diagnostic reconciliation, dedup proof, failure/rollback drills, soak, Monday import/cutover, GraphWiki refresh, and final Monday reconciliation remain open. No provider event or Monday write has occurred.

## 1. Outcome

Build a multi-tenant **Measurement Signal Hub** into Zero so the platform—not Monday—becomes the canonical source for:

- each client's collection method and server-side tracking configuration;
- Meta and Google destinations, mappings, consent policy, and credential health;
- lead lifecycle truth, including `Qualified`, `Won`, and `Lost`;
- inbound CRM/client outcome feedback;
- conversion delivery attempts, failures, diagnostics, and replay;
- rollout readiness and production health.

Monday is the **temporary incumbent job board only**. Its board structure and work items are migrated into the platform's native boards/tasks, after which Zero owns both the implementation work and the runtime measurement configuration. Monday receives one final reconciled update at cutover and is then retained only as migration history; it does not feed runtime configuration.

This plan extends the tracking foundation already present in the repository. It does not propose a parallel tracking stack.

## 2. Executive recommendations

1. **Use Neon as the canonical control plane and audit store.** Store durable, versioned client settings and delivery state beside clients, leads, social connections, and tracking events. Use KV only as a derived hostname/config cache for the edge ingest path.
2. **Create a dedicated conversion delivery Worker and Queue.** The general jobs queue is already high-coupling, and the lead-delivery Worker is scoped to lead routing. Conversion fan-out needs its own retry, rate-limit, credential, DLQ, and replay lifecycle.
3. **Reuse connected Meta and Google accounts, but do not equate “connected” with “ready for conversions.”** Use existing connections for account discovery and linkage. Model conversion destinations separately because dataset/pixel IDs, conversion actions, scopes, tokens, and health have different lifecycles.
4. **Treat `Qualified` as a governed lifecycle transition.** It already exists in the internal data model and UI, and is visible in the portal. The missing work is portal mutation, transition rules, authority, audit history, and an atomic conversion outbox.
5. **Make Zero's native CRM the default outcome source.** For clients using the platform CRM, opportunity-stage movement (`Qualified`, `Won`, `Lost`) should emit conversions directly and transactionally—no webhook. Keep Zero Leads as the fallback for leads not yet linked to an opportunity. Signed webhooks, connector sync, and manual import are optional modes only for clients operating an external CRM/DMS.
6. **Deliver Meta first, but design a destination-neutral canonical event.** Google offline conversion delivery should use the Data Manager API path. The current Google OAuth connection lacks the Data Manager scope, so authorization and account-linking are a release gate rather than a hidden implementation detail.
7. **Fix browser/server dedup before enabling fan-out.** `public/track.js` currently generates one ID for its data-layer conversion and a different ID for the server beacon. One event ID must be created once and reused by both paths.
8. **Expose two different health surfaces.** Internal staff need configuration, errors, retry, test/live controls, and detailed diagnostics. Clients need lead outcome controls (when permitted) and a redacted, plain-language status view—never tokens or provider payloads.
9. **Move the rollout work itself into Zero.** Use the repository's existing Monday import/mapping and native board capabilities to migrate the current board, preserve provenance, reconcile every item/subitem, and cut operational work over to the platform.

## 3. R&D findings from the repository and GraphWiki

### Existing capabilities to retain

- `tracking_sites` and `tracking_events` already provide multi-tenant first-party ingestion, consent mode, origin controls, attribution IDs, and event deduplication storage.
- `public/track.js` already captures `_fbp`, `_fbc`, `fbclid`, Google click IDs, sessions, SPA navigation, consent, and sends events to `/api/public/track`.
- `server/utils/tracking/normalize.ts` and `pii-hash.ts` already establish destination-oriented normalization and hashing conventions.
- The leads schema already supports `new`, `contacted`, `qualified`, `won`, `lost`, and `spam_suspected`.
- The agency lead detail UI can already select `Qualified`; the client portal can filter and display qualified leads.
- Zero already has a native CRM with opportunities, configurable stages, default `Qualified/Won/Lost` semantics, queryable stage history, analytics, and agency/client-portal pipeline mutation routes.
- Existing Meta and Google connections already map external ad accounts to clients and report connection health.
- A standalone `leads-delivery-worker` proves the Pages producer → Cloudflare Queue → Worker → Hyperdrive → Neon pattern.
- Existing Monday clients, imports, webhooks, and reconciliation utilities can support the final board-update workflow without making Monday canonical.

### Gaps that change the implementation

- The portal's only lead write is `POST .../contacted`, restricted to `new → contacted`. It cannot set `Qualified`, `Won`, or `Lost`.
- Agency status changes are direct SQL updates with no shared transition service, immutable history, source authority, or transactional conversion event.
- Client users have no `canManageLeadOutcomes` permission.
- No conversion destination, mapping, outbox, delivery-attempt, or health schema exists.
- The current lead→CRM bridge only adds an inbound communication when email matches an existing CRM person. It does not create a durable lead→person/opportunity relationship or synchronize lifecycle truth.
- Agency and portal CRM stage-move routes duplicate direct SQL and call stage history/automation as a best-effort hook after the update. That boundary is not strong enough for a guaranteed conversion outbox.
- No inbound external CRM/DMS outcome webhook exists. This is only a gap for clients whose sales lifecycle is maintained outside Zero; current Meta/Google/generic lead webhooks ingest new leads, not downstream outcomes.
- The existing Google OAuth scopes are `adwords` and `content`; the Data Manager API requires `datamanager`, with OAuth verification or an approved service-account/data-partner model.
- Tracking configuration is global/technical today; it does not express client rollout tier, outcome authority, destination readiness, or test/live state.
- GraphWiki shows broad coupling around the general queue and duplicated lead modules across Pages and the leads Worker. Conversion delivery should not add another responsibility to those hubs.
- Graphify does not parse Vue SFC architecture deeply, so UI conclusions in this plan were cross-checked directly against the Vue source.

### External API implications verified on 18 July 2026

- Meta requires matching `event_name` and matching browser `eventID` / server `event_id` for deduplication; website events also require `event_source_url`. See [Meta server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event).
- Meta's Conversion Leads CRM integration is separate from ordinary web CAPI. Its published fit criteria include Instant Forms, retention of the 15–16 digit Meta Lead ID, roughly 200+ leads per month, at least daily uploads, a target stage within 28 days, and a 1–40% stage conversion rate. Clients that do not meet those criteria may still use CAPI for measurement, but must not be presented as Conversion Leads optimization-ready. See [Meta Conversion Leads CRM Integration](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration).
- For Conversion Leads, Zero must send the valid Meta `leadgen_id` as `user_data.lead_id`, `action_source=system_generated`, `custom_data.event_source=crm`, a Zero-specific `lead_event_source`, and every funnel stage—including the initial/raw lead event. Qualified-only snapshots are insufficient. Meta allows up to seven days of accurate backfill and recommends real-time or at least daily delivery. See [Meta CRM developer implementation](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration).
- Meta's published validation gate requires at least seven days of CRM event data, at least 60% lead coverage, at least two funnel stages, and valid required parameters before sales-funnel configuration. See [Meta CRM data verification](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/4-verify-your-data).
- Meta's programmatic Integration Quality/EMQ API is beta and requires Meta representative access. MVP health must use Zero's own delivery telemetry plus manual/provider-console verification; programmatic EMQ is an optional capability, not a dependency. See [Meta Integration Quality API](https://developers.facebook.com/docs/marketing-api/conversions-api/integration-quality-api).
- Google recommends Data Manager API for offline conversions; developer tokens without qualifying prior offline uploads are restricted from Google Ads API offline conversion uploads as of 15 June 2026. See [Google Ads API deprecations](https://developers.google.com/google-ads/api/docs/deprecations).
- The Data Manager API requires the `https://www.googleapis.com/auth/datamanager` scope and may require OAuth verification; it also supports advertiser or data-partner account access models. See [Data Manager API access setup](https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access).
- Google Data Manager partner-link administration uses an additional `datamanager.partnerlink` scope. A successful ingest returns a request ID but is not final proof: Google recommends polling `RetrieveRequestStatus` after an initial wait and until each destination reaches success, partial success, or failure, potentially for up to 24 hours. See [Data Manager destinations](https://developers.google.com/data-manager/api/devguides/concepts/destinations) and [Data Manager diagnostics](https://developers.google.com/data-manager/api/devguides/diagnostics).
- Cloudflare Queues supports delayed retry and DLQs, but messages left in an unconsumed DLQ expire. A platform replay path and alert are therefore part of the design. See [Cloudflare retry guidance](https://developers.cloudflare.com/queues/configuration/batching-retries/) and [DLQ guidance](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/).

### Live account and production-data readiness audit

The read-only [Meta and Google conversion readiness audit](../research/2026-07-17-meta-google-account-readiness-audit.md) found that the architecture is viable and provisionally identifies **Ferntree Gully Automotive** as the strongest inspected pilot candidate, but the CRM outcome path is not yet pilot-ready:

- the user-supplied Meta account is an inactive app-source shell, while Ferntree has an active `FTG Used` dataset with Pixel plus web CAPI; that connection is explicitly web-only, Meta separately recommends CRM CAPI, and the live Lead event is `6.2/10` with an update recommended;
- Ferntree has Google Enhanced Conversions for Leads managed through GTM, but its ten-action Submit lead form goal needs attention and one of eight enhanced-conversion actions has an urgent diagnostic issue;
- Zero has 113 active Meta and 102 active Google connections, but only 20/17 are client-linked and no Google connection has `datamanager` scope;

**18 July pilot decision:** Big Garage Subaru supersedes the provisional Ferntree candidate because ADME controls the published website and its Cloudflare/Netlify delivery path. The approved exact destinations are Meta dataset `202987455920103` and Google conversion action `customers/6257728347/conversionActions/7687832282`. This decision does not waive provider gates: the matched Google connection is expired and lacks `datamanager`, while Zero has no identifier-bearing Big Garage lead or tracking event.
- current intake contains no valid retained Meta Lead IDs or Google `gclid` values, and native CRM production has no opportunities/stage history yet.

Therefore T0's pilot-selection decision is resolved, but its provider-evidence portion remains open: capture the Big Garage baselines and prove a new provider lead identifier → CRM opportunity → stage history path before the adapters can be accepted. Existing web CAPI or GTM enhanced conversions are baseline signals, not evidence that CRM outcome delivery is ready.

## 4. Canonical ownership model

| Concern | Canonical owner | Derived/read-only copies |
|---|---|---|
| Per-client measurement configuration | Neon / Zero | Edge KV cache; final historical Monday snapshot |
| Destination IDs and connection linkage | Neon / Zero | Worker runtime cache |
| Secret material | Cloudflare secret binding/store or encrypted token store | Only opaque secret reference in Neon |
| Lead/opportunity lifecycle status | Native Zero CRM stage; Zero Leads until linked | Provider conversion events; native rollout evidence |
| External CRM/DMS outcome authority | Neon / Zero policy, only when configured | Portal label and integration instructions |
| Conversion event | Append-only Neon outbox | Queue message |
| Delivery status and diagnostics | Neon / Zero | Internal UI; redacted portal summary |
| Rollout/project work and completion | Native Zero board/tasks after cutover | Monday retained as read-only migration history |

Rule: a Monday edit must never change live tracking behavior or overwrite a native Zero job after cutover. During migration, Monday is read-only input to a governed import. After cutover, only the final reconciliation write described in T19 is permitted unless a separately approved exception is raised.

## 5. Target architecture

```text
Browser tag / GTM          Zero CRM pipeline / Leads UI         External CRM/DMS
        |                         agency or portal                       |
        v                                |                               v
POST /api/public/track                   |                   signed outcome webhook
        |                                v                               |
        +----------------------> canonical event services <--------------+
                                         |
                         Neon transaction: lifecycle history
                         + conversion_events outbox
                                         |
                              queue publisher + sweeper
                                         |
                            conversion-delivery-queue
                                         |
                           dedicated delivery Worker
                              /                    \
                    Meta CAPI adapter        Google Data Manager
                              \                    /
                               conversion_deliveries
                                         |
                        internal health + redacted portal health
                                         |
                        native Zero rollout board + evidence
                                         |
                            final cutover reconciliation
                                         v
                         Monday board retained as history
```

The request path records canonical truth and returns quickly. Provider calls never block a portal or lead-status mutation. A sweeper re-enqueues committed outbox rows that were not successfully published, closing the database/queue dual-write gap.

## 6. Configuration model

### 6.1 Client measurement profile

One active profile per client:

```ts
type CollectionTier =
  | 'cloudflare_owned'
  | 'first_party_cname'
  | 'shared_endpoint'
  | 'backend_only'

type OutcomeAuthority =
  | 'zero_native'
  | 'client_webhook'
  | 'connector_sync'
  | 'manual_import'

interface ClientMeasurementProfile {
  clientId: string
  enabled: boolean
  environment: 'test' | 'live' | 'paused'
  collectionTier: CollectionTier
  trackingSiteId: string | null
  firstPartyHostname: string | null
  hostnameStatus: 'not_required' | 'pending' | 'active' | 'error'
  consentMode: 'off' | 'au_optout' | 'consent_gated'
  vertical: string
  outcomeAuthority: OutcomeAuthority
  nativeLifecycleMode: 'crm_preferred' | 'leads_only'
  portalOutcomeMode: 'disabled' | 'propose' | 'authoritative'
  configVersion: number
}
```

`collectionTier` describes transport; `outcomeAuthority` describes lifecycle truth. Default to `zero_native`; in `crm_preferred` mode, a linked CRM opportunity owns the outcome while an unlinked lead remains actionable in Zero Leads until promotion/linking. Keeping these fields separate avoids encoding “uses CNAME” as “client webhook is authoritative.”

### 6.2 Destination model

Each profile may have zero or more destinations:

- platform: `meta` or `google_data_manager` initially;
- independently declared capability/mode: `meta_pixel`, `meta_web_capi`, `meta_crm_capi`, `meta_conversion_leads`, `google_tag_enhanced_conversions`, `google_enhanced_conversions_for_leads`, or `google_data_manager`;
- capability status: `not_configured`, `detected`, `configured`, `validating`, `ready`, `degraded`, or `blocked`, with evidence timestamp and reason;
- management origin: `zero`, `gtm`, `partner`, or `external`, so Zero can observe an existing integration without claiming ownership or overwriting it;
- linked existing `social_connection_id` where applicable;
- external account/dataset/pixel/conversion-action identifiers;
- opaque credential reference, never the secret;
- environment, enablement, configuration version, and health state;
- last validation, success, failure, provider request ID, and redacted error class.

Connection health and destination health are distinct. A healthy Google Ads spend connection can still be unauthorized for Data Manager ingestion.

### 6.3 Canonical event taxonomy

Start with a small platform-owned taxonomy:

- `lead_created`
- `lead_contacted`
- `lead_qualified`
- `lead_won`
- `lead_lost`
- `purchase`
- existing website conversion events mapped through an allowlist

Destination mappings translate canonical names to Meta event names and Google conversion actions. Do not store provider-specific names as the lifecycle truth.

### 6.4 Outcome authority and conflict rules

| Authority mode | Who may set final lifecycle state? | Portal behavior | Reconciliation |
|---|---|---|---|
| `zero_native` | Linked native CRM opportunity; otherwise the unlinked Zero lead | CRM pipeline for linked opportunities; lead actions before linking | Lead mirrors mapped CRM outcome after linking; promotion preserves provenance |
| `client_webhook` | Signed client system | Propose or disabled; cannot overwrite newer authority event | Webhook delivery diagnostics |
| `connector_sync` | Scheduled connector | Read-only/propose | Watermark + periodic full reconcile |
| `manual_import` | Approved internal importer | Read-only/propose | Import report and exception queue |

Default conflict policy:

1. Scope identity resolution to one client.
2. Deduplicate by source system + source event ID.
3. Compare the source's `occurredAt`, not request arrival time.
4. Do not regress terminal states automatically.
5. Route ambiguous matches and conflicting terminal outcomes to an exception queue.
6. Preserve every attempted transition in immutable history, including rejected transitions.

## 7. Proposed data model

The schema task must validate naming and exact columns, but the target responsibilities are:

| Table | Responsibility | Key constraints |
|---|---|---|
| `client_measurement_profiles` | One canonical profile per client | unique client; versioned; paused kill switch |
| `conversion_destinations` | Meta/Google delivery config and independently evidenced capability modes | unique profile/platform/external destination/mode; management origin and secret ref only |
| `conversion_event_mappings` | Canonical → provider mapping | versioned; one active mapping per destination/event |
| `lead_crm_links` | Durable attribution link from intake lead to CRM person/opportunity | client-scoped FKs; explicit link method/provenance |
| `lead_status_events` | Immutable lifecycle transition history | actor/source, from/to, authority decision, occurred time |
| `outcome_endpoints` | Per-client inbound webhook identity and policy | opaque endpoint key, secret version, rotation state, rate policy |
| `conversion_events` | Canonical transactional outbox | unique idempotency key; config snapshot/version; no provider token |
| `conversion_deliveries` | One event × destination delivery lifecycle | unique event/destination; attempt count; redacted diagnostics |

PII policy:

- persist only identifiers already allowed by the client contract and consent mode;
- hash normalized identifiers before provider delivery where the provider requires it;
- keep raw webhook payloads out of long-lived delivery logs;
- if encrypted raw PII is required for deferred processing, isolate it in a short-retention encrypted envelope referenced by the event;
- never include PII, secrets, access tokens, or full provider payloads in logs or Monday updates.

## 8. API boundaries

All new APIs are versioned or internal, schema-validated, tenant-scoped, and return the repository's consistent error envelope.

### Internal agency APIs

```text
GET    /api/agency/measurement/clients
GET    /api/agency/measurement/clients/:clientId
PUT    /api/agency/measurement/clients/:clientId/profile
POST   /api/agency/measurement/clients/:clientId/destinations
PATCH  /api/agency/measurement/destinations/:destinationId
POST   /api/agency/measurement/destinations/:destinationId/validate
POST   /api/agency/measurement/deliveries/:deliveryId/replay
GET    /api/agency/measurement/health
```

### Lead lifecycle APIs

```text
PATCH /api/leads/:id
PATCH /api/client-portal/leads/:id/status
PATCH /api/crm/opportunities/:id/move
PATCH /api/client-portal/crm/opportunities/:id/move
```

The lead routes delegate to one lead transition service, while both CRM routes delegate to one opportunity-stage service. Both services call the same canonical outcome/outbox boundary. The portal lead contract takes `{ status, expectedStatus, occurredAt?, reason? }`; CRM movement likewise includes an expected stage/version. Stale state produces `409` rather than silently overwriting a newer outcome.

### Client outcome webhook

```text
POST /api/public/v1/outcomes/:endpointKey
```

Required headers:

- `X-Zero-Signature: v1=<hex-hmac-sha256>` over timestamp + raw body;
- `X-Zero-Timestamp` with a short replay window;
- `X-Zero-Event-Id` as the external idempotency key.

Minimum body:

```json
{
  "sourceSystem": "dealer-crm",
  "externalLeadId": "abc-123",
  "status": "qualified",
  "occurredAt": "2026-07-17T01:23:45Z",
  "value": 0,
  "currency": "AUD",
  "reason": null
}
```

Identity resolution order: the client's external/source lead ID, then platform lead ID where explicitly mapped, then advertising click IDs, then consented email/phone matching as a controlled fallback. No cross-client matching.

## 9. User experience

### Internal media/ops

Add a client-level **Measurement** surface and a global **Signal Health** view.

Client Measurement surface:

- rollout tier, hostname/CNAME status, consent mode, and test/live/paused state;
- connected account and destination selection;
- Meta dataset/pixel and Google conversion-action mapping;
- outcome authority and portal permissions;
- native CRM linkage coverage and unmapped/custom stage warnings;
- canonical event mapping, including `Qualified`;
- validation checklist and test-event controls;
- last event received, last successful delivery, failure class, retry/replay;
- immutable config/audit history.

Global Signal Health:

- filter by client, platform, tier, rollout state, and failure class;
- received, accepted, deduplicated, skipped-by-policy, queued, delivered, retried, and failed counts;
- stale connections, CNAME failures, queue backlog, DLQ count, and last-success age;
- safe links into client configuration and a provider console, without exposing credentials.

### Client portal

- use the existing native CRM pipeline as the primary Qualified/Won/Lost control for linked opportunities;
- allow permitted users to move unlinked leads through approved transitions without creating a competing lifecycle source;
- show when a CRM is authoritative and disable conflicting portal actions with a clear explanation;
- show last outcome sync, recent accepted/rejected counts, and plain-language delivery status;
- hide dataset tokens, webhook secrets, raw identifiers, provider request bodies, internal stack traces, and other clients.

## 10. Implementation plan and dependency graph

```text
T0 Board + pilot discovery
 ├─> T1 ADR, threat model, contracts
 │    ├─> T2 schema
 │    │    ├─> T3 services/config APIs ─> T4 internal config UI
 │    │    └─> T5 native CRM/lead lifecycle ─┬─> T6 portal outcomes
 │    │                                      ├─> T8 transactional outbox
 │    │                                      └─> T7 external outcome webhook (optional cohort)
 │    └─> T9 browser dedup/collection contract ─> T10 hostname/tier control
 └───────────────────────────────────────────────┘

T8 + T9 + T10 ─> T11 delivery Worker ─> T12 Meta adapter ─> T13 Google spike/adapter
T0 ─> T4A migrate rollout jobs into Zero; T3 + T4 then add typed Measurement links
T3 + T6 + T11 + T12 ─> T14 health/observability ─> T15 portal health; T7 extends health for external-CRM cohorts
T12 + T14 + T4A ─> T16 pilot and staged rollout ─> T17 docs/Graphify ─> T18 platform-board closeout ─> T19 Monday final reconciliation
```

Sizes are relative implementation sizes, not calendar commitments: **S** ≈ 1–2 engineering days, **M** ≈ 2–4, **L** ≈ 4–7. No task should be allowed to grow past L; split it if discovery expands scope.

## 11. Detailed tasks

### T0 — Snapshot the rollout board and select the pilot (S)

**Purpose:** Establish a read-only baseline and resolve operational unknowns before designing migration or board automation.

**Subtasks**

1. Query Monday board `18422459929` through the existing Monday connection and record group, column, label, item, and subitem identifiers. Browser rendering was insufficient to extract the table reliably, so use the API rather than DOM assumptions.
2. Map existing board fields to proposed platform fields: client, method/tier, dataset/pixel, hostname/CNAME, consent, test events, dedup, outcome source, `Qualified` feedback, live date, owner, and status.
3. Inventory clients into `cloudflare_owned`, `first_party_cname`, `shared_endpoint`, and `backend_only`; separately record outcome authority candidates.
4. Provisionally nominate **Ferntree Gully Automotive** as the pilot because it has known GTM/site access, an active Meta dataset/web-CAPI baseline, an Enhanced Conversions for Leads baseline, and linked Meta/Google connections. Name a fallback from the dual-connected client cohort.
5. Record Ferntree's current baseline before mutation: Meta dataset `573284833843027`, web-only CAPI, Lead EMQ `6.2/10`, and CRM-CAPI recommendation; Google customer `4221552633`, ECL via GTM, Submit lead form Needs attention, and the urgent enhanced-conversion diagnostic.
6. Name the client/GTM, Meta, Google, native CRM/portal, and privacy owners. Require permission to create/link a native CRM opportunity and submit test events; do not use a manager/test shell as evidence of destination readiness.
7. Prove a fresh Meta lead ID or Google click/user-data identifier and confirm whether the account meets Conversion Leads volume/latency criteria. If it cannot, keep Ferntree as a web/offline measurement pilot without presenting it as optimization-eligible.
8. Record board items that do not map cleanly. Do not mutate the board.

**Acceptance criteria**

- A board-schema snapshot and field mapping are attached to this plan or a discovery note.
- Ferntree is confirmed or rejected with recorded reasons; one fallback pilot is named with access owners and blockers.
- Meta and Google provider baselines are recorded so rollout impact is measurable and existing diagnostics are not misattributed to Zero.
- A fresh test lead proves Meta Lead ID or Google click/user-data retention before adapter acceptance.
- The migration/cutover rule is explicit: Monday is temporary input, Zero becomes the working board and runtime source, and Monday receives only a final historical reconciliation.

**Verification:** Compare API-returned board IDs/labels with a manual board view; obtain owner sign-off on the pilot.
**Dependencies:** None.
**Likely files:** `server/utils/mondayClient.ts`, a new discovery note under `docs/superpowers/research/`.

### T1 — Approve the architecture ADR, lifecycle contract, and threat model (M)

**Purpose:** Freeze the public and cross-module contracts before schema or UI code.

**Subtasks**

1. Write an ADR for Neon canonical config, KV as cache, a dedicated Worker, native Zero job tracking, and Monday retirement after migration/final reconciliation.
2. Define the canonical event schema, config versioning, destination adapter interface, lead and CRM-opportunity lifecycle state machines, authority precedence, lead→opportunity promotion/linking behavior, and terminal-state policy.
3. Define permissions for internal edit/view/replay and portal `canManageLeadOutcomes`.
4. Threat-model public tracking and outcome endpoints: spoofing, tenant confusion, replay, enumeration, payload bombs, rate abuse, secret rotation, PII logging, and support access.
5. Decide retention for lifecycle history, conversion metadata, delivery attempts, encrypted identifier envelopes, and webhook rejections.
6. Decide whether portal actions are authoritative or proposals for each outcome mode.

**Acceptance criteria**

- ADR and threat model are approved by product, engineering, and data/privacy owners.
- Every state transition and authority conflict has deterministic behavior.
- API examples and error cases are documented before implementation.

**Verification:** Contract review using stale update, duplicate webhook, reversed terminal state, wrong tenant, expired signature, provider 429, and disabled-client scenarios.
**Dependencies:** T0.
**Likely files:** `docs/decisions/ADR-00x-measurement-signal-hub.md`, `docs/security/measurement-signal-hub-threat-model.md`, `server/utils/measurement/contracts.ts`.

**Checkpoint A:** Do not begin migrations until T0–T1 decisions are accepted.

### T2 — Add canonical measurement and lifecycle schema (M)

**Purpose:** Add durable config, audit, outbox, and delivery state without activating any client.

**Subtasks**

1. Create the tables in section 7 with UUIDs, foreign keys, unique idempotency constraints, timestamps, and query indexes, including durable `lead_crm_links`.
2. Add `can_manage_lead_outcomes` to client users with a safe default of false.
3. Add config version/check constraints and `test/live/paused` state.
4. Add append-only protections for status events and immutable provider-attempt identity.
5. Seed dormant defaults for existing clients; do not infer enabled destinations from connected accounts.
6. Add down/rollback notes and data-retention indexes.

**Acceptance criteria**

- Migration is additive, repeat-safe where repository conventions require it, and leaves all clients disabled.
- Unique constraints prove webhook and event idempotency.
- No credential value column is introduced.

**Verification:** Migration contract tests; apply to an isolated database; duplicate/foreign-key/check-constraint tests; inspect query plans for client/time and pending-outbox lookups.
**Dependencies:** T1.
**Likely files:** `server/database/migrations/256_measurement_signal_hub.sql`, `test/config/measurementSignalHubMigrationContract.test.ts`.

### T3 — Build typed repositories, policy services, and configuration APIs (M)

**Purpose:** Make one audited service layer the only way to read or change measurement config.

**Subtasks**

1. Implement repositories for profiles, destinations, mappings, outcome endpoints, events, and deliveries.
2. Add Zod input/output contracts and a shared error taxonomy.
3. Enforce internal RBAC and client scoping at service and route boundaries.
4. Increment `configVersion` atomically and capture before/after audit metadata on every mutation.
5. Publish a derived, non-secret hostname config to KV only after the Neon transaction commits; include cache version and safe stale fallback.
6. Implement test/live/paused and destination kill switches.

**Acceptance criteria**

- Routes cannot return secrets or cross-client data.
- Stale config updates return `409` instead of overwriting a newer version.
- A KV/cache failure does not erase canonical config and surfaces a health warning.

**Verification:** Unit and endpoint tests for roles, tenant isolation, validation, optimistic concurrency, redaction, cache failure, and audit history.
**Dependencies:** T2.
**Likely files:** `server/utils/measurement/*`, `server/api/agency/measurement/**`, `test/server/measurement/**`.

### T4 — Build the internal client Measurement configuration slice (M)

**Purpose:** Give media/ops staff a usable canonical configuration surface before any live delivery.

**Subtasks**

1. Add a Measurement tab/panel to the existing agency client page; keep the current Website/tracking view linked rather than duplicated.
2. Build profile fields for tier, hostname, consent, outcome authority, native CRM/lead mode, portal mode, environment, and owner.
3. Add destination cards that reuse connected Meta/Google accounts for discovery but require explicit destination mapping.
4. Add a capability matrix per client showing Meta Pixel, web CAPI, CRM CAPI, Conversion Leads, Google tag enhanced conversions, Enhanced Conversions for Leads, and Data Manager independently. Show status, management origin, evidence time, blockers, and whether Zero may mutate it.
5. Add an event mapping editor with presets and explicit `lead_qualified` mapping.
6. Show a readiness checklist and validation history; disable Live until every capability required by the selected rollout mode passes, without blocking on unrelated externally managed capabilities.
7. Add an audit drawer with actor, time, changed fields, and config version.

**Acceptance criteria**

- An authorized operator can configure a disabled test profile end to end without SQL or Monday.
- An operator cannot mistake an externally managed web CAPI/GTM setup for a Zero-managed CRM destination or Conversion Leads-ready state.
- A viewer cannot edit, validate, replay, or view secret material.
- Live activation is blocked when hostname, consent, credentials, or mapping gates fail.

**Verification:** Component tests and real-browser test of create/edit/stale-save/permission/error states at desktop and mobile widths.
**Dependencies:** T3.
**Likely files:** `app/pages/agency/clients/[id].vue`, `app/components/measurement/ClientMeasurementPanel.vue`, `app/components/measurement/DestinationCard.vue`, related API tests.

### T4A — Import the Meta CAPI rollout job board into Zero and cut over work management (M)

**Purpose:** Transfer the current operational board into the platform so Zero becomes the canonical home for both the work and the resulting configuration.

**Subtasks**

1. Use T0's board-schema snapshot to map Monday groups, columns, status labels, people, dates, dependencies, items, and subitems to the native Zero board/task model.
2. Create a native **Meta CAPI Rollout** board in Zero with the agreed groups, statuses, owners, dates, and client references. Keep measurement configuration fields in the Measurement profile; do not duplicate runtime settings into arbitrary task columns.
3. Run the repository's existing scoped Monday import in dry-run mode and produce a source→destination diff. Reuse `monday_board_mappings`, `monday_item_mappings`, source IDs, comments/files migration, and reconciliation utilities where they fit.
4. Import every in-scope item and subitem, preserving the Monday board/item IDs as provenance and linking each client rollout job to its existing client record. Backfill the typed `client_measurement_profile` link after T3 creates profiles.
5. Import useful updates, files, decisions, blockers, owners, and dates subject to the approved scope and retention policy. Exclude secrets, redundant generated activity, and data that has no business value.
6. Reconcile counts and field values at board, group, item, and subitem level; route unmapped people/statuses/columns to an exception report rather than silently dropping them.
7. Establish a cutover timestamp. Before it, Monday is the temporary job board and the import may be rerun idempotently. After it, Zero is canonical and Monday becomes read-only except for T19's final completion reconciliation.
8. Put a visible migration notice and link to the native Zero board on the Monday board, if the board supports it and the user approves the write at cutover.

**Acceptance criteria**

- Every in-scope Monday item/subitem is imported or appears in an explicit exception report.
- Imported jobs retain Monday provenance and have stable native Zero IDs.
- Runtime measurement settings exist only in typed measurement tables; the native board links to them rather than becoming a second config store.
- Owners agree on the cutover timestamp and perform all new job updates in Zero afterward.

**Verification:** Dry-run diff, imported/source count reconciliation, sampled field/comment/file comparisons, idempotent rerun, permission test, and manual browser walkthrough of the native board.
**Dependencies:** T0 for board import/cutover; T3–T4 only for the later typed Measurement-profile links. Complete the working-board cutover as early as practical and before T16 rollout execution.
**Likely files:** existing `server/utils/mondayMigrationComplete.ts`, `server/utils/mondayMigration.ts`, `server/utils/mondayClient.ts`, mapping/import routes, `app/pages/agency/boards/[id].vue`, and a narrowly scoped migration config/evidence note.

### T5 — Centralize native CRM and lead lifecycle transitions with immutable audit (L)

**Purpose:** Make native CRM stages the default source of outcome truth, keep unlinked leads coherent, and replace direct status/stage SQL with transactional services.

**Subtasks**

1. Encode allowed lead transitions, CRM stage semantics, configurable stage→canonical outcome mappings, and terminal-state behavior from T1.
2. Add explicit `lead_crm_links` when an intake lead is promoted/matched to a CRM person and opportunity. Preserve source lead ID, attribution IDs, link method, actor, and time.
3. Implement `transitionLeadStatus()` using a transaction and row lock or optimistic precondition for leads without a linked opportunity.
4. Implement `moveOpportunityStage()` as the shared agency/portal CRM service. Move the opportunity, write `crm_opportunity_stage_history`, apply canonical outcome mapping, and insert the conversion outbox atomically. Stage automations may remain asynchronous, but outcome/audit cannot be best-effort.
5. When a linked opportunity moves, mirror the mapped outcome to `leads.status` as derived state without generating a second conversion event. Define deterministic behavior for custom stages and multiple opportunities.
6. Record accepted and rejected lead/outcome transitions with actor type/ID, source, authority, reason, and occurrence time.
7. Refactor agency and portal lead endpoints plus both CRM opportunity move routes to use the shared services while preserving compatible responses during migration.
8. Add linked-opportunity and unified lifecycle history to the agency lead detail and CRM opportunity surfaces.

**Acceptance criteria**

- No agency or portal route writes `leads.status` or `crm_opportunities.stage_id/status` directly.
- Concurrent or stale transitions do not silently overwrite each other.
- A native CRM move to a mapped Qualified/Won/Lost stage creates one canonical outcome and one outbox event, and the linked lead reflects it without duplication.
- Existing Qualified behavior remains available for unlinked leads with full history.

**Verification:** Lead and stage state-machine tests, link/provenance tests, concurrency test, duplicate-outbox test, custom-stage mapping test, tenant/visibility test, regression tests for CRM automations and lead assignment/notes, and UI audit-timeline test.
**Dependencies:** T2–T3.
**Likely files:** `server/utils/leads/statusTransition.ts`, new `server/utils/crm/opportunityStageTransition.ts`, `server/utils/crm/stageAutomation.ts`, agency/portal lead routes, both `crm/opportunities/[id]/move.patch.ts` routes, CRM pipeline UI, and `app/components/leads/LeadDetailSlideover.vue`.

### T6 — Align portal Leads and native CRM outcome controls (M)

**Purpose:** Let clients supply timely outcome truth through the native CRM pipeline by default, while retaining governed lead actions before an opportunity exists.

**Subtasks**

1. Add `canManageLeadOutcomes` to server client-user types, admin user management, and portal session responses.
2. Apply `canManageLeadOutcomes`, expected-stage concurrency, and canonical mapping rules to the existing portal CRM opportunity move path.
3. Add `PATCH /api/client-portal/leads/:id/status` for unlinked leads with allowed statuses, `expectedStatus`, visibility rule, client scope, and authority enforcement.
4. Replace the one-off “Mark contacted” action with a transition/link menu that adapts to current state, CRM linkage, and authority mode. When linked, direct the user to or update the native CRM opportunity instead of independently changing the lead.
5. Require a reason for `lost` if configured; capture opportunity amount/value for `won` where available without making it mandatory for the first pilot.
6. Explain disabled actions when an external CRM/webhook is authoritative.
7. Refresh lead list, CRM pipeline/detail, counts, and audit state after success; handle `409` with a reload prompt.

**Acceptance criteria**

- A permitted portal user can move a linked native CRM opportunity to Qualified and see the linked lead update, or set Qualified on a visible unlinked lead.
- An unpermitted user, wrong client, hidden lead, invalid transition, and stale update are rejected without leaking lead existence.
- Portal and agency show the same canonical status after refresh.

**Verification:** Endpoint authorization matrix, link/unlinked portal component tests, and browser test from lead intake → CRM opportunity → Qualified → Won; repeat with an unlinked lead and external-webhook-authority read-only mode.
**Dependencies:** T3, T5.
**Likely files:** `server/utils/clientAuth.ts`, `server/api/client-portal/leads/[id]/status.patch.ts`, `app/components/portal/LeadsInbox.vue`, client-user admin UI/migration tests.

### T7 — Build signed inbound outcome webhooks and mapping diagnostics (L)

**Purpose:** Receive accurate lifecycle outcomes only for clients whose sales lifecycle is maintained in an external CRM/DMS. This is not required for the native-CRM MVP.

**Subtasks**

1. Implement opaque endpoint keys, per-client HMAC secrets, versioned signature verification, timestamp replay window, and constant-time comparison.
2. Validate body size/content type/schema before business processing; add endpoint/client rate limits.
3. Deduplicate on endpoint + external event ID and retain a minimal redacted receipt for diagnostics.
4. Resolve lead identity in the approved order and apply per-client external→canonical status mappings.
5. Resolve or create the approved lead/CRM link and call the shared canonical outcome service with `client_webhook` authority; return stable accepted/duplicate/rejected results without exposing internal data.
6. Build endpoint creation, secret reveal-once/rotation, mapping, sample payload, signature example, and test console in the internal UI.
7. Add an exception workflow for unknown lead, ambiguous match, invalid regression, and conflicting terminal outcome.
8. Run a connector-vs-webhook feasibility spike for the pilot CRM. Implement pull reconciliation only if the CRM cannot reliably send webhooks.

**Acceptance criteria**

- Valid signed duplicate deliveries are idempotent.
- Old timestamps, wrong signatures, oversized bodies, wrong client identifiers, and replay attempts are rejected and observable.
- Secret rotation supports a short dual-key grace period without displaying stored secret values.
- An external-CRM sandbox status reaches the correct linked lead/opportunity and records provenance before that cohort is enabled.

**Verification:** Signature vectors, fuzzed schema tests, replay/rate tests, cross-tenant tests, rotation tests, and a real sandbox webhook.
**Dependencies:** T3, T5.
**Likely files:** `server/api/public/v1/outcomes/[endpointKey].post.ts`, `server/utils/measurement/outcomes/*`, rate-limiter bindings, internal endpoint configuration components.

### T8 — Create the transactional conversion outbox (M)

**Purpose:** Guarantee that accepted lifecycle truth produces exactly one canonical conversion event without provider calls inside the request.

**Subtasks**

1. In either the native CRM stage transaction or unlinked-lead transaction, insert a `conversion_events` row for mapped accepted transitions.
2. Derive a deterministic idempotency key from client, source entity, transition/status event, and canonical event.
3. Snapshot the config version, consent decision, attribution IDs, and minimal delivery identifier envelope.
4. Publish committed pending rows to the queue and mark publication state.
5. Add a scheduled sweeper/repair endpoint for pending or lease-expired rows to close dual-write failures.
6. Record policy-skipped events explicitly so “not sent” is explainable.

**Acceptance criteria**

- Retried CRM, lead, portal, or webhook requests create one canonical event.
- A queue-send failure leaves a recoverable pending outbox row.
- Paused/disabled/unconsented mappings do not publish but retain a redacted reason.

**Verification:** Transaction rollback, duplicate, queue failure, sweeper recovery, pause, consent, and config-version tests.
**Dependencies:** T3, T5; used directly by T6 and later by T7.
**Likely files:** `server/utils/measurement/outbox.ts`, lifecycle service, queue producer binding/config, scheduled repair route.

**Checkpoint B:** Demonstrate agency and client-portal native CRM transitions plus an unlinked lead transition producing one auditable canonical event before provider delivery begins. Add the signed-webhook proof before onboarding the first external-CRM client, not before the native-CRM pilot.

### T9 — Fix browser/server event identity and formalize collection contracts (M)

**Purpose:** Prevent Meta double-counting and make website conversions safe inputs to the same outbox.

**Subtasks**

1. Generate a conversion event ID once in `public/track.js` and reuse it for dataLayer/Pixel and server beacon paths.
2. Define the supported conversion event allowlist and map website event names to canonical names.
3. Carry consent, event source URL, occurrence time, `_fbp`, `_fbc`, click IDs, and attribution into the canonical event builder.
4. Preserve beacon “never block the page” behavior while distinguishing accepted, duplicate, and policy-skipped server processing internally.
5. Add payload limits, origin enforcement, per-site rate limiting, and kill-switch tests.
6. Verify SPA and ordinary form submission paths do not double-fire.

**Acceptance criteria**

- One user action produces matching browser and server IDs.
- Repeated beacons are idempotent in tracking and conversion stores.
- Non-conversion behavioral events remain unaffected and are not fanned out.

**Verification:** Unit contract around shared ID, endpoint dedup test, GTM/Pixel dataLayer inspection, and Meta Test Events dedup proof on pilot.
**Dependencies:** T1, T3, T8.
**Likely files:** `public/track.js`, `server/api/public/track.post.ts`, `server/utils/tracking/zod-schema.ts`, browser/endpoint tests.

### T10 — Add collection tier and first-party hostname control (M)

**Purpose:** Make Tier A/B/C/backend selection and CNAME readiness part of canonical client config.

**Subtasks**

1. Link measurement profiles to existing tracking sites rather than duplicating allowed origins, SPA, and consent config.
2. Implement first-party hostname provisioning/verification adapter for Cloudflare for SaaS; persist provider IDs and status in Neon, cache only safe routing data.
3. Resolve tenant by hostname for first-party collection and by write key/origin for shared collection.
4. Add polling/reconciliation for hostname and certificate readiness with clear failure states.
5. Run the PRD's Zaraz-on-custom-hostname spike. If it fails, use the common snippet+Worker path; do not fork the event contract.
6. Show exact DNS instructions and verification evidence in the internal UI.

**Acceptance criteria**

- A Tier B hostname cannot be marked active until hostname and certificate are active.
- Unknown hostname/write-key combinations cannot select another tenant.
- Tier C operates through the shared endpoint with an explicit lower-match-quality warning.

**Verification:** Cloudflare sandbox/custom-host test, DNS failure/recovery test, tenant-confusion test, and pilot browser cookie/endpoint inspection.
**Dependencies:** T3–T4, T9.
**Likely files:** `server/utils/measurement/hostnames.ts`, tracking routes/config UI, Cloudflare bindings/env types, hostname reconciliation cron.

### T11 — Build a dedicated conversion delivery Worker and Queue (L)

**Purpose:** Isolate high-volume provider delivery from Pages, general jobs, and lead routing.

**Subtasks**

1. Scaffold `workers/conversion-delivery-worker` with Queue consumer, Hyperdrive, typed env, structured redacted logging, and health endpoint.
2. Add `conversion-delivery-queue` and `conversion-delivery-dlq` bindings; acknowledge/retry individual messages rather than entire successful batches.
3. Implement database leasing/idempotent claim so queue redelivery cannot duplicate a completed delivery.
4. Implement provider-neutral adapter result classes: success, accepted/pending, retryable, permanent configuration failure, and policy skip.
5. Apply exponential/delayed retry for 429/5xx/timeouts and stop retrying validation/auth/config errors until configuration changes.
6. Add DLQ consumption or scheduled capture into platform state; never rely on an unmonitored DLQ.
7. Avoid source-copy drift by extracting framework-neutral contracts/adapters into a shared package or adding a build-time sync-diff gate.

**Acceptance criteria**

- Worker dry-run/typecheck passes independently.
- Duplicate queue messages produce at most one successful delivery row.
- Retry, permanent failure, and DLQ states are visible in Neon with no PII/token logs.
- General jobs and lead delivery behavior are unchanged.

**Verification:** Worker unit tests with mocked adapters, queue redelivery and partial-batch tests, Hyperdrive integration test, DLQ test, deploy dry run.
**Dependencies:** T2–T3, T8–T10.
**Likely files:** `workers/conversion-delivery-worker/**`, root/Pages queue bindings, `server/utils/measurement/queue.ts`, shared measurement contracts.

### T12 — Implement and certify the Meta CAPI adapter (L)

**Purpose:** Deliver test and live canonical events to the correct Meta dataset with auditable outcomes.

**Subtasks**

1. Complete a Meta access-model spike: CRM Pixel/dataset ownership, Business Manager admin path, required app permissions, system-user vs connected-user token, token rotation, and Conversion Leads requirements.
2. Build a per-client Conversion Leads eligibility assessment using Instant Form source, retained Meta Lead ID, monthly lead volume, upload frequency, outcome latency, and stage conversion rate. Model browser Pixel, web CAPI, CRM CAPI, and Conversion Leads validation as separate states. Keep ordinary web/offline CAPI available when the optimization program is not a fit.
3. Extend the existing Meta client with a narrow conversions adapter rather than adding provider calls to routes.
4. Build ordinary web CAPI payloads with stable API version, correct action source/source URL/time, shared event ID, normalized/hashes user data, consent/data-processing fields, and mapped custom data.
5. Build a distinct Conversion Leads payload path for Meta Instant Form leads: preserve the 15–16 digit Meta lead ID from intake, send the initial/raw stage and every subsequent native CRM stage, use `system_generated`/`crm`, and retain accurate stage occurrence times for a maximum seven-day backfill.
6. Support Test Events code only in test mode and ensure it cannot leak into live delivery.
7. Parse response event counts, trace/request IDs, warnings, and error classes into redacted delivery diagnostics.
8. Add destination validation and a test-event action in the internal UI.
9. Map Zero's initial, Qualified, Won, Lost, and client-specific CRM stages to advertiser-defined Meta funnel events; retain the full transition sequence rather than only the latest snapshot.
10. Treat programmatic EMQ as optional/beta-gated. Detect capability and fall back to internal telemetry plus recorded Events Manager checks when the Integration Quality API is unavailable.
11. Add a Conversion Leads validation view for coverage, days observed, stage count, missing Meta lead IDs, late events, and required-parameter failures.
12. For Ferntree, target dataset `573284833843027` only after ownership validation; record the existing web-only CAPI and Lead EMQ baseline, then prove CRM test events without changing or duplicating the current web feed. Treat Dataset Quality API setup as an optional capability spike, not an assumed dependency.

**Acceptance criteria**

- Pilot event appears in Meta Test Events for the intended dataset.
- Browser/server duplicates are shown as deduplicated rather than two conversions.
- Invalid token/dataset and 429/5xx paths classify correctly.
- Live mode is protected by explicit activation and kill switch.
- The UI distinguishes Pixel, web CAPI, CRM CAPI, and Conversion Leads optimization eligibility and never fabricates EMQ/Dataset Quality API availability.
- A Conversion Leads pilot sustains at least seven days of data, at least 60% lead coverage, and at least two stages before it is marked validation-ready.

**Verification:** Golden payload tests, hashing normalization tests, mocked Meta response matrix, and signed-off Meta Events Manager screenshots/IDs stored as rollout evidence.
**Dependencies:** T9–T11.
**Likely files:** `server/utils/metaClient.ts` or a new shared `measurement/adapters/meta.ts`, Worker adapter, destination validation API/tests.

### T13 — Complete Google Data Manager authorization spike and adapter (L)

**Purpose:** Add Google offline/enhanced lead conversion delivery on the supported 2026 API path.

**Subtasks**

1. Decide advertiser OAuth vs service account/data-partner link for ADME's operating model; document ownership and onboarding impact.
2. Enable Data Manager API, add the `datamanager` scope, plan OAuth verification, and identify which existing connections require re-consent. If ADME uses managed partner links, separately authorize and govern the `datamanager.partnerlink` scope.
3. Discover/validate Google Ads destinations and conversion actions without mixing spend-readiness with conversion-readiness.
4. For Ferntree customer `4221552633`, identify the intended conversion action among the ten primary Submit lead form actions and resolve or explicitly baseline the Needs attention/urgent enhanced-conversion diagnostic before Zero delivery.
5. Implement canonical event → Data Manager event mapping, identifiers, consent, value/currency, and destination references.
6. Store ingestion request IDs and implement diagnostics retrieval/reconciliation because initial acceptance may not equal final processing success. Schedule the first check around 30 minutes after ingest, then use jittered exponential backoff until terminal status or a 24-hour ceiling.
7. Classify per-record and request-level validation, auth, quota, retryable, and permanent errors.
8. Run sandbox/test-account proof before exposing Live.

**Acceptance criteria**

- The chosen auth model is approved and reproducible for a second client.
- Re-consent requirements are visible and do not break existing Google spend access.
- A pilot Qualified conversion is accepted and its diagnostic result reconciled.
- No implementation depends on legacy `UploadClickConversions` eligibility.

**Verification:** OAuth scope/refresh tests, golden request tests, diagnostics polling tests, error matrix, and Google test-account evidence.
**Dependencies:** T3–T4, T11; can run in parallel with late T12 work after T1.
**Likely files:** `server/utils/googleAdsClient.ts`, new `server/utils/measurement/googleDataManager.ts`, OAuth callback/scope tests, Worker adapter.

**Checkpoint C:** Meta pilot may proceed after T12. Google stays disabled until T13 authorization and diagnostic gates pass.

### T14 — Build delivery health, replay, metrics, and alerting (L)

**Purpose:** Make Zero the operational source for delivery health, not just a config screen.

**Subtasks**

1. Define health rollups for received, accepted, duplicate, policy-skipped, pending, delivered, retried, failed, and stale.
2. Add global Signal Health APIs/page and client drill-down with destination, event, and time filters.
3. Add controlled replay for retryable/permanent-after-fix deliveries; require reason, permission, idempotency, and audit.
4. Add alerts for no recent events, no recent successes, high failure ratio, expired/invalid credentials, CNAME failure, queue backlog, and DLQ entries.
5. Expose provider request/trace IDs and safe error classes; redact payloads, identifiers, and tokens.
6. Add operational metrics/log sampling and dashboards for ingest latency, queue age, delivery latency, provider response class, and sweeper recovery.

**Acceptance criteria**

- An operator can explain why a conversion was delivered, skipped, pending, or failed without querying raw tables.
- Replay cannot duplicate a successful provider delivery.
- Alert thresholds and owners are documented and tested.

**Verification:** Seeded state matrix UI tests, replay authorization/idempotency tests, synthetic alert tests, browser inspection, and production-safe log review.
**Dependencies:** T3, T8, T11–T13.
**Likely files:** `server/api/agency/measurement/health.get.ts`, `app/pages/agency/measurement/index.vue`, observability utilities, alert cron/tests.

### T15 — Add redacted client-portal measurement/outcome health (M)

**Purpose:** Give clients confidence and actionable feedback without exposing internal/provider-sensitive data.

**Subtasks**

1. Add a portal measurement/status API scoped by authenticated `clientId` and integrate it with existing portal CRM access.
2. Show outcome source, last successful sync, last accepted outcome, recent rejected count, and plain-language status.
3. Show a redacted capability summary that distinguishes browser measurement, server-side web measurement, and CRM outcome feedback for Meta and Google; label whether each is operated by Zero or another integration.
4. Link rejected client-entered outcomes to safe remediation text; never reveal another lead or provider payload.
5. Show whether Qualified/Won/Lost updates are controlled by Zero CRM, an unlinked lead workflow, or an external connected CRM.
6. Add empty, onboarding, paused, degraded, and healthy states.

**Acceptance criteria**

- Portal data is strictly client-scoped and redacted.
- Internal delivery errors are translated into client-safe language.
- Portal state agrees with the internal canonical profile and health rollup.

**Verification:** Cross-client security tests, snapshot/component tests for every state, and real-browser portal test.
**Dependencies:** T6–T7, T14.
**Likely files:** `server/api/client-portal/measurement.get.ts`, `app/pages/portal/measurement.vue` or portal dashboard card, portal navigation/tests.

### T16 — Pilot, measure, and stage the rollout (L)

**Purpose:** Prove accuracy and operations on one client before broad enablement.

**Subtasks**

1. Complete the pilot profile, destination, consent, hostname, mappings, native CRM/portal authority, and test-mode checklist in Zero.
2. Capture and approve the pre-Zero provider baseline, including Ferntree's current Meta web-CAPI/Lead diagnostics and Google ECL goal/action diagnostics.
3. Validate one browser conversion and one native-CRM Qualified stage transition through lead linkage, outbox, queue, Meta delivery, health, and portal display.
4. Validate browser/server dedup and compare source counts across Zero, Pixel/Events Manager, native CRM opportunity history, and lead records.
5. Run failure drills: pause, invalid token, provider 429, queue delay, stale CRM/portal update, duplicate stage move, broken lead link, and rollback. Add webhook replay/wrong-signature drills for the first external-CRM cohort.
6. Observe a defined soak window and record baseline coverage, success ratio, delivery latency, dedup rate, outcome freshness, and match-quality proxies.
7. Roll out in cohorts: internal/owned, Tier B pilots, remaining Tier B, then shared endpoint/backend and Google.
8. Require explicit go/no-go and rollback owner for each cohort.

**Acceptance criteria**

- Pilot acceptance evidence covers collection, consent, dedup, Qualified feedback, delivery, health, and rollback.
- No unresolved severity-1/2 privacy, tenant-isolation, or duplication issues remain.
- Cohort gates and kill switches are proven before expanding.

**Verification:** Signed pilot checklist, provider evidence, sampled event reconciliation, alert drill, and rollback exercise.
**Dependencies:** Native-CRM Meta pilot requires T4–T6, T8–T12, and T14–T15. T7 is required only for the first external-CRM cohort; Google cohort also requires T13.
**Likely files:** rollout evidence under `docs/superpowers/handoffs/` or a governed evidence store; no feature code required unless defects are found.

### T17 — Finish documentation, runbooks, and GraphWiki refresh (M)

**Purpose:** Make the system supportable and keep architecture knowledge current.

**Subtasks**

1. Publish operator runbooks for onboarding, consent review, CNAME, Meta/Google validation, webhook setup, secret rotation, replay, DLQ, pause, and rollback.
2. Publish client-facing webhook/OpenAPI documentation and signature examples without real credentials.
3. Document data retention/deletion, subject-request impact, incident response, and provider/token ownership.
4. Update the original PRD decisions: Zero canonical, Neon audit/outbox, KV cache, dedicated delivery Worker, and Monday migrated/retired after final reconciliation.
5. Regenerate Graphify/GraphWiki and confirm the new Worker, contracts, routes, and services are represented; document Vue limitations.
6. Add deployment/readiness checks for queue, DLQ, Hyperdrive, secret bindings, OAuth scope, and alerts.

**Acceptance criteria**

- A second operator can onboard a test client and diagnose a failed event from the runbooks.
- OpenAPI/contract examples pass automated tests.
- GraphWiki is regenerated and uploaded to the established `graphify/dashboard` target.

**Verification:** Runbook rehearsal, documentation link check, contract example tests, `pnpm run graphify:rebuild`, and graph report review.
**Dependencies:** T1–T16.
**Likely files:** `docs/decisions/`, `docs/runbooks/measurement/`, `docs/api/`, source PRD or superseding decision note, `graphify-out/` generated artifacts.

### T18 — Close rollout jobs and evidence in the native Zero board (S)

**Purpose:** Make the platform board accurately reflect the accepted implementation before touching the legacy Monday board.

**Subtasks**

1. Reconcile each native rollout item against the client's canonical Measurement readiness checklist and T16 cohort evidence.
2. Close only tasks whose acceptance criteria and evidence links are complete; preserve deferred and blocked work with owner/reason/date.
3. Confirm all board items link to the correct client/profile and all configuration work was performed through typed Measurement APIs.
4. Produce a platform-board completion export/diff that T19 can use for the final Monday update.

**Acceptance criteria**

- The native Zero board is the complete, current record of rollout work.
- Closed tasks have verifiable platform/provider evidence and no secret/PII attachments.
- No completion status depends solely on a Monday value.

**Verification:** Platform board read-back, item/evidence audit, and owner sign-off.
**Dependencies:** T4A, T16–T17.
**Likely files:** Native board/task APIs and UI; preferably no new migration code.

### T19 — Perform the final Monday reconciliation and retire it as the working board (S)

**Purpose:** Update the requested board only after platform acceptance evidence exists.

**Subtasks**

1. Re-query board schema/labels immediately before mutation; use stored column IDs, not display-text guesses.
2. Diff the legacy Monday board against the completed native Zero board and T18 completion export.
3. For each client, apply the final status, owner, completion/go-live date, and concise migration note. Add links to the native Zero rollout item and client Measurement page.
4. Where the board still contains operational configuration columns, set their final historical values from Zero without allowing them to become runtime inputs.
5. Mark an item Done only when the Zero readiness checklist and pilot/cohort acceptance criteria are satisfied. Preserve blockers/deferred items accurately.
6. Do not copy PII, tokens, signatures, or provider payloads into Monday.
7. Read back every changed item through the Monday API and produce a reconciliation report of intended vs actual values.
8. Mark the board as migrated/read-only/archive according to the agreed Monday operating convention, and direct staff to the native Zero board for all future work.
9. Do not build ongoing two-way sync. If a temporary one-way link is operationally required, time-box it and make Zero authoritative on conflict.

**Acceptance criteria**

- Board `18422459929` accurately reflects the final migrated rollout state and links to the canonical Zero board/platform evidence.
- Every mutation has an audit/reconciliation record and read-back confirmation.
- Monday contains no secret or personal conversion data.
- Staff have stopped using Monday as the active board for this rollout.

**Verification:** Dry-run diff, explicit change approval, API mutation, API read-back, and manual spot-check in the browser.
**Dependencies:** T18 and user authorization at execution time.
**Likely files:** Prefer existing `server/utils/mondayClient.ts`; add a narrowly scoped reconciliation script/service only if repeatability warrants it.

**Checkpoint D:** The project is complete only after T19 read-back reconciliation and board retirement, not merely after provider delivery works.

## 12. Test strategy by layer

| Layer | Required proof |
|---|---|
| Contracts | Zod schema, stable errors, versioning, redaction, invalid/unknown fields |
| Database | migrations, constraints, transaction rollback, idempotency, query plans |
| Lifecycle | every allowed/rejected transition, authority conflicts, terminal states, concurrency |
| Public security | signatures, replay, rate/size limits, tenant isolation, endpoint enumeration |
| Browser collection | SPA/MPA, consent states, shared event ID, beacon failure, GTM/Pixel dedup |
| Worker | claim/lease, duplicate queue message, partial batch, retry delay, DLQ, secret failure |
| Providers | golden payloads, test endpoints/accounts, 2xx/4xx/429/5xx, async diagnostics |
| Agency UI | roles, config versions, readiness gates, health matrix, replay audit |
| Portal UI | client scope, permissions, stale status, CRM-authority disabled state, redaction |
| Rollout | end-to-end reconciliation, failure drills, soak, rollback, native-board audit, Monday final read-back |

## 13. Rollout gates

### Gate 1 — Build-ready

- Big Garage Subaru approved with evidence and the Zero rollout board mapped;
- existing Meta web-CAPI and Google ECL diagnostics baselined;
- ADR, lifecycle contract, privacy/retention, and threat model approved;
- Meta and Google access owners named.

### Gate 2 — Test-mode ready

- canonical config UI, lifecycle audit, outbox, Worker, and health operational;
- one shared browser/server event ID verified;
- native CRM and portal Qualified paths verified, including lead linkage and duplicate prevention;
- signed webhook verified only before the first external-CRM cohort;
- no client enabled live.

### Gate 3 — Meta pilot live

- CNAME/endpoint, consent, dataset, mappings, test events, dedup, Qualified outcome, alerting, and rollback accepted;
- web CAPI remains healthy and distinct from the validated CRM-CAPI/Conversion Leads state;
- soak metrics within agreed thresholds.

### Gate 4 — Google pilot live

- Data Manager auth model and scope approved;
- Big Garage's exact conversion action selected and pre-existing goal/authorization diagnostics resolved or accepted as a signed baseline;
- Data Manager diagnostic reconciliation verified;
- existing spend connection unaffected.

### Gate 5 — Cohort complete

- Zero reports healthy or explicitly accepted exceptions;
- documentation and GraphWiki refreshed;
- native Zero board complete; Monday final state updated, read back, and retired as the working board.

## 14. Initial success measures

Set exact thresholds during T1/T16 after baseline measurement. Track at minimum:

- conversion coverage versus browser-only baseline;
- browser/server deduplication ratio and duplicate-provider events;
- accepted-to-delivered ratio by client/destination;
- p50/p95 time from outcome occurrence to provider acceptance;
- percentage of leads with fresh `Qualified`/`Won`/`Lost` feedback;
- Meta Conversion Leads coverage, days of valid data, stage count, and missing/invalid Meta lead ID rate;
- unmatched and conflicting CRM outcome rate;
- provider authentication/configuration failure rate;
- queue age, retry count, and DLQ count;
- time for an operator to diagnose and safely replay a failed event;
- rollout readiness by client in Zero, reconciled to Monday.

Do not promise the PRD's 20–40% signal recovery as an engineering acceptance criterion. Treat it as a business hypothesis measured during pilot/cohort rollout.

## 15. Decision outcomes and remaining execution gates

1. **Resolved:** Big Garage Subaru is the controlled pilot because ADME controls its published site delivery path. Ferntree remains research context, not the active pilot.
2. Is the portal authoritative for outcomes by default, or only when no CRM is connected?
3. What state regressions are permitted, and who can override terminal states?
4. Does `Qualified` map to a Meta standard event, Conversion Leads workflow, or client-specific mapping for the pilot?
5. **Selected for the pilot:** reuse advertiser OAuth through the existing Google connection, with explicit `datamanager` re-consent. Service-account/data-partner operation remains a later architectural option.
6. What identifier retention and encrypted-envelope window are contractually permitted?
7. What evidence may clients see versus internal-only diagnostics?
8. What thresholds define healthy, degraded, and rollout-ready?

These are explicit discovery decisions. They must not be silently encoded by the first adapter or UI form.
