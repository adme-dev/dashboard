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
**Last Activity:** 2026-08-07
**Last Activity Description:** Planning baseline, active Phase 0 plan and six pending phase scaffolds created

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

## Immediate next actions

1. Verify Cloud project ID/number and OAuth client mapping without exposing secrets.
2. Inventory enabled Merchant, Ads and Data Manager services and Ads developer-token
   access level.
3. Confirm agency Merchant advanced-account/subaccount topology and registration owner.
4. Wait for the concurrent PMax session to finish, then rebase and reconcile contracts.
5. Refresh the passing Node 24 baseline after the PMax rebase.
6. Begin MER-101 only after the Phase 0 gate passes.

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
