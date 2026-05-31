# Email Marketing Module — Design Spec

**Date:** 2026-05-31
**Status:** Approved design, ready for planning
**Owner:** Paul (paul@adme.net.au)

## Summary

A self-hosted, listmonk-equivalent **email marketing module** built natively inside the XeroFlow Agency dashboard. It manages **subscriber lists**, **campaigns**, a **resumable sending engine**, and **delivery/engagement tracking** — owning all data in Neon Postgres and using **Resend purely as the send transport and event source**.

Ships **agency-first** (XeroFlow sends to its own leads/clients/contacts), with the schema designed for `client_id` scoping so a future multi-tenant "campaigns on behalf of clients" mode can light up without a rewrite.

Lives at **`/agency/email`**.

## Goals

- Named **lists** + global **subscribers** (many-to-many), with CSV import and "add to list" from existing `leads` / `agency_clients`.
- **Campaign composer**: rich-text (WYSIWYG) ⇄ raw-HTML toggle, merge tags, branded shell, save/load reusable templates, test sends, schedule.
- **Resumable, chunked sending engine** sized for **medium scale (2k–50k recipients/campaign)** — crash-safe, pausable, cancellable.
- **Tracking + analytics** via Resend webhooks: delivered/opened/clicked/bounced/complained, per-campaign + per-subscriber, with auto-suppression of hard bounces/complaints.
- **Public pages**: subscribe form + double opt-in, one-click unsubscribe + preference center. Legally compliant (AU Spam Act 2003 + Gmail/Yahoo bulk-sender requirements).

## Non-Goals (this milestone)

- Drag-and-drop **block builder** (deferred to a future phase; can lean on Banner Studio tech).
- **A/B testing** of subject lines / content variants.
- Raw-SQL arbitrary **segmentation** (listmonk-style). V1 segmentation is list + status + simple attribute filters only.
- **Per-client sending domains / DKIM** and dedicated-IP warm-up (relevant only when multi-tenant + large scale lands).
- Multi-messenger (SMS, etc.) — email only.

## Key Decision: Own the data, rent the transport

Resend offers its own Broadcasts/Audiences product. **Rejected** because it stores contacts in Resend (separate from our Postgres), has weak segmentation, and makes `client_id` scoping and pulling from existing `leads`/`agency_clients` awkward. **We own lists, subscribers, campaigns, and events in Neon; Resend is used only to send (Batch API) and to emit delivery/engagement webhooks.** This mirrors listmonk's architecture and fits the existing stack.

The other rejected approach — a naive cron loop that sends to everyone in a single pass — cannot resume after a crash at medium scale. The chosen design persists per-recipient send state so any interruption is recoverable.

## Existing building blocks reused

- **DB layer**: `server/utils/db.ts` (`queryRows`, `queryOne`, `execute`, `transaction`). Neon, dual-driver.
- **Email transport**: `server/utils/email.ts` (Resend client + branded `renderEmailTemplate()` shell).
- **Async/fan-out**: Cloudflare Queues `JOBS_QUEUE` (`server/utils/queue.ts`, `queueConsumer.ts`, `plugins/queue.ts`) with inline fallback for local dev.
- **Scheduling/watchdog pattern**: `server/api/cron/*` with `x-cron-secret` auth and local-hour gating (mirror of `anomaly-detection.post.ts`).
- **Webhook-exempt-from-RBAC pattern**: Xero webhooks (for the new Resend webhook endpoint).
- **Signed-token util**: `server/utils/exportTokens.ts` (currently untracked in the working tree) + migration 130 pattern — reuse for unsubscribe/confirm tokens.
- **Merge-tag rendering**: extend `server/utils/leads/templateRender.ts`.
- **UI**: Nuxt UI v4, Unovis charts (already used for analytics dashboards).

Next migration slot: **131**.

## Architecture

### 1. Data model (migrations 131+)

All tables carry `client_id` (nullable for agency-first), `created_by`, `created_at`, `updated_at` where applicable.

- **`email_subscribers`** — `id`, `email` (citext, UNIQUE), `name`, `attribs` JSONB, `status` (`enabled` / `disabled` / `blocklisted`), timestamps. One global record per person, deduped by email.
- **`email_lists`** — `id`, `name`, `description`, `client_id` (nullable), `double_optin` (bool), `created_by`, timestamps, `archived_at`.
- **`subscriber_lists`** (junction) — `subscriber_id`, `list_id`, `status` (`unconfirmed` / `confirmed` / `unsubscribed`), `source` (`import` / `form` / `manual` / `leads`), `subscribed_at`, `unsubscribed_at`. PK `(subscriber_id, list_id)`.
- **`campaigns`** — `id`, `name`, `subject`, `from_name`, `from_email`, `reply_to`, `body_html`, `body_source` (editor source), `content_type` (`richtext` / `html`), `template_id` (nullable), `status` (`draft` / `scheduled` / `sending` / `paused` / `sent` / `cancelled`), `scheduled_at`, `started_at`, `finished_at`, `client_id`, `created_by`, denormalized counters (`to_send`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `unsubscribed`), timestamps.
- **`campaign_lists`** (junction) — `campaign_id`, `list_id`. A campaign may target multiple lists.
- **`campaign_recipients`** — **the resumable work queue.** `id`, `campaign_id`, `subscriber_id`, `email` (snapshot), `status` (`pending` / `sent` / `failed` / `cancelled`), `resend_message_id`, `attempts`, `error`, `sent_at`. Unique `(campaign_id, subscriber_id)`.
- **`email_events`** — `id`, `campaign_id`, `subscriber_id`, `resend_message_id`, `event_type` (`sent` / `delivered` / `opened` / `clicked` / `bounced` / `complained` / `unsubscribed`), `url` (for clicks), `occurred_at`, `raw` JSONB. Idempotent insert keyed on Resend event id.
- **`email_templates`** — `id`, `name`, `body_html`, `body_source`, `content_type`, `client_id`, `created_by`, timestamps.
- **`suppression_list`** — `email` (citext, UNIQUE), `reason` (`hard_bounce` / `complaint` / `manual` / `global_unsubscribe`), `campaign_id` (nullable), `created_at`. **Global hard stop** — never emailed again regardless of list membership.

### 2. Sending engine (resumable state machine)

1. **Trigger** — user clicks Send, or scheduler fires for a `scheduled` campaign. Status → `sending`.
2. **Materialize** — one job expands `campaign_lists` into `campaign_recipients` rows: dedup by email across lists; exclude `unsubscribed` (per target list), globally suppressed, and `disabled`/`blocklisted` subscribers. Set `campaigns.to_send`.
3. **Chunked send jobs** — enqueue chunks of **100** (Resend Batch API limit). Each queue job:
   - Claims a chunk of `pending` rows (`FOR UPDATE SKIP LOCKED`).
   - Renders body per recipient (merge tags) — or once per batch when no personalization.
   - Calls **Resend Batch API**; records `resend_message_id` per recipient; status → `sent`; inserts `sent` `email_events`.
   - On 429 / rate-limit: exponential backoff + re-enqueue remainder.
4. **Completion** — drains to zero `pending` → status `sent`, `finished_at` set, counters reconciled.
5. **Pause / cancel** — pause stops claiming new chunks; cancel marks remaining `pending` → `cancelled`. All state lives in `campaign_recipients`, so **crash recovery is automatic**.
6. **Cron** (`/api/cron/campaign-dispatch`, hourly, `x-cron-secret`) does double duty: (a) fire `scheduled` campaigns whose `scheduled_at <= now`, and (b) **watchdog** — re-enqueue `sending` campaigns that have stalled `pending` rows.

**Send gate:** a campaign cannot enter `sending` unless its body contains an unsubscribe link + the send path attaches `List-Unsubscribe` / RFC 8058 one-click headers.

### 3. Tracking (Resend webhooks)

- New endpoint **`/api/webhooks/resend.post.ts`** — RBAC-exempt (server-middleware allowlist, like Xero webhooks), **signature-verified** (Resend signing secret).
- Handles `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`.
- Maps `resend_message_id → campaign_recipient → campaign + subscriber`; inserts `email_events` (idempotent on Resend event id); updates denormalized `campaigns` counters transactionally.
- **Hard bounce / complaint → insert into `suppression_list`** + set `subscriber_lists.status`, so future sends skip them automatically.
- Open/click tracking must be enabled on the Resend side (pixel + link-rewrite, Resend-managed). Fidelity is whatever Resend reports.

### 4. Public pages (compliance-critical)

All `public: true`, `layout: false`, dark-mode-aware per CLAUDE.md marketing-page rules. Tokens are **HMAC-signed opaque tokens** (reuse `exportTokens.ts` pattern), never guessable IDs.

- **Subscribe** — hosted form (`/email/subscribe/[listToken]`) + API `POST /api/email/public/subscribe`. Creates subscriber + `subscriber_lists` (`unconfirmed` if `double_optin`), triggers confirmation email.
- **Confirm** — `/email/confirm/[token]` → status `confirmed`.
- **Unsubscribe** — `/email/unsubscribe/[token]`, one-click; honors `List-Unsubscribe` POST (RFC 8058). Preference center lets the subscriber choose which lists to keep.
- Every campaign email includes the unsubscribe link + `List-Unsubscribe` headers (Gmail/Yahoo bulk-sender requirement + AU Spam Act 2003: identify sender, honor unsubscribe).

### 5. Admin UI + recipient sources (Nuxt UI v4)

New `/agency/email` area:
- **Lists** — `UTable` of lists + subscriber counts; create/edit/archive.
- **Subscribers** — search, status filter, CSV import, manual add, "add to list" from `leads` / `agency_clients`.
- **Campaigns** — list with status + headline stats.
- **Composer** — rich-text (Tiptap/WYSIWYG → HTML) ⇄ raw-HTML (code editor + live preview) toggle; merge tags (`{{ first_name }}`, `{{ email }}`, `{{ unsubscribe_url }}`); optional branded shell; recipient/list picker; **send test to me**; send now / schedule.
- **Campaign Report** — sent/delivered/open-rate/click-rate/bounce/unsub via Unovis charts + per-subscriber event drill-down.
- **Templates** — save/load reusable shells.
- **Settings** — from-name/from-email, double opt-in defaults, Resend webhook status.

**Segmentation v1:** list membership + subscriber status + simple attribute-equality filters. (Raw-SQL segmentation deferred.)

## Error handling & edge cases

- **Idempotency**: webhook events deduped on Resend event id; `campaign_recipients` unique `(campaign_id, subscriber_id)`; materialization is re-runnable.
- **Rate limits**: 429 from Resend → backoff + re-enqueue, never drop a recipient.
- **Crash mid-send**: cron watchdog re-enqueues stalled `pending` rows.
- **Duplicate emails across lists**: deduped at materialization (one send per person per campaign).
- **Suppression precedence**: global `suppression_list` always wins over list membership.
- **Send gate**: missing unsubscribe link blocks the campaign from sending.

## Testing strategy

- **Unit (Vitest)**: merge-tag rendering, materialization dedup/exclusion logic, suppression precedence, token sign/verify, webhook event→counter mapping, send-gate enforcement.
- **Integration**: full campaign lifecycle against a test DB (materialize → chunked send with a mocked Resend Batch client → webhook ingestion → counters), pause/cancel/resume, double opt-in flow, unsubscribe flow.
- **Manual**: real low-volume send to a seed list; verify Resend webhooks land and counters update; verify one-click unsubscribe in Gmail.

## Build order (phases — each its own plan)

1. **Data + Lists + Subscribers + Import** — migrations 131+, list/subscriber CRUD, CSV import, pull-from-leads/clients, admin UI for lists/subscribers.
2. **Composer + Sending engine** — campaigns + `campaign_recipients`, composer UI, materialization + chunked queue sender + cron scheduler/watchdog, test sends, send gate.
3. **Tracking + Analytics** — Resend webhook handler, `email_events`, suppression auto-add, campaign report dashboard.
4. **Public pages** — subscribe + double opt-in + unsubscribe + preference center + `List-Unsubscribe` headers.
5. **Templates + segmentation + marketing-page sync** — templates manager, v1 segmentation filters, update `app/pages/features/*` + `MarketingNav.vue` per CLAUDE.md.
6. **(Future)** — block builder, A/B testing, advanced SQL segmentation, per-client domains.

## Compliance notes (AU)

Australian Spam Act 2003: requires consent, sender identification, and a functional unsubscribe honored promptly. Design bakes in: optional double opt-in, mandatory unsubscribe link + immediate suppression, sender identity in footer. Gmail/Yahoo bulk-sender rules: `List-Unsubscribe` one-click headers + low complaint rate (auto-suppression of complaints supports this).
