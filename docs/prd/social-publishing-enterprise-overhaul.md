# PRD — Social Publishing Suite: Enterprise Overhaul

**Status:** Active · **Owner:** Paul (ADME / XeroFlow) · **Created:** 2026-06-24
**Goal:** Take the `/agency/social/publishing/*` suite to an Agorapulse/Sprout-class
enterprise product, with AI woven through, fully cohesive across pages.

---

## 1. Vision

A single, cohesive workflow where an agency manages **all** of a client's organic
social — connect accounts → compose (AI-assisted) → schedule on a calendar/queue →
route through approvals → publish → measure — across Facebook, Instagram, Google
Business (live today) and LinkedIn/TikTok/YouTube (gated). The differentiator vs
Agorapulse is **AI everywhere** (caption, image, best-time, calendar generation,
approval pre-checks, reply suggestions) and tight integration with the rest of
XeroFlow (Banner Studio, listening/inbox engines, reporting, briefs).

## 2. Current state (audit, 2026-06-24)

Routes under `app/pages/agency/social/publishing/`:
- **accounts.vue** — connect Meta/GBP + grid of connected pages. *Just fixed: full-width + scroll + card grid.*
- **compose.vue** + `components/social-publishing/PostComposer.vue` — **richest**: per-network customization, AI caption, AI image, Banner Studio picker, schedule/queue/now, hashtags/tags, first comment, link UTM.
- **planner.vue** (107 ln), **approvals.vue** (85), **queue.vue** (77), **analytics.vue** (61, stub), **index.vue** (237 landing).

Cohesion gaps found:
- Sidebar nav lists **Calendar** and **Message Approvals** but there is **no `calendar.vue`** route; message-approvals vs approvals conflated.
- **Client selector lives only on Accounts** — other pages have no persistent client context.
- Each page rolls its own container (`max-w-4xl mx-auto` etc.) → inconsistent width/scroll.
- Section nav is a flat cramped text strip, no counts/status.

## 3. Goals / Non-goals

**Goals**
- One shared **suite shell**: full-width, consistent header, **global persistent client selector**, **tile-based section nav** with live counts/status.
- Reconcile routes (build Calendar, fix Message Approvals vs Approvals).
- Bring Queue, Calendar, Analytics, Approvals to Agorapulse parity.
- Extend AI beyond Compose (best-time, calendar gen, approval pre-checks, reply suggestions).
- Reuse existing infra, don't rebuild.

**Non-goals (this milestone)**
- New network integrations beyond what's gated today.
- Paid-social (that's the spend module).
- Inbox/listening rebuild (already shipped — just cross-link).

## 4. UX principles
- Full-width, single scroll container per page (`h-full overflow-y-auto`).
- Client context is ambient (set once, persists across the suite via query param + store).
- Every list shows counts/empty/loading states; nothing overflows horizontally.
- AI actions are inline and optional, never blocking.
- Nuxt UI v4 components only; dark-mode-safe semantic colors.

## 5. Information architecture

**Suite shell** (`SocialPublishingShell.vue`, wraps every page):
- Header: page title + **global client `USelectMenu`** (persisted to `?client=` + a `useSocialPublishingClient` composable/cookie) + primary action slot.
- **Tile nav** (`SocialPublishingNav.vue`): icon + label + live count/status badge, grouped:
  - **Create:** Compose
  - **Schedule:** Calendar · Queue · Planner
  - **Review:** Approvals
  - **Connect:** Accounts
  - **Measure:** Analytics
- Body slot: full-width, scrollable.

**Shared data:** one `useScheduledPosts(clientId)` source feeds Calendar + Queue + Planner so they never drift.

## 6. Feature requirements

- **Accounts** ✅ (done) — grid of connected pages, per-platform connect, counts. *Future: search box at 50+, avatars, bulk disconnect.*
- **Compose** — already strong. Add: **live network previews** (reuse `MetaFeedPreview`/`LinkedInPreview` from marketing), multi-post/bulk, save-as-draft, duplicate.
- **Calendar** (NEW) — month/week drag-and-drop of scheduled posts; click a slot → compose prefilled; color by network/status. Agorapulse-core.
- **Queue** — per-account posting **time slots** ("publishing schedules"), drag-to-reorder, "fill queue" from drafts.
- **Approvals** — review list + post preview + approve/reject + threaded comments; surface client-portal approvals (already server-side). Distinguish **Message Approvals** (inbox replies) from **Content Approvals** (posts) or merge intentionally.
- **Analytics** — per-post + per-account performance from `social_post_metrics`/`social_account_metrics` (already collected); top content, cadence, growth; AI summary (reuse `socialReporting/aiSummary`).
- **Planner** — campaign/theme planning board feeding Compose; or fold into Calendar.

**AI / enterprise layer**
- AI best-time-to-post (per account, from `social_account_metrics`).
- AI content-calendar generation (brief → N scheduled drafts).
- AI approval pre-checks (brand voice / compliance flags before human review).
- AI reply suggestions (cross-link inbox engine).
- Cross-links: Banner Studio (done in Compose), listening/inbox, reporting, briefs.

## 7. Gaps vs Agorapulse (parity checklist)
- [ ] Drag-and-drop content calendar (Calendar route)
- [ ] Publishing queues / time slots (Queue)
- [ ] Live post previews per network (Compose)
- [ ] Bulk/CSV scheduling
- [ ] Approval workflows w/ client portal (partial — wire UI)
- [ ] Per-post + per-account analytics + reports (data exists, UI stub)
- [ ] Unified inbox (already shipped separately — cross-link)
- [ ] **AI layer (our edge)** — best-time, calendar-gen, pre-checks, reply suggestions

## 8. Phased delivery plan + task lists

> Build as flag-gated slices with reviews, like the rest of the social suite. Each slice ships independently.

### Slice 1 — Suite shell, tile nav, global client context  *(highest leverage; delivers the 3 explicit asks)*
- [ ] `composables/useSocialPublishingClient.ts` — selected client persisted to `?client=` + cookie; shared across pages.
- [ ] `components/social-publishing/SocialPublishingNav.vue` — tile nav (icon + label + count/status badge), grouped Create/Schedule/Review/Connect/Measure.
- [ ] `components/social-publishing/SocialPublishingShell.vue` — full-width header (title + global client selector + action slot) + tile nav + scrollable body slot.
- [ ] Endpoint `GET /api/agency/social/publishing/nav-counts?client=` — counts for badges (accounts, scheduled, pending approvals, drafts).
- [ ] Migrate all 7 pages to the shell; remove per-page `max-w-*`/containers and the local client selector.
- [ ] Tests for the composable + nav-counts; verify each page renders full-width + scrolls.

### Slice 2 — Route reconciliation + Calendar
- [ ] Add `calendar.vue` (month/week, drag-and-drop) on `useScheduledPosts`.
- [ ] Fix nav: Calendar route real; clarify Message Approvals vs Approvals.
- [ ] Click slot → Compose prefilled (date/time/client).

### Slice 3 — Queue + Planner to parity
- [ ] Per-account time-slot schedules; drag-to-reorder; "fill from drafts".
- [ ] Planner → campaign board feeding Compose (or fold into Calendar).

### Slice 4 — Approvals + Analytics
- [ ] Approvals: preview + approve/reject + comments; portal wired.
- [ ] Analytics: per-post/account dashboards from existing metrics + AI summary.

### Slice 5 — AI / enterprise layer
- [ ] Best-time-to-post, content-calendar generation, approval pre-checks, reply suggestions.
- [ ] Cross-links to listening/inbox/reporting/briefs.

## 9. Technical notes (reuse, don't rebuild)
- Composer + AI caption/image + Banner Studio: `components/social-publishing/PostComposer.vue` (keep).
- Metrics already collected: `social_post_metrics`, `social_account_metrics`, `socialReporting/*`.
- Preview components exist in marketing pages (`MetaFeedPreview`, `LinkedInPreview`).
- Scheduling/dispatch: existing `social-dispatch-cron` + scheduled-posts tables.
- Gating: flag new/unstable surfaces (e.g. `SOCIAL_PUBLISHING_V2`) per house style.

## 10. Success criteria
- All 7 pages full-width, scrollable, one consistent shell + tile nav.
- Client selected once, persists across the suite.
- Calendar exists and drives scheduling.
- Analytics shows real data.
- ≥1 AI feature beyond Compose live.
- No regressions; tests green; flag-gated rollout.
