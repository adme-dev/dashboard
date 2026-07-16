# Implementation Plan: Client-intelligent News Inbox

## Architecture decisions

- Store one durable social content profile per client; optional brief provenance avoids coupling live recommendations to arbitrary historical brief fields.
- Compute explainable relevance on read for V1. With a small feed and only configured clients, this avoids a premature client-by-story join table.
- Reuse the existing social post, account, slot, platform override, and approval contracts.
- Keep selection human-led. AI rewrites selected items but does not autonomously publish or choose client accounts.

## Phase 1: Client relevance vertical slice

- [ ] Add the client content-profile schema and validated profile API.
  - Acceptance: an authorized creative can read a profile; an admin can save one; cross-client access is rejected.
  - Verify: focused profile API and normalization tests.
  - Files: migration, profile route, profile utility, tests.
- [ ] Add deterministic relevance and inbox filters.
  - Acceptance: client/topic/make/source/query filters work; matches include a score and reasons; exclusions are respected.
  - Verify: scoring unit tests and inbox route contract tests.
  - Files: relevance utility, inbox route, tests.
- [ ] Add client-first profile and filter controls to News Inbox.
  - Acceptance: selecting a client loads its profile/accounts and visibly ranks matching stories.
  - Verify: typecheck and authenticated browser inspection.

### Checkpoint: relevance

- [ ] Focused tests pass.
- [ ] Existing clients without a content profile still see the unfiltered inbox.
- [ ] No source item is modified by filtering or scoring.

## Phase 2: Brief-aware creation vertical slice

- [ ] Enrich AI rewrite prompts with the selected client profile.
  - Acceptance: each platform override uses audience, voice, pillars, and instructions; prompt-injection delimiters remain present.
  - Verify: prompt and draft endpoint tests.
- [ ] Add next-slot scheduling and explicit workflow choice.
  - Acceptance: users can choose draft, exact time, or next saved client slot; approval-required profiles create an approval-safe result.
  - Verify: slot calculation tests plus post-row assertions.
- [ ] Improve Compose handoff.
  - Acceptance: created posts retain story provenance, relevance reasons, and source link and are editable per platform.
  - Verify: social publishing regression and browser flow.

### Checkpoint: publishing workflow

- [ ] `pnpm run test:social-publishing` passes.
- [ ] `pnpm run typecheck` passes.
- [ ] No cross-client account target can be submitted.

## Phase 3: AI intelligence and commercial packages

- [ ] Add client-scoped social knowledge indexing and a dedicated AI recommendation tool.
  - Acceptance: the assistant can recommend what/client/account/audience/time with evidence; client scope and social permissions are enforced; generic SOP search cannot surface these vectors.
  - Verify: embedding metadata, tool ACL, cross-client isolation, and recommendation fallback tests.
- [ ] Add publishing feedback signals for future ranking.
  - Acceptance: selection, dismissal, rewrite, approval, publish, and aggregate performance can be tied back to the source item and client.
  - Verify: provenance and event-contract tests.
- [ ] Add versioned industry content packages linked to existing commercial budgets.
  - Acceptance: a package can seed a client profile; client overrides are preserved; included post volumes and spend/allowance usage are reported from existing post and finance records.
  - Verify: package-version snapshot, budget-reference, usage-counting, and cross-client isolation tests.

## Phase 4: Production proof

- [ ] Apply migration and deploy through existing CI.
- [ ] Configure one pilot client content profile.
- [ ] Verify client filtering, AI rewrite, draft creation, approval state, and scheduling in production.
- [ ] Record the feature and operational decisions in the handoff.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generic briefs contain inconsistent field keys | Wrong client context | Save a reviewed durable profile; make brief import a later explicit action |
| One caption is invalid for another network | Publish failure or poor copy | Generate and retain per-platform overrides |
| AI repeats unsupported claims | Brand/compliance risk | Ground in immutable source, preserve attribution, require human review |
| Scheduled content misses approval | Unapproved publish or stale post | Existing approval gate blocks publish; do not auto-shift expired content |
| Broad keywords create noisy relevance | Low trust | Explain every match and support exclusions/manual all-stories view |
