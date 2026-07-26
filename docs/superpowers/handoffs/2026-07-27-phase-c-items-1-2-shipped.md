# Handoff — Phase C items 1 & 2 shipped, items 3 & 4 next

Date: 2026-07-27. Session ran long (context ~68%+); continue in a fresh session.

## Where things stand right now

`origin/main` HEAD: `4cca5ca8` ("feat(persona): wire hot/warm/cold intent tiers into live audience export", PR #308, merged). This session started from the handoff at `docs/superpowers/handoffs/2026-07-26-phase-b-shipped-phase-c-next.md` (now stale/superseded — that work is done), which identified 4 Phase C (ad-spend efficiency) candidate items: intent-tier scoring, exclusion audiences, conversion value passing, micro-conversions to GA4/Google Ads.

### 1. Conversion value passing (Phase C item 1) — SHIPPED

PR #307, merged. Meta CAPI and Google Data Manager delivery were binary-only ("this happened") with no monetary value. Now `lead_won` opportunity transitions with a real `crm_opportunities.amount` pass that value through to both providers, unlocking value-based bidding. Design: `docs/superpowers/specs/2026-07-26-phase-c-conversion-value-passing-design.md`. Plan: `docs/superpowers/plans/2026-07-26-phase-c-conversion-value-passing.md`.

**Migration 310 has been run against the production database** (verified: `value`/`currency_code` columns exist on `conversion_events`, CHECK constraint validated). This item is fully live, not just merged.

Deliberately deferred (see design doc's Scope section): `$0` on `lead_lost`, historical backfill, per-client currency config, the plain leads-status path (no linked opportunity).

### 2. Intent-tier scoring (Phase C item 2) — SHIPPED

PR #308, merged. Persona/cohort scoring (`cohorts.ts`) was preview-only — the live Meta/Google Customer Match export path (`audienceSync.ts`'s `loadEligibleMembers`) never consulted it, selecting audience members purely by attribution filters. This closes that gap: 3 new ranked persona definitions (Hot/Warm/Cold, built from Phase B's tracking signals plus existing intent signals) reuse the existing `scorePersonaDefinition` engine; a nightly cron job (`/api/cron/persona-tier-recompute`, wired into `workers/pages-cron`) resolves each identified profile's single highest-qualifying tier from the last 30 days of signals into a new `crm_persona_tier_memberships` table; `loadEligibleMembers` now joins against it as a real filter. Design: `docs/superpowers/specs/2026-07-27-phase-c-intent-tier-scoring-design.md`. Plan: `docs/superpowers/plans/2026-07-27-phase-c-intent-tier-scoring.md`.

**Migration 311 has NOT been run against the production database yet.** This is the very next thing to do once a fresh session starts, and it's urgent: the app code assumes the columns/table already exist, and there's no auto-migration runner in this repo, so deploying/running the cron job before the migration lands would break things. Ask the user for go-ahead, then:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/311_persona_intent_tiers.sql
```

**Final-review saved this from shipping broken**: the original implementation had the tier filter completely unreachable in production — the only API endpoint that creates activation requests (`server/api/agency/analytics/personas/activations.post.ts`) used a strict Zod schema that silently rejected the new `tierKey` field. Fixed and tested end-to-end through the real schema before merge. Also fixed in the same final-review wave: tier personas were leaking into the client-facing cohort preview page (excluded via `tier_rank IS NULL`, per explicit product decision — tiers are export-only, not a preview feature), an unbounded per-profile INSERT loop in the nightly job (converted to one set-based bulk insert via `jsonb_to_recordset`), and per-client recompute failures that were silently swallowed (now logged + surfaced in the cron endpoint's response).

Deliberately deferred (see design doc's Scope section): numeric-threshold signals (VDP dwell time — the engine only does binary signal presence), exclusion audiences (item 3 below), live/on-demand tier computation (nightly-only), retrofitting `getPersonaMetrics` to understand tiers (a separate, tier-count query was added instead), any UI for creating tier-filtered activation requests (this whole feature is still API-only — no Vue component exists yet for creating persona activation requests at all).

**Not yet verified**: no real client has had the nightly recompute job run against them yet (migration hasn't landed). First things to check in the new session, after the migration runs: does `/api/cron/persona-tier-recompute` populate `crm_persona_tier_memberships` for a real client, and does a tier-filtered activation request through the real API produce a non-zero estimated size.

## My recommendation for what's next

**Phase C item 3 (exclusion audiences)** is the natural next step — it's explicitly related to intent-tier scoring's infrastructure (both build on the persona/signal-ledger system), and the handoff that started this session named it: "exclusion audiences from negative signals (bounce <3s, `competitive_referrer` click — already collected, currently unused for exclusion)." Two things worth knowing before brainstorming it:
- `crm_persona_definitions.negative_signals` exists in the schema today but is only used to *disqualify* a subject from a positive cohort — it's never exported as its own "exclude these people" audience. Building real exclusion audiences is a genuinely new capability, not just flipping a flag.
- The persona/audience export plumbing this session built out (`audienceSync.ts`'s `loadEligibleMembers`, the tier-membership table pattern) is a strong template to follow — an exclusion audience will likely need its own membership-table-and-join shape, analogous to what tiers just got.

**Phase C item 4 (micro-conversions to GA4/Google Ads)** remains the least-scoped item — no existing code to anchor on, would need real brainstorming from scratch about what counts as a micro-conversion and which delivery pipeline (the same Data Manager path items 1/2 touch, or GA4 Measurement Protocol separately).

Start whichever one the user picks the same way both prior items started: **brainstorming skill first**, not straight to a plan — both items 1 and 2 this session surfaced real architectural gaps during brainstorming (the disconnected preview/export split for item 2; the missing value-source wiring for item 1) that weren't obvious from the handoff's one-line framing alone.

## Key facts for the new session

- **This handoff was committed from `/private/tmp/dashboard-podium-provider-identity`**, a separate clean worktree already on `main` — same location the prior session used for its handoff, for the same reason: the primary checkout at `/Users/paulgiurin/Documents/Projects/dashboard` has unrelated pre-existing uncommitted work on `release/send-scan-foundation`.
- **Start a fresh worktree** for Phase C item 3/4 work (`EnterWorktree` tool) — don't reuse this session's now-deleted `phase-c-ad-spend-efficiency` or `phase-c-intent-tier-scoring` worktrees.
- **`.env`/`.env.local` are not auto-symlinked into a fresh `EnterWorktree`-created worktree** — copy them manually: `cp /Users/paulgiurin/Documents/Projects/dashboard/.env <worktree>/.env` (and `.env.local`).
- **If `EnterWorktree` branches from a stale local `origin/main` ref** (check `git log origin/main --oneline -3` right after creating it — if it's missing this session's merges, `git fetch origin main` then `git reset --hard origin/main`, safe since nothing's committed yet on a fresh branch).
- **DB access**: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)`, then `psql "$DATABASE_URL"`.
- **Migrations**: author them, run the migration test, but do not run `psql` against the real database without explicit user go-ahead — established pattern held for both items this session (migration 310 got go-ahead and ran; migration 311 is still pending).
- **`gh` is authenticated as `adme-dev`** (not `Paul008`, which gets 403 on this repo).
- **`gh pr merge --delete-branch` fails locally** with `"main" is already used by worktree at ...` even though the merge succeeds via the API every time — verify with `gh pr view <N> --json state,mergedAt` after, then separately `git push origin --delete <branch>` since `--delete-branch` didn't run.
- **CI takes a few minutes on a PR** — `gh run watch <id> --exit-status` backgrounded is the efficient way to wait for it, not polling.
- **Subagent messaging quirk, confirmed again this session**: background `Agent`-tool subagents routinely send `idle_notification` pings with no content attached before their real report arrives — don't treat a bare idle notification as "nothing to report," the actual `agent-message`/`teammate-message` with content follows shortly after in a separate turn.
- **Full test-suite baseline this session (unchanged across both items)**: 20 pre-existing failing files / 39 failing tests, all unrelated to persona/measurement/CRM (email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts, actionPlanAi, financialInsightsAi, groqFeatureKeyCoverage). Compare against this exact list when verifying "no new failures," not just a count.
- **Both items this session were executed via subagent-driven-development** (5 TDD tasks each, task-scoped reviews, one final whole-branch review with a fix wave). This worked well — the final whole-branch review caught real cross-task integration bugs neither task-scoped review could see (item 2's Critical API-schema-rejection bug, in particular). Keep using it for items 3/4 if the user wants the same rigor.
