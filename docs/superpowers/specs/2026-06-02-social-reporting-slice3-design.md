# Social Suite — Slice 3: Organic Reporting (Design Spec)

**Date:** 2026-06-02
**Status:** Design draft — decisions made autonomously (flagged ⟐); review before building 3a.
**Depends on:** Slice 1 (Publishing — `social_accounts`, `social_posts`, `social_post_metrics`, the `social-providers/*` registry, companion-Worker cron pattern) and Slice 2 (Inbox — `social_conversations`/`social_messages`, SLA fields). All shipped/merged.
**Port source (read-only ref):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` — `components/reports`, `workers/scheduled-reports-cron`, `types/report-config.ts`, `composables/useReportConfig.ts`, `types/ai-insights-report.ts`.

---

## 1. Goal

Organic social **performance reporting** across the six networks: post performance (reach / impressions / engagement / clicks), account growth (followers / audience), best-performing content, posting-cadence-vs-engagement, and engagement-ops metrics (response time / SLA / volume from the Slice 2 inbox) — as an agency dashboard **and** a client-portal report, with **scheduled PDF/email exports** and an **AI narrative summary**.

Scope is **organic** (paid ad spend stays in the existing `/agency/social` spend module; this slice may show an organic-vs-paid context panel but does not own paid). 

## 2. The foundational gap (why 3a exists)

`social_post_metrics` (mig 146: `impressions, engagements, clicks, collected_at`) exists but **nothing populates it** — there is no provider metrics fetch anywhere in the codebase. There is also **no account-level metric store** (followers, profile reach, audience). So reporting cannot be a pure read layer: **Slice 3 must build the collection tier first** (3a), then report on it (3b+).

## 3. Scope decisions (autonomous — ⟐ flags ones worth a sanity check)

| Decision | Choice |
|----------|--------|
| ⟐ MVP boundary | Design the full thing; **phase the build** (§11). 3a (collection) is the first shippable increment and is independently valuable (powers the existing publishing analytics tile with real numbers). |
| ⟐ Metric granularity | Per-post lifetime snapshots (re-polled, last-write-wins per `collected_at`) + per-account daily snapshots. **Not** hourly time-series in v1 (cost/benefit; revisit for trending). |
| ⟐ Audience/growth | New `social_account_metrics` daily snapshot table (followers, reach, impressions, profile views) — enables growth-over-time charts. |
| Collection backbone | Poll path only (reuse the inbox cron pattern — a `social-metrics-cron` companion Worker). Webhooks don't deliver insights. |
| ⟐ Engagement-ops metrics | Reuse Slice 2 inbox SLA/response data (`social_conversations.first_response_at`, `sla_breached`) — report response time / SLA / volume alongside content metrics. No new collection. |
| Client portal | Read-only report surface (reuse the Slice 2d portal pattern: `requireClientAuth`, session-scoped, `useSocialInboxRealtime`-style polling not needed — reports are periodic). |
| ⟐ Scheduled exports | `social_report_schedules` + a cron that renders a report (PDF via Browser Rendering or a server-built HTML→PDF) and emails it (Resend). **Gated dormant** behind an env flag until verified, mirroring every other outbound sender in this repo. |
| AI summary | Groq narrative over the period's metrics (reuse `generateGroqInsight`), same as the notifications digest + anomalies narrative. |

## 4. Per-network metric availability matrix

Reporting degrades to what each network's API exposes; missing metrics simply don't render for that network.

| Network | Post metrics | Account metrics | Source |
|---|---|---|---|
| **Facebook** (Page) | impressions, reach, reactions, comments, shares, clicks | followers (fan_count), page impressions/reach | Graph `/{post}/insights`, `/{page}/insights` |
| **Instagram** (Business) | impressions, reach, likes, comments, saves, video views | followers, reach, profile views | Graph `/{media}/insights`, `/{ig}/insights` |
| **LinkedIn** (Org) | impressions, clicks, reactions, comments, shares | follower count | Rest `/organizationalEntityShareStatistics`, `/networkSizes` |
| **YouTube** | views, likes, comments, watch-time (Analytics API) | subscribers, views | YouTube Analytics API |
| **TikTok** | views, likes, comments, shares (limited) | followers | TikTok Business API (best-effort) |
| **Google Business** | n/a (no organic post insights) | views/searches/actions (Performance API) | GBP Performance API |

**Permission note:** post/page insights ride the **same page tokens** Slice 1/2 already use (FB `read_insights` is in the page-token family; IG insights via `instagram_manage_insights` — verify against the D2 scope set, may need adding to `META_D2_SCOPES`). No new App Review for FB/IG insights. LinkedIn/TikTok/YouTube/GBP each need their own (already-deferred) platform connection.

## 5. Data model (new migrations — assume **153+**, verify at exec time; additive, `IF NOT EXISTS`)

All `client_id`-scoped (FK `agency_clients(id) ON DELETE CASCADE`), mirroring Slices 1/2.

### `social_account_metrics` (new) — daily account snapshot
- `id`, `client_id`, `social_account_id` (FK), `platform`, `snapshot_date DATE`,
- `followers INT`, `reach INT`, `impressions INT`, `profile_views INT`, `posts_count INT`, `metadata JSONB`,
- Unique: `(social_account_id, snapshot_date)`. One row per account per day (idempotent upsert).

### `social_post_metrics` (extend mig 146) — richer per-post snapshot
- Add: `reach INT`, `likes INT`, `comments_count INT`, `shares INT`, `saves INT`, `video_views INT`, `reactions INT`.
- Keep the re-poll model: latest `collected_at` row per post is the current truth (or upsert one row per post and overwrite). ⟐ Decision: **one row per post, upserted** (unique on `post_id`) — simpler than time-series; we don't need post-level history in v1.

### `social_sync_cursors` (reuse from Slice 2)
- Add `channel_type` value `'metrics'` and `'account_metrics'` for the metrics poll watermark — no new table.

### `social_report_schedules` (new) — 3c
- `id`, `client_id`, `name`, `cadence TEXT` (`weekly｜monthly`), `recipients TEXT[]`, `sections JSONB` (which report blocks), `enabled BOOLEAN`, `last_sent_at`, timestamps.

## 6. Collection layer (3a)

- Extend the **existing** `social-providers/*` registry with `fetchPostMetrics(account, postIds)` and `fetchAccountMetrics(account)` — do **not** create a parallel provider set (same rule as Slice 2's `fetchInbox`/`reply`).
- Pure normalizers `server/utils/socialReporting/normalize.ts` map each network's insight payload → a common `{ postId, impressions, reach, likes, ... }` / `{ followers, reach, ... }` shape (TDD, like `socialInbox/normalize.ts`).
- Idempotent upsert helpers `server/utils/socialReporting/store.ts` (injected-db, unit-tested) → upsert `social_post_metrics` (by post_id) + `social_account_metrics` (by account+date).
- Companion Worker **`social-metrics-cron`** → `POST /api/cron/sync-social-metrics` (`x-cron-secret`). Per active account: pull account metrics (daily) + post metrics for posts published in a trailing window (e.g. last 90d), advance the `metrics` cursor. Self-gate cadence per network rate limits.

## 7. Reporting API + UI (3b)

### API — `server/api/agency/social/reporting/**` (requireAuth; clientId param, all-clients per the established agency precedent)
- `overview` (headline KPIs + deltas vs prior period), `posts` (per-post table, sortable by any metric), `accounts` (growth time-series from `social_account_metrics`), `engagement-ops` (response/SLA/volume from inbox), `best-content` (top posts by engagement-rate), `cadence` (posting frequency vs engagement), `ai-summary` (Groq narrative). All take `from`/`to`/`platform` filters.

### Frontend — `/agency/social/reporting/*` (Creative-gated, sibling of `/publishing` and `/inbox`)
- `index.vue` — report dashboard: period picker (reuse `SpendPeriodPicker`), network filter, KPI cards, growth charts (Unovis, reuse the spend chart components), best-content grid, cadence heatmap, engagement-ops panel, AI summary card.
- Adapt sibling `components/reports/*` shadcn → **Nuxt UI v4**; apply the `frontend-design` skill to any forms (schedule editor in 3c).

## 8. Client-portal report (3b)
- `server/api/client-portal/social/reporting/**` (`requireClientAuth`, session-scoped — mirror Slice 2d portal data layer's tenant-isolation discipline: every query scoped to `client.clientId`, never input).
- `/portal/social-reporting` page — read-only report (KPIs, growth, best content, AI summary). No ops/SLA internals (staff-only, like internal notes were excluded in 2d).

## 9. Scheduled exports (3c)
- `social_report_schedules` CRUD + a `social-report-cron` companion Worker → `POST /api/cron/send-social-reports`.
- Render: build the report HTML server-side → PDF via **Cloudflare Browser Rendering** (available, §Cloudflare) → store in R2 → email via Resend with the PDF link/attachment.
- **HARD gate** env `SOCIAL_REPORTS_ENABLED` (default off) — no scheduled email fires until explicitly enabled (mirrors `EMAIL_SENDING_ENABLED` / `SOCIAL_AUTOMATION_ENABLED`). Manual "preview/download now" is ungated (human-initiated).

## 10. AI narrative
- `server/utils/socialReporting/aiSummary.ts` — `generateGroqInsight` over the period's KPIs + deltas + best content → a short plain-English summary ("Engagement up 23% MoM, driven by Reels; response time improved to 1.4h…"). Fails safe (no summary on error, never blocks the report). Same posture as the anomalies/digest narratives.

## 11. Phasing (build order)

1. **3a — Collection.** Metrics tables (mig 153) + provider `fetchPostMetrics`/`fetchAccountMetrics` (FB+IG first, others framework-ready) + normalizers + store + `social-metrics-cron`. *Ships dormant for un-connected networks; immediately makes the existing publishing-analytics tile show real numbers once Meta is connected.* No App Review (FB/IG insights ride page tokens).
2. **3b — Reporting dashboard + portal.** Reporting API + agency UI + client-portal report + AI summary.
3. **3c — Scheduled exports.** Schedules CRUD + PDF render + email cron, behind `SOCIAL_REPORTS_ENABLED`.

Each phase independently shippable; 3a delivers value (real metrics) without any UI.

## 12. Error handling & security
- **SSRF** — collection only calls platform API hosts; never user URLs.
- **RBAC** — agency `requireAuth` + Creative; portal `requireClientAuth` client-scoped; every query filtered by `client_id` (no IDOR), per the Slice 2d portal discipline.
- **Tokens** — reuse `social_accounts` tokens; surface failures via `last_error`/`last_synced_at`; backoff on 429/expiry; partial-failure tolerant.
- **Exports** — `SOCIAL_REPORTS_ENABLED` gate off by default; PDF links are R2 signed/expiring; reports only contain the client's own data.
- Server imports use `~~/server/utils/`.

## 13. Testing
- **Unit** — per-network metric normalizers; store idempotency (re-poll overwrites, account+date upsert); period-delta math; engagement-rate / cadence computations; AI-summary fail-safe.
- **Integration** — cron poll → metrics upsert; report overview aggregation; portal tenant-scoping.
- Mirror Slices 1/2 vitest approach; target **0 new type errors**.

## 14. Front-facing page sync
- Add Reporting to `app/pages/features/index.vue` (+ `[slug]`) and `MarketingNav.vue` when 3b lands. (Note: the whole inbox arc 2a–2d deferred marketing sync — consider a single catch-up pass covering Inbox + Reporting together.)

## 15. Out of scope (later / explicit cuts)
- Paid/ad performance (owned by the spend module).
- Cross-channel attribution to revenue (GA4/CRM territory).
- Competitor benchmarking, share-of-voice → **Slice 4 (Listening)**.
- Post-level time-series history (v1 is latest-snapshot); revisit if trending per-post is needed.

---

## Open questions for review (before building 3a)
1. ⟐ **Metric history depth** — latest-snapshot per post + daily account snapshots (proposed) vs full time-series? Latest-snapshot is far cheaper; daily account snapshots already give growth trends.
2. ⟐ **First networks** — build 3a collection for **FB + IG only** (consistent with D2 OAuth being Meta-first), others framework-ready? Recommended yes.
3. ⟐ **PDF engine** — Cloudflare Browser Rendering (proposed) vs a server HTML→PDF lib. Browser Rendering is already available on our CF plan.
4. ⟐ **IG insights scope** — confirm whether `instagram_manage_insights` must be added to `META_D2_SCOPES` (would require operators to reconnect). If so, 3a should bundle that scope addition (ungated — it's a standard permission, not messaging-grade).
