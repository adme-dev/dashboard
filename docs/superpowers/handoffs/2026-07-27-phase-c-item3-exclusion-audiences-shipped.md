# Handoff — Phase C item 3 (exclusion audiences) built, pending deploy

Date: 2026-07-27. Continues from `docs/superpowers/handoffs/2026-07-27-phase-c-items-1-2-shipped.md`, which named this item as the recommended next step after intent-tier scoring.

## What this branch built

Branch `worktree-phase-c-exclusion-audiences` (worktree at `.claude/worktrees/phase-c-exclusion-audiences`, based on `main` at `568e6fb5`) adds a standalone "exclude these people" audience export, closing the gap where `crm_persona_definitions.negative_signals` existed but was never exported to Meta/Google — only used to disqualify someone from a positive cohort in preview. Design: `docs/superpowers/specs/2026-07-27-phase-c-exclusion-audiences-design.md`. Plan: `docs/superpowers/plans/2026-07-27-phase-c-exclusion-audiences.md`. Built via subagent-driven-development, 6 tasks, all task reviews clean (2 needed one fix round each), final whole-branch review clean ("Ready to merge: Yes").

V1 scope: one blended exclusion list per client, built from `competitive_referrer` OR `exit_intent` (both already-tracked binary signals) in the trailing 30 days. Bounce-duration derivation was explicitly deferred — no exit/elapsed-time signal exists in `track.js` today, would need new instrumentation.

## Release ordering — read before deploying

**Migration 312 (this branch) and migration 311 (Phase C item 2, prior session) both need to be applied before or with this deploy.** Per the item 1/2 handoff, migration 311 had not been run against production as of that handoff (it may have landed since — check `crm_persona_tier_memberships`/`crm_persona_definitions.tier_rank` exist before assuming). Migration 312 is required by this branch's very first commit onward: `server/utils/persona/cohorts.ts`'s three definition queries (`activeDefinitions`, `activeTierDefinitions`, `activeExclusionDefinitions`) all reference `is_exclusion` in both SELECT and WHERE. **Merging and deploying this code before 312 lands breaks the client-facing cohort preview page and the nightly recompute cron, not just the new feature** — those queries 500 with `column "is_exclusion" does not exist`. Both migrations are additive/idempotent (`IF NOT EXISTS`/`WHERE NOT EXISTS` guards), same pattern as every other migration this Phase C effort has used — get explicit go-ahead, then:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/311_persona_intent_tiers.sql   # if not already applied
psql "$DATABASE_URL" -f server/database/migrations/312_persona_exclusion_audiences.sql
```

## What to expect on the first real run — this is not a bug

The deliverable exclusion audience is the intersection of: (`competitive_referrer` OR `exit_intent` in the last 30 days) ∩ marketing-consented ∩ identity-resolved to a person/lead with an email or phone ∩ not do-not-contact/do-not-email ∩ not in `crm_persona_current_suppressions`. That intersection will plausibly sit well under `minimumAudienceSize()`'s default floor of 1000 for most clients, producing `status: 'blocked'` on the very first activation-request attempt — expect this, don't read it as broken. The privacy floor is enforced twice (at request-creation size estimate, and again at sync time against the real post-consent member count) and must not be weakened without an explicit privacy decision — a fix-round in this branch already removed one accidental bypass of this exact floor.

Also worth knowing before anyone attaches this list in Ads Manager: because the list is consent-gated (correctly — you cannot upload hashed PII of non-consented individuals even to suppress them), it structurally omits some of the people most obviously worth excluding. This is legally correct, not a defect, but it's a real surprise if unstated.

## Known gap, not introduced by this branch: no UI

Neither this feature nor Phase C item 2 (intent-tier scoring) has a UI control. `app/components/analytics/PersonaActivationPanel.vue` builds activation-request filters from `startDate`/`endDate`/`platform`/`campaignId` only — no `tierKey` control, no `excludeAudience` control. Both are currently API-only; an account manager cannot invoke either without hand-crafting a POST request. This is one tracked follow-up (a filter-picker addition to the existing panel), not two.

## Deferred, non-blocking findings from review (see ledger for detail)

`.superpowers/sdd/2026-07-27-phase-c-exclusion-audiences/progress.md` in this worktree has the full per-task ledger. Nothing here blocks merge; noted for whoever touches this code next:
- `tierRecompute.ts`'s tier/exclusion resolution blocks are structurally similar (not verbatim) — extraction judged not worth it (would obscure more than it saves).
- No test exercises `tierKey` + `excludeAudience` simultaneously reaching `loadEligibleMembers` — the Zod `.refine()` in `activations.post.ts` is the actual upstream gate preventing this combination from ever reaching that layer, which is sufficient today since `createPersonaActivationRequest` has exactly one caller. If that ever changes, the `if/else if` in `loadEligibleMembers` silently prefers `tierKey` and drops the exclusion intent — worth a defensive throw at that point, not before.

## Recommendation for what's next

**Phase C item 4 (micro-conversions to GA4/Google Ads)** is the one remaining item from the original 4-item Phase C list, and is the least-scoped — no existing code to anchor on. Start it the same way items 1-3 started: brainstorming skill first, not straight to a plan.
