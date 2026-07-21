# PAUL Session Handoff

**Session:** 2026-07-16 (morning → 18:03 AEST)
**Context:** Bookkeeper (Kellie) UAT of XeroFlow finance → full fix round shipped; admin/users + /customers + stale-chunk fixes; Auto Feed feature built via /loop. 10 PRs merged & deployed (#188–#197).

---

## Session Accomplishments

- **Kellie's UAT answered in Slack (DM D04L8J3BM9N + group C05JY5Z967K)** — every figure she flagged was diagnosed, fixed, deployed, and confirmed to her with a full written wrap-up in both channels.
- **PR #188 — finance correctness:** credit notes netted off "This Month Invoiced" ($117,873.74 → $111,524, her exact number, verified live incl. "Less $6,350 credits" badge); dashboard Revenue/Expenses/Profit cards now read Xero's REAL P&L report (each = a literal named report line; cash-July $146,252 / $62,938 match her P&L to the cent) with an Accrual/Cash toggle shared with Reports; GST Collected card removed; quote pipeline age-floored (12mo, shared constant); Refresh buttons bust the 5-min cache; Xero webhook clears the real KV key families + verifies signature; **token-divergence fix** (refreshes write tenant row; crons read newest row via shared `server/utils/xeroCronAuth.ts`) — this was why the AGI cache froze 3 June; magic-link emails now use the server callback (blank-black-page fix); "Sign in with Xero" mints a session (openid/email scopes added → one-time re-consent for everyone) and unknown Xero identities can't bind the org; settings role-gated; Benjamin placeholder removed.
- **AGI backfill executed** (13 months, ~7k invoices) via scratchpad script + prod-minted access token — June now ~$313k not $15,760. Get Out verified live.
- **PR #189 — CI unblocked:** stale providers.test stubbed the retired `$fetch` global; main's ci job had been red and SKIPPING EVERY AUTO-DEPLOY since ≥12 July. Now green; deploy job works.
- **PR #190 — /admin/users:** renders in agency shell (no more "jumping out"); toasts on activate/deactivate; real status filter; Remove modal = Deactivate + NEW FK-safe hard delete (409 → "deactivate instead"); Invite modal now actually creates users + sends magic-link emails; `/api/members` real data.
- **PR #191 — stale-if-error** in `cachedFetch` bust path (Xero 429 storms degrade to stale data, not error walls).
- **PR #192 — /customers fixed:** legacy `customers.vue` (no NuxtPage) shadowed the real finance view AND the child SSR-blocked on a full Xero contacts pull (hard loads/phones hung until CF killed them). Legacy deleted; loads after mount. Verified live desktop + 390px.
- **PR #193 — stale-chunk auto-recovery** plugin (`app/plugins/chunk-error-reload.client.ts`).
- **PR #194 — deactivated-user indicator** (dimmed row, red "Deactivated" badge, colour-coded status chips).
- **PRs #195–#197 — Auto Feed (all live, flag-gated `DEALER_FEEDS_ENABLED`):** `/agency/social/publishing/feed` vehicle-card stream per linked dealer client; Send-to-Compose `?prefill=` deep link; auto-draft rules (mig 248 APPLIED: `feed_post_rules` + `feed_rule_executions`; cron `/api/cron/feed-post-rules` drafts-only w/ caps+dedupe+notify; CRUD `/api/agency/social/feed-rules/`; rules UI on the page).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| KPI Expenses = literal "Total Operating Expenses" line (not COGS+opex) | This org books PPC recharges as contra-COGS (negative COGS); bookkeeper reconciles against named P&L rows |
| Quote pipeline window = 365 days (shared `server/utils/quotePipeline.ts`) | Kellie: years-old quotes are dead deals |
| Delete user = hard delete ONLY when no FK activity; else 409 + deactivate | Data preservation; matches "remove Tyler/Teresa/Richard" need for demo/stale accounts |
| Auto Feed items only ever become DRAFTS | Human-in-loop operating model; nothing auto-publishes |
| Feed page uses SocialPublishingShell | routeCoverage test enforces it for all publishing pages |
| Webhook clears whole key families (`xero:`/`xero-report:`/`xero-get-out:`) | Hand-kept prefix list was already missing keys; single-tenant so over-invalidation is only perf |

## Open Items / Next Actions

| Priority | Action | Owner |
|---|---|---|
| 1 | **Cloudflare operator steps:** re-add `CRON_SECRET`; register crons: `xero-invoice-lines-sync` (nightly), `xero-customer-sync`, `feed-post-rules`; until then re-run AGI backfill manually if days pass (safe pattern in memory: poll `__default__` token, NEVER consume refresh token locally) | Paul + Claude |
| 2 | Activate Auto Feed: set `DEALER_FEEDS_ENABLED` + feed provider connection; link clients (Admin → dealer-feed-links) | Paul |
| 3 | **P1b** — event-delta endpoint in social-dashboard repo (price_drop/offer events; feed currently only new/listing) | Claude (needs repo path) |
| 4 | Everyone sees one-time Xero re-consent (new openid/profile/email scopes) — expected, tell the team | Paul |
| 5 | UTC month-boundary follow-up (first ~10h of Melbourne month shows prior month, app-wide, pre-existing) | backlog |
| 6 | Slice-3 "next queue slot" scheduling for rule drafts (v1 creates unscheduled drafts) | backlog |
| 7 | Separate workstream noted: adme-advertising MCP live; its Cloudflare Workflow enrichment deploy pending (OTHER repo/session) | other session |

## Reference Files

```
@.paul/HANDOFF-2026-07-16-bookkeeper-uat-and-auto-feed.md   (this file)
@~/.claude/projects/.../memory/bookkeeper-uat-finance-gaps.md  (full fix ledger w/ file:line + shipped status)
@~/.claude/projects/.../memory/dealer-feeds-plugin-rnd.md      (Auto Feed shipped notes + P1b remaining)
@server/utils/xeroCronAuth.ts  @server/utils/xeroPnlParse.ts  @server/utils/quotePipeline.ts
@server/api/cron/feed-post-rules.post.ts  @app/pages/agency/social/publishing/feed.vue
```

## State Summary

**Current:** main @ PR #197 merge, all deploys green, prod verified. Local branches (merged, deletable): fix/bookkeeper-uat-round1, fix/ci-providers-test, fix/admin-users-page, fix/xero-stale-if-error, fix/customers-ssr-block, fix/chunk-error-reload, fix/inactive-user-indicator, feat/auto-feed-slice1, feat/auto-feed-rules(-ui).
**Watch-fors:** gh account must be `adme-dev` for pushes; CI social suite + deploy-guard are the merge gates; 51 pre-existing vitest failures outside CI scope remain on main; browser automation via Kimi WebBridge (tab group «XeroFlow finance check» still open, incl. a mobile-emulation-cleared tab).
**Next:** operator steps (row 1–2) then P1b.
**Resume:** read this handoff + the two memory files above.

*Handoff created: 2026-07-16 18:04 AEST*

## Continuation — 2026-07-16 18:35 AEST

- **PR #198 merged** (`chore(cron): register Xero customer and Auto Feed jobs`).
  `workers/pages-cron` now has nine schedules: the existing nightly
  `xero-invoice-lines-sync`, `xero-customer-sync` every 15 minutes, and the
  flag-gated `feed-post-rules` daily at 04:10 UTC. Contract tests and Wrangler
  dry-run passed; Worker deployed as version `8aa9f3d3-899d-4e3c-9f4f-dd324780f77a`.
- **Cron auth repaired and verified:** Pages production has encrypted
  `CRON_SECRET`; the Worker binding was aligned to the production value as
  version `26a85e94-a3b8-418b-a5b4-002ac2f017b3`. The live 18:25 UTC Worker
  tick authenticated all existing routes with HTTP 200. A direct production
  `feed-post-rules` smoke returned `{ok:true,rules:0,drafts:0}`.
- **Auto Feed enabled:** production `DEALER_FEEDS_ENABLED=true`; the
  social-dashboard integration resolves to `https://socials.driveagent.io` and
  Neon has three active client links. No feed rules exist yet, so activation
  cannot create drafts.
- **Current UAT finding:** the Auto Feed screenshot shows 0 items because all
  three active links currently have `default_feed_ids=[]`. Linking an external
  organization/seller does not create a provider feed; create/select an active
  feed for each client in Admin → Dealer Feeds, save its feed ID in the mapping,
  then refresh Auto Feed. No feed IDs were guessed or written.
- **P1b status:** the social-dashboard checkout at
  `/Users/paulgiurin/Documents/GitHub/social-dashboard` is clean and seven
  commits ahead of its remote; service-auth, `create_feed`, and
  `search_inventory` are already implemented locally. The remaining
  price-drop/offer event-delta slice needs a reviewed snapshot/event contract:
  current source data has no historical price or canonical offer field, and
  XeroFlow's rule ledger dedupes by item ID. Do not implement by guessing what
  “offer” means.
- **Security note:** the separate social-dashboard checkout contains embedded
  fallback Supabase service-role credentials in `dashboard/server/utils/vehiclesClient.ts`
  (pre-existing, not touched). Rotate/remove that credential before any broader
  sharing or new external API work.
- **Empty-stream fix shipped:** PR #199 (`fix(feeds): fall back to linked
  inventory without a feed`) merged and deployed through the guarded main CI
  run `29484470593`; build, Pages upload, origin smoke, and workflow-readiness
  smoke all passed. The Auto Feed API now prefers an active configured feed but
  falls back to seller-scoped linked inventory, so refresh the page to verify
  the three existing links now populate cards.
