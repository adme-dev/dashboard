# Implementation Plan: Client-intelligent News Inbox

## Architecture decisions

- Store one durable social content profile per client; optional brief provenance avoids coupling live recommendations to arbitrary historical brief fields.
- Compute explainable relevance on read for V1. With a small feed and only configured clients, this avoids a premature client-by-story join table.
- Reuse the existing social post, account, slot, platform override, and approval contracts.
- Keep selection human-led. AI rewrites selected items but does not autonomously publish or choose client accounts.

## Phase 1: Client relevance vertical slice

- [x] Add the client content-profile schema and validated profile API.
  - Acceptance: an authorized creative can read a profile; an admin can save one; cross-client access is rejected.
  - Verify: focused profile API and normalization tests.
  - Files: migration, profile route, profile utility, tests.
- [x] Add deterministic relevance and inbox filters.
  - Acceptance: client/topic/make/source/query filters work; matches include a score and reasons; exclusions are respected.
  - Verify: scoring unit tests and inbox route contract tests.
  - Files: relevance utility, inbox route, tests.
- [x] Add client-first profile and filter controls to News Inbox.
  - Acceptance: selecting a client loads its profile/accounts and visibly ranks matching stories.
  - Verify: typecheck and authenticated browser inspection.

### Checkpoint: relevance

- [x] Focused tests pass.
- [x] Existing clients without a content profile still see the unfiltered inbox.
- [x] No source item is modified by filtering or scoring.

## Phase 2: Brief-aware creation vertical slice

- [x] Enrich AI rewrite prompts with the selected client profile.
  - Acceptance: each platform override uses audience, voice, pillars, and instructions; prompt-injection delimiters remain present.
  - Verify: prompt and draft endpoint tests.
- [x] Add next-slot scheduling and explicit workflow choice.
  - Acceptance: users can choose draft, exact time, or next saved client slot; approval-required profiles create an approval-safe result.
  - Verify: slot calculation tests plus post-row assertions.
- [x] Improve Compose handoff.
  - Acceptance: created posts retain story provenance, relevance reasons, and source link and are editable per platform.
  - Verify: social publishing regression and browser flow.

### Checkpoint: publishing workflow

- [x] `pnpm run test:social-publishing` passes.
- [x] `pnpm run typecheck` passes for the first release.
- [x] No cross-client account target can be submitted.

## Phase 3: AI intelligence and commercial packages

- [x] Add client-scoped social knowledge indexing and a dedicated AI recommendation tool.
  - Acceptance: the assistant can recommend what/client/account/audience/time with evidence; client scope and social permissions are enforced; generic SOP search cannot surface these vectors.
  - Verify: embedding metadata, tool ACL, cross-client isolation, and recommendation fallback tests.
- [ ] Add publishing feedback signals for future ranking.
  - Acceptance: selection, dismissal, rewrite, approval, publish, and aggregate performance can be tied back to the source item and client.
  - Verify: provenance and event-contract tests.
- [x] Add versioned industry content packages linked to existing commercial budgets.
  - Acceptance: a package can seed a client profile; client overrides are preserved; included post volumes and spend/allowance usage are reported from existing post and finance records.
  - Verify: package-version snapshot, budget-reference, usage-counting, and cross-client isolation tests.
- [x] Add governed client evidence and make XeroFlow authoritative.
  - Acceptance: approved XeroFlow evidence can inform recommendations; imported Monday/Slack discussions remain pending until reviewed; approved evidence is client-scoped and indexed.
  - Verify: authority normalization, route permissions, cross-client ownership, and embedding input tests.

## Phase 4: Production proof

- [x] Apply the client-profile migration and deploy through existing CI.
- [ ] Apply the governance/package migration and deploy through existing CI.
- [ ] Configure one pilot client content profile/package after commercial inputs are confirmed.
- [x] Verify authenticated production client/profile/news reads and the client-first filtering controls.
- [ ] Verify package assignment and evidence capture in production without creating an arbitrary client package.
- [ ] Record the feature and operational decisions in the handoff.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generic briefs contain inconsistent field keys | Wrong client context | Save a reviewed durable profile; make brief import a later explicit action |
| One caption is invalid for another network | Publish failure or poor copy | Generate and retain per-platform overrides |
| AI repeats unsupported claims | Brand/compliance risk | Ground in immutable source, preserve attribution, require human review |
| Scheduled content misses approval | Unapproved publish or stale post | Existing approval gate blocks publish; do not auto-shift expired content |
| Broad keywords create noisy relevance | Low trust | Explain every match and support exclusions/manual all-stories view |
