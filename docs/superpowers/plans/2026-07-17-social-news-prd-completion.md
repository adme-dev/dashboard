# Implementation Plan: Social News Publishing PRD Completion

## Objective

Finish the remaining work in `docs/specs/social-news-client-intelligence.md`, then prove the MCP news-to-publishing workflow in production without bypassing client scoping, approvals, or XeroFlow governance.

## Task list

### Phase 1 — Source provenance and feedback

- [ ] **Task 1: Add news publishing feedback events**
  - Record client, source story, post, actor, platform, and event type for selection, dismissal, rewrite, approval, publish, failure, and aggregate performance updates.
  - Keep events append-only and permission-checked; do not mutate immutable source stories.
  - **Verify:** migration, route-contract, provenance, and client-isolation tests.
  - **Depends on:** existing news/post provenance contracts.

- [ ] **Task 2: Connect feedback to ranking/reporting**
  - Expose feedback counts and outcomes to the client-scoped recommendation tool and reporting views without granting autonomous publishing authority.
  - **Verify:** recommendation fallback tests, reporting query tests, and regression suite.
  - **Depends on:** Task 1.

### Checkpoint A — Feedback foundation

- [ ] Focused social-news tests pass.
- [ ] Typecheck passes.
- [ ] Cross-client and approval-gate tests pass.

### Phase 2 — Commercial governance rollout

- [ ] **Task 3: Apply governance/package migrations through CI**
  - Confirm migration ordering, deploy the package/version, commercial-scope, usage, and SLA schema to the production database, and record the migration IDs.
  - **Verify:** CI migration job succeeds and production schema audit matches expected tables/columns/indexes.
  - **Depends on:** none; must precede production package setup.

- [ ] **Task 4: Configure a pilot client package**
  - With confirmed commercial inputs, assign one versioned industry package to a pilot client, snapshot overrides, link existing XeroFlow commercial records, and set volume, budget, AI allowance, SLA, and overage policy.
  - **Verify:** authenticated browser check plus API/database assertions for snapshot immutability and client isolation.
  - **Depends on:** Task 3.

- [ ] **Task 5: Verify package usage and evidence capture in production**
  - Create or import approved client evidence, confirm pending Monday/Slack evidence cannot instruct recommendations, and validate included-versus-used/forecast-overage reporting.
  - **Verify:** production evidence review, package usage report, and audit-log checks.
  - **Depends on:** Task 4.

### Checkpoint B — Governance production proof

- [ ] Pilot package is visible in the client profile.
- [ ] Budget/volume/SLA controls affect draft creation as expected.
- [ ] No Monday/Slack item influences AI before approval.

### Phase 3 — End-to-end production UAT

- [ ] **Task 6: Seed a controlled pilot news story**
  - Use the configured MCP source or an approved test fixture so the pilot client has one selectable story; preserve source URL and immutable provenance.
  - **Verify:** source ingestion and client-filtered inbox show the story.
  - **Depends on:** Tasks 3–4.

- [ ] **Task 7: Run the complete authenticated UAT flow**
  - Select client → filter/relevance explanation → choose story → optional per-platform AI rewrite → choose account/platform → choose draft/exact/next-slot → create approval-safe draft → inspect Compose/Approvals → approve only if authorised → verify analytics/provenance.
  - **Verify:** browser evidence, post metadata, account target scope, approval state, and analytics row.
  - **Depends on:** Task 6.

- [ ] **Task 8: Release closeout and operational handoff**
  - Run full tests, typecheck, build, CI/deploy verification, production smoke checks, and document rollback/operations notes and remaining later enhancements.
  - **Verify:** `pnpm run test:social-publishing`, `pnpm run typecheck`, `pnpm run build`, successful CI deploy, and updated handoff.
  - **Depends on:** Tasks 1–7.

## Definition of done

- [ ] Every unchecked acceptance item in the client-intelligent News Inbox plan is closed or explicitly deferred with an owner and reason.
- [ ] Production UAT proves a real story can become an approval-safe, client-scoped, platform-specific draft.
- [ ] Feedback, package usage, evidence provenance, and analytics are auditable.
- [ ] No automatic publishing, cross-client leakage, or unreviewed external evidence is introduced.

## Deferred enhancements

Learning relevance weights, campaign frequency caps, statistically trained per-account timing, and broader enterprise-overhaul items (drag calendar, bulk CSV scheduling, and advanced AI workflows) remain separate follow-up work unless explicitly promoted into this goal.
