# Leads Engine — Zapier replacement for Meta + Google ad inquiries

**Date:** 2026-04-30
**Status:** Approved (design)
**Replaces:** External Zapier zaps that route Meta Lead Ads + Google Ads Lead Form submissions to spreadsheets, CRMs, and notification channels.

## Goal

Receive Meta Lead Ads and Google Ads Lead Form submissions in real-time via native webhooks, normalize them into a canonical lead model, fan out to multiple per-form destinations with optional conditions and delays, and surface each lead inside both the agency dashboard and the matching client portal.

The system replaces the lead-handling slice of Zapier — not Zapier as a whole. No drag-and-drop canvas; no general-purpose triggers beyond "lead arrived"; no multi-step branching past one filter level.

## Phasing

Three phases, each independently shippable.

| Phase | Scope | Time |
|---|---|---|
| **1. Core engine + Google leads** | Webhook ingestion (Google only), data model, rules engine, delayed-action primitive, agency Inbox, portal Inbox, 5 destinations: portal write, outbound webhook, Slack, email, Sheets append. | ~2 weeks |
| **2. Meta lead capture** | Extend Meta OAuth (`leads_retrieval` + `pages_manage_ads`), per-Page leadgen subscription toggle, Page access token storage, Meta webhook handler with `X-Hub-Signature-256` verify, Graph API field fetch. SMS destination via Twilio. Speed-to-lead autoresponder destinations (email + SMS to prospect). | ~1.5 weeks |
| **3. Marketer polish** | Spam heuristic scoring, lead scoring, no-reply escalation system rule, dedup beyond ID, attribution reporting, Smart Watch deep integration. | ~1 week |

Phase 1 ships a complete end-to-end system using Google as the single channel. Phases 2 and 3 are additive and never block each other.

## Architecture

```
Meta / Google
     │
     ▼
┌──────────────────────────────┐
│ Ingestion endpoints           │ /api/leads/webhook/meta
│ (sig verify, dedup)           │ /api/leads/webhook/google/[token]
└──────────┬───────────────────┘
           │  insert lead row
           ▼
┌──────────────────────────────┐
│ Normalizer                    │ canonical lead shape;
│ + scoring + spam check        │ capture full attribution
│ (Phase 3 features)            │
└──────────┬───────────────────┘
           │  enqueue rules.evaluate
           ▼
┌──────────────────────────────┐
│ Rules engine                  │ per-form rules,
│ (conditional fan-out)         │ filters → Delivery[]
└──────────┬───────────────────┘
           │  N delivery jobs
           ▼
┌──────────────────────────────┐
│ Delivery worker               │ destination adapters,
│ (CF Queue consumer)           │ retries with backoff,
│                               │ audit log
└──────────┬───────────────────┘
           │
           ▼
   Slack / Webhook / Email / SMS / Sheet / Portal write / Autoresponder
                          │
                          ▼
                  UI: agency inbox + portal inbox
```

### Marketer best practices baked in

| Practice | Where it lives |
|---|---|
| Real-time delivery (sub-60s) | Native webhooks at ingestion — no polling |
| Idempotency (no double-deliver on retries) | `UNIQUE(source, source_lead_id)` constraint at ingestion |
| Full attribution capture (`gclid`, `fbclid`, `ad_id`, `campaign_id`, `utm_*`) | Normalizer, stored on every lead |
| Spam / fake-lead filter (work-email check, dedup, suspicious patterns) | Phase 3, runs before rules; flags `status='spam_suspected'` rather than dropping |
| Lead scoring (cheap heuristic: domain quality + field completeness) | Phase 3, score stored on lead |
| Retry on failure | Delivery worker, exponential backoff via CF Queues |
| Audit trail ("what was delivered, when, where, did it succeed") | `lead_deliveries` table |
| Status lifecycle (new → contacted → qualified → won / lost / spam) | Lead row, surfaced in both inboxes |
| Speed-to-lead autoresponder back to prospect | First-class destination type (email + SMS variants) in Phase 2 |
| No-reply escalation (status still `new` after Xh → ping AM) | Phase 3 system rule, built on the delayed-action primitive |

## Data model

New migration `084-leads-engine.sql` (Phase 1 tables) and `085-meta-lead-pages.sql` (Phase 2).

### `lead_webhook_endpoints` (Phase 1)

Per-client tokenized URL + key for Google Ads to POST to. Issued once per client, rotatable.

```
id                UUID PK
client_id         UUID NOT NULL  -- existing clients table
source            VARCHAR(20)     -- 'google' (Phase 1) | 'meta_app' (one global row)
url_token         TEXT UNIQUE     -- random token in URL path
secret_key        TEXT            -- shared with Google Ads "Webhook key" field
rotated_at        TIMESTAMPTZ
created_at        TIMESTAMPTZ
```

Webhook URL format: `https://<host>/api/leads/webhook/google/<url_token>`

### `meta_page_subscriptions` (Phase 2)

Tracks which connected Meta Pages have leadgen subscription enabled, and stores their long-lived Page access token (encrypted) for Graph API lookups after a webhook fires.

```
id                          UUID PK
connection_id               UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE
page_id                     TEXT NOT NULL
page_name                   TEXT
page_access_token_encrypted TEXT
subscribed_at               TIMESTAMPTZ
last_token_refresh_at       TIMESTAMPTZ
status                      VARCHAR(20)  -- active | failed | disabled
last_error                  TEXT
UNIQUE(connection_id, page_id)
```

### `leads` (Phase 1)

Canonical normalized lead.

```
id                  UUID PK
client_id           UUID NOT NULL REFERENCES clients
source              VARCHAR(20) NOT NULL   -- 'meta' | 'google'
source_lead_id      TEXT NOT NULL          -- Meta leadgen_id or Google lead_id
form_id             TEXT                   -- Meta form_id, or Google form asset id
form_name           TEXT
ad_id               TEXT
ad_name             TEXT
campaign_id         TEXT
campaign_name       TEXT
page_id             TEXT                   -- Meta only
submitted_at        TIMESTAMPTZ NOT NULL
ingested_at         TIMESTAMPTZ DEFAULT NOW()
field_data          JSONB NOT NULL         -- form field key/value pairs
attribution         JSONB                  -- { gclid, fbclid, utm_source, utm_medium, ... }
score               INT                    -- 0–100, populated in Phase 3
score_reasons       JSONB
status              VARCHAR(20) DEFAULT 'new'
                                           -- new | contacted | qualified | won | lost | spam_suspected
spam_reasons        JSONB
assigned_to         UUID REFERENCES team_members
contacted_at        TIMESTAMPTZ
contacted_by        UUID REFERENCES team_members
notes               TEXT
created_at          TIMESTAMPTZ DEFAULT NOW()

UNIQUE(source, source_lead_id)
```

Indexes: `(client_id, status, submitted_at DESC)`, `(form_id, submitted_at)`, `(status) WHERE status='new'`.

### `lead_form_rules` (Phase 1)

One row per `(client_id, form_id)` combination — the rule set for a form.

```
id              UUID PK
client_id       UUID NOT NULL
source          VARCHAR(20) NOT NULL  -- 'meta' | 'google'
form_id         TEXT NOT NULL
form_name       TEXT
enabled         BOOLEAN DEFAULT TRUE
created_by      UUID REFERENCES team_members
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(source, form_id)
```

If a lead arrives for a form that has no rule row, the lead is still ingested and shown in the agency Inbox; only fan-out is skipped. (Surfaces "unconfigured form" in the UI.)

### `lead_rule_destinations` (Phase 1)

The list of destinations under each rule, evaluated in `sort_order`.

```
id                  UUID PK
rule_id             UUID NOT NULL REFERENCES lead_form_rules(id) ON DELETE CASCADE
destination_type    VARCHAR(30) NOT NULL
                    -- portal | webhook | slack | email | sheets | sms |
                    -- autoresponder_email | autoresponder_sms
config              JSONB NOT NULL    -- type-specific (URL, channel, recipients, template_id)
filter              JSONB             -- { field: 'field_data.budget', op: 'gt', value: 5000 } | null
delay_minutes       INT DEFAULT 0     -- 0 = immediate
enabled             BOOLEAN DEFAULT TRUE
sort_order          INT DEFAULT 0
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

### `lead_deliveries` (Phase 1)

Audit log of every dispatch attempt. Surfaces in the UI as the lead's "delivery history."

```
id                       UUID PK
lead_id                  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE
rule_destination_id      UUID REFERENCES lead_rule_destinations(id) ON DELETE SET NULL
destination_type         VARCHAR(30) NOT NULL
status                   VARCHAR(20) DEFAULT 'pending'
                         -- pending | delivered | failed | cancelled
scheduled_at             TIMESTAMPTZ NOT NULL
attempted_at             TIMESTAMPTZ
last_error               TEXT
retry_count              INT DEFAULT 0
response_meta            JSONB
created_at               TIMESTAMPTZ DEFAULT NOW()
updated_at               TIMESTAMPTZ DEFAULT NOW()
```

Indexes: `(lead_id)`, `(status, scheduled_at) WHERE status='pending'` for the queue worker.

### `lead_ingestion_errors` (Phase 1)

Errors during signature verify, dedup, or normalization — for ops review without losing data.

```
id              UUID PK
source          VARCHAR(20) NOT NULL
raw_payload     JSONB
headers         JSONB
error           TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

## Ingestion endpoints

### `GET /api/leads/webhook/meta` (Phase 2)

Meta verify-token handshake. Echoes `hub.challenge` if `hub.verify_token` matches `process.env.META_LEADGEN_VERIFY_TOKEN`.

### `POST /api/leads/webhook/meta` (Phase 2)

1. Verify `X-Hub-Signature-256` header against `process.env.META_APP_SECRET` (HMAC-SHA256).
2. For each entry's `changes[]` with `field='leadgen'`:
   - Extract `leadgen_id`, `form_id`, `page_id`, `ad_id`, `campaign_id`, `created_time`.
   - Look up `meta_page_subscriptions` row for the page_id; load the encrypted Page access token; decrypt.
   - Call Graph API `GET /{leadgen_id}?fields=field_data,ad_id,form_id,...&access_token=<page_token>` to fetch field values.
   - Resolve `client_id` via `social_connections` → `ad_account_client_map` join. Fall back to "unmapped" client if no map.
   - Insert into `leads` with `ON CONFLICT (source, source_lead_id) DO NOTHING` for idempotency.
   - Enqueue `rules.evaluate(lead.id)` to CF Queue.
3. Always return HTTP 200 to Meta even on internal errors (write to `lead_ingestion_errors` instead). Meta retries are aggressive and we'd rather replay from our own table than be hammered.

### `POST /api/leads/webhook/google/[token]` (Phase 1)

1. Look up `lead_webhook_endpoints` by `url_token`. 404 if not found.
2. Validate the `google_key` field in the JSON body matches the row's `secret_key`. 401 if not. (Google sends the key alongside the lead data, not as an HMAC; we compare with constant-time equality.)
3. Parse the payload. Field shape: `lead_id`, `gcl_id`, `user_column_data[]` (array of `{column_name, string_value}`), `campaign_id`, `form_id`, `api_version`.
4. Resolve `client_id` from the endpoint row.
5. Insert into `leads` with `ON CONFLICT (source, source_lead_id) DO NOTHING`.
6. Enqueue `rules.evaluate(lead.id)`.
7. Return HTTP 200.

## Rules engine

Pure function: `evaluateLead(leadId) → DeliveryRow[]`. Triggered as a CF Queue consumer.

1. Load the lead and its `lead_form_rules` row by `(source, form_id)`.
2. If no rule row, write a single `lead_deliveries` placeholder marked `cancelled` with reason `no_rule_configured` and exit.
3. For each enabled `lead_rule_destinations`:
   - Evaluate `filter` if present. JSON-path-style field reference (`field_data.budget`, `attribution.utm_campaign`, `score`, `field_data.email`).
   - Operators: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `in`, `not_in`.
   - If filter passes, insert `lead_deliveries` row with `scheduled_at = NOW() + delay_minutes * 1 minute` and `status='pending'`.
4. Enqueue each pending delivery to the delivery queue.

Filters are deliberately limited to one level — no AND/OR composition of multiple conditions in the same destination. If users want compound logic, they create two destinations with different filters.

## Destination adapters

Each adapter implements:

```ts
interface DestinationAdapter {
  type: string
  dispatch(delivery: LeadDelivery, lead: Lead, config: any): Promise<DispatchResult>
  validateConfig(config: any): { valid: boolean; errors?: string[] }
}
```

Phase 1 adapters:

| Type | Config | Behavior |
|---|---|---|
| `portal` | `{}` | No external call — flips lead visibility flag for the client portal. (Always available; if not in any rule, leads still appear in agency inbox but not portal.) |
| `webhook` | `{ url, method='POST', headers?, secret? }` | POSTs the canonical lead JSON. Adds `X-Leads-Signature: sha256=<hmac>` if `secret` provided. |
| `slack` | `{ webhook_url, channel?, mention? }` | Posts a formatted card to a Slack incoming webhook. |
| `email` | `{ to[], subject_template, body_template, from? }` | Sends via Resend. Templates support `{{ field.email }}`, `{{ field.first_name }}`, `{{ source }}`, etc. |
| `sheets` | `{ spreadsheet_id, sheet_name }` | Append row via Google Sheets API. Uses the existing Google connection's OAuth (with scope expansion). |

Phase 2 adapters:

| Type | Config | Behavior |
|---|---|---|
| `sms` | `{ to_template, body_template }` | Twilio API. `to_template` typically `{{ field.phone }}` for autoresponder, or a hard-coded staff number for alerts. |
| `autoresponder_email` | `{ subject_template, body_template, from }` | Same as `email` but addressed to `{{ field.email }}` by default. Distinct type so the UI labels it differently and we can rate-limit per recipient. |
| `autoresponder_sms` | `{ body_template }` | SMS to `{{ field.phone }}`. |

Adapters never throw on dispatch failure — they return `{ status: 'failed', error: string }` so the worker can persist and retry.

## Delivery worker

CF Queue consumer (`leads-delivery-queue`).

1. Load delivery row.
2. If `scheduled_at > NOW()`, requeue with `{ delaySeconds: scheduled_at - NOW() }`.
3. Resolve adapter; dispatch.
4. On success: update row `status='delivered'`, `attempted_at=NOW()`, `response_meta=...`.
5. On 429 with `Retry-After`: requeue with that delay; do not increment `retry_count`.
6. On other failure: increment `retry_count`. If `retry_count < 3`, requeue with backoff `(1m, 5m, 15m)`. If `>= 3`, mark `status='failed'`, `last_error=...`. Surfaces in UI with manual "Retry" button.

## UI surfaces

### Agency: `/agency/leads`

Two tabs: **Inbox** | **Form Rules**.

**Inbox:**
- Filter bar: client, source (Meta/Google), form, status, date range, score range (Phase 3).
- Table columns: submitted_at, client, source icon, form name, lead summary (first 2 fields), status pill, assigned to, deliveries count.
- Row click opens slide-over with: full field data, attribution (UTM/gclid/etc.), delivery history (each `lead_deliveries` row with status + last_error), status changer, assign-to picker, notes.
- Bulk actions: mark contacted, mark spam, reassign.

**Form Rules:**
- List of `(client × form)` combinations seen in the wild (auto-discovered) plus any pre-configured.
- "Configure" opens a per-form rule editor:
  - Form metadata (read-only: form_id, source, last seen lead at).
  - Destinations table — each row: type, config summary, filter, delay, enabled, drag handle, ✎/🗑 buttons.
  - "Add destination" picker.
  - Per-destination editor (modal): destination type → type-specific config form; optional filter builder (`field` dropdown × `op` dropdown × `value` input); optional delay (`0` / `5min` / `15min` / `1hr` / `2hr` / `24hr` / custom).

### Settings → Social → Google: "Lead webhooks" tab (Phase 1)

Per client (filterable), a card showing:
- Webhook URL (read-only, copy button)
- Webhook key (read-only, copy button, masked behind reveal)
- "Rotate key" button (with confirm modal — invalidates immediately)
- Setup instructions with screenshots showing the Google Ads "Webhook integration" form
- "Test data received" indicator (true if any lead has arrived through this token)

### Settings → Social → Meta: per-Page lead capture (Phase 2)

For each connected Meta Page (joined from `social_connections` + Pages), a row:
- Page name + ID
- Lead capture toggle. Toggle on:
  - Re-prompts OAuth if scopes don't yet include `leads_retrieval` + `pages_manage_ads`.
  - Calls `POST /{page_id}/subscribed_apps` with `subscribed_fields=leadgen`.
  - Stores Page access token (encrypted).
  - Inserts/updates `meta_page_subscriptions` row.
- Status pill: not subscribed / subscribed / failed (with last error).

### Client portal: `/portal/leads` (Phase 1)

Read-only inbox for the logged-in client.
- Same filter bar minus client (always self).
- Same table layout minus assignment columns.
- Same slide-over minus delivery history (clients don't need to see internal delivery routes) and minus assign-to.
- Default `status='new'` filter on. "Mark contacted" allowed (writes back to lead with `contacted_by=client_user`).

Linked from existing client portal nav alongside Invoices, Briefs, Approvals.

## Reliability + error handling

- **Idempotency:** `UNIQUE(source, source_lead_id)` makes duplicate webhook deliveries from Meta/Google safe.
- **Signature verify:** Meta uses HMAC-SHA256 in `X-Hub-Signature-256` header against the app secret. Google uses a per-endpoint `secret_key` in the request body, compared with constant-time equality.
- **Verify-token handshake:** Meta GET handshake is implemented in the same route handler as the POST.
- **Always-200 to providers:** Both webhook endpoints return 200 to the platform even on internal failure — failures are written to `lead_ingestion_errors` for ops review. Avoids platform retry storms.
- **Graceful degradation when CF bindings missing:** Delivery worker falls back to inline dispatch if CF Queues are unavailable (mirrors existing `notifications` patterns).
- **Page token refresh (Phase 2):** Long-lived Page tokens (~60 days). Background job exchanges them weekly via `/oauth/access_token?grant_type=fb_exchange_token`. Marks `meta_page_subscriptions.status='failed'` if refresh fails; surfaces in Meta settings UI.
- **Retry policy:** 3 attempts with backoff `1m → 5m → 15m`. After exhaustion, `status='failed'` with the error stored. UI exposes "Retry" button.
- **Rate-limit awareness:** Adapters honor `429` + `Retry-After` without consuming a retry attempt.
- **Per-recipient autoresponder rate limit (Phase 2):** Max 1 autoresponder email and 1 autoresponder SMS per `(form, recipient)` per 24h to prevent loops if a lead resubmits.
- **Queue consumer placement:** Per `CLAUDE.md`, CF Pages can produce to Queues but `queues.consumers` cannot live in the Pages `wrangler.toml`. The delivery worker therefore runs in a small companion Worker (sibling to `ai-agent-worker`) configured via the Cloudflare dashboard, sharing the database and Resend env. Implementation plan should confirm whether to extend an existing Worker or stand up a new `leads-delivery-worker`.

## Notifications + Smart Watch integration

- Phase 1: New leads create a notification on the existing `notifications` system targeting the client's assigned account manager. Reuses the Smart Watch reason taxonomy — new reason `lead_arrived`.
- Phase 3: Importance scoring of lead notifications uses the same heuristic engine as Phase E watch improvements (`importance_score` 0–1 mapped from lead `score`).

## Permissions / RBAC

- `/agency/leads` and rule editing — gated by existing `requireRole(event, PERMISSIONS.MANAGE_SOCIAL)` (or new `MANAGE_LEADS` permission). Account managers can read their clients' leads; only admins/owners can edit form rules.
- `/portal/leads` — gated by existing `requireClientAuth(event)`; query is always filtered to `client_id = clientUser.client_id`.

## Out of scope (deferred — Option 3 territory)

- Visual canvas / drag-and-drop flow editor.
- Multi-step branching past one filter level (no nested if/else trees).
- Loops, sub-flows, error branches.
- Generic triggers other than "lead arrived" (no "lead status changed", "task created", etc., as flow triggers).
- Time-window triggers ("every Tuesday at 9am").
- Multi-trigger combinations ("if lead AND email opened AND form filled").
- Lead enrichment (Clearbit-style API calls). Can be added as a destination type later if needed.
- Cross-form deduplication across long time windows (>24h).
- Per-client white-labeled portal branding for the leads page (uses existing portal theming).

## Open questions

- **Client mapping for Meta leads** — when a Meta lead arrives, we need to resolve `client_id`. Today `ad_account_client_map` maps by ad account ± campaign pattern. For leadgen we may need finer mapping by Page or form. Implementation plan should verify the join is sufficient or design a lookup table.
- **Sheets append OAuth scope** — existing Google connection is `ads_read` scope. Sheets needs `https://www.googleapis.com/auth/spreadsheets`. Need to add scope re-prompt UX for affected connections in Phase 1.
- **Twilio account onboarding** — Phase 2 requires a Twilio account, phone number, and (for US numbers) A2P 10DLC compliance registration. Treat as prerequisite work, not engineering.

## Acceptance criteria

### Phase 1
- [ ] Migration `084-leads-engine.sql` applied
- [ ] `POST /api/leads/webhook/google/[token]` accepts a real Google Ads test payload, verifies key, dedupes, inserts a lead, enqueues rules evaluation
- [ ] Rules engine fans out to N destinations with per-destination filters and delays
- [ ] All 5 Phase 1 destinations (`portal`, `webhook`, `slack`, `email`, `sheets`) dispatch real payloads in dev
- [ ] CF Queue consumer retries failed deliveries with `1m / 5m / 15m` backoff and marks `failed` after 3 attempts
- [ ] Agency `/agency/leads` Inbox lists, filters, and opens detail slide-overs
- [ ] Agency Form Rules tab supports add/edit/remove destinations per `(client × form)`
- [ ] Settings → Social → Google "Lead webhooks" tab generates per-client URL+key, supports key rotation, shows "Test data received" indicator
- [ ] Client portal `/portal/leads` shows the logged-in client's leads, supports "Mark contacted"
- [ ] New-lead notification reaches the assigned AM via Smart Watch

### Phase 2
- [ ] Migration `085-meta-lead-pages.sql` applied
- [ ] Meta OAuth flow re-prompts for `leads_retrieval` + `pages_manage_ads` when needed
- [ ] Per-Page "Enable lead capture" toggle subscribes the Page via `/{page_id}/subscribed_apps` and stores an encrypted Page token
- [ ] `POST /api/leads/webhook/meta` verifies `X-Hub-Signature-256`, fetches lead fields via Graph API, dedupes, inserts a lead, enqueues rules
- [ ] Background job refreshes Page tokens weekly
- [ ] SMS, autoresponder_email, autoresponder_sms destinations dispatch successfully
- [ ] Per-recipient autoresponder rate limit enforced (max 1/24h per form+recipient)

### Phase 3
- [ ] Spam heuristic flags `status='spam_suspected'` based on disposable email, missing fields, dupe within 24h
- [ ] Lead score 0–100 populated on every lead from heuristic; surfaces in Inbox and slide-over
- [ ] No-reply escalation system rule fires a configured destination if `status='new'` after a configurable delay
- [ ] Attribution dashboard shows leads × source × campaign × form with conversion (status→won) % over time
- [ ] Importance scoring of lead notifications integrated with Phase E watch system

## Migration list

- `084-leads-engine.sql` — Phase 1 — `lead_webhook_endpoints`, `leads`, `lead_form_rules`, `lead_rule_destinations`, `lead_deliveries`, `lead_ingestion_errors`; adds `lead_arrived` to the existing notification reason enum/check
- `085-meta-lead-pages.sql` — Phase 2 — `meta_page_subscriptions`, autoresponder rate-limit table
- `086-leads-scoring.sql` — Phase 3 — additional indexes for scoring queries; potentially a `lead_no_reply_rules` table if config moves out of `lead_rule_destinations`

## File touch list (estimate)

```
server/database/migrations/084-leads-engine.sql                          (new)
server/api/leads/webhook/google/[token].post.ts                          (new)
server/api/leads/webhook/google/[token].get.ts                           (new — health check)
server/api/leads/list.get.ts                                             (new)
server/api/leads/[id].get.ts                                             (new)
server/api/leads/[id].patch.ts                                           (new — status / assignment / notes)
server/api/leads/rules/list.get.ts                                       (new)
server/api/leads/rules/[ruleId]/destinations/[destId].put.ts             (new)
server/api/leads/rules/[ruleId]/destinations.post.ts                     (new)
server/api/leads/endpoints/list.get.ts                                   (new)
server/api/leads/endpoints/[id]/rotate.post.ts                           (new)
server/api/client-portal/leads/list.get.ts                               (new)
server/api/client-portal/leads/[id].get.ts                               (new)
server/api/client-portal/leads/[id]/contacted.post.ts                    (new)
server/utils/leads/normalizer.ts                                         (new)
server/utils/leads/rulesEngine.ts                                        (new)
server/utils/leads/destinations/index.ts                                 (new — adapter registry)
server/utils/leads/destinations/portal.ts                                (new)
server/utils/leads/destinations/webhook.ts                               (new)
server/utils/leads/destinations/slack.ts                                 (new)
server/utils/leads/destinations/email.ts                                 (new)
server/utils/leads/destinations/sheets.ts                                (new)
server/utils/leads/queue.ts                                              (new — CF Queue producer + consumer)
app/pages/agency/leads/index.vue                                         (new — Inbox + Form Rules tabs)
app/pages/agency/leads/[id].vue                                          (new — detail page or use slide-over)
app/components/leads/Inbox.vue                                           (new)
app/components/leads/RuleEditor.vue                                      (new)
app/components/leads/DestinationEditor.vue                               (new)
app/pages/portal/leads.vue                                               (new)
app/pages/agency/social/google.vue                                       (extend — Lead webhooks tab)
```

Phase 2 adds Meta-side files; Phase 3 adds scoring + escalation utilities.

## Marketing site sync

When Phase 1 ships, update:
- `app/pages/features/index.vue` — add "Lead Capture & Routing" feature in the right category
- `app/pages/features/[slug].vue` — add detailed entry with 3-4 sections (real-time, multi-tenant, in-portal, agency-built)
- `app/components/MarketingNav.vue` — surface in mega menu under Operations or Social

Per `CLAUDE.md` "Front-Facing Page Sync" rule.
