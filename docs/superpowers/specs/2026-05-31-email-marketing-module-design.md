# Email Marketing Module — Design Spec

**Date:** 2026-05-31
**Status:** Approved design, ready for planning (revised 2026-05-31 after R&D — EmailBuilder.js composer, RFC 8058 opt-out, Resend pacing, MJML-on-Workers constraint)
**Owner:** Paul (paul@adme.net.au)

## Summary

A self-hosted, listmonk-equivalent **email marketing module** built natively inside the XeroFlow Agency dashboard. It manages **subscriber lists**, **campaigns**, a **resumable sending engine**, and **delivery/engagement tracking** — owning all data in Neon Postgres and using **Resend purely as the send transport and event source**.

Ships **agency-first** (XeroFlow sends to its own leads/clients/contacts), with the schema designed for `client_id` scoping so a future multi-tenant "campaigns on behalf of clients" mode can light up without a rewrite.

Lives at **`/agency/email`**.

## Goals

- Named **lists** + global **subscribers** (many-to-many), with CSV import and "add to list" from existing `leads` / `agency_clients`.
- **Campaign composer**: a visual block builder — **EmailBuilder.js** (`@usewaypoint/email-builder`, MIT) — authoring a JSON document that renders to email-safe HTML in the browser; merge tags, an HTML block for raw markup, save/load reusable templates, test sends, schedule.
- **Resumable, chunked sending engine** sized for **medium scale (2k–50k recipients/campaign)** — crash-safe, pausable, cancellable.
- **Tracking + analytics** via Resend webhooks: delivered/opened/clicked/bounced/complained, per-campaign + per-subscriber, with auto-suppression of hard bounces/complaints.
- **Public pages**: subscribe form + double opt-in, one-click unsubscribe + preference center. Legally compliant (AU Spam Act 2003 + Gmail/Yahoo bulk-sender requirements).

## Non-Goals (this milestone)

- A **bespoke block builder** — we adopt **EmailBuilder.js** (`@usewaypoint`, MIT) rather than building our own editor. (This is the same library listmonk embeds.)
- **A/B testing** of subject lines / content variants.
- Raw-SQL arbitrary **segmentation** (listmonk-style). V1 segmentation is list + status + simple attribute filters only.
- **Per-client sending domains / DKIM** and dedicated-IP warm-up (relevant only when multi-tenant + large scale lands).
- Multi-messenger (SMS, etc.) — email only.

## Key Decision: Own the data, rent the transport

Resend offers its own Broadcasts/Audiences product. **Rejected** because it stores contacts in Resend (separate from our Postgres), has weak segmentation, and makes `client_id` scoping and pulling from existing `leads`/`agency_clients` awkward. **We own lists, subscribers, campaigns, and events in Neon; Resend is used only to send (Batch API) and to emit delivery/engagement webhooks.** This mirrors listmonk's architecture and fits the existing stack.

The other rejected approach — a naive cron loop that sends to everyone in a single pass — cannot resume after a crash at medium scale. The chosen design persists per-recipient send state so any interruption is recoverable.

**Corollary (Resend reality, confirmed by R&D):** because we use the send/Batch API rather than Audiences, Resend provides **nothing automatic** — no managed unsubscribe link/token, no auto `List-Unsubscribe` headers, no suppression list. We build all of it (see §4). Resend's hard limits: **Batch API = 100 emails/request**; **rate limit = 2 req/s default, max 5 req/s per team** (with `ratelimit-*` + `retry-after` response headers). The sending engine must pace to this globally (§2), not just fan out.

## Key Decision: EmailBuilder.js for the composer, rendered in the browser

The campaign composer is **EmailBuilder.js** (`@usewaypoint/email-builder` + its `@usewaypoint/block-*` packages, all MIT) — the exact library listmonk embeds for its visual builder. It is **React 18 + MUI**, so it is mounted as an **isolated micro-island** on the composer route only (the rest of `/agency/email` stays Nuxt/Vue 3). listmonk proves this island pattern in production (it embeds the same React app inside a Vue 2 host).

The email is stored as a **JSON document** (`@usewaypoint/document-core`) in `campaigns.body_source`; EmailBuilder.js renders it to email-safe HTML **client-side**, and we persist that rendered HTML in `campaigns.body_html`. Raw-HTML authoring is covered by EmailBuilder.js's built-in **HTML block** — no separate code editor needed.

**Hard runtime constraint:** **MJML cannot run in the Cloudflare Workers runtime** (`window`/`fs` dependencies — a known, unresolved issue). EmailBuilder.js sidesteps this entirely by rendering HTML in the browser. The rule for this module is therefore absolute: **all email HTML is produced client-side; the Workers/edge runtime never compiles a template.** The server only ever stores and sends already-rendered HTML (with `{{merge_tags}}` substituted per-recipient at send time, a pure string operation).

## Existing building blocks reused

- **DB layer**: `server/utils/db.ts` (`queryRows`, `queryOne`, `execute`, `transaction`). Neon, dual-driver.
- **Email transport**: `server/utils/email.ts` (Resend client + branded `renderEmailTemplate()` shell).
- **Async/fan-out**: Cloudflare Queues `JOBS_QUEUE` (`server/utils/queue.ts`, `queueConsumer.ts`, `plugins/queue.ts`) with inline fallback for local dev.
- **Scheduling/watchdog pattern**: `server/api/cron/*` with `x-cron-secret` auth and local-hour gating (mirror of `anomaly-detection.post.ts`).
- **Webhook-exempt-from-RBAC pattern**: Xero webhooks (for the new Resend webhook endpoint).
- **Signed-token util**: `server/utils/exportTokens.ts` (currently untracked in the working tree) + migration 130 pattern — reuse for unsubscribe/confirm tokens.
- **Merge-tag rendering**: extend `server/utils/leads/templateRender.ts`.
- **UI**: Nuxt UI v4, Unovis charts (already used for analytics dashboards).

Next migration slot: **132** (131 is taken by `131-report-schedules.sql`).

## Architecture

### 1. Data model (migrations 132+)

All tables carry `client_id` (nullable for agency-first), `created_by`, `created_at`, `updated_at` where applicable.

- **`email_subscribers`** — `id`, `email` (citext, UNIQUE), `name`, `attribs` JSONB, `status` (`enabled` / `disabled` / `blocklisted`), timestamps. One global record per person, deduped by email.
- **`email_lists`** — `id`, `name`, `description`, `client_id` (nullable), `double_optin` (bool), `created_by`, timestamps, `archived_at`.
- **`subscriber_lists`** (junction) — `subscriber_id`, `list_id`, `status` (`unconfirmed` / `confirmed` / `unsubscribed`), `source` (`import` / `form` / `manual` / `leads`), `subscribed_at`, `unsubscribed_at`. PK `(subscriber_id, list_id)`.
- **`campaigns`** — `id`, `name`, `subject`, `from_name`, `from_email`, `reply_to`, `body_html` (rendered, ready-to-send), `body_source` (EmailBuilder.js JSON document), `content_type` (`emailbuilder` / `html`), `template_id` (nullable), `status` (`draft` / `scheduled` / `sending` / `paused` / `sent` / `cancelled`), `scheduled_at`, `started_at`, `finished_at`, `client_id`, `created_by`, denormalized counters (`to_send`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `unsubscribed`), timestamps.
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
   - Substitutes `{{merge_tags}}` per recipient into the pre-rendered `body_html` (pure string op — no template compilation on the edge).
   - Calls **Resend Batch API**; records `resend_message_id` per recipient; status → `sent`; inserts `sent` `email_events`.
   - On 429 / rate-limit: read `retry-after`, back off, re-enqueue remainder.
   - **Global pacing:** the engine throttles to **≤2 req/s** (token bucket / single-flight consumer), staying under Resend's default cap. At 2 req/s × 100/batch ≈ 12k emails/min, so a 50k campaign drains in ~4 min. Concurrency is deliberately capped — we do NOT blast all queue consumers at once, or we 429 ourselves.
4. **Completion** — drains to zero `pending` → status `sent`, `finished_at` set, counters reconciled.
5. **Pause / cancel** — pause stops claiming new chunks; cancel marks remaining `pending` → `cancelled`. All state lives in `campaign_recipients`, so **crash recovery is automatic**.
6. **Cron** (`/api/cron/campaign-dispatch`, hourly, `x-cron-secret`) does double duty: (a) fire `scheduled` campaigns whose `scheduled_at <= now`, and (b) **watchdog** — re-enqueue `sending` campaigns that have stalled `pending` rows.

**Send gate:** a campaign cannot enter `sending` unless its body contains an unsubscribe link **and** the send path attaches the RFC 8058 headers (see §4). This is enforced in code, not just convention.

### 3. Tracking (Resend webhooks)

- New endpoint **`/api/webhooks/resend.post.ts`** — RBAC-exempt (server-middleware allowlist, like Xero webhooks), **signature-verified** (Resend signing secret).
- Handles `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`.
- Maps `resend_message_id → campaign_recipient → campaign + subscriber`; inserts `email_events` (idempotent on Resend event id); updates denormalized `campaigns` counters transactionally.
- **Hard bounce / complaint → insert into `suppression_list`** + set `subscriber_lists.status`, so future sends skip them automatically.
- Open/click tracking must be enabled on the Resend side (pixel + link-rewrite, Resend-managed). Fidelity is whatever Resend reports.

### 4. Public pages + opt-out (compliance-critical)

All public pages are `public: true`, `layout: false`, dark-mode-aware per CLAUDE.md marketing-page rules. Tokens are **HMAC-signed opaque tokens** (reuse `exportTokens.ts` pattern), never guessable IDs.

- **Subscribe** — hosted form (`/email/subscribe/[listToken]`) + API `POST /api/email/public/subscribe`. Creates subscriber + `subscriber_lists` (`unconfirmed` if `double_optin`), triggers confirmation email.
- **Confirm** — `/email/confirm/[token]` → status `confirmed`.
- **Unsubscribe** — `/email/unsubscribe/[token]`. The endpoint serves **GET** (human preference-center page: choose which lists to keep) **and** accepts **POST** (machine one-click; suppress immediately, return `200`/`202`, no login, no confirmation step).

**Exact opt-out mechanics (RFC 8058 — we build all of this; Resend does not):** every campaign send attaches **two** headers:

```
List-Unsubscribe: <https://app.../email/unsubscribe/{token}>, <mailto:unsubscribe@adme.net.au?subject={token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

- The `List-Unsubscribe-Post` value is **exact** — `List-Unsubscribe=One-Click`, no variation.
- **DKIM must cover both headers.** ⚠️ **Verification item before Phase 4 ships:** send a test through Resend and confirm at Gmail that the DKIM `h=` list includes `List-Unsubscribe` and `List-Unsubscribe-Post`. If Resend does not sign them, this is a blocker to resolve (Resend config or a header-signing workaround).
- Required by **Gmail/Yahoo bulk-sender rules** (senders >5k/day): one-click honored within **48h**. We suppress instantly, so we beat that.

**Australian Spam Act 2003 (we are `adme.net.au`):**
- Unsubscribe honored within **5 business days** (we do it instantly ✓) and the facility must stay **functional ≥30 days** → unsubscribe tokens must not expire inside 30 days.
- **Sender identification** in every campaign footer: legal business name **+ ABN**, kept accurate ≥30 days.
- **Consent** required before sending (double opt-in option + import provenance via `subscriber_lists.source` support this).

### 5. Admin UI + recipient sources (Nuxt UI v4)

New `/agency/email` area:
- **Lists** — `UTable` of lists + subscriber counts; create/edit/archive.
- **Subscribers** — search, status filter, CSV import, manual add, "add to list" from `leads` / `agency_clients`.
- **Campaigns** — list with status + headline stats.
- **Composer** — **EmailBuilder.js** React island (block-based visual editor: text, heading, button, image, columns, container, divider, spacer, HTML, avatar) producing a JSON document → client-rendered HTML; merge tags (`{{ first_name }}`, `{{ email }}`, `{{ unsubscribe_url }}`) inserted as plain tokens and substituted at send time; recipient/list picker; **send test to me**; send now / schedule. Mounted only on this route; rest of the area is Nuxt/Vue.
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
- **Manual**: real low-volume send to a seed list; verify Resend webhooks land and counters update; **inspect raw headers at Gmail to confirm `List-Unsubscribe` + `List-Unsubscribe-Post` are present and DKIM-signed**; verify Gmail's UI one-click unsubscribe round-trips (POST → suppression).

## Build order (phases — each its own plan)

1. **Data + Lists + Subscribers + Import** — migrations 132+, list/subscriber CRUD, CSV import, pull-from-leads/clients, admin UI for lists/subscribers.
2. **Composer + Sending engine** — campaigns + `campaign_recipients`; **EmailBuilder.js** composer island (JSON doc → client-rendered HTML); materialization + chunked queue sender with **≤2 req/s global pacing** + cron scheduler/watchdog; test sends; send gate.
3. **Tracking + Analytics** — Resend webhook handler, `email_events`, suppression auto-add, campaign report dashboard.
4. **Public pages + opt-out** — subscribe + double opt-in + unsubscribe (GET preference center **and** POST one-click) + RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers + DKIM-coverage verification + AU sender-ID footer.
5. **Templates + segmentation + marketing-page sync** — templates manager, v1 segmentation filters, update `app/pages/features/*` + `MarketingNav.vue` per CLAUDE.md.
6. **(Future)** — A/B testing, advanced SQL segmentation, per-client sending domains.

## External dependencies (new)

- **`@usewaypoint/email-builder`** + `@usewaypoint/block-*` + `@usewaypoint/document-core` (MIT) — the composer. Pulls **React 18 + MUI** into one isolated route bundle (the same set listmonk ships). Verify the React island mounts cleanly under Nuxt 4's Vite build before committing to it in Phase 2.
- No MJML dependency (cannot run on Workers; not needed since EmailBuilder.js renders client-side).

## Compliance notes (AU + bulk-sender) — see §4 for the authoritative mechanics

Australian Spam Act 2003: consent before sending, sender identification (legal name + ABN) in every campaign footer kept accurate ≥30 days, functional unsubscribe honored within 5 business days and live ≥30 days. Gmail/Yahoo bulk-sender (>5k/day): RFC 8058 one-click `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (DKIM-signed), honored ≤48h, and a low spam-complaint rate (auto-suppression of complaints supports this). All enforced by the §2 send gate + §4 opt-out build.

## R&D provenance (2026-05-31)

Findings backing the decisions above: Resend gives nothing automatic on the send/Batch path ([docs](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)); Batch=100/req, rate 2–5 req/s ([limits](https://resend.com/docs/api-reference/rate-limit)); RFC 8058 two-header one-click ([Mailgun](https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/)); AU Spam Act s18 functional unsubscribe + 5-day rule ([AustLII](https://austlii.edu.au/cgi-bin/viewdoc/au/legis/cth/consol_act/sa200366/s18.html)); MJML can't run on Workers ([issue #2812](https://github.com/mjmlio/mjml/issues/2812)); EmailBuilder.js is the MIT library listmonk embeds ([listmonk email-builder](https://github.com/knadh/listmonk/tree/master/frontend/email-builder), [EmailBuilder.js](https://github.com/usewaypoint/email-builder-js)).
