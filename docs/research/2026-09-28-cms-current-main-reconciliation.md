# Dashboard CMS reconciliation — refreshed 29 September 2026

## Source and preserved behavior

Worktree: `/private/tmp/dashboard-cms-current-main-20260928`, branch
`fix/cms-current-main-20260928`. Fresh `git fetch origin main` on 29 September
confirmed base `642980e448e9cfb9d898f1282274bd3cd9c246d6` with no divergence.
The five preserved CMS commits `0c1671b60` through `eb2584de8` were reconciled
onto this base; the original `/private/tmp/dashboard-cms-resume-20260928` remains
untouched. This record describes the reviewed candidate, not a deployed release.

The base includes QR access for creative/marketing staff and four-hour editor
sessions. Production renderer `astro_runtime_5986dc6f…` and retained
`astro_runtime_a6a72b89…` remain unchanged. The older CMS branch's production
renderer `0e4f99a7…` was not adopted because it predates the live footer. Preview
configuration retains the previously uploaded synthetic CMS renderer
`0939af78…`, preserving its preceding `a71fb296…` generation. Any new integrated
renderer selection is a separate reviewed rollout change.

The generated verifier was regenerated from the paired current-main Studio
checkout instead of combining incompatible generated files. Dashboard integrity
verification passes for all five artifacts; independent review also checked all
125 source hashes against the paired Studio source. The source digest is
`f9a1ae99e4f13e298977c76ec3bf46fcaca71a45f3f6498c3282ed93f1831ea6`.

## Publication corrections and review

Independent review identified three Important publication issues. Regression
cases reproduced each failure before correction:

- Production Dashboard rejected its valid shared staging CMS pointer. Public
  authority now resolves the pointer environment from native hostname ownership,
  validates a ready provider-verified staging allocation, and preserves the
  explicitly configured isolated synthetic-canary exception. Staging cannot read
  production pointers. PostgreSQL coverage exercises staging publication,
  replacement, projection and rollback with an independent production pointer.
- Action-bearing forms could replace a working pointer with a runtime release
  the renderer would reject. Route preflight and the shared preparation boundary
  now reject generated action forms before content retention. Rollback checks the
  recovered checkpoint too. Ordinary native forms remain supported.
- CMS publication could select the pre-CMS production renderer. Publication and
  rollback now require `PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS`: exact server-owned
  site scope, publication environment and full renderer generation/code/assets
  identity. Missing or mismatched admission fails closed. No admissions are
  enabled in this candidate, and ordinary publication/rollback remains available.

See `docs/runbooks/page-studio-runtime-delivery.md` for the admission contract,
synthetic acceptance prerequisites and retained-generation requirements.
Independent follow-up review approved the corrected source with no remaining
Critical or Important findings. Hosted acceptance remains a separate release gate.

## Current verification

- Full Dashboard Vitest run passes: **15,474 tests passed, 881 skipped**, across
  2,162 passing files and 34 skipped files. Disposable PostgreSQL 17 was enabled;
  this replaces the earlier unavailable-database limitation. An initial full run
  found a stale mock SQL matcher and an incorrectly named disposable collection
  database URL; both were corrected before the successful complete rerun.
- Focused affected publication/route/authority coverage passes 154 tests with one
  existing skip. The added combined staging/production rollback case passes,
  and the final rollback checks pass three tests after the reviewer-requested
  use of the already-verified checkpoint projection.
- All **33 changed TypeScript/Vue files pass ESLint**. Generated-verifier integrity
  and `git diff --check` pass.
- Complete production build passes. Worker size is **25,392,185 raw bytes** against
  the 25,468,928-byte guard (76,743 remaining), and **6,813,436 gzip bytes** against
  9,750,000. No build artifact from this verification has been deployed.
- Final global typecheck exits 2 on the same **919 diagnostics** as clean main.
  Comparison preserves diagnostic multiplicity and messages while normalizing
  checkout roots and source positions: **zero added, zero removed**. This is
  baseline parity, not a passing global typecheck.
- Migration 435 had previously been applied and read back in production and
  isolated staging. The new verification uses disposable PostgreSQL; no live
  migration, customer checkpoint, record or publication pointer was changed.

Current logs under `/private/tmp/`:

- `cms-dashboard-verified-tests-20260929.log`
- `cms-dashboard-verified-build-20260929.log`
- `dashboard-cms-final-lint-20260929.log`
- `dashboard-cms-final-verifier-20260929.log`
- `dashboard-cms-final-typecheck-20260929.log`
- `dashboard-cms-typecheck-comparison-20260929.json`
- `dashboard-publication-staging-red.log`
- `dashboard-publication-actions-red.log`
- `dashboard-publication-admission-red.log`
- `dashboard-publication-route-red.log`
- `dashboard-publication-verified-green.log`
- `dashboard-publication-staging-rollback.log`
- `dashboard-publication-final-rollback.log`

## Remaining release gates

The 28 September session was blocked from Git writes and could not run the
PostgreSQL acceptance suite. Those are historical observations: current Git
fetching works, local commit preparation is authorized, and the full suite now
passes with PostgreSQL 17. No deployment or hosted acceptance is implied by the
restored tooling.

Recheck current-main ancestry before integration and release. Verify and record
the fresh integrated renderer upload's exact bytes and provider identity; retain
all generations needed for rollback. A scoped synthetic admission may be enabled
only for authorized hosted acceptance after that identity check. Complete the
actual generate → review/accept → CMS/admin → edit records → save/reopen → publish
→ current SSR records → rollback journey, including second-account, tenant,
environment, role, quota, revocation and pointer-epoch negatives. Customer and
production admission remains disabled until the corresponding reviewed rollout
and hosted acceptance pass. Generated action forms and arbitrary compiler
execution remain separately gated.
