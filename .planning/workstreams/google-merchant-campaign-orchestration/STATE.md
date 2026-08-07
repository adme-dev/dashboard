---
workstream: google-merchant-campaign-orchestration
created: 2026-08-07
updated: 2026-08-07
status: active
current_phase: 0
---

# Project State

## Current position

**Status:** Planning baseline created; Phase 0 in progress
**Current phase:** Phase 0 — control-plane verification and dependency reconciliation
**Current task:** CTL-003 — verify Cloud project and OAuth-client ownership
**Progress:** 2 of 54 tasks complete (4%)
**Active branch:** `docs/google-merchant-orchestration`
**Worktree:** `.worktrees/google-merchant-orchestration`
**Tracking PR:** `#379` — draft; do not merge before Phase 0 reconciliation
**Last Activity:** 2026-08-07
**Last Activity Description:** Production Google credential topology and a bounded Ads
authorization check recorded; Phase 0 remains gated

## Completed this session

- Created an isolated Git worktree from pushed `main` at commit `71b56065`.
- Created and activated the GSD workstream.
- Established the canonical PRD, requirements, roadmap, task register, decisions and
  Google API registry.
- Confirmed the architecture boundary: Merchant API for Merchant resources, Google Ads
  API for campaigns, XeroFlow/Cloudflare for orchestration.
- Added Data Manager as conditional/existing and YouTube Data API as optional.
- Added the one-project/one-Merchant-registration topology as a hard gate.
- Declared the other session's unmerged PMax schema/state work as an explicit dependency.
- Committed the reviewed planning baseline as `9cd0efdd`.
- Opened draft tracking PR `#379` against `main` with an explicit PMax dependency gate.
- Verified via aggregate-only production queries that the active shared Google profile
  covers 87 MCC-linked accounts with Ads, Merchant-content and Data Manager scopes.
- Confirmed 21 legacy Google connections remain outside the encrypted profile and no
  Merchant Center identifiers are persisted in current connection metadata.
- Re-ran a one-account aggregate-only Ads v23 audit; the legacy direct sample returned
  `USER_PERMISSION_DENIED`, so live authorization remains unproven.
- Confirmed by secret-name-only Cloudflare inspection that production has the Google
  OAuth/developer-token entries and `REPO_TOKEN_ENCRYPTION_KEY`; no values were read and
  no configuration changed.

## Active blockers

1. **Concurrent PMax session:** root contains unmerged migrations 273-282 and launch
   utilities. This workstream will not change overlapping launch code until that session
   merges and CTL-008 is complete.
2. **Cloud project identity:** the supplied Console URL names
   `gen-lang-client-0818792107`, but its relationship to production `GOOGLE_CLIENT_ID`
   is not yet proven.
3. **Merchant topology:** the controlling agency/advanced Merchant account and
   subaccount model are not yet approved. Developer registration must not run yet.
4. **Final executable baseline:** the clean `main` baseline now passes under Node 24,
   but CTL-009 remains in progress until it is refreshed after the concurrent PMax
   merge/rebase.
5. **Usable live Ads proof:** production has `REPO_TOKEN_ENCRYPTION_KEY`, but local
   execution does not, so the shared MCC profile cannot be exercised from this
   worktree; the sampled legacy direct grant is stale or unauthorized and returned
   `USER_PERMISSION_DENIED`.

## Immediate next actions

1. Verify Cloud project ID/number and OAuth client mapping without exposing secrets.
2. Finish the enabled-service inventory and record the Ads developer-token access
   level; the OAuth-scope/database portion is now verified.
3. Confirm agency Merchant advanced-account/subaccount topology and registration owner.
4. Run a bounded MCC-child Ads read through an authorized production/preview path with
   the encryption key, and reconnect or formally retire a direct legacy connection.
5. Wait for the concurrent PMax session to finish, then rebase and reconcile contracts.
6. Refresh the passing Node 24 baseline after the PMax rebase.
7. Begin MER-101 only after the Phase 0 gate passes.

## Operating rules

- Update this file after every task or blocker change.
- Update `TASKS.md` and `REQUIREMENTS.md` in the same commit as implementation status.
- Do not mark provider behavior proven using fixtures alone.
- Do not register the Cloud project or enable provider writes without the named gate.
- Do not modify the other session's files or duplicate its PMax contracts.
- Use guarded Cloudflare deployment commands only.

## Resume command

```bash
gsd-sdk query workstream.set google-merchant-campaign-orchestration --raw \
  --cwd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/google-merchant-orchestration
```

Then read, in order:

1. `STATE.md`
2. `DECISIONS.md`
3. `ROADMAP.md`
4. The current phase section in `TASKS.md`
5. Relevant acceptance requirements in `REQUIREMENTS.md`
