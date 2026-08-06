# SDD ledger — plan: docs/superpowers/plans/2026-08-05-leapmotor-animated-banner.md

Pre-flight: existing linked worktree `/Users/paulgiurin/Documents/Projects/dashboard/.worktrees/main-ai-integration`, branch `main`, user explicitly authorised main integration and production deployment.
Pre-flight: plan conflict scan clean; tasks preserve draft-only/no-publish boundary and exact supplied artwork.
Pre-existing parallel fix: finance same-event delegation re-entry is uncommitted; 5 suites, 96/96 tests passed and requires isolated review/commit before banner task diffs.
Finance prerequisite: minor (deferred): sequential same-event success is implemented but lacks its own direct regression test; concurrent same-event and cross-event replay are covered.
Finance prerequisite: complete (commit 300af37c, spec compliant, quality approved; production retest remains in Task 5).
Task 1: fix round 1/5 (2 addressed, 0 open — filename edge controls; pre-copy absolute size guard; commit e3241e45).
Task 1: complete (commits 300af37c..e3241e45, review clean).
Task 2: fix round 1/5 (2 addressed, 1 open — partial R2 compensation; trusted 4xx propagation; ambiguous COMMIT null visibility; commit 4a7d4d58).
Task 2: fix round 2/5 (1 addressed, 0 open — transaction stage classification and null reconciliation safety; commit d80f6c63).
Task 2: complete (commits e3241e45..d80f6c63, review clean).
Task 3: fix round 1/5 (4 addressed, 0 open — shared byte identity; serialized retry session; same-content key reuse; lifecycle tests; commit 3fe4cbc4).
Task 3: complete (commits d80f6c63..3fe4cbc4, review clean).
Task 4: fix round 1/5 (route-level canvas/default verification addressed; no-render/publish assertion open; commit 1b63bf6b).
Task 4: fix round 2/5 (no-render/publish route dependency inventory addressed; commit a4ef7b32).
Task 4: complete (commits 3fe4cbc4..a4ef7b32, review clean).
Task 6: fix round 1/5 (4 Important findings addressed, 0 Critical/Important open — request-owned rollback, HTTP semantics/ES2019 compatibility, audited compaction scope, real-artifact workerd harness; commits 333b12d2, 7d73bcba, 63865e28). Coordinator-focused verification passes 4 files/66 tests; expanded verification passes 10 files/105 tests; production-artifact workerd passes 1 file/3 tests in 5.11s. Fresh build and size guard pass at 24,745,798 bytes with 4,202 remaining. One deferred Minor remains: mechanically detect future compactor allowlist audit drift.
Task 6: complete (re-review approved and clear to deploy through guarded workflow; 0 Critical, 0 Important open; compactor audit drift deferred as Minor).
