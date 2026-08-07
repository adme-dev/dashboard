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
- Draft tracking PR: `#379`.

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
- A read-only interactive Console inspection was attempted, but the local desktop
  automation runtime became unavailable before page state could be read. No Console
  action or configuration change occurred.
- Secret exposure: none.

## Dependency and test baseline

- Runtime: Node `24.18.0`.
- `pnpm install --frozen-lockfile`: passed; lockfile unchanged; Nuxt preparation passed.
- Focused baseline command covered Google Ads client, Google AI Max classifier/scanner/
  endpoint and inventory-feed audit contracts.
- Result: 5 test files passed; 33 tests passed; 0 failures.
- CTL-009 remains in progress only because the baseline must be refreshed after the
  concurrent PMax session merges and this branch rebases.

## Production Google credential inventory

**Checked:** 2026-08-07
**Method:** Read-only aggregate SQL transaction; no token, account, tenant or user
identifiers selected or emitted.

- Google connections: 108 active of 108 total.
- Shared encrypted credential profiles: one active profile.
- Profile-linked connections: 87; all 87 are manager-linked account mappings.
- Shared-profile grants: `adwords`, `content` and `datamanager` are present on the
  profile and its 87 linked connections.
- Legacy/unprofiled connections: 21.
- Merchant account identifiers in stored connection/profile metadata: zero.
- Merchant discovery implication: existing inventory audit discovers Merchant Center
  IDs dynamically from Google Ads `product_link` rows rather than a persisted Merchant
  topology.
- Metadata key names were inspected, but metadata values were not selected.

## Bounded Google Ads authorization proof

**Checked:** 2026-08-07
**Method:** Existing aggregate-only `scripts/audit-google-ai-max-live.ts`, limited to
one account; provider operation was read-only and emitted no identifiers.

- API version: v23.
- Sample selected the legacy fallback because local
  `REPO_TOKEN_ENCRYPTION_KEY` is not configured.
- Result: failed with Google Ads `USER_PERMISSION_DENIED` after bounded fallback;
  successful accounts: zero.
- The call proves the request reached Google Ads, but does **not** prove usable direct
  or MCC-child authorization and does not establish the developer-token access level.
- This is consistent with the existing five-account validation record in
  `docs/research/2026-08-google-ai-max-api-validation.md`; it is not a new success.
- No provider mutation occurred. Token/credential values were not printed.

## Cloudflare production secret prerequisites

**Checked:** 2026-08-07
**Method:** Read-only `wrangler pages secret list` against the immutable
`agency-dashboard` Pages project; secret names only.

- Production has encrypted entries for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_REDIRECT_URI` and
  `REPO_TOKEN_ENCRYPTION_KEY`.
- This confirms configuration presence only; values, project ownership, validity and
  Ads developer-token access level were not exposed or proven.
- The missing encryption key is local-operator-only, not an observed production
  configuration omission.
- No Cloudflare configuration was changed.

## Outstanding Phase 0 evidence

- Candidate Cloud project's numeric project number and enabled-service inventory.
- Google Ads developer-token owner/access level.
- A current direct-account grant or an approved retirement decision for the 21 legacy
  connections.
- A live MCC-child read through an authorized production/preview execution path that
  has `REPO_TOKEN_ENCRYPTION_KEY`.
- Merchant advanced-account/subaccount topology and registration approval.
- Merchant registration plus bounded read.
- Direct and manager/subaccount Ads/Merchant read comparison.
- Concurrent PMax merge and contract reconciliation.
- Post-PMax-rebase refresh of the currently passing Node/dependency/test baseline.
