# Leads Engine — Zapier replacement for Meta + Google ad inquiries

**Date:** 2026-04-30
**Status:** Approved (design, revised)
**Replaces:** External Zapier zaps that route Meta Lead Ads + Google Ads Lead Form submissions to spreadsheets, CRMs, and notification channels.

## Goal

Receive Meta Lead Ads and Google Ads Lead Form submissions in real-time via native webhooks, normalize them into a canonical lead model, fan out to multiple per-form destinations with optional conditions and delays, and surface each lead inside both the agency dashboard and the matching client portal.

The system replaces the lead-handling slice of Zapier — not Zapier as a whole. No drag-and-drop canvas; no general-purpose triggers beyond "lead arrived"; no multi-step branching past one filter level.

## Phasing

Three phases, each independently shippable.

| Phase | Scope | Time |
|---|---|---|
| **1. Core engine + Google leads** | Webhook ingestion (Google only), data model, rules engine, delayed-action primitive, agency Inbox, portal Inbox, manual lead entry, CSV export, 5 destinations: portal write, outbound webhook, Slack, email, Sheets append. | ~2 weeks |
| **2. Meta lead capture** | Extend Meta OAuth (`leads_retrieval` + `pages_manage_ads`), per-Page leadgen subscription toggle, Page access token storage, Meta webhook handler with `X-Hub-Signature-256` verify, Graph API field fetch. SMS destination via Twilio. Speed-to-lead autoresponder destinations (email + SMS to prospect). | ~1.5 weeks |
| **3. Marketer polish** | Spam heuristic scoring, lead scoring, no-reply escalation system rule, dedup beyond ID, attribution reporting, Smart Watch deep integration, retroactive scoring backfill. | ~1 week |

Phase 1 ships a complete end-to-end system using Google as the single channel. Phases 2 and 3 are additive and never block each other.

## Architecture

```
Meta / Google / Manual entry
     │
     ▼
┌──────────────────────────────┐
│ Ingestion endpoints           │ /api/leads/webhook/meta
│ (sig verify, dedup, rate-lim) │ /api/leads/webhook/google/[token]
│                               │ /api/leads (manual)
└──────────┬───────────────────┘
           │  insert lead row (NULL client_id allowed)
           ▼
┌──────────────────────────────┐
│ Normalizer                    │ canonical lead shape;
│ + scoring + spam check        │ capture full attribution;
│ (Phase 3 features)            │ resolve client_id; auto-assign AM
└──────────┬───────────────────┘
           │  enqueue rules.evaluate
           ▼
┌──────────────────────────────┐
│ Rules engine                  │ per-form rules,
│ (conditional fan-out)         │ filters → Delivery[];
│                               │ form-field metadata cache
└──────────┬───────────────────┘
           │  N delivery jobs (claim-locked)
           ▼
┌──────────────────────────────┐
│ Delivery worker               │ destination adapters,
│ (CF Queue consumer)           │ re-validate at fire time,
│                               │ retries with backoff, audit log
└──────────┬───────────────────┘
           │
           ▼
   Slack / Webhook / Email / SMS / Sheet / Portal write / Autoresponder
                          │
                          ▼
                  UI: agency inbox + portal inbox
                  (SSE for real-time updates)
```

### Marketer best practices baked in

| Practice | Where it lives |
|---|---|
| Real-time delivery (sub-60s) | Native webhooks at ingestion — no polling |
| Idempotency (no double-deliver on retries) | `UNIQUE(source, source_lead_id)` constraint at ingestion; `INSERT … RETURNING` to detect skips |
| Full attribution capture (`gclid`, `fbclid`, `ad_id`, `campaign_id`, `utm_*`) | Normalizer, stored on every lead |
| Spam / fake-lead filter (work-email check, dedup, suspicious patterns) | Phase 3, runs before rules; flags `status='spam_suspected'` rather than dropping |
| Lead scoring (cheap heuristic: domain quality + field completeness) | Phase 3, score stored on lead |
| Retry on failure | Delivery worker, exponential backoff via CF Queues |
| Audit trail ("what was delivered, when, where, did it succeed") | `lead_deliveries` table |
| Status lifecycle (new → contacted → qualified → won / lost / spam) | Lead row, surfaced in both inboxes |
| Speed-to-lead autoresponder back to prospect | First-class destination type (email + SMS variants) in Phase 2 |
| No-reply escalation (status still `new` after Xh → ping AM) | Phase 3 system rule, built on the delayed-action primitive |
| Auto-assignment to AM | Normalizer step using `client_team_assignments` (existing 064 migration) |

## Multi-tenancy / app architecture

- We use **one Meta app** to OAuth all client Pages. The leadgen webhook fires for every subscribed page across the app; the ingestion handler partitions by `entry.id` (page_id) → `meta_page_subscriptions` → `connection_id` → `client_id`.
- Google Ads gives us **one webhook URL per client** (we generate it). No per-app routing needed; the URL token alone identifies the client.
- A single agency tenant runs the system. No cross-agency isolation in scope (this is the agency's internal tool, not a SaaS product).

## Data model

Migrations:
- `084-leads-engine.sql` — Phase 1 tables and Smart Watch reason addition
- `085-meta-lead-pages.sql` — Phase 2 Meta subscriptions + autoresponder rate-limit
- `086-leads-scoring.sql` — Phase 3 scoring indexes + (optional) escalation config

### `lead_webhook_endpoints` (Phase 1)

Per-client tokenized URL + key for Google Ads to POST to. Issued once per client, rotatable with grace period.

```
id                    UUID PK
client_id             UUID NOT NULL  -- existing clients table
source                VARCHAR(20)     -- 'google' (Phase 1) | 'meta_app' (one global row)
url_token             TEXT UNIQUE     -- random token in URL path
secret_key            TEXT NOT NULL   -- shared with Google Ads "Webhook key" field
secret_key_previous   TEXT            -- previous key, valid until secret_key_grace_until
secret_key_grace_until TIMESTAMPTZ
rotated_at            TIMESTAMPTZ
created_at            TIMESTAMPTZ DEFAULT NOW()
```

Webhook URL format: `https://<host>/api/leads/webhook/google/<url_token>`

Rotation: when an agency hits "Rotate key", we generate a new `secret_key`, copy the old one to `secret_key_previous`, and set `secret_key_grace_until = NOW() + 30 minutes`. Both keys are accepted during the grace window so in-flight Google retries don't 401.

### `meta_page_subscriptions` (Phase 2)

Tracks which connected Meta Pages have leadgen subscription enabled, and stores their long-lived Page access token (encrypted) for Graph API lookups after a webhook fires.

```
id                          UUID PK
connection_id               UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE
page_id                     TEXT NOT NULL
page_name                   TEXT
client_id                   UUID REFERENCES clients(id)  -- resolved at subscribe time
page_access_token_encrypted TEXT
subscribed_at               TIMESTAMPTZ
last_token_refresh_at       TIMESTAMPTZ
status                      VARCHAR(20)  -- active | failed | disabled | revoked
last_error                  TEXT
UNIQUE(connection_id, page_id)
```

Storing `client_id` directly avoids a runtime join through `social_connections → ad_account_client_map`. Resolved when the toggle is turned on.

### `leads` (Phase 1)

Canonical normalized lead. **`client_id` is nullable** to support unmapped leads (Meta lead arrives for a Page not yet mapped to a client).

```
id                  UUID PK
client_id           UUID REFERENCES clients(id)        -- NULL if unmapped; surfaced in agency UI as "Unmapped"
source              VARCHAR(20) NOT NULL                -- 'meta' | 'google' | 'manual'
source_lead_id      TEXT NOT NULL                       -- Meta leadgen_id, Google lead_id, or generated UUID for manual
form_id             TEXT                                -- Meta form_id, Google form asset id, or NULL for manual
form_name           TEXT
ad_id               TEXT
ad_name             TEXT
campaign_id         TEXT
campaign_name       TEXT
page_id             TEXT                                -- Meta only
submitted_at        TIMESTAMPTZ NOT NULL
ingested_at         TIMESTAMPTZ DEFAULT NOW()
field_data          JSONB NOT NULL                      -- normalized form field key/value pairs
attribution         JSONB                               -- { gclid, fbclid, utm_source, utm_medium, ... }
score               INT                                 -- 0–100, populated in Phase 3
score_reasons       JSONB
status              VARCHAR(20) DEFAULT 'new'
                                                        -- new | contacted | qualified | won | lost | spam_suspected
spam_reasons        JSONB
assigned_to         UUID REFERENCES team_members
contacted_at        TIMESTAMPTZ
contacted_by        UUID REFERENCES team_members
notes               TEXT
created_by          UUID REFERENCES team_members        -- only set for source='manual'
deleted_at          TIMESTAMPTZ                         -- soft-delete; hard-delete via separate purge job
created_at          TIMESTAMPTZ DEFAULT NOW()

UNIQUE(source, source_lead_id) WHERE deleted_at IS NULL
```

Indexes: `(client_id, status, submitted_at DESC) WHERE deleted_at IS NULL`, `(form_id, submitted_at)`, `(status) WHERE status='new' AND deleted_at IS NULL`, `(client_id) WHERE client_id IS NULL` (for unmapped triage).

### `lead_form_metadata` (Phase 1)

Discovered or pulled metadata about each form — used to populate the filter builder's field dropdown. Refreshed on each lead ingestion (cheap union with existing fields).

```
id              UUID PK
source          VARCHAR(20) NOT NULL
form_id         TEXT NOT NULL
form_name       TEXT
fields          JSONB                  -- [{ key, label, sample_value, first_seen_at }]
last_lead_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(source, form_id)
```

For Meta in Phase 2, we can also proactively pull form schema from `GET /{form_id}` to populate fields before the first lead arrives.

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
                    -- autoresponder_email | autoresponder_sms | assign_user
config              JSONB NOT NULL    -- type-specific (URL, channel, recipients, template_id)
filter              JSONB             -- { field: 'field_data.budget', op: 'gt', value: 5000 } | null
delay_minutes       INT DEFAULT 0     -- 0 = immediate
enabled             BOOLEAN DEFAULT TRUE
sort_order          INT DEFAULT 0
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

`assign_user` is a special destination type (added based on revision) that sets `leads.assigned_to` rather than calling external. Lets per-form rules pin a specific AM as the owner.

### `lead_deliveries` (Phase 1)

Audit log of every dispatch attempt. Surfaces in the UI as the lead's "delivery history."

```
id                       UUID PK
lead_id                  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE
rule_destination_id      UUID REFERENCES lead_rule_destinations(id) ON DELETE SET NULL
destination_type         VARCHAR(30) NOT NULL
status                   VARCHAR(20) DEFAULT 'pending'
                         -- pending | claimed | delivered | failed | cancelled | skipped
scheduled_at             TIMESTAMPTZ NOT NULL
claimed_at               TIMESTAMPTZ           -- worker claim lock
claimed_by               TEXT                  -- worker instance id
attempted_at             TIMESTAMPTZ
last_error               TEXT
retry_count              INT DEFAULT 0
response_meta            JSONB
idempotency_key          TEXT NOT NULL         -- sent in outbound webhook payload as X-Leads-Idempotency-Key
created_at               TIMESTAMPTZ DEFAULT NOW()
updated_at               TIMESTAMPTZ DEFAULT NOW()
```

Indexes: `(lead_id)`, `(status, scheduled_at) WHERE status='pending'` for the queue worker, `(claimed_at) WHERE status='claimed'` for stuck-claim recovery.

`skipped` status: written when re-validation at fire time finds rule/destination disabled or lead deleted/spam.

### `lead_ingestion_errors` (Phase 1)

Errors during signature verify, dedup, or normalization — for ops review without losing data. **30-day TTL via cron purge** because raw payloads can contain PII.

```
id              UUID PK
source          VARCHAR(20) NOT NULL
raw_payload     JSONB
headers         JSONB
error           TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

Index: `(created_at)` for purge.

### `lead_autoresponder_log` (Phase 2)

Per-recipient rate limit for autoresponder destinations. One row per `(form_id, recipient, channel)` per send.

```
id              UUID PK
form_id         TEXT NOT NULL
recipient       TEXT NOT NULL    -- email or phone
channel         VARCHAR(20)      -- email | sms
sent_at         TIMESTAMPTZ DEFAULT NOW()
INDEX(form_id, recipient, channel, sent_at DESC)
```

Worker checks `WHERE sent_at > NOW() - INTERVAL '24 hours'` before dispatch.

## Ingestion endpoints

### `GET /api/leads/webhook/meta` (Phase 2)

Meta verify-token handshake. Echoes `hub.challenge` if `hub.verify_token` matches `process.env.META_LEADGEN_VERIFY_TOKEN`.

### `POST /api/leads/webhook/meta` (Phase 2)

1. Rate-limit by source IP (configurable, default 100/min/IP) — defense beyond signature.
2. Verify `X-Hub-Signature-256` header against `process.env.META_APP_SECRET` (HMAC-SHA256, constant-time compare).
3. For each entry's `changes[]` with `field='leadgen'`:
   - Extract `leadgen_id`, `form_id`, `page_id`, `ad_id`, `campaign_id`, `created_time`.
   - Look up `meta_page_subscriptions` row for the page_id; if not found or status≠active, skip and log to `lead_ingestion_errors`.
   - Decrypt Page access token; if decryption fails, mark subscription `status='failed'` and log.
   - Call Graph API `GET /{leadgen_id}?fields=field_data,ad_id,form_id,...&access_token=<page_token>` with 30s timeout.
   - Normalize `field_data[]` (array of `{name, values[]}`) into a flat key/value object.
   - Resolve `client_id` from `meta_page_subscriptions.client_id`.
   - `INSERT INTO leads ... ON CONFLICT (source, source_lead_id) DO NOTHING RETURNING id`. Only enqueue rules if RETURNING returned a row.
   - Upsert `lead_form_metadata` with the form's observed field keys.
   - Enqueue `rules.evaluate(lead.id)` to CF Queue.
4. Always return HTTP 200 to Meta even on internal errors (write to `lead_ingestion_errors` instead). Meta retries are aggressive.

### `POST /api/leads/webhook/google/[token]` (Phase 1)

1. Rate-limit by `url_token` (default 200/min/token).
2. Look up `lead_webhook_endpoints` by `url_token`. 404 if not found.
3. Validate the `google_key` field in the JSON body matches the row's `secret_key` OR (during grace) `secret_key_previous`. 401 if neither matches. Constant-time comparison.
4. Parse the payload. Field shape: `lead_id`, `gcl_id`, `user_column_data[]` (array of `{column_name, string_value}`), `campaign_id`, `form_id`, `api_version`.
5. Normalize `user_column_data[]` into a flat key/value object.
6. Resolve `client_id` from the endpoint row.
7. `INSERT INTO leads ... ON CONFLICT (source, source_lead_id) DO NOTHING RETURNING id`. Only enqueue rules if a row was inserted.
8. Upsert `lead_form_metadata`.
9. Enqueue `rules.evaluate(lead.id)`.
10. Return HTTP 200 with `{"ok": true}`.

### `POST /api/leads` (Phase 1) — Manual lead entry

Agency-side endpoint for entering phone/walk-in leads.

1. `requireAuth` + RBAC check.
2. Validate body: `client_id`, `field_data` (object), optional `form_name`, `notes`, `assigned_to`.
3. Generate `source='manual'`, `source_lead_id=<uuid>`, `submitted_at=NOW()`, `created_by=user.id`.
4. Insert. No rules engine evaluation by default — manual leads go straight to inbox without fan-out (toggleable via UI checkbox "Run rules" if user wants delivery).

## Form metadata & field discovery

The filter builder needs to know what fields exist for a form so the user picks from a dropdown rather than typing field paths. Two sources:

1. **Reactive discovery** (always on): every ingestion upserts the lead's field keys into `lead_form_metadata.fields` as a union, with first-seen sample values.
2. **Proactive pull (Phase 2, Meta only):** when a Page subscribes, also call `GET /{form_id}?fields=questions` to seed metadata before any leads arrive.

The rule editor's field dropdown reads from `lead_form_metadata.fields`. Falls back to free-text input if no metadata yet.

## Auto-assignment

Two layers, evaluated in order:

1. **Rule-level `assign_user` destination:** if a rule has an `assign_user` destination matching the lead's filter, set `assigned_to` to that user.
2. **Default per-client AM:** if no assignment from rules, look up `client_team_assignments` (existing 064 migration) and assign to the client's primary AM.
3. If neither resolves, leave `assigned_to=NULL`. UI shows leads as "Unassigned."

This runs in the normalizer (before rules engine), so the value is set when notifications fire.

## Rules engine

Pure function: `evaluateLead(leadId) → DeliveryRow[]`. Triggered as a CF Queue consumer.

1. Load the lead and its `lead_form_rules` row by `(source, form_id)`.
2. If rule disabled or no rule row, write a single `lead_deliveries` placeholder marked `cancelled` with reason `no_rule_configured` or `rule_disabled` and exit.
3. For each enabled `lead_rule_destinations`:
   - Evaluate `filter` if present. JSON-path-style field reference (`field_data.budget`, `attribution.utm_campaign`, `score`, `field_data.email`).
   - Operators: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `in`, `not_in`.
   - If filter passes, generate a deterministic `idempotency_key = hash(lead.id + destination.id + retry_count_zero)` and insert `lead_deliveries` row with `scheduled_at = NOW() + delay_minutes * 1 minute` and `status='pending'`.
4. Enqueue each pending delivery to the delivery queue.

Filters are deliberately limited to one level — no AND/OR composition of multiple conditions in the same destination. If users want compound logic, they create two destinations with different filters.

## Destination adapters

Each adapter implements:

```ts
interface DestinationAdapter {
  type: string
  // Validate config when saving rule. Returns friendly errors for the editor UI.
  validateConfig(config: any): { valid: boolean; errors?: Record<string, string> }
  // Dispatch the delivery. Must respect 30s timeout. Never throws — always returns result.
  dispatch(delivery: LeadDelivery, lead: Lead, config: any): Promise<DispatchResult>
}

type DispatchResult =
  | { status: 'delivered'; response_meta?: any }
  | { status: 'failed'; error: string; retry_after_ms?: number }
```

Validation rules:
- **`webhook`**: URL must be HTTPS (no http://, no localhost, no private IPs — SSRF defense per `CLAUDE.md`). Method in `[POST, PUT]`. Headers values can't include literal CRLF.
- **`slack`**: URL must match `https://hooks.slack.com/services/...`.
- **`email`** + **`autoresponder_email`**: each `to` must be RFC5322 valid; subject/body templates must reference only fields present in `lead_form_metadata` for the form.
- **`sheets`**: spreadsheet_id must be 44-char Google ID; sheet_name must be present.
- **`sms`** + **`autoresponder_sms`**: `to_template` must resolve to E.164 format; body ≤ 1600 chars (Twilio limit).
- **`assign_user`**: target user_id must exist and be active.

### Phase 1 adapters

| Type | Config | Behavior | Timeout |
|---|---|---|---|
| `portal` | `{}` | No external call — flips lead's portal-visible flag. | n/a |
| `webhook` | `{ url, method='POST', headers?, secret? }` | POSTs canonical lead JSON. Adds `X-Leads-Signature: sha256=<hmac>` if `secret` provided. Always sends `X-Leads-Idempotency-Key: <delivery.idempotency_key>` so receivers can dedupe our retries. | 30s |
| `slack` | `{ webhook_url, channel?, mention? }` | Posts a formatted Block Kit card to a Slack incoming webhook. | 30s |
| `email` | `{ to[], subject_template, body_template, from? }` | Sends via Resend (existing integration). Templates support `{{ field.email }}`, `{{ field.first_name }}`, `{{ source }}`, etc. Missing fields render as empty string with a warning logged. | 30s |
| `sheets` | `{ spreadsheet_id, sheet_name }` | Append row via Google Sheets API. Requires Google connection with `spreadsheets` scope. | 30s |
| `assign_user` | `{ user_id }` | Updates `leads.assigned_to`. | n/a |

### Phase 2 adapters

| Type | Config | Behavior | Timeout |
|---|---|---|---|
| `sms` | `{ to_template, body_template }` | Twilio API. `to_template` typically `{{ field.phone }}` for autoresponder, or a hard-coded staff number for alerts. | 30s |
| `autoresponder_email` | `{ subject_template, body_template, from }` | Same as `email` but addressed to `{{ field.email }}` by default. Skipped if `lead_autoresponder_log` shows a send to this recipient in last 24h. | 30s |
| `autoresponder_sms` | `{ body_template }` | SMS to `{{ field.phone }}`. Same 24h rate limit. | 30s |

Adapters never throw on dispatch failure — they return `{ status: 'failed', error }` so the worker can persist and retry. HTTP 5xx, network errors, and timeouts are all `failed`. HTTP 4xx (other than 429) are `failed` and **not retried** (likely config error, not transient).

## Delivery worker

CF Queue consumer (`leads-delivery-queue`).

1. **Claim** the delivery atomically: `UPDATE lead_deliveries SET status='claimed', claimed_at=NOW(), claimed_by=$worker_id WHERE id=$1 AND status='pending' RETURNING *`. If 0 rows, another consumer already claimed — exit.
2. If `scheduled_at > NOW()`, release claim (`status='pending'`) and requeue with `{ delaySeconds: scheduled_at - NOW() }`.
3. **Re-validate at fire time:**
   - Reload lead. If `deleted_at IS NOT NULL` or `status='spam_suspected'`, mark delivery `status='skipped'` with reason `lead_invalid` and exit.
   - Reload rule. If `enabled=false`, mark `status='skipped'` reason `rule_disabled` and exit.
   - Reload destination. If `enabled=false`, mark `status='skipped'` reason `destination_disabled` and exit.
   - For autoresponder types, check `lead_autoresponder_log` for 24h dedupe; if hit, mark `status='skipped'` reason `autoresponder_rate_limited`.
4. Resolve adapter; dispatch with 30s wall-clock timeout.
5. On success: update row `status='delivered'`, `attempted_at=NOW()`, `response_meta=...`. For autoresponders, append to `lead_autoresponder_log`.
6. On 429 with `Retry-After` header: release claim, requeue with that delay; do not increment `retry_count`.
7. On other failure: increment `retry_count`. If `retry_count < 3`, release claim and requeue with backoff `1m → 5m → 15m`. If `>= 3`, mark `status='failed'`, `last_error=...`. Surfaces in UI with manual "Retry" button (resets retry_count to 0).
8. **Stuck-claim recovery:** a separate cron sweeps `WHERE status='claimed' AND claimed_at < NOW() - INTERVAL '5 minutes'` and resets to `pending` (worker died mid-dispatch).

## UI surfaces

### Agency: `/agency/leads`

Two tabs: **Inbox** | **Form Rules**.

**Inbox:**
- Filter bar: client (incl. "Unmapped"), source (Meta/Google/Manual), form, status, date range, score range (Phase 3), assigned-to.
- Table columns: submitted_at, client, source icon, form name, lead summary (first 2 fields), status pill, assigned to, deliveries count.
- Row click opens slide-over with: full field data, attribution (UTM/gclid/etc.), delivery history (each `lead_deliveries` row with status + last_error + manual retry button), status changer, assign-to picker, notes, "Mark unmapped → assign client" picker for orphans.
- Bulk actions: mark contacted, mark spam, reassign, delete (soft).
- **Real-time updates:** SSE stream `/api/leads/stream` pushes new lead events to the open inbox. Reuses the existing `chat-rooms` / `board-events` Durable Object pattern, or a simpler per-user SSE if a DO is overkill for v1.
- **CSV export:** button on the inbox respecting current filters; downloads `leads-YYYY-MM-DD.csv` with columns matching the table + full attribution.
- **"+ Manual lead" button:** opens modal with client picker, free-form fields editor, notes, optional "Run rules engine" toggle.

**Form Rules:**
- List of `(client × form)` combinations seen in the wild (auto-discovered) plus any pre-configured.
- "Configure" opens a per-form rule editor:
  - Form metadata (read-only: form_id, source, last seen lead at, observed field count).
  - Destinations table — each row: type, config summary, filter, delay, enabled, drag handle, ✎/🗑 buttons.
  - "Add destination" picker.
  - Per-destination editor (modal): destination type → type-specific config form (uses `validateConfig` for live errors); optional filter builder (`field` dropdown populated from `lead_form_metadata.fields` × `op` dropdown × `value` input); optional delay (`0` / `5min` / `15min` / `1hr` / `2hr` / `24hr` / custom).
  - "Test fire" button — synthesizes a sample lead from `lead_form_metadata.sample_value`s and runs the rule end-to-end, showing each destination's dispatch result without persisting to `lead_deliveries`.

### Settings → Social → Google: "Lead webhooks" tab (Phase 1)

Per client (filterable), a card showing:
- Webhook URL (read-only, copy button)
- Webhook key (read-only, copy button, masked behind reveal)
- "Rotate key" button (with confirm modal — old key valid for 30 minutes after rotation)
- Setup instructions with screenshots showing the Google Ads "Webhook integration" form
- "Test data received" indicator (true if any lead has arrived through this token)
- "Last 5 events" mini-feed: ingestion success/error from `lead_ingestion_errors` and recent leads

### Settings → Social → Meta: per-Page lead capture (Phase 2)

For each connected Meta Page (joined from `social_connections` + Pages), a row:
- Page name + ID
- Lead capture toggle. Toggle on:
  - Re-prompts OAuth if scopes don't yet include `leads_retrieval` + `pages_manage_ads`.
  - Calls `POST /{page_id}/subscribed_apps` with `subscribed_fields=leadgen`.
  - Stores Page access token (encrypted at rest with column encryption).
  - Inserts/updates `meta_page_subscriptions` row with resolved `client_id`.
  - Optionally pulls form schema from `GET /{page_id}/leadgen_forms` to seed `lead_form_metadata`.
- Status pill: not subscribed / subscribed / failed / revoked (with last error).
- "Test webhook" button: sends a Meta-format synthetic event to our own ingestion endpoint to verify wiring.

### Client portal: `/portal/leads` (Phase 1)

Read-only inbox for the logged-in client.
- Same filter bar minus client (always self) and minus assigned-to.
- Same table layout minus assignment columns.
- Same slide-over minus delivery history (clients don't need internal routing visibility) and minus assign-to / "+ Manual lead" / bulk delete.
- Default `status='new'` filter on. "Mark contacted" allowed (writes back to lead with `contacted_by=client_user`).
- CSV export available.

Linked from existing client portal nav alongside Invoices, Briefs, Approvals.

## Privacy, retention & deletion

- **At-rest encryption:** Sensitive fields (`page_access_token_encrypted`, eventually any column-encrypted PII) use the project's existing encryption helper. `field_data` itself is not column-encrypted (size/queryability tradeoff) — relies on Neon's at-rest encryption.
- **Retention policy:** Configurable per-tenant with a sensible default of **18 months** for leads (matches Australian Privacy Principles' "no longer than necessary" guideline). Cron job nightly hard-deletes leads older than retention with `deleted_at IS NULL` AND status in (`won`, `lost`, `spam_suspected`).
- **`lead_ingestion_errors` raw payloads:** 30-day TTL via cron purge — they can contain phone/email PII.
- **`lead_autoresponder_log`:** 90-day TTL.
- **Right to be forgotten:** `DELETE /api/leads/[id]/purge` (admin-only, audited) hard-deletes the lead, cascades to `lead_deliveries`, redacts the `idempotency_key` audit row to a stub. Also redacts the original payload in `lead_ingestion_errors` if present.
- **Soft-delete vs hard-delete UI:** "Delete" button in slide-over does a soft-delete (`deleted_at=NOW()`). Hard-delete is admin-only via "Purge" submenu, with a 7-day cooling period unless flagged as a privacy request.

## Reliability + error handling

- **Idempotency:** `UNIQUE(source, source_lead_id)` makes duplicate webhook deliveries from Meta/Google safe. `INSERT … RETURNING id` distinguishes "new lead" from "already-seen" to avoid double-enqueueing rules.
- **Concurrency:** Delivery worker uses claim-lock via `UPDATE … WHERE status='pending' RETURNING *`. Stuck-claim recovery cron resets entries claimed >5 minutes.
- **Re-validation at fire time:** Worker re-loads lead/rule/destination before dispatch; skips if any are disabled or lead deleted.
- **Signature verify:** Meta uses HMAC-SHA256 in `X-Hub-Signature-256` against the app secret. Google uses a per-endpoint `secret_key` in the request body. Both compared with constant-time equality.
- **Verify-token handshake:** Meta GET handshake implemented in the same route handler as the POST.
- **Always-200 to providers:** Both webhook endpoints return 200 to the platform even on internal failure — failures are written to `lead_ingestion_errors`. Avoids platform retry storms.
- **Inbound rate limits:** 100/min/IP for Meta endpoint, 200/min/`url_token` for Google. Exceeding returns 429 with `Retry-After`. Storage: in-memory ring buffer per Worker (good enough for v1; Redis if proven inadequate).
- **Outbound HTTP timeout:** 30s wall-clock per dispatch. Aborts and counts as `failed`.
- **Outbound idempotency keys:** Every webhook dispatch sends `X-Leads-Idempotency-Key` (the delivery's own id) so client receivers can dedupe our retries.
- **Outbound webhook signing:** When destination config has a `secret`, we add `X-Leads-Signature: sha256=<hmac(secret, body)>`. Header name finalized as `X-Leads-Signature` (project namespace).
- **Graceful degradation when CF bindings missing:** Producer falls back to inline dispatch if CF Queues are unavailable (mirrors existing `notifications` patterns). Logs a warning so ops can re-enable.
- **Page token refresh (Phase 2):** Long-lived Page tokens (~60 days). Background job exchanges them weekly via `/oauth/access_token?grant_type=fb_exchange_token`. Marks `meta_page_subscriptions.status='failed'` if refresh fails; surfaces in Meta settings UI; emails the agency owner if all tokens fail.
- **Token revocation handling (Phase 2):** Webhook arrival for a page whose token is revoked → mark subscription `status='revoked'`, log to `lead_ingestion_errors`, surface in UI with a "Reconnect" CTA.
- **Retry policy:** 3 attempts with backoff `1m → 5m → 15m`. After exhaustion, `status='failed'` with the error stored. UI exposes "Retry" button (resets `retry_count` and `status='pending'`).
- **Rate-limit awareness:** Adapters honor `429` + `Retry-After` without consuming a retry attempt.
- **Per-recipient autoresponder rate limit (Phase 2):** Max 1 autoresponder email and 1 autoresponder SMS per `(form, recipient)` per 24h to prevent loops if a lead resubmits.
- **Key/secret rotation grace:** Inbound Google webhook keys keep the previous value valid for 30 minutes. Outbound webhook secrets switch immediately (low risk — just a verification header; the receiver should accept either during their own rotation).
- **Queue consumer placement:** Per `CLAUDE.md`, CF Pages can produce to Queues but `queues.consumers` cannot live in the Pages `wrangler.toml`. The delivery worker therefore runs in a small companion Worker (sibling to `ai-agent-worker`) configured via the Cloudflare dashboard, sharing the database and Resend env. Implementation plan should confirm whether to extend an existing Worker or stand up a new `leads-delivery-worker`.

## Observability

- **Structured logs** (existing logging conventions): every ingestion logs `{source, form_id, client_id, lead_id, dedup_skipped, ms}`. Every dispatch logs `{delivery_id, type, attempt, status, ms, http_status?}`.
- **Metrics** (CF Workers Analytics Engine if available, otherwise simple counts table):
  - `leads.ingested.count` by source / status (new vs deduped vs error)
  - `leads.deliveries.count` by destination_type / status
  - `leads.deliveries.duration_ms` histogram
  - `leads.queue.depth` (pending count)
  - `leads.autoresponder.skipped` (rate-limited)
- **Alerts** (manual review v1, automated v2):
  - Token refresh failed for any page → notification to agency owner via Smart Watch
  - >10 deliveries in `failed` status across a rolling 1h window → ops notification
  - Stuck-claim recovery fired → ops log
- **Dashboard tile** (Phase 3): existing dashboard adds a "Leads (24h)" tile showing ingested / delivered / failed counts plus a sparkline.

## Testing strategy

**Unit tests (Vitest):**
- Normalizer: Meta payload shape → canonical lead; Google payload shape → canonical lead; manual entry → canonical lead.
- Filter evaluator: every operator × scalar/array/null inputs × missing-field cases.
- Adapter `validateConfig` for each type — happy path + at least 3 invalid configs.
- Template renderer: missing fields render empty + log warning; nested paths (`field.address.city`).
- Rate-limit ring buffer: window sliding, 429 response shape.
- Idempotency key generation: deterministic, stable across retries.

**Integration tests (Vitest with happy-dom):**
- `POST /api/leads/webhook/google/[token]`: valid request → lead row + queued delivery; key mismatch → 401; dedup → 200 with no enqueue; rate-limited → 429.
- `POST /api/leads/webhook/meta`: signature mismatch → 200 + ingestion_error row; unknown page → 200 + ingestion_error.
- Manual entry endpoint: RBAC enforced; `source='manual'` lead created; rules skipped unless flagged.
- Rules engine: rule disabled → cancelled placeholder; matching filter → delivery row; non-matching → no row.
- Delivery worker (mocked adapters): success → status='delivered'; 429 → requeue; 5xx three times → status='failed'; lead deleted between schedule and fire → status='skipped'.
- Stuck-claim recovery: claimed delivery older than 5min → reset to pending.
- Autoresponder dedupe: second send within 24h → skipped.
- Key rotation: old key valid during grace window, invalid after.

**Manual / E2E (browser):**
- Configure a rule with 3 destinations (portal write + Slack + email) + 1 with a filter; fire a synthetic lead via "Test fire"; confirm UI states match.
- Real Google Ads "Send test data" round-trip on a staging endpoint.
- Real Meta synthetic leadgen via `POST /{page_id}/leads` (test endpoint) on staging.
- Client portal lead inbox: client user sees only their leads; mark-contacted writes back; CSV export downloads correct rows.
- Inbox SSE: open inbox in two windows, fire a lead, both update without refresh.

**Load test (Phase 1 acceptance):**
- 1,000 leads ingested over 60 seconds → no dropped leads, all delivered or failed cleanly, queue drains within 5 minutes.

## Local development & webhook testing

- **`pnpm dev`** runs Nitro on `http://localhost:3000`; webhook endpoints are unreachable from Meta/Google.
- **Tunneling:** Use `cloudflared tunnel --url http://localhost:3000` for an instant public URL. Doc this in the spec's setup README and in the rule editor's "Test webhook" tooltip.
- **Synthetic event runner:** `pnpm test:webhook:google` and `pnpm test:webhook:meta` scripts POST realistic payloads to a local endpoint for manual testing without tunnels.
- **Replay tool:** `/api/leads/dev/replay/[ingestion_error_id]` (dev-env only, gated) re-feeds a stored raw payload through the ingestion pipeline for debugging.
- **Mock destinations in dev:** Slack/webhook/email destinations can be configured to point at `https://webhook.site/<token>` for inspection without spamming real endpoints.

## Notifications + Smart Watch integration

- **Phase 1:** New leads create a notification on the existing `notifications` system targeting the client's assigned account manager. Reuses the Smart Watch reason taxonomy — new reason `lead_arrived`. Tested against existing notification UI to confirm rendering.
- **Phase 1:** Manual lead entry creates the same notification.
- **Phase 3:** Importance scoring of lead notifications uses the same heuristic engine as Phase E watch improvements (`importance_score` 0–1 mapped from lead `score`).

## Permissions / RBAC

- **`/agency/leads` read** — `requireRole(event, [PERMISSIONS.MANAGE_SOCIAL, PERMISSIONS.VIEW_LEADS])`. Account managers and above can read their clients' leads.
- **Rule editing** — only admins/owners can edit form rules (new permission `MANAGE_LEAD_RULES`, or check existing role hierarchy).
- **Hard-delete / purge** — admin/owner only.
- **Manual lead entry** — same as inbox read (anyone who can see leads can add them).
- **`/portal/leads`** — gated by existing `requireClientAuth(event)`; query is always filtered to `client_id = clientUser.client_id`.

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
- Cross-agency multi-tenancy (this is one agency's internal tool).
- Source IP allowlist as a strict gate (signature verify is sufficient; allowlist is a future hardening).

## Open questions

- **Sheets append OAuth scope** — existing Google connection is `ads_read` scope. Sheets needs `https://www.googleapis.com/auth/spreadsheets`. Need to add scope re-prompt UX for affected connections in Phase 1.
- **Twilio account onboarding** — Phase 2 requires a Twilio account, phone number, and (for US numbers) A2P 10DLC compliance registration. Treat as prerequisite work, not engineering.
- **SSE vs Durable Object for inbox real-time** — existing pattern uses DOs (`chat-rooms`, `board-events`). For the leads inbox a simpler per-user SSE may be enough; implementation plan to choose.
- **Retention default** — 18 months chosen as Australian-Privacy-Principle-friendly default. Confirm with the agency before Phase 1 ship.
- **Form metadata refresh cadence** — every-ingestion union is cheap. Should we ALSO call Meta `GET /{form_id}` weekly to catch question changes/removals?

## Acceptance criteria

### Phase 1
- [ ] Migration `084-leads-engine.sql` applied (incl. `lead_arrived` reason added)
- [ ] `POST /api/leads/webhook/google/[token]` accepts a real Google Ads test payload, verifies key, dedupes, inserts a lead, enqueues rules evaluation
- [ ] Inbound rate limit returns 429 with Retry-After when exceeded
- [ ] Manual lead entry endpoint creates a `source='manual'` lead with optional rules-skip
- [ ] Form metadata is upserted on every ingestion; rule editor's field dropdown populates from it
- [ ] Auto-assignment sets `assigned_to` from `client_team_assignments` when no rule overrides
- [ ] Rules engine fans out to N destinations with per-destination filters and delays
- [ ] All 6 Phase 1 destinations (`portal`, `webhook`, `slack`, `email`, `sheets`, `assign_user`) dispatch real payloads in dev
- [ ] Adapter `validateConfig` blocks invalid configs in the rule editor with friendly errors
- [ ] CF Queue consumer claims atomically, re-validates at fire time, retries with `1m / 5m / 15m` backoff, marks `failed` after 3 attempts
- [ ] Stuck-claim recovery cron resets stale claims after 5 minutes
- [ ] Outbound webhook payloads include `X-Leads-Idempotency-Key`; signed with `X-Leads-Signature` when secret configured
- [ ] Agency `/agency/leads` Inbox lists, filters, supports SSE real-time, opens detail slide-overs, supports CSV export
- [ ] Agency Form Rules tab supports add/edit/remove destinations with live config validation; "Test fire" button works
- [ ] Settings → Social → Google "Lead webhooks" tab generates per-client URL+key, supports key rotation with 30-min grace, shows "Test data received" indicator and last-5-events feed
- [ ] Client portal `/portal/leads` shows the logged-in client's leads, supports "Mark contacted" and CSV export
- [ ] New-lead notification reaches the assigned AM via Smart Watch
- [ ] Soft-delete + admin hard-delete (purge) works; cascades to deliveries
- [ ] `lead_ingestion_errors` 30-day purge cron runs
- [ ] Unit + integration test suites pass; load test (1,000 leads/60s) succeeds

### Phase 2
- [ ] Migration `085-meta-lead-pages.sql` applied
- [ ] Meta OAuth flow re-prompts for `leads_retrieval` + `pages_manage_ads` when needed
- [ ] Per-Page "Enable lead capture" toggle subscribes the Page via `/{page_id}/subscribed_apps` and stores an encrypted Page token
- [ ] `POST /api/leads/webhook/meta` verifies `X-Hub-Signature-256`, rate-limits, fetches lead fields via Graph API, dedupes, inserts a lead, enqueues rules
- [ ] Background job refreshes Page tokens weekly; failures surface in UI and notify owner
- [ ] Token revocation handled gracefully — subscription marked `revoked`, UI shows "Reconnect" CTA
- [ ] Proactive form-schema pull seeds `lead_form_metadata` for newly-subscribed pages
- [ ] SMS, autoresponder_email, autoresponder_sms destinations dispatch successfully
- [ ] Per-recipient autoresponder rate limit enforced (max 1/24h per form+recipient) with `lead_autoresponder_log`
- [ ] "Test webhook" button on Meta settings sends a synthetic event end-to-end

### Phase 3
- [ ] Spam heuristic flags `status='spam_suspected'` based on disposable email, missing fields, dupe within 24h
- [ ] Lead score 0–100 populated on every lead from heuristic; surfaces in Inbox and slide-over
- [ ] Retroactive scoring backfill job runs once over existing leads
- [ ] No-reply escalation system rule fires a configured destination if `status='new'` after a configurable delay
- [ ] Attribution dashboard shows leads × source × campaign × form with conversion (status→won) % over time
- [ ] Importance scoring of lead notifications integrated with Phase E watch system
- [ ] Dashboard tile "Leads (24h)" shows counts + sparkline

## Migration list

- `084-leads-engine.sql` — Phase 1 — `lead_webhook_endpoints`, `leads`, `lead_form_metadata`, `lead_form_rules`, `lead_rule_destinations`, `lead_deliveries`, `lead_ingestion_errors`; adds `lead_arrived` to the existing notification reason enum/check
- `085-meta-lead-pages.sql` — Phase 2 — `meta_page_subscriptions`, `lead_autoresponder_log`
- `086-leads-scoring.sql` — Phase 3 — additional indexes for scoring queries; potentially a `lead_no_reply_rules` table if config moves out of `lead_rule_destinations`

## File touch list (estimate, Phase 1)

```
server/database/migrations/084-leads-engine.sql                          (new)
server/api/leads/webhook/google/[token].post.ts                          (new)
server/api/leads/webhook/google/[token].get.ts                           (new — health check)
server/api/leads/index.post.ts                                           (new — manual entry)
server/api/leads/list.get.ts                                             (new)
server/api/leads/[id].get.ts                                             (new)
server/api/leads/[id].patch.ts                                           (new — status / assignment / notes)
server/api/leads/[id].delete.ts                                          (new — soft delete)
server/api/leads/[id]/purge.delete.ts                                    (new — admin hard delete)
server/api/leads/[id]/retry.post.ts                                      (new — retry failed deliveries)
server/api/leads/export.get.ts                                           (new — CSV export)
server/api/leads/stream.get.ts                                           (new — SSE)
server/api/leads/rules/list.get.ts                                       (new)
server/api/leads/rules/[ruleId].get.ts                                   (new)
server/api/leads/rules/[ruleId].patch.ts                                 (new)
server/api/leads/rules/[ruleId]/destinations.post.ts                     (new)
server/api/leads/rules/[ruleId]/destinations/[destId].put.ts             (new)
server/api/leads/rules/[ruleId]/destinations/[destId].delete.ts          (new)
server/api/leads/rules/[ruleId]/test-fire.post.ts                        (new)
server/api/leads/endpoints/list.get.ts                                   (new)
server/api/leads/endpoints/[id]/rotate.post.ts                           (new)
server/api/leads/forms/list.get.ts                                       (new — form metadata)
server/api/leads/dev/replay/[errorId].post.ts                            (new — dev-only)
server/api/client-portal/leads/list.get.ts                               (new)
server/api/client-portal/leads/[id].get.ts                               (new)
server/api/client-portal/leads/[id]/contacted.post.ts                    (new)
server/api/client-portal/leads/export.get.ts                             (new — CSV)
server/utils/leads/normalizer.ts                                         (new)
server/utils/leads/rulesEngine.ts                                        (new)
server/utils/leads/filterEval.ts                                         (new)
server/utils/leads/templateRender.ts                                     (new)
server/utils/leads/scoring.ts                                            (Phase 3)
server/utils/leads/autoAssign.ts                                         (new)
server/utils/leads/destinations/index.ts                                 (new — adapter registry)
server/utils/leads/destinations/portal.ts                                (new)
server/utils/leads/destinations/webhook.ts                               (new)
server/utils/leads/destinations/slack.ts                                 (new)
server/utils/leads/destinations/email.ts                                 (new)
server/utils/leads/destinations/sheets.ts                                (new)
server/utils/leads/destinations/assignUser.ts                            (new)
server/utils/leads/queue.ts                                              (new — CF Queue producer)
server/utils/leads/rateLimit.ts                                          (new)
server/utils/leads/sse.ts                                                (new)
workers/leads-delivery-worker/                                           (new — or extend ai-agent-worker)
scripts/test-webhook-google.ts                                           (new)
scripts/test-webhook-meta.ts                                             (new)
app/pages/agency/leads/index.vue                                         (new — Inbox + Form Rules tabs)
app/components/leads/Inbox.vue                                           (new)
app/components/leads/InboxFilters.vue                                    (new)
app/components/leads/LeadDetail.vue                                      (new — slide-over content)
app/components/leads/ManualLeadModal.vue                                 (new)
app/components/leads/RuleEditor.vue                                      (new)
app/components/leads/DestinationEditor.vue                               (new)
app/components/leads/FilterBuilder.vue                                   (new)
app/components/leads/TestFirePanel.vue                                   (new)
app/components/leads/DeliveryHistory.vue                                 (new)
app/composables/useLeadsStream.ts                                        (new)
app/pages/portal/leads.vue                                               (new)
app/pages/agency/social/google.vue                                       (extend — Lead webhooks tab)
tests/unit/leads/*                                                       (new)
tests/integration/leads/*                                                (new)
```

Phase 2 adds Meta-side files; Phase 3 adds scoring + escalation utilities.

## Marketing site sync

When Phase 1 ships, update:
- `app/pages/features/index.vue` — add "Lead Capture & Routing" feature in the right category
- `app/pages/features/[slug].vue` — add detailed entry with 3-4 sections (real-time, multi-tenant, in-portal, agency-built)
- `app/components/MarketingNav.vue` — surface in mega menu under Operations or Social

Per `CLAUDE.md` "Front-Facing Page Sync" rule.
