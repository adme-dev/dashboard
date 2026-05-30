# Session Handoff — 2026-05-30 → 2026-05-31

**Context:** Long multi-feature session. GA4 funnel integration, GA4 auto-map + dedicated page, Xero→client reconciliation (AI-assisted), clients fixes, leads form-setup review. Next up: **GA4 into the analytics dashboards + other sections (GA4 Phase 2).**

---

## ⚠️ Git / deploy state (read first)

| Thing | State |
|---|---|
| Local `main` HEAD | `ee88f36` (clients route hardening — authored by Paul008) |
| `origin/main` | `9c02cc8` — **local is 20 commits ahead; NOT pushed** |
| Production deploy | `d3a83018`, built from `b8428bf` — **1 commit behind HEAD** (missing `ee88f36`) |
| Working tree | clean except untracked `.claude/worktrees/` |

**Two open deltas:**
1. **Push gap** — everything after the GA4 funnel (auto-map, reconciliation, leads WIP, clients hardening, all docs) is local-only. Push needs the `adme-dev` gh account (active) — `Paul008` gets 403.
2. **Deploy gap** — `ee88f36` (clients `/agency/clients/[id]` auth + financials hardening, the user's own audit fix) is committed but **not deployed**. Next deploy ships it.

---

## Session Accomplishments (all committed to local `main`)

- **Fixed `SyncResult` duplicate auto-import** (mondaySync.ts / xeroCustomerSync.ts) → renamed to `MondaySyncResult` / `XeroSyncResult`. `215956b`.
- **GA4 Funnel integration** (spec+plan+executed+merged+deployed): migration 121 (`ga4_property_map`, `ga4_daily_channel`), separate GA4 OAuth (`platform='ga4'`), `ga4Client`/`ga4Sync`/`ga4Funnel` utils, candidates/sync/cron + portal & agency funnel endpoints, portal "Website & Funnel" section. Channel-level funnel: spend → sessions → GA4 key events → owned leads.
- **GA4 operator setup**: wrote `docs/runbooks/ga4-operator-setup.md`; walked user through Google Cloud — enabled **Analytics Data API + Admin API**, added redirect URI for `agency-dashboard-6cm.pages.dev`, **made the OAuth app Internal** (kills the 7-day Testing refresh-token expiry). User connected GA4 via `advertising@adme.net.au`.
- **GA4 auto-map + dedicated page** (spec+plan+executed+merged+deployed): `app/utils/ga4PropertyMatch.ts` (location-prefix matcher, tested), `map-bulk` endpoint, **moved GA4 card off the ad-platform grid to `/agency/social/ga4`** (header button), "Auto-map" button. Scroll fix (`4c6f9d2`). **Live result: auto-mapped 42 of 48 properties; 6 left for manual.**
- **Clients active-filter fix** (`96bb3f9`): `/api/agency/clients` had an inverted `active` filter (default returned all; `?active=false` returned active-only). Corrected.
- **Xero vs client-list investigation**: `agency_clients` is a static **2026-03-02 import** (57 rows, only **1/57 linked to Xero**). Found **48 unrepresented, currently-invoiced Xero customers** (Brighton, Geely, McRae, Knox, Harmony $10.9k, Peninsula Dealer Group, etc.). Confirmed the list has drifted from Xero.
- **Xero → Client Reconciliation (Phase 1)** (spec+plan+executed+merged+deployed): `/agency/clients/reconcile` page, migration 122 (`client_xero_contacts`), deterministic matcher (`xeroReconcile.ts`) + **Groq LLAMA_70B AI grouping** (`xeroReconcileAI.ts`, validated parser that demotes hallucinated client IDs), candidates/suggest/apply endpoints. Apply is **admin/owner-gated**, transactional, idempotent.
- **Leads form-setup review**: read `SetupGuide.vue` + `FormRulesTab.vue`; assessed marketer-ease (building blocks 8/10, end-to-end self-serve ~6/10 due to the seam + admin-gated credentials). Committed the leads WIP (`b8428bf`) so the deploy shipped from a tracked state.
- **Deploys**: multiple to production, all verified via curl (200 on pages, 401 on auth-gated endpoints).

---

## Decisions Made

| Decision | Rationale |
|---|---|
| GA4 is its own domain, **not** `media_spend` | GA4 is website analytics, not ad spend; would pollute SUM(spend)/ROAS |
| Channel-level attribution (GA4 Default Channel Group) | Robust, GA4-native; UTM/campaign-grain deferred |
| Conversions = GA4 key events **+ owned leads** | Show on-site signal vs captured ground truth side by side |
| Separate GA4 OAuth connect (not bolted onto Google Ads) | GA4 access is often a different Google login |
| Auto-map: high-confidence auto-save, ambiguous → manual | User's explicit choice |
| Reconciliation = **Option 1** (Xero auto-populates `agency_clients`) | Keeps `agency_clients` canonical (load-bearing for portal/EOM/RBAC); Xero feeds it |
| Reconciliation matching = **hybrid** deterministic + AI; AI never writes | Deterministic handles 80%; AI for acronyms/clustering; human-confirmed creates only |
| Group-level client creation (not per-brand) | Consistent with existing 57; Xero bills per-brand, clients are per-group |
| OAuth app → **Internal** | Removes 7-day Testing refresh-token expiry; all connectors are `@adme.net.au` |
| Commit leads WIP before deploy | `deploy:production` builds from working tree — ship from a tracked commit |

---

## Open Threads / Next Actions (prioritized)

| # | Action | Notes |
|---|---|---|
| 1 | **GA4 into analytics + other sections (NEXT PHASE)** | Brainstorm scope first. Concretely: **(a)** the agency funnel endpoint `/api/agency/analytics/funnel` is **built but has NO UI consumer** — wire it; **(b)** add GA4 channel/session/engagement to the cross-platform analytics page + dashboard widgets; **(c)** possible standalone website-analytics views (traffic by channel, trends). |
| 2 | **Push local `main` to `origin`** | 20 commits unpushed. Needs `adme-dev` gh account. |
| 3 | **Deploy `ee88f36`** | Clients route hardening committed but not live. Goes out next deploy. |
| 4 | **Add the GA4 cron trigger** | Cloudflare Pages → Triggers → Cron `0 * * * *` → `POST /api/cron/ga4-sync`, header `x-cron-secret: $CRON_SECRET`. Google Cloud side is done. Until then GA4 only syncs on manual "Sync now". |
| 5 | **Finish mapping the 6 leftover GA4 properties** | Manual dropdown on `/agency/social/ga4`. |
| 6 | **Paused brainstorm: marketer "Connect a form" inline step** | Unify rule-creation + webhook connection into one inline guided step (closes the leads-flow "seam" + admin-gated-credentials issue). Was at the depth question: (a) show URL+steps, (b) connect + live test-lead verify [recommended], (c) full wizard. |
| 7 | **Reconciliation Phase 2** | Live auto-match on ad ingest; wire `client_xero_contacts` into `buildClientCondition` so spend reconciles for group clients whose Xero brands differ from the client name. |

---

## Reference Files for Next Session

```
docs/superpowers/specs/2026-05-30-ga4-funnel-integration-design.md
docs/superpowers/plans/2026-05-30-ga4-funnel-integration.md
docs/superpowers/specs/2026-05-30-ga4-auto-map-properties-design.md
docs/superpowers/specs/2026-05-30-xero-client-reconciliation-design.md
docs/runbooks/ga4-operator-setup.md
server/api/agency/analytics/funnel.get.ts   # built, NO UI consumer — Phase 2 entry point
server/api/portal/analytics/funnel.get.ts    # the working portal twin to mirror
app/pages/portal/analytics/index.vue         # has the "Website & Funnel" section
server/utils/ga4Funnel.ts                    # buildFunnel() — reuse for agency UI
app/pages/agency/analytics/index.vue         # likely home for GA4-into-analytics
```

---

## Gotchas captured this session

- **Build heap is now 16384** in `package.json` `build` script — `pnpm deploy:production` works directly (the old "prefixing NODE_OPTIONS is a no-op, use bypass command" note is OUTDATED).
- **`getGroqClient` is a DEFAULT export** of `server/utils/groqClient.ts` — `import getGroqClient, { GROQ_MODELS }`.
- **`agency` layout wraps pages in `overflow-hidden`** — every page needs its own `<div class="flex-1 overflow-auto">` scroll wrapper.
- **`transaction()`** — use the passed `client.query()` directly inside, never `queryOne`/`execute`.
- **GA4 properties / Xero contacts are per-brand; `agency_clients` is per-group** — the recurring granularity mismatch behind both auto-map and reconciliation.

---

## Resume

Start fresh, read this handoff, then **brainstorm "GA4 into analytics + other sections"** — first piece is wiring `/api/agency/analytics/funnel` into an agency-side UI (the endpoint already exists and is tested).

*Handoff created: 2026-05-31*
