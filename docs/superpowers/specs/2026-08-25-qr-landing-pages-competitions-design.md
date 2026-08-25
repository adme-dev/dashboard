# QR landing pages, competitions & campaign tooling — design

Date: 2026-08-25 · Status: approved by Paul ("bake all of this in") · Builds on PRs #449, #460, #461

## Goal

Turn the QR tool from a redirect + analytics into a client-facing acquisition product:
hosted mobile landing pages that create attributed leads, a compliant competition module with
an audited draw and a legal evidence vault, CTA frames on exports, bulk/variant codes, presets,
A/B destinations, and a client-360 event export. Each is a separate PR; order below is dependency order.

## Non-goals

SMS sending (no provider in the stack — winner notification is email + in-app), custom domains for
short links (column reserved, unchanged), fingerprinting of any kind, a general page builder
(pages are template-driven with a fixed set of blocks).

---

## S1 · Hosted landing pages

### Behaviour
- A code has a `destination_mode`: `url` (today) or `page`. In `page` mode `/q/<code>` renders the
  hosted page itself (scan still recorded, tagging still applied to any outbound link on the page).
- Page is **server-rendered HTML from Nitro** (`server/utils/qr/landing/render.ts`), self-contained
  (inline CSS, no framework, < 30 KB), mobile-first, dark/light via `prefers-color-scheme`.
  Rationale: the `/q/**` route rule already proxies to Nitro; a Nuxt page would fight the proxy and
  the auth middleware, and a scan-to-first-paint under 1 s on 4G matters more than component reuse.
- Blocks (fixed order, each optional): logo · hero image · headline · sub-headline · body (markdown
  subset: paragraphs, bold, links, lists) · form · consent · footer (promoter, privacy link, T&Cs link).
- Form fields: ordered list of `{ key, label, type: text|email|tel|postcode|select|checkbox, required,
  options? }`, max 6 (UI nudges toward ≤3, shows the "−4 %/field" hint). `postcode` type is normalised
  to 4 digits and feeds the leads map.
- Consent: privacy collection notice (required text, editable), optional **unticked** marketing
  consent checkbox (Spam Act) stored in `field_data.marketing_consent`.
- Anti-abuse: honeypot field, Turnstile when configured (fails closed via `verifyTurnstile`),
  `rateCheck` per IP+code, 16 KB body cap, server-side field validation mirroring the page schema.
- Submit → `acceptLead` with `source: 'qr'`, `source_lead_id: <code>:<uuid>`, `field_data` = fields,
  `attribution` = `{ xf_qr, utm_source: 'qr'|override, utm_medium, utm_campaign, utm_content, landing_page }`,
  `form_name` = page headline, `campaign_name` = folder/name. Client's `lead_capture_mode` governs
  rules/CRM fan-out as for any lead. Duplicate (same `source_lead_id`) is impossible by construction;
  per-person dedupe is a competition concern (S2).
- Success state: headline + body + optional redirect URL (e.g. to the client site, tagged).
- Pixels: optional GA4 measurement id, Meta pixel id, GTM container id — injected only after the
  consent snapshot allows (`snapshotConsent`; AU default = implicit consent, EU = opt-in).
- Preview: `/q/<code>?xf_preview=1` skips `recordScan` and lead creation is blocked (form disabled,
  banner "Preview"). Editor embeds it in an iframe (phone frame).
- Hero/logo images: uploaded to R2 via `uploadFile('media-image', …)`, served through the existing
  capability-token media proxy (`signBannerAssetToken` pattern generalised to `qr-page` assets).

### Data (migration 354)
```
qr_pages (id, qr_code_id UNIQUE FK, template text, headline, subheadline, body_md, hero_key, logo_key,
          theme jsonb {bg,fg,accent,font}, fields jsonb, cta_label, consent_text, marketing_consent boolean,
          success_headline, success_body, success_redirect_url, pixels jsonb, competition_id uuid NULL,
          is_published boolean default false, created_at, updated_at)
qr_codes.destination_mode text not null default 'url' check in ('url','page')
leads_source_check += 'qr'; lead_form_rules_source_check += 'qr'; app/types LeadSource += 'qr'
```
KV cache: `ResolvedQr` gains `mode`; page HTML is rendered per request from a KV-cached page row
(`qr:page:<code>`, invalidated on save/publish).

### API
- `GET /api/q/[code]` — existing; branches on `mode`.
- `POST /api/q/[code]/submit` — public, auth-exempt (already under `/api/q/`).
- `GET|PUT /api/agency/qr-codes/[id]/page`, `POST …/page/publish`, `POST …/page/assets` (image upload).
- `GET /api/agency/qr-codes/[id]/page/preview-token` not needed — preview is `?xf_preview=1` gated by
  `requireQrCodeAccess` cookie check inside the public handler (authenticated staff only).

### UI
- Editor gains a **Destination** switch: "Send to a URL" / "Hosted page". Page mode opens a
  `QrPageEditor` slideover: template picker (Lead capture · Register interest · Subscribe ·
  Competition), block fields with live phone preview (iframe of `?xf_preview=1`), publish toggle.
- Card + detail show a "Hosted page" badge; detail's Connect card shows page conversions
  (scans → submissions) since we now own the whole chain.

### Tests
`render.test.ts` (escaping, blocks, consent, pixels gated), `submit.test.ts` (validation, honeypot,
rate limit, acceptLead payload, preview blocked), `resolve` mode caching, redirect branch.

---

## S2 · Competitions + legal vault

### Behaviour
- A competition belongs to a client and is attached to one or more pages (many codes → one
  competition: flyer, poster, packaging each with their own code and attribution).
- Type: **chance** (random draw) or **skill** (judged). Type changes the permit checklist and the
  entry form (skill adds a required free-text answer).
- Lifecycle: `draft → open → closed → drawn → archived`. Entries accepted only while `open` and
  within `opens_at..closes_at` in the competition's timezone; the page shows countdown/closed state.
- **Entry rules**: one entry per person by default (`entrant_hash` = SHA-256 of normalised mobile or
  email + competition id); configurable `max_entries_per_person`. Eligibility: min age checkbox,
  allowed states (from postcode → state via `geo_au_postcodes`), staff exclusion attestation.
- **T&Cs generator**: a structured form (promoter legal name, ABN, contact, dates + timezone, entry
  method, prize list + total value, draw date/method/venue, notification/publication, unclaimed prize
  handling, verification/disqualification, privacy, permit numbers) renders a Markdown T&Cs from a
  template; every save creates an immutable `terms_version` (hash). The page links the current
  version; **each entry records the version accepted**.
- **Permit workflow**: per-state rows `{ state, required: auto|yes|no, status: not_required|to_apply|applied|approved|refused, permit_number, applied_at, approved_at, expires_at, document_id }`.
  Auto-required rules (editable constants, dated): NSW authority when total prize > $10,000;
  ACT permit for pools ≥ $3,001 (exempt-lottery conditions below); SA licence when prizes > $5,000
  or any scratch-and-win; NT permit at ≥ $5,001 unless holding another jurisdiction's permit;
  VIC/QLD/WA/TAS none for standard draws. Skill competitions: none. The product **flags**, it does
  not decide — the operator confirms each row.
- **Legal vault**: `competition_documents` — permit approvals, signed T&Cs, client contracts,
  correspondence. Immutable: no update route; delete is soft and audited; each file stores
  `sha256`, size, content-type, uploader, timestamp; served via capability token. Vault + terms
  versions + entries + draw audit = the **evidence pack**, exportable as a ZIP (S2b).
- **Draw**: winners + reserves drawn with CSPRNG over eligible, non-disqualified entries;
  `qr_competition_draws` stores method, seed hash, eligible count, ordered winner/reserve entry ids,
  drawn_by, drawn_at, and the exact snapshot of eligibility filters. Re-draw only for a reserve
  promotion with reason, appended (never overwritten). Winner notification via the existing Resend
  helpers (gated by `EMAIL_SENDING_ENABLED`) + in-app list; export CSV of entrants for the client.
- Entry is also a **lead** (source `qr`), so routing/CRM keep working; the entry row references the
  lead.

### Data (migration 355)
```
qr_competitions (id, client_id, name, type chance|skill, status, timezone, opens_at, closes_at,
   prize_summary, prize_items jsonb, prize_pool_value numeric, promoter jsonb {name, abn, contact},
   eligibility jsonb {min_age, states[], exclude_staff, max_entries_per_person}, judging_criteria,
   terms_current_version int, permits jsonb, draw_settings jsonb {winners, reserves}, created_by, timestamps)
qr_competition_terms_versions (id, competition_id, version, terms_md, sha256, created_by, created_at) unique(competition_id, version)
qr_competition_entries (id, competition_id, qr_code_id, lead_id, entrant_hash, terms_version, answer text,
   postcode, state, ip_hash, ua, status valid|disqualified|winner|reserve, status_reason, created_at)
   unique(competition_id, entrant_hash) when max_entries_per_person = 1 (enforced in code + partial index)
qr_competition_draws (id, competition_id, drawn_at, drawn_by, method, seed_sha256, eligible_count,
   winners uuid[], reserves uuid[], filters jsonb, note)
qr_competition_documents (id, competition_id, kind permit|terms_signed|contract|correspondence|other,
   state, title, storage_key, sha256, size_bytes, content_type, uploaded_by, uploaded_at, deleted_at, deleted_by, delete_reason)
```

### UI
`/agency/qr-codes/competitions` list + `/[id]` with tabs: Setup · Terms · Permits & documents ·
Entries · Draw. Page editor "Competition" template links a competition.

---

## S3 · CTA frames on export
`shared/qr/frame.ts` wraps `renderQrSvg` output in an outer SVG: frame styles `none | label-below |
label-above | badge`, text (default by template: "Scan to enter", "Scan for menu", "Scan to book"),
frame colour from style, corner radius. Export routes accept `?frame=…&label=…`; editor gets a
Frame section with preview; PNG path reuses the client-side rasteriser.

## S4 · Bulk & variant codes
`POST /api/agency/qr-codes/bulk` — N codes from one definition (name pattern `{base} – {variant}`,
CSV of variants or count), same destination/page/competition, grouped by a new
`qr_codes.campaign_id` (nullable FK to `qr_campaigns(id, client_id, name)`) with a campaign
analytics roll-up (scans/leads per code) and a ZIP export of all SVG/PNGs.

## S5 · Register-interest & subscribe presets
Page templates pre-wired: **Register interest** (launch date, auto-switch to a "launched" body +
redirect after the date), **Subscribe** (email/mobile + offer code; writes to an email-marketing
list via existing list APIs). Both are S1 templates + a small scheduler check at render time.

## S6 · A/B destinations
`qr_codes.ab jsonb {enabled, variant_b_url|page_id, split_pct}`; assignment hashed from `ip_hash`
+ day so a person sees one arm; `qr_scans.variant` + `leads.attribution.xf_qr_variant`; detail
page shows scans → leads per arm with a simple two-proportion z-test badge.

## S7 · Client-360 export
Emit `qr.scan`, `qr.landing_view`, `qr.lead` events with the tracker's first-party `anon_id` (when
present) and GA4 `client_id` through the existing measurement destinations; per-client toggle.
No fingerprinting; identity only from first-party ids the client's own site already holds.

---

## Cross-cutting
- All new public routes live under `/api/q/**` (already auth/RBAC-exempt) and follow
  `lead-intent.post.ts` hygiene (body cap, rate limit, IP hash with `TRACKING_IP_SALT`).
- Every write route registered for God-mode families as per `god-mode-mutation-families`.
- Marketing pages (`features/index.vue`, `features/[slug].vue`) updated per slice.
- Migrations are additive and run against Neon as part of each PR.
