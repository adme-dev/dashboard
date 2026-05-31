# Slice 1 — First-Party Tracking Tag & Ingestion Foundation

**Date:** 2026-05-31
**Status:** Design — pending user review
**Author:** Paul + Claude (brainstorming)

## One-paragraph summary

A portable, framework-agnostic JavaScript tracking tag that the agency embeds on **external** client dealer sites (kia.gws.com.au, kevindennisvw.com.au, ferntreegullyautomotive.com.au). The tag captures behavioural events (pageview, scroll, engagement, click-to-call, form submissions) plus ad attribution (`gclid`/`gbraid`/`wbraid`/`fbclid`/`fbc`/`fbp`/`ttclid`/`msclkid`/`li_fat_id` + the canonical UTM five), tied to an anonymous first-party identity, and POSTs them to a public dashboard endpoint that resolves the client by a **write key**, validates origin, snapshots consent, and persists raw events into Neon. Slice 1 ends at **"events land in Neon, reliably, from all three sites."** Conversion fan-out (Meta CAPI / GA4 MP), Leads-Engine wiring + raw PII, and persona profiling are explicitly out of scope (Slices 2–4).

## Background & decision context

This is **Slice 1 of 5** in a first-party customer-data platform (CDP). The full pipeline:

```
[ Tag on dealer site ] → [ Public collect endpoint ] → [ Event store ]
                                                           ├─→ Conversion relay (Meta CAPI / Google / GA4 MP)   ← Slice 2
                                                           ├─→ Leads Engine wiring (raw PII, idempotent)        ← Slice 3
                                                           ├─→ 360 identity + persona + audiences               ← Slice 4
                                                           └─→ Audience activation / export to ad platforms     ← Slice 5
```

**Yes — personas and 360 audiences are in scope (Slices 4–5), and the reference proves an advanced version.** The "Engagr 360 Identity Platform" already implements: a durable cross-session/cross-site `identities` table (`durable_id`, rolling counters for VDP/finance/trade-in/test-drive/lead, `email_hash`/`phone_hash` resolution, merge), a **logic-based** persona detection engine (7 personas, sales-stage ladder, confidence, recommended actions — no LLM dependency), a real-time **audience segmentation** engine (JSON-logic rules → `audience_memberships`), and **audience activation/export** to ad-platform Custom Audiences with audit logging. We inherit all of it in Slices 4–5. **Slice 1's only obligation toward this is forward-compatibility** (below) — no endpoint/transport changes.

**Reference implementation (port source):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` — the "Engagr" pipeline (codenamed Phase 64–67, "TRACK-xx"). It is a battle-tested multi-tenant tracking system:
- Browser tag: `layers/widgets/public/tracking.js` (1116 lines, `<3KB` minified) — `engagrTrack.init/track`.
- Behaviour endpoint: `server/api/tracking/collect.post.ts` (the pipeline we port as `/api/public/track`).
- Conversion/CAPI endpoint: `server/api/track/conversion.post.ts` (Slice 2 source).
- Pure modules: `server/utils/tracking/{zod-schema,pii-hash,consent,normalize,session,tenant-config}.ts`.
- Threat model: `.planning/research/PITFALLS.md`.

**Build-home decision (approved):** port the proven pipeline **into this dashboard repo**. First-party data lands in the dashboard's own Neon, feeding its analytics/leads/personas directly. Accepted cost: a second copy of the pipeline to maintain versus the reference.

### The one architectural difference that drives this slice: cross-origin vs same-origin

| | Reference (Engagr) | This dashboard build |
|---|---|---|
| Who hosts the dealer site | Engagr (CF for SaaS custom hostnames) | The dealer's own vendor (we do **not** host) |
| Tag → endpoint relationship | **Same-origin** (`<sub>.engagr.com.au/api/...`) | **Cross-origin** (dealer site → `dashboard/api/...`) |
| Tenant resolution | By **request host** (KV → Neon) | By **write key** in the snippet + Origin allowlist |
| Identity cookie | Server `Set-Cookie` with `Domain=.<apex>` (first-party) | Tag sets `document.cookie` client-side on dealer domain |
| Pitfalls P2/P3 (cookie domain / CNAME custom-hostname) | **Apply** — hard | **Do not apply** — sidestepped by accepting cross-origin |

**Consequence:** Slice 1 is *simpler* than the reference's edge layer (no custom-hostname provisioning), at the cost of Safari ITP capping the JS cookie to 7 days. Documented future upgrade: per-dealer custom hostname (`tracking.kevindennisvw.com.au` → our Pages) restores 1st-party server cookies — the reference's exact P2/P3 approach. **Not in Slice 1.**

## Feasibility — verified against the three live sites (2026-05-31)

| Site | Stack / host | Dealer platform | GTM present | `spa` flag | CSP |
|---|---|---|---|---|---|
| kia.gws.com.au | WordPress, nginx (MPA) | AdTorque Edge | `GTM-KDV5LJS` | `false` | none |
| kevindennisvw.com.au | Gatsby 5 / React, Netlify (SPA) | iMotor | gtag/GTM | `true` | `frame-ancestors *` only (harmless) |
| ferntreegullyautomotive.com.au | Next.js / Vercel (SPA) | Dealer Studio | `GTM-TF9X4HB` | `true` | none |

**Conclusion:** a vanilla-JS tag is indifferent to WordPress/Gatsby/Next.js. All three already run **Google Tag Manager** — the universal, framework-agnostic install vector (one GTM Custom HTML tag per site). The reference tag already handles everything these stacks need, verified in source:
- **SPA pageviews** — monkey-patches `history.pushState` + listens on `popstate`/`hashchange`, gated by `config.spa` (tracking.js:1069–1076).
- **GTM-safe loading** — resolves via `document.currentScript` with `script[src*=...]` fallback + `DOMContentLoaded` guard; **no `<head>`-placement assumption** (tracking.js:978, 1103–1110).
- **Cross-origin identity** — first-party cookie written client-side: `document.cookie … SameSite=Lax; path=/` (tracking.js:365). No `Set-Cookie` from us required.
- **Consent** — `_engagr_consent` cookie + essential-always gating (tracking.js:291–310).

**The only real dependency is non-technical: GTM container access per site**, typically held by each dealer's vendor (AdTorque / iMotor / Dealer Studio). This is an onboarding task, not an engineering blocker.

## Goals (Slice 1)

1. A pasteable, per-client snippet (raw `<script>` **and** GTM Custom HTML) that loads a versioned tag from our origin, keyed by a write key.
2. The tag reliably captures: `page_view` (incl. SPA route changes), `scroll`, `engagement`, `phone_click` (tel:), generic `click`, and `form_submit` (with lead-form detection flag), plus full attribution + anonymous identity.
3. A public `POST /api/public/track` endpoint that: never throws (beacon semantics), caps body at 64 KB, resolves tenant by write key, validates Origin against a per-client allowlist, snapshots consent, and persists the raw event to Neon.
4. Per-client config + provisioning: an agency admin UI to create a tracking site, generate a write key, set allowed origins / `spa` / lead-form selectors / retention, and copy the install snippet.
5. Tag deployed and verified producing events on **all three** dealer sites.
6. **Forward-compatibility with Slices 4–5 (personas / 360 / audiences)** — without building any of it: (a) the event taxonomy is rich enough that VDP-view / finance-calculator / trade-in / test-drive / lead signals are *capturable* (reserve the `event_name` values now even if some only fire once Slice 3 wires forms); (b) `tracking_events` is queryable for a later identity join (stable `anon_id`, denormalised `client_id`, no hard partitioning that blocks it); (c) `pii-hash`/`normalize` are ported (Slice 1) so `email_hash`/`phone_hash` identity resolution drops in at Slice 3/4 with no re-derivation.

## Non-goals (explicitly deferred)

- **Slice 2:** Cloudflare Queue consumer + server-side fan-out to Meta CAPI / GA4 MP / Google Ads. (Per **Pitfall 1**: the consumer MUST be a standalone Worker, not a Pages/Nitro route — Pages Functions cannot consume Queues. Design for it now, build it in Slice 2.)
- **Slice 3:** Raw-PII capture on genuine lead submits, encryption at rest, and idempotent hand-off into the Leads Engine (`source_lead_id`).
- **Slice 4:** **360 durable identity** (`identities` table, cross-session stitching, rolling counters), **logic-based persona detection** (7 personas + sales-stage ladder), and **real-time audience segmentation** (JSON-logic rules → memberships). Ported from the reference's `persona-detection-engine.ts` / `audience-engine.ts` / `030_engagr_360_identities.sql` / `20260131_identity_graph.sql`.
- **Slice 5:** **Audience activation/export** — push 360 segments to ad-platform Custom Audiences with audit logging (`audience-export.ts`, `marketing_audience_activation_snapshots`).
- **Per-dealer custom hostnames** (Safari 1st-party cookie upgrade).
- **EU consent regime** — these are AU sites; ship the AU opt-out default + a `consentMode` flag, don't build the EU opt-in UI.

## Architecture & components

### 1. The tag — `public/track.js` (+ bootstrap snippet)

Ported from `tracking.js`, trimmed to Slice-1 events. Behaviour:
- Auto-inits from `data-` attributes on its own `<script>` (`data-key`, `data-spa`, `data-auto`).
- Resolves write key + our origin from `document.currentScript`.
- Manages `anon_id` (1-year JS cookie + `localStorage` mirror) and `session_id` (30-min idle rotation), per-client cookie name `_xf_<writeKeyPrefix>` to avoid collisions on shared hardware.
- Captures attribution from URL + cookies on first touch; persists first-touch + last-touch.
- Auto-listeners: pageview (incl. `config.spa` history hooks), scroll depth `[25,50,75,90]`, engagement intervals, `tel:` click → `phone_click`, generic click, `submit` → `form_submit` (+ `is_lead` from configured selectors / heuristic).
- Transport: **batched**, flushed via `navigator.sendBeacon` with `fetch({keepalive:true})` fallback; force-flush on `visibilitychange: hidden` / `pagehide`.
- Generates a browser-canonical **`event_id`** per event (**Pitfall 4**) — the dedup key Slice 2 relies on; mandatory in the payload.
- Public API: `xf('track', name, props)`, `xf('init', cfg)`, `getClientId`, `getSessionId`.

Served from CF Pages as `public/track.js`, versioned (`/track.js?v=<n>` or content-hashed path) so cache-busting is controlled.

### 2. Collect endpoint — `server/api/public/track.post.ts` + `.options.ts`

Models `banner-pixel/[type].get.ts` (public, fire-and-forget) + the reference `conversion.post.ts` discipline:
- **Public** — no `requireAuth`. Write key + Origin allowlist are the only gates.
- **Never throws** (top-level try/catch) — returns `200 {ok:true}` even on internal failure; a 500 = dropped events = lost client data.
- **64 KB cap** via `Content-Length` before `readBody`; `> 64 KB → 413`.
- **Tenant resolution by write key:** look up `tracking_sites` by `write_key` (cached). Unknown/inactive key → silent `403`.
- **Origin validation:** `Origin` header must be in the site's `allowed_origins`. Mismatch → store-and-flag (Slice 1 logs the mismatch but still records; tighten to 403 once allowlists proven). *Decision: soft in Slice 1, hard later.*
- **Consent snapshot** (`snapshotConsent`, AU opt-out default) stored on the event.
- **Validate** with ported Zod schema (rejects unknown `event_name`, requires `event_id`).
- **Persist** raw event(s) to `tracking_events`. Batches handled in a single insert.
- **CORS** (`.options.ts` + headers): echo the request `Origin` (never `*`), `Access-Control-Allow-Methods: POST, OPTIONS`, `Allow-Headers: content-type`, `Max-Age`.

### 3. Ported pure modules — `server/utils/tracking/`

Copied near-verbatim, imports rewritten to `~~/server/utils/`, DB via `server/utils/db.ts`:
- `zod-schema.ts` — event-name enum (superset incl. `page_view`, `scroll`, `engagement`, `phone_click`, `form_submit`, `generate_lead`, `view_item`…), attribution schema, mandatory `event_id`. `parsePayload` returns a discriminated-union result, never throws.
- `consent.ts` — `snapshotConsent` (AU opt-out essential default). EU set retained but unused.
- `normalize.ts` + `pii-hash.ts` — **ported now (pure, cheap), not yet wired to destinations.** Present so Slices 2/3 plug in without re-derivation. Per **Pitfall 5**, per-destination normalization rules live here as the single source of truth.
- `session.ts` — id/session helper logic (the client-side cookie equivalents the tag uses; server validates shape).

### 4. Schema — migration `125-tracking-foundation.sql`

> Migration numbering note: `124-ga4-sync-status-and-retention.sql` is taken by the in-flight GA4 branch (and there is a pre-existing `123-*` duplicate). **Next free number is `125`.** All `CREATE` use `IF NOT EXISTS`. Run immediately after writing per CLAUDE.md.

```sql
-- 125: First-party tracking foundation (Slice 1)
CREATE TABLE IF NOT EXISTS tracking_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  write_key       TEXT NOT NULL UNIQUE,          -- public, embedded in snippet
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {https://www.kia.gws.com.au}
  spa             BOOLEAN NOT NULL DEFAULT FALSE,
  consent_mode    TEXT NOT NULL DEFAULT 'off',   -- off | au_optout | consent_gated
  lead_selectors  TEXT[] NOT NULL DEFAULT '{}',  -- CSS/id/url patterns; heuristic fallback if empty
  retention_days  INTEGER NOT NULL DEFAULT 395,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id           BIGSERIAL PRIMARY KEY,
  site_id      UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL,                    -- denormalised for fast client-scoped reads
  event_id     TEXT NOT NULL,                    -- browser-canonical dedup key (Pitfall 4)
  anon_id      TEXT NOT NULL,
  session_id   TEXT,
  event_name   TEXT NOT NULL,
  page_url     TEXT,
  referrer     TEXT,
  -- attribution
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid TEXT, gbraid TEXT, wbraid TEXT, fbclid TEXT, fbc TEXT, fbp TEXT,
  ttclid TEXT, msclkid TEXT, li_fat_id TEXT,
  -- payload + context
  event_data   JSONB NOT NULL DEFAULT '{}',
  consent      JSONB,
  ua           TEXT,
  ip_hash      TEXT,                             -- hashed, not raw IP (no raw PII in Slice 1)
  origin       TEXT,                             -- request Origin (for soft-allowlist auditing)
  occurred_at  TIMESTAMPTZ,                      -- browser timestamp
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_events_dedup ON tracking_events(site_id, event_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_client_time ON tracking_events(client_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_session ON tracking_events(session_id);
```

**No raw-PII column in Slice 1** — keeps the foundation clean. Raw PII + encryption arrive with the Leads-Engine wiring in Slice 3.

### 5. Provisioning UI — agency admin

A page (e.g. `app/pages/agency/tracking/index.vue` + a create/edit slideover) to:
- List tracking sites per client; create one → generate `write_key`.
- Configure `allowed_origins`, `spa`, `lead_selectors`, `retention_days`, `consent_mode`.
- Show the **install snippet** (raw `<script>` block + GTM Custom HTML instructions) with copy-to-clipboard.
- Show a live "events received (last 24h)" count per site as a health signal.

Endpoints under `server/api/agency/tracking/` gated with `requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])` (matches sibling analytics endpoints). Nuxt UI v4 only; per project form conventions.

### 6. Ingestion scale path (designed, not built)

Direct Neon insert for MVP (3 low-volume dealer sites). If volume grows, buffer through the existing `JOBS_QUEUE` Cloudflare Queue binding. **Pitfall 1** governs Slice 2: any queue *consumer* must be a standalone Worker (`workers/tracking-consumer/`), never a Pages/Nitro route.

## Data flow (Slice 1)

1. Visitor loads dealer page → bootstrap snippet loads `track.js?k=<writeKey>`.
2. Tag resolves/creates `anon_id` + `session_id` (client-side cookies on dealer domain), captures attribution, fires `page_view` with a generated `event_id`.
3. Tag batches subsequent events; flushes via `sendBeacon` to `POST /api/public/track`.
4. Endpoint: write-key → `tracking_sites`; Origin check; consent snapshot; Zod validate; insert into `tracking_events` (dedup on `(site_id, event_id)`); return `200`.
5. Agency views per-site health in the provisioning UI. Retention cron (stub in Slice 1, or simple `DELETE … WHERE received_at < now() - retention_days`) prunes old rows.

## Testing strategy

- **Unit (Vitest):** `zod-schema` (accept/reject event names, mandatory `event_id`), `consent.snapshotConsent` (AU default + explicit cookie), write-key resolution, `pii-hash`/`normalize` pure outputs (locks them for Slice 2).
- **Endpoint:** never-throws on malformed body (returns 200); 413 over 64 KB; 403 on unknown write key; dedup — same `(site_id,event_id)` inserts once.
- **Manual / live:** **vertical proof first** — land one `page_view` from kia.gws into Neon before building the full event set. Then verify all three sites produce events (DevTools Network shows `204/200` beacon; `SELECT count(*) FROM tracking_events WHERE site_id=…` climbs).

## Rollout / install runbook

1. Create a `tracking_sites` row per client; copy write key.
2. **kia.gws** (WordPress/MPA): GTM Custom HTML tag (container `GTM-KDV5LJS`) **or** raw `<script>` via AdTorque/WP; `spa=false`.
3. **kevindennisvw** (Gatsby/SPA): GTM Custom HTML (iMotor-managed container); `spa=true`.
4. **ferntreegully** (Next.js/SPA): GTM Custom HTML (`GTM-TF9X4HB`, Dealer Studio); `spa=true`.
5. CSP note: only kevindennis has a CSP today (`frame-ancestors *`, harmless). If any vendor later tightens CSP, request `script-src https://<our-origin>` and `connect-src https://<our-origin>` additions.
6. Verify each site in the provisioning UI's 24h event count.

## Open questions / risks

- **GTM access** per dealer (vendor-held) — onboarding dependency; surface early.
- **Soft vs hard Origin allowlist** — Slice 1 soft (log mismatches); promote to hard 403 once allowlists are proven correct, to prevent write-key abuse from other origins.
- **Write-key abuse** — a public write key can be lifted from page source and POSTed from elsewhere. Mitigations in Slice 1: Origin allowlist (soft→hard) + per-key rate limiting + `is_active` kill switch. Full abuse-hardening (signed beacons) is a later concern.
- **Bundle size** — keep `track.js` lean; the reference's heavy behavioural signals (rage clicks, video, idle, competitive-referrer) are `config.behavioral` opt-in — keep them OFF by default in Slice 1.
- **Cross-client identity stitching (Slice 4 decision, flagged now)** — the reference's 360 identity can stitch one person across *multiple dealer sites* via shared `email_hash`/`phone_hash`. For an agency running many dealers this is powerful, but co-mingling one client's visitors with another client's data is a **privacy/contractual** decision (each dealer's data arguably must stay siloed). Slice 1 does **not** force this either way — server-side stitching by hash works regardless of the per-site `anon_id`. Decision deferred to Slice 4; recording it here so the identity schema is designed with the chosen scope (client-siloed vs agency-global) in mind.

## Appendix — reference file map (port sources)

| Slice 1 artifact | Reference source |
|---|---|
| `public/track.js` | `layers/widgets/public/tracking.js` (trim to Slice-1 events) |
| `server/api/public/track.post.ts` | `server/api/tracking/collect.post.ts` (+ never-throws discipline from `server/api/track/conversion.post.ts`) |
| `server/utils/tracking/zod-schema.ts` | same path in reference |
| `server/utils/tracking/{consent,normalize,pii-hash,session}.ts` | same paths |
| Threat model | `.planning/research/PITFALLS.md` (P1 queue-consumer, P4 event_id, P5 normalization) |
| Public-endpoint convention | `server/api/public/banner-pixel/[type].get.ts` (this repo) |
