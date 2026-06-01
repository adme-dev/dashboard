# Social Suite — Slice 1: Organic Publishing + Calendar — Design Spec

**Date:** 2026-06-01
**Status:** Approved (brainstorm) → ready for implementation planning
**Author:** Paul + Claude

---

## 1. Context & Decision

XeroFlow Agency already owns a differentiated creative engine (**Banner Studio**), a native **CRM**, **ad-spend tracking/measurement**, **leads**, a **client portal with approvals**, and a strong **analytics** module. It has a working but narrow paid pipeline at `/agency/ad-publish` (Banner Studio creatives → Meta ads; Google/TikTok stubbed).

After R&D against **Agorapulse** and **Sprout Social** (incl. Sprout's help-center taxonomy), the market read is:

- Pure social-management suites (Sprout, Agorapulse) have **no native creative engine** — Sprout explicitly delegates design to Canva/Adobe.
- Pure paid-ads tools (Smartly, Madgicx) have **no agency ops**.
- **Nobody owns creative → approve → publish (organic *and* paid) → measure → ROI end-to-end.**

XeroFlow already holds the pieces both categories rent. The decision: **build the full social suite**, decomposed into four slices, starting with **Organic Publishing + Calendar** — the highest-reuse, most-differentiated slice.

### Strategic edge to lean into (vs Sprout)
- **Native creative** (Banner Studio) — Sprout has none.
- **Native CRM** — Sprout pays to bolt on Salesforce/HubSpot.
- **Native paid + GA4 + attribution** — true blended organic+paid+web ROI.

### Suite decomposition & build order
1. **Organic Publishing + Calendar** ← *this spec*
2. Engagement Inbox (+ **Reviews management** folded in)
3. Organic Reporting (extends existing analytics)
4. Social Listening (deferred — highest external-data cost, most commoditized)

---

## 2. Source of the Port

A sibling Nuxt + Cloudflare app, **`promotion-knoxgwmhaval`** (`/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`), already contains a full social publishing system. We **port-and-adapt** it.

**Ports cleanly (logic/server):** `SocialPostProvider` interface + 6 providers, post lifecycle, queue, slot-schedule, optimal-times, AI planner/packs/captions/images, A/B experiments, approvals workflow, post data model, calendar components.

**Three systematic adaptations applied to every ported file:**
1. **UI kit:** shadcn-nuxt / reka-ui / unocss → **Nuxt UI v4** (`UButton`, `UModal`, `UCalendar`, `UTable`, `USelectMenu`, `UFormField`), dark-mode semantic colors. (Logic/composables port cleanly; `.vue` templates need re-skinning.)
2. **DB:** drizzle-orm / kysely → raw `queryRows/queryOne/execute/transaction` from `server/utils/db.ts`; sibling schema lands as new SQL migrations.
3. **Tenancy:** dealer-scope (`dealer_id`, better-auth) → **agency-client scope** (`client_id` → `agency_clients`), auth via `requireAuth` + `requireRole`/`requireWriteAccess`; reuse the existing `map-client` precedent and `client_team_assignments`.

> **Note:** the sibling uses Nuxt 3 root-level `pages/`/`components/`; the dashboard is Nuxt 4 (`app/`). Adjust paths on port.

---

## 3. Scope (v1)

**In scope:**
- Organic publishing only. The working `/agency/ad-publish` stays standalone; the Composer is architected so **paid folds in as a later slice**.
- **6 networks** (all ported): Facebook, Instagram, LinkedIn, TikTok, YouTube, Google Business.
- **Internal approvals** (request → approve/reject). Client-portal approval is a fast-follow.
- Per-network post customization, tagging, first comment, bulk/queue scheduling, AI caption/image, Banner Studio + media-library creatives, live per-network previews.

**Out of scope (decided, not omitted):**
- Influencer marketing, employee advocacy, social commerce / product tagging.
- Cases / help-desk / bots / Salesforce Service Cloud (revisit via native CRM later).
- Native mobile app (PWA covers approvals-on-the-go).
- Deep social listening (slice #4).
- Paid mode in the Composer (ad-publish standalone for v1).
- Additional networks (X / Threads / Pinterest / Bluesky / Reddit / WhatsApp / Snapchat) — **X / Threads / Pinterest named as the natural fast-follow** (dashboard already holds X + Pinterest OAuth from the spend side).

---

## 4. Module Structure & Information Architecture

New section **`/agency/social`** (beside the Ad Spend / Meta Ads nav group). IA = **calendar-as-hub + deep-linkable Compose route** (validated against the sibling app's proven structure).

| View | Route | Ported from |
|---|---|---|
| **Calendar** (hub, landing) | `/agency/social` | `ContentCalendar.vue` + Month/Week/Day/Agenda |
| **Compose** (deep-linkable) | `/agency/social/compose?edit=&client=&creative=` | `compose.vue` + `PostComposer*` |
| **Queue** | `/agency/social/queue` | `queue.vue` |
| **Planner (AI)** | `/agency/social/planner` | `planner.vue` |
| **Approvals** | `/agency/social/approvals` | `approvals.vue` |
| **Analytics** | `/agency/social/analytics` | `analytics.vue` |
| **Accounts** | `/agency/social/accounts` | `accounts.vue` + connect flows |

The calendar colour-codes organic vs (future) paid. Server endpoints mount under **`server/api/agency/social/publishing/**`** to avoid colliding with the existing `server/api/agency/social/**` spend endpoints.

---

## 5. Data Model

New SQL migrations from **127** onward (dashboard is currently at 126). Additive, `IF NOT EXISTS` guards. Run against Neon per CLAUDE.md.

### `social_posts` (one row per post; fan-out via arrays — proven design)
- `id UUID PK`, `client_id UUID NOT NULL → agency_clients`, `created_by`
- `content TEXT`, `media_urls TEXT[]` (R2), `link_url`, `hashtags TEXT[]`
- `platforms TEXT[]` (`['facebook','instagram',...]`), `account_ids UUID[]` → `social_accounts`
- **`platform_overrides JSONB DEFAULT '{}'`** — per-network customization, e.g. `{ "instagram": {"content": "...", "mediaUrls": [...]}, "linkedin": {...} }`; absent key = inherit base. *(Added vs sibling — closes the Sprout "Customize Post per Network" gap.)*
- **`tags TEXT[]`** — cross-cutting; written here, consumed by Inbox + Reporting slices. *(Added vs sibling.)*
- `first_comment TEXT` (nullable)
- `scheduled_at TIMESTAMPTZ`, `timezone TEXT`
- `status TEXT` ∈ `draft│approved│scheduled│publishing│published│partially_published│failed│cancelled`
- `platform_results JSONB` (per-network published id/url/error), `publish_attempts INT`, `published_at`, `last_attempt_at`
- approval cols: `approval_requested_at`, `approval_requested_by`, `approved_by`, `approved_at`, `rejection_reason`
- queue cols: `queue_position INT`, `queued_from_optimal BOOLEAN`
- `metadata JSONB` (AI gen context, template id, **`creativeId`** → Banner Studio)
- `created_at`, `updated_at`
- Index: `(client_id, queue_position) WHERE queue_position IS NOT NULL AND status IN ('draft','scheduled')`; `(status, scheduled_at)` for the dispatcher.

### `social_accounts` (client-scoped publishing connections)
- `id UUID PK`, `client_id`, `platform`, `platform_account_id`, `account_name`
- `access_token`, `refresh_token`, `token_expires_at`, `is_active`, `last_error`, `last_synced_at`, `metadata JSONB`
- *(Drop sibling's webhook/auto-reply columns — those belong to the Inbox slice.)*

### `social_slot_schedules` (recurring posting slots)
- `id`, `client_id`, `name`, `platforms TEXT[]`, `day_of_week INT` (0–6), `time_of_day TIME`, `timezone`, `capacity INT`, `enabled BOOLEAN`, `metadata JSONB`

### Ported support tables
`social_post_templates`, `social_ab_tests` (experiments), `social_content_packs`, `social_content_sources`, `social_post_metrics` (feeds Analytics view).

### Deferred (named, not built)
`social_conversations` (→ Inbox), webhook/auto-reply columns.

---

## 6. Provider & Publish Layer

Port `server/utils/social-providers/` → `registry.ts` + 6 provider modules implementing `SocialPostProvider`:

```ts
interface SocialPostProvider {
  identifier: string
  name: string
  post(params: PostParams): Promise<PostResult>
  comment?(params: CommentParams): Promise<PostResult>
}
```

`getProviderOrThrow(platform)` is the single dispatch point. Plain `$fetch`/Graph-API code — ports with minimal change. `PlatformLimits` (per type) drives Composer validation.

### Publish flow (ported `posts/[id]/publish.post.ts`, re-scoped)
1. Load post + its client-scoped `social_accounts`; validate platform readiness.
2. `status='publishing'`, increment `publish_attempts`.
3. For each platform: resolve content = base + `platform_overrides[platform]`, stamp UTMs on `link_url`, `getProviderOrThrow(platform).post({ accountId, accessToken, content, media })`.
4. Write per-network outcome to `platform_results`; final status = `published` / `partially_published` / `failed`.

### OAuth/token reconciliation (the one real nuance)
The dashboard's existing `social_connections` stores **ad-account** tokens for *spend reading* (`act_xxx`, 60-day Meta) — a different object/scope from publishing. Therefore:
- New `social_accounts` owns **publishing** (page/profile) tokens, with its own ported connect/callback flow, client-scoped.
- Kept **separate** from `social_connections` (don't entangle spend and publish) but cross-referenced by `client_id` so a client's spend + publishing accounts sit together in the UI.
- v1 connect flows: FB/IG (Graph), LinkedIn, YouTube ported directly; TikTok + Google Business via their ported providers. Token refresh + `last_error`/`is_active` surfaced in the Accounts view.

---

## 7. Scheduling & Dispatch

Three modes in the Composer, all landing in `social_posts`:
- **Publish now** → immediate dispatch.
- **Schedule for** → explicit `scheduled_at` + `timezone`.
- **Add to queue** → next free `social_slot_schedules` slot via ported optimal-times logic (`queue_position`).

### Dispatcher (Cloudflare Pages has no `scheduled()` handler)
Follow the dashboard's proven companion-Worker cron pattern:
1. Port `_cron/publish-social-posts.post.ts` → **`server/api/cron/publish-social-posts.post.ts`**, guarded by `x-cron-secret` vs `CRON_SECRET` (same as `ga4-sync`).
2. Scans `WHERE status IN ('scheduled','approved') AND scheduled_at <= now()`, **idempotent claim** (`UPDATE … SET status='publishing' WHERE status IN ('scheduled','approved')` — only the winning update proceeds), then runs the publish loop.
3. Add companion Worker **`workers/social-dispatch-cron`** (mirroring `workers/meta-status-cron`) on a 1–2 min schedule.

### Safety properties
- Idempotent claim → overlapping ticks can't double-publish.
- Bounded retries → exhausted `publish_attempts` go `failed` with error surfaced (not silently retried).
- Partial success → one network failing doesn't block others.
- Timezone: store UTC, compose/display in client `timezone` via `@internationalized/date`.

---

## 8. Composer & Creatives

Compose route (`/agency/social/compose`), port of `PostComposer.vue` re-skinned to Nuxt UI v4.

**Left — authoring:**
- Base content editor (text, emoji, link) + per-network char counters.
- **Per-network customization tabs** — surfaces `platform_overrides`; "Customize per network" toggle reveals a tab per selected platform; empty = inherit base.
- First comment + hashtag group fields.
- Tags input (`tags TEXT[]`).
- Schedule controls (§7).

**Creatives — three sources (the differentiator), unified picker:**
1. **Banner Studio published creatives** — reuse `BulkCreativePicker` + `banner-studio/ad-publish/index.get.ts`; resolves to R2 `media_urls` + records `metadata.creativeId`.
2. **Media library** — port `MediaLibraryDialog` + `media/browse` over R2 (upload/browse/reuse).
3. **AI image** — port `ai/generate-image`; **AI caption** via port of `ai/generate-caption` rewired to the dashboard's Groq client.

**Right — live per-network previews:**
- Reuse existing dashboard `ad-preview/{MetaFeed,MetaStory,TikTok,LinkedIn}Preview`; port sibling `PlatformPreviews` only for gaps (IG carousel/Reel, YouTube, Google Business). Previews react to resolved content (base + override).

**Deep-linkable:** `?edit=<postId>`, `?client=<id>`, `?creative=<bannerId>` — Create-post from calendar, Banner Studio, or a future campaign all funnel here pre-filled.

**Validation:** per-network media count / aspect ratio / caption limits from ported `PlatformLimits`, fail-fast with inline `UFormField` errors before scheduling.

---

## 9. Approvals, Observability & Testing

### Internal approval workflow (ported)
- Lifecycle: `draft → (request_approval) → approved → scheduled/published`, or `rejected` (`rejection_reason`, back to draft).
- `/agency/social/approvals` view + nav badge (port `approvals/badge.get.ts`), RBAC-gated; `requireWriteAccess` blocks viewers.
- Requests/decisions fire through the **existing notification system** (`notifications.ts`/`subscriptions.ts`).
- Architected so **external (client-portal) approval** drops in later as an alternate approver target.

### Error handling & observability
- Partial-publish first-class (`platform_results`); `last_error`/`is_active` on `social_accounts` surface token/permission failures in Accounts.
- Dispatcher: idempotent claim, bounded retries, structured per-tick logs (claimed/published/failed) consistent with existing cron handlers.
- Token expiry detected pre-publish → account flagged, post held with "reconnect" prompt (not silently failed).

### Testing (mirrors dashboard Vitest patterns)
- **Unit:** each provider `post()`/`comment()` with mocked `$fetch`; `platform_overrides` merge; UTM stamping; slot/optimal-time selection; dispatcher claim (concurrent-tick → single publish); `PlatformLimits` validation.
- **Integration:** full lifecycle (draft→approve→schedule→dispatch→published), partial-failure path, idempotent re-dispatch.
- **Migrations** additive with `IF NOT EXISTS`, run against Neon.

### Marketing-page sync (per CLAUDE.md)
Add Publishing to `app/pages/features/index.vue` + `[slug].vue` + `MarketingNav.vue`.

---

## 10. Open Items for Planning
- Confirm exact migration numbers (127+) at plan time (avoid collision with any in-flight branches).
- Decide token-refresh cadence per network (some need proactive refresh before expiry).
- Inventory which sibling AI endpoints depend on models not configured in the dashboard (rewire to Groq/Workers AI).
- Per-network preview gaps to port vs reuse (confirm IG Reel/carousel, YouTube, GBP).
