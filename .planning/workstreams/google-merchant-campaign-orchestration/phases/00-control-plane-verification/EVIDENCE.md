# Phase 0 Evidence

## Planning isolation and tracker

**Date:** 2026-08-07

- Source baseline: pushed `main` commit `71b56065665b3dc5a71d619c8527344d26263dd8`.
- Isolated branch: `docs/google-merchant-orchestration`.
- Isolated worktree: `.worktrees/google-merchant-orchestration`.
- Root dirty worktree was not modified.
- Active GSD workstream: `google-merchant-campaign-orchestration`.
- GSD inventory: seven phases, Phase 0 in progress, Phases 1-6 pending.
- Executable register: 54 stable tasks.
- Canonical planning commit: `9cd0efdd`.

## Documentation verification

- `git diff --check`: passed.
- Task heading count: 54.
- Secret-pattern scan across workstream Markdown: no credential values detected.
- API boundaries and Cloudflare deployment assumptions reviewed against `AGENTS.md`.
- Concurrent PMax migrations/utilities are declared as a blocked dependency and were
  not modified.

## OAuth project observation

- Local `.env` contains a `GOOGLE_CLIENT_ID` in the expected Google OAuth client format.
- Sanitized numeric project prefix: `14351276985`.
- Candidate project ID from the supplied Console URL:
  `gen-lang-client-0818792107`.
- Candidate numeric project number: not yet obtained.
- Mapping verdict: **not proven**.
- Secret exposure: none.

## Dependency and test baseline

- Runtime: Node `24.18.0`.
- `pnpm install --frozen-lockfile`: passed; lockfile unchanged; Nuxt preparation passed.
- Focused baseline command covered Google Ads client, Google AI Max classifier/scanner/
  endpoint and inventory-feed audit contracts.
- Result: 5 test files passed; 33 tests passed; 0 failures.
- CTL-009 remains in progress only because the baseline must be refreshed after the
  concurrent PMax session merges and this branch rebases.

## Outstanding Phase 0 evidence

- Candidate Cloud project's numeric project number and enabled-service inventory.
- Google Ads developer-token owner/access level.
- Merchant advanced-account/subaccount topology and registration approval.
- Merchant registration plus bounded read.
- Direct and manager/subaccount Ads/Merchant read comparison.
- Concurrent PMax merge and contract reconciliation.
- Post-PMax-rebase refresh of the currently passing Node/dependency/test baseline.
