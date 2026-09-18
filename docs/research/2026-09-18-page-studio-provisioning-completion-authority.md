# Page Studio — provisioning completion authority

18 September 2026. R06 child increment; local implementation only. No deployment
or main-branch integration has occurred for this increment.

## Finding and repair

Content-route resolution requires the retained provisioning job to be complete.
After the checkpoint executor returned, the coordinator previously checked only
its lease before completing that job. Revoked or unavailable authority at that
point did not prevent completion.

The runner now repeats its lease / current-authority / lease checks after the
checkpoint RPC response and before the conditional D1 completion update. A denied
or unavailable authority service leaves a failed job and an unavailable route;
resources remain for reconciliation. Lease expiry leaves the job unmodified.
Continued authority completes successfully. This adds one authority RPC per
successful provisioning attempt, with no migration or binding change.

This is admission revalidation, **not an atomic PostgreSQL/D1 logout fence**.
Revocation can still occur after validation and before D1 completion. PostgreSQL
checkpoint metadata has separate transactional protection; that protection does
not extend to this transition. R06 remains partial and generated customer
execution remains disabled.

## Verification

- Actual SQLite-backed store/route regression: three cases failed before the fix;
  the positive control passed. All four now pass, covering authorization,
  revocation, authority unavailability and lease expiry during validation.
- Focused runner/coordinator/registry/deadline suites: 68 tests passed.
- Full Studio suite: 3,162 tests passed, including runtime and security suites.
  Turbo reused 29 of 32 tasks; affected worker tests executed. The first attempt
  was blocked by sandbox localhost-listening restrictions, then an authorized
  rerun passed.
- Studio build, typecheck and lint passed (865 files checked). The initial lint
  run found a nested ternary in the new test; it was corrected before the passing
  final run.
- Independent review found no Critical or Important findings. Review traced the
  concrete executor's acceptance of an unchanged content-seeded job after route
  activation; the regression itself injects authority responses.
- No live PostgreSQL logout, browser acceptance or Cloudflare deployment is
  claimed. No Dashboard application code changed in this increment.

Evidence: `.verification/page-studio-builder-rnd-20260917/completion-authority-*`.
Studio contract: `docs/architecture/provisioning-completion-authority.md`.

## Source and remaining work

Studio implementation commit: `5e6bf7d15a0f7b02cd1aeef8d66357c4d3a0aea8`.

The existing isolated Studio branch includes main
`f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43`; implementation started from
`13e7009e5b27b8a5fd9cb5732219b8fba8238493`. The paired Dashboard branch includes
main `a917386dde67f06921843fd6e3a1ed1b4b984c6f`. Earlier authority changes remain
preserved on both branches. The main checkout's unrelated work is untouched.

The coordinator bundle must be updated to install this runner check; an executor
deployment alone is insufficient. Staging release and acceptance remain pending.
The cross-database completion fence, already-admitted effects, remaining job
lifecycles, preview isolation, CPU containment and full browser/public matrix
remain open. Seven of twelve research tasks are complete; all 26 CMS/component
delivery tasks remain open. Client-admin entry linked to Studio and shared CMS
records remains the first delivery priority.

Research PRs #570 (packages/costs) and #571 (reference workflows) both passed CI.
They remain open drafts and have not been merged or deployed.
