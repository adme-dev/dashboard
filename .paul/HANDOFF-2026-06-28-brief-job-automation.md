# PAUL Session Handoff

**Session:** 2026-06-28
**Context:** Brief→job automation: Monday job-types audit, dealer-feeds plugin (P1a built), brief→job conversion gaps + P0/P1 built, structured budget model + target operating flow + per-role AI assistant vision.
**⚠️ Everything below is committed LOCALLY across several branches — NOTHING pushed. Pushing needs the `adme-dev` gh account (Paul008 → 403).**

---

## Session Accomplishments

**1. Monday "Items to Action" audit + brief→Monday campaign mapping** — branch `feat/brief-monday-campaign-mapping` (`7b3e5c6e`, pushed earlier this session)
- Audited Marketing board (13392458) "Items to Action": 4 real job types (Meta AIA Traffic/Leads, Google PMax Inventory, Meta Leads) — all already have brief templates.
- Built `server/utils/briefCampaignType.ts` (brief template+objective → Monday Campaign Type code) + `meta-aia` Video Card ad-format + lead-qualifying-questions. **Migration 205 applied live.** 10 tests.

**2. Automotive dealer-feeds plugin** — branch `docs/dealer-feeds-plugin-rnd` (not pushed)
- R&D + design spec + **P1a XeroFlow foundation BUILT & VERIFIED**: `server/utils/feeds/` (FeedProvider contract, service-auth REST client, social-dashboard provider, dealer-link mapping, config/flag). **Migration 206 applied live.** 23 unit tests; opus whole-branch review (0 crit); real-DB battle test 20/20.
- social-dashboard = SEPARATE repo `/Users/paulgiurin/Documents/GitHub/social-dashboard` (Vehicle Feed Platform, Nuxt3/Supabase/CF Pages, has MCP server). Flag `DEALER_FEEDS_ENABLED=off`. P1b (SD-side)/P2/P3/P4 NOT built.

**3. Brief→job conversion: gaps + P0/P1 built** — branch `docs/brief-to-job-workflow-gaps` (not pushed, commits `bdb95821..3838be7c`)
- Traced the brief→job→assignment→sidebar flow; produced **gap register G1–G11 + action plan**.
- Built **P0** (mig 207 `template_tasks.default_assignee_id` + schema reconcile) + **P1** (assignment resolvers + wired `briefConversion.ts`: project PM = brief owner, every task gets department_id + status_id + deterministic assignee, dedup notify). 10 resolver unit tests; opus review; real-DB battle test 10/10.
- **MADE CONVERSION WORK FOR THE FIRST TIME:** battle test found a pre-existing bug — `brief_activities.activity_type='converted'` violated a CHECK (only `converted_to_project` allowed) → every conversion had been silently rolling back (proof: brief_activities empty, 0 briefs ever converted). Opus review then caught converted tasks omitted `department_id` AND `status_id` (board queries INNER JOIN both) → invisible. All fixed + verified.

**4. Vision specs (the "PRD"):**
- `docs/superpowers/research/2026-06-28-brief-to-job-workflow-gaps.md` — gap register + phased action plan (P0→P5).
- `docs/superpowers/plans/2026-06-28-brief-to-job-p0-p1.md` — the executed P0/P1 task list.
- `docs/superpowers/specs/2026-06-28-structured-job-budget-model.md` — per-channel typed budget allocations (grounded in the Geelong Kia Slack confusion: pulse 11922482657).
- `docs/superpowers/specs/2026-06-28-target-operating-flow.md` — AM-initiated auto-setup → AI/MCP-assisted → human-executed; + per-role AI assistant layer.

---

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Operating model: manual→automation, **AI proposes / human confirms**; humans still create live ad campaigns | Platform's existing safety pattern; never autonomous spend/platform writes | Frames every fix as assisted-automation with a human gate |
| Brief→job Q1: manual assignment stays baseline; auto-assign is AI-proposed/human-confirmed | Legacy must keep working; never guess a person | P1 resolver = deterministic-or-unassigned |
| Brief→job Q2: **revive `field_mapping`** | Carry brief data into the job (automation direction) | P2 scope |
| Brief→job Q3: budget/deadline owned by **accounts manager via budget tracker** — surface, never overwrite | AM owns these | P2 surfaces brief numbers for AM approval |
| Brief→job Q4: brief auto-complete = **AI alert + human confirm** | Human-in-loop | P4 |
| Dealer feeds: Approach C (hybrid + plugin registry), **REST internal hop + SD MCP parity**, scope=all 4 consumers, onboarding deferred, new `FEEDS` perm, 6h+event sync | Honors MCP for chat, robust for batch | P1a built on this |
| Budget = **typed per-channel allocations** {campaignType, platform, amount, period(monthly/total), month, state} summing to total + change log | Kills the $600-vs-$700-lifetime + SEM/PMax/brand confusion | The P2 budget design |
| Per-employee, per-role AI assistants mapped role→persona→tool/knowledge-scope + learning loop | Make the flow personal & self-improving | New layer (scaffolding exists) |

---

## Gap Analysis with Decisions

Full register in `@docs/superpowers/research/2026-06-28-brief-to-job-workflow-gaps.md`. Headlines:
- **G1/G2/G7/G11 (assignment + board visibility): FIXED in P1** — tasks now get department + status + deterministic assignee; PM = brief owner.
- **Pre-existing conversion-breaking bug: FIXED** (activity_type).
- **G3 field_mapping (DEFER→P2, revive), G4 deadline/budget (DEFER→P2, surface to AM), G5 notify (partial done), G6 status alert (DEFER→P4), G9 UI rollup (DEFER→P5), G10 swallowed failures (DEFER→P3).**
- Deferred from P1: workspace-scoped fallback department (latent if single-workspace).

---

## Open Questions

1. **Merge order** for the 3 unmerged branches (brief-mapping, dealer-feeds, brief→job) — migrations 205/206/207 reserved across them; collision risk at merge.
2. **AM intake surface** — existing brief form, a lighter "AM request" entry, or conversational/AI intake that drafts the brief?
3. **"Industry standard" checklist** — encode as the gatekeeper's required-field/sanity contract (channel split, typed budget, disclaimers, deadline)?
4. **Budget spec:** allocation granularity (campaign-type only vs ×brand/conquesting intent); monthly-vs-lifetime prevalence; source-of-truth during Monday transition.
5. **Per-role assistants:** formalise role→persona→tool/knowledge map as a data model? Learning feedback signal = human confirm/edit, outcome metrics, or both?
6. **Dealer feeds:** build P1b (social-dashboard repo) next?

---

## Reference Files for Next Session

```
@docs/superpowers/specs/2026-06-28-target-operating-flow.md          ← the north-star PRD
@docs/superpowers/specs/2026-06-28-structured-job-budget-model.md    ← P2 budget design
@docs/superpowers/research/2026-06-28-brief-to-job-workflow-gaps.md  ← gap register + action plan
@docs/superpowers/plans/2026-06-28-brief-to-job-p0-p1.md             ← executed P0/P1 task list
@docs/superpowers/specs/2026-06-28-automotive-dealer-feeds-plugin-design.md
@docs/superpowers/plans/2026-06-28-dealer-feeds-p1a-xeroflow-foundation.md
@server/utils/briefConversion.ts  @server/utils/briefConversion/assignment.ts
@server/utils/briefCampaignType.ts  @server/utils/feeds/
```
Memory: `brief-to-job-workflow-gaps.md`, `dealer-feeds-plugin-rnd.md`, `monday-job-types-rnd.md` (in the project memory dir).

---

## Prioritized Next Actions

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Decide merge order + push the 3 branches (needs `adme-dev` gh acct) | S |
| 2 | Answer P2 open Qs (AM intake surface, industry-standard checklist, budget granularity) | discussion |
| 3 | Plan + build **P2**: structured budget model + revive `field_mapping` + deadline surfacing, fronted by AM intake | L |
| 4 | Dealer feeds **P1b** (social-dashboard repo: serviceAuth + search_inventory + create_feed/MCP parity) | M |
| 5 | Later phases: brief→job P3 (notify/failures), P4 (status alert), P5 (UI rollup); per-role assistant data model | — |

---

## State Summary

**Current:** all session work committed locally on 3 feature branches + `.paul`/docs; nothing pushed; migrations 205/206/207 applied to live Neon. Brief→job conversion now functional for the first time (flag-free; safe — 0 briefs existed). Dealer feeds flag-off.
**Next:** decide merge order, then P2 (structured budget + AM intake).
**Resume:** `/paul:resume` → read this handoff. Verify branch state with `git branch` + `git log --oneline -15`.

---

*Handoff created: 2026-06-28*
