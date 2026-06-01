# PAUL Session Handoff

**Session:** 2026-06-01 — Social Suite R&D → Spec → Plan
**Phase:** Brainstorm complete; implementation NOT started
**Context:** Decided to build a full social-management suite (Sprout/Agorapulse-class) on top of the dashboard's creative moat. Brainstormed + spec'd + planned **Slice 1: Organic Publishing + Calendar**. Ready to execute.

---

## TL;DR for the next session

1. Read this file, then read the **spec** `docs/superpowers/specs/2026-06-01-social-publishing-design.md` and the **plan** `docs/superpowers/plans/2026-06-01-social-publishing.md`.
2. The plan is a **port-and-adapt** from the sibling app `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` (read-only reference — it already has a full social publishing system).
3. **Open decision before coding:** execution mode (subagent-driven vs inline) + run it in an **isolated git worktree off `origin/main`**.
4. Then execute the plan Phase A → J with `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

---

## Session Accomplishments

- **R&D via Kimi browser (claude-in-chrome):** walked the local `/agency/ad-publish` (a working 5-step Meta paid wizard fed by Banner Studio), then **Agorapulse** (Inbox/Publishing/Listening/Reporting/ROI; no native creative) and **Sprout Social** + its **help-center taxonomy** (12 networks; pillars: Engagement, Publishing, Analytics+Premium, Listening, Tagging, AI&Automation, Influencer, Employee Advocacy, Cases/Help-desk, Social Commerce, Reviews).
- **Web R&D:** paid-ads automation landscape (Smartly/Madgicx/AdCreative) vs social-management — confirmed nobody owns creative→approve→publish(organic+paid)→measure→ROI end-to-end.
- **Discovered the sibling app** `promotion-knoxgwmhaval` already contains ~most of the Publishing slice (6 providers, post lifecycle, queue, slot-schedule, optimal-times, AI planner/packs, A/B experiments, approvals, analytics, calendar UI, + `social/conversations` inbox). This reframed the build as **port-and-adapt**.
- **Wrote + committed the design spec** (`80e9ab2e`) and the **implementation plan** (`d865d6d6`).
- Used the brainstorming visual companion to validate the IA (calendar-hub + Compose route).

---

## Decisions Made

| Decision | Rationale | Impact |
|---|---|---|
| Build the **full social suite**, decomposed into 4 slices | Market gap + leverages owned moat (Banner Studio, CRM, GA4/attribution) | Multi-slice roadmap |
| Build order: **1 Publishing → 2 Inbox → 3 Reporting → 4 Listening** | Publishing = most reuse + most differentiated; Listening = most external cost, deferred | Slice 1 is the active spec/plan |
| **Port-and-adapt** from `promotion-knoxgwmhaval` (not greenfield) | Sibling already has a clean, working system; ~halves the build | Plan is structured as ports + 3 adaptations |
| 3 adaptations on every ported file | shadcn/reka-ui/unocss → **Nuxt UI v4**; drizzle/kysely → **`db.ts` raw SQL**; dealer/better-auth → **client-scope + requireAuth/RBAC** | Applied per-task |
| IA = **calendar hub + deep-linkable Compose route** (Option A) | Matches Sprout/Agorapulse + the sibling's proven structure | `/agency/social` section, 7 views |
| **Generalize ad-publish into one Composer** (paid = future mode) | Avoid duplicate creative→publish UX | But v1 = **organic-first**; ad-publish stays standalone, paid folds in later |
| v1 networks = **all 6 ported** (FB, IG, LinkedIn, TikTok, YouTube, Google Business) | Providers already exist | X/Threads/Pinterest named as fast-follow |
| Approvals = **internal first** | Fastest; client-portal approval is fast-follow | Ported approval workflow + notifications |
| Add **`platform_overrides JSONB`** (per-network customization) + **`tags TEXT[]`** vs sibling schema | Closes the only real design gap vs Sprout ("Customize Post per Network"); tags are cross-cutting | New columns in `social_posts` |
| Keep new `social_accounts` (publish tokens) **separate** from existing `social_connections` (spend tokens) | Different object/scope (page vs ad-account) | Cross-ref by `client_id` only |
| Dispatcher = `x-cron-secret` endpoint + **companion Worker** | Cloudflare Pages has no `scheduled()` handler (project constraint) | `workers/social-dispatch-cron` |

---

## Gap Analysis with Decisions (vs Sprout)

### Per-network post customization
**Status:** CREATE (folded into v1) — `platform_overrides JSONB`. **Reference:** spec §5, plan C1.

### Tagging
**Status:** CREATE (lightweight) — `tags TEXT[]` now; reporting that consumes them deferred to slice #3.

### Reviews management (Google/FB/Yelp)
**Status:** DEFER → **Inbox slice (#2)** scope. The one accidental omission, now placed.

### Influencer marketing / Employee advocacy / Social commerce / Cases-Helpdesk / Bots
**Status:** INTENTIONAL CUT — separate products Sprout acquired; named under spec §3 "Out of scope (decided)".

### Native mobile app
**Status:** INTENTIONAL CUT — PWA covers approvals-on-the-go.

### Deep social listening
**Status:** DEFER → slice #4 (highest external-data cost, most commoditized).

### AI planner (week generation)
**Status:** CONDITIONAL — port if Groq-wired; else ship a slots/suggested-times stub (plan H2 Step 5).

---

## Open Questions (resolve at execution)

1. **Execution mode:** subagent-driven vs inline. (⚠️ project memory: subagent *file writes* have been denied here before — may need inline-implement + subagent-review.)
2. **Worktree:** strongly recommended — `git worktree add --detach <dir> origin/main`, then give it its OWN `node_modules` (`rm` symlink → `pnpm install`) to avoid the shared-cache prerender bug noted in project memory.
3. **Migration numbers:** plan assumes 144–148; target branch is at 139 but other branches reached 143 — verify the true max at execution and shift if needed (plan Pre-flight).
4. **Token-refresh cadence** per network (some short-lived) — spec §10.
5. **Which sibling AI endpoints** depend on models not configured here — rewire to Groq/Workers AI.
6. **Confirm `PERMISSIONS` export path** and `queryRows` export in `db.ts` (plan Pre-flight).

---

## Reference Files for Next Session

```
@docs/superpowers/specs/2026-06-01-social-publishing-design.md   # the spec
@docs/superpowers/plans/2026-06-01-social-publishing.md          # the plan (execute this)
@/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval     # PORT SOURCE (read-only, sibling app)
  └ server/utils/social-providers/**                              # provider layer to port
  └ server/api/admin/social-marketing/**                          # endpoints to port
  └ server/api/_cron/publish-social-posts.post.ts                 # dispatcher to port
  └ pages/admin/social-marketing/**  components/admin/ContentCalendar.vue  # UI to port+re-skin
@app/pages/agency/ad-publish.vue                                 # existing paid wizard (stays standalone)
@app/components/ad-publish/BulkCreativePicker.vue                # reuse: Banner Studio picker
@app/components/ad-preview/{MetaFeed,MetaStory,TikTok,LinkedIn}Preview.vue  # reuse: previews
@server/utils/db.ts  @server/utils/auth.ts  @server/utils/permissions.ts   # dashboard helpers
@workers/meta-status-cron/                                       # companion-worker template to clone
```

---

## Prioritized Next Actions

| Priority | Action | Effort |
|---|---|---|
| 1 | Decide execution mode + create worktree off `origin/main` with own node_modules | 10 min |
| 2 | Plan Pre-flight (verify migration numbers, db.ts helpers, PERMISSIONS) | 10 min |
| 3 | Execute **Phase A** (migrations 144–146, run against Neon) | ~1 hr |
| 4 | Execute **Phase B–C** (providers + publish core) — the highest-reuse, highest-value layer | ~half day |
| 5 | Execute **Phase D–F** (accounts/OAuth, posts API, dispatcher + worker, queue/approvals) | ~1–2 days |
| 6 | Execute **Phase G–H** (composer + calendar + views) — invoke `frontend-design` skill for forms | ~2–3 days |
| 7 | Execute **Phase I–J** (nav, marketing sync, verify, release runbook) | ~half day |

---

## State Summary

**Current:** Brainstorm + spec + plan COMPLETE and committed on branch `feat/crm-custom-objects-engine` (commits `80e9ab2e`, `d865d6d6`). No implementation code written yet.
**Caveat:** This spec/plan is unrelated to the `crm-custom-objects-engine` branch it's committed on — consider moving execution to a dedicated branch/worktree.
**Next:** Start a fresh session, read this handoff + the plan, decide execution mode, then execute Phase A.
**Resume:** `/paul:resume` then read `.paul/HANDOFF-2026-06-01-social-publishing.md`.

---

*Handoff created: 2026-06-01 14:05*
