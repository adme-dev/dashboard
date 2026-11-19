# Marketing Tracking Onboarding Implementation Plan

> Execute inline, as requested by the user, using executing-plans and test-driven-development.

**Goal:** Let marketing request first GTM mappings and follow an accessible onboarding skill.
**Architecture:** Extend binding proposals, use current authority and independent reviews, expose a scoped status/guide read and publish an additive skill seed.
**Tech Stack:** Nuxt/Nitro, TypeScript, Zod, PostgreSQL, Vitest.
**Spec:** docs/superpowers/specs/2026-11-19-marketing-tracking-onboarding-design.md

## Global Constraints
- No provider reads before initial mapping approval; independent ADMIN approval/execution for bootstrap.
- Preserve fresh grants, assignment, write scope, ownership evidence and native DriveAgent routing.
- No actual dealer configuration, test customer enquiries or permission grants.

## Review Focus
- Guessed foreign containers must not expose inventory or bind to another client.
- Concurrent binding must not be overwritten.
- Revoked requester/reviewer authority must fail before credentials.
- Guide/status reads must omit keys, scripts and unassigned sites.
- Skill seeding must preserve subsequent operator edits and survive replay.

### Task 1: Bounded first mapping
Files: gtmProposalSchemas.ts, gtmProposals.ts, googleTagManagerInstaller.ts, marketingTask4Postgres.test.ts.
- [x] Add SQL-boundary tests for initial mapping, no provider reads at request, self-review, wrong host, cross-client, revocation and concurrent binding.
- [x] Run against disposable local PostgreSQL; observe missing-feature failures.
- [x] Implement initialMapping binding request and ADMIN gate, provider host check and atomic insert-only mapping.
- [x] Run existing and new Task4 tests.

### Task 2: Onboarding guide/status and role skill
Files: new tracking/marketingOnboarding.ts; marketingTask4Names.ts; marketingTask4Tools.ts; roleSkills/definitions.ts; additive migration; onboarding and role tests.
- [x] Add tests for scoped safe status and tool catalog/write policy, skill migration replay and availability.
- [x] Observe failures, then implement read tool/guide and skill seed.
- [x] Apply migration automatically using the configured database without printing credentials; run disposable DB tests too.

### Task 3: Documentation and review
Files: staff and tracking runbooks; features/index.vue; features/[slug].vue; MarketingNav.vue.
- [x] Update onboarding instructions and existing public feature entries with accurate prerequisites and evidence boundaries.
- [ ] Record final broad-suite result and report failures outside changed paths separately. Focused tests and lint comparison are complete.
- [ ] Review every changed file and authorization boundary, commit and prepare a reviewable branch/PR. Record release and live staff acceptance separately.

## Execution evidence

- Existing Orca linked worktree reused; clean source began at freshly fetched origin/main f3234eabc.
- Baseline: 18 existing tests passed. New mapping tests first failed on unsupported initialMapping; implementation passed. New discovery/migration tests failed before source/seed existed, then passed.
- Independent source review identified first-mapping bypass, native transport write admission, no-op hold, generic publication/rollback verification, domain scope and superseded ownership concerns. Regression cases were observed failing and corrected.
- Focused final run: 11 suites, 130 tests passed, including 61 real PostgreSQL boundary/workflow cases, migration replay and native/MCP catalog parity. Google transport is mocked.
- Migration 518 applied automatically using the canonical checkout's existing .env (the linked worktree has no .env); the configured database returned revision 1, enabled New client tracking setup. No grants or provider settings changed.
- Broad pre-review test run was interrupted for a final-source restart. Final broad suite is running separately; its result must be recorded before closeout.
- New source/test modules pass ESLint. Modified legacy files retain baseline lint findings; rule-count comparison is recorded separately.
- No deployment, staff enrollment, employee-host acceptance, Google OAuth or live customer-event proof is claimed. Operator steps remain explicit in the guide.

Implementation decision: preserve human Google OAuth and site provisioning, add a local first-mapping request with admin authority, and deny unproven ordinary remaps/shared unrelated-domain containers. This keeps supported onboarding available without granting agency-wide provider discovery.
