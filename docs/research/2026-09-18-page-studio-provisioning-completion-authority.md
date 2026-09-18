# Page Studio — provisioning completion authority

18 September 2026. R06 child increment; deployed to staging with artifact-integrity
and read-only RPC verification. No main-branch integration has occurred.

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
- These implementation checks do not establish live PostgreSQL logout or browser
  acceptance. The later staging rollout is recorded below. No Dashboard application
  code changed in this increment.

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
deployment alone is insufficient. Staging artifact-integrity and read-only RPC checks pass as recorded below;
cloud provisioning/native-logout acceptance remains open.
The cross-database completion fence, already-admitted effects, remaining job
lifecycles, preview isolation, CPU containment and full browser/public matrix
remain open. Seven of twelve research tasks are complete; all 26 CMS/component
delivery tasks remain open. Client-admin entry linked to Studio and shared CMS
records remains the first delivery priority.

Research PRs #570 (packages/costs) and #571 (reference workflows) both passed CI.
They remain open drafts and have not been merged or deployed.


## Staging rollout and bounded verification

18 September 2026. Source `5e6bf7d15a0f7b02cd1aeef8d66357c4d3a0aea8`
was deployed only to `xeroflow-provisioning-staging` after a fresh main fetch,
clean source check, reviewed configuration and successful dry run.

- Deployment: `d9f492f3-509a-423a-a676-f963ff9e157f`.
- Active version: `0f95a51f-a866-4d0f-bd67-52c42f5f2c46`, 100%.
- Module SHA-256: `578d98a718b6a86efac10ae5af2e01553a729ba7062fb39464c50b4f9a8c6a62`.
- Downloaded module equals the tested dry-run artifact byte for byte. Compared
  with the old deployed module, the only code difference is the intended final
  authority-check call.
- Existing D1 job rows remain identical: six complete and 26 failed; no pending
  work. The record digest is unchanged. No synthetic live jobs or resources were
  created by this verification.
- Binding/settings/cron comparisons pass. Other Workers and their annotations,
  Dashboard preview/production deployments and the container configuration and
  version are unchanged. Production remains
  `8798c363-6e9c-472a-a78f-47d8ce780ef4`; Dashboard preview remains
  `4f64466c-ba5e-4e70-827d-f630b7eee5fc`.

Five read-only live RPC checks passed before and after rollout: HTTP returns 404,
unknown scoped job returns null, unknown route stays unavailable, foreign
environment is denied, and a caller-controlled route override is rejected. Both
local remote-binding proxies were disposed. No provisioning execution or native
logout was triggered in the live environment.

The exact old downloaded artifact reproduces the missing check across three
negative scenarios. Candidate and newly downloaded artifacts each pass four
local Worker-RPC cases: authorized completion; revoked/unavailable authority
records failure; lease expiry during validation leaves content-seeded state and
throws lease loss. Resource handles remain intact. These use disposable local
D1 and a synthetic executor. The pinned local workerd cannot honor staging's
2026-09-09 compatibility date: the local tests use 2026-08-18. This is explicitly
local regression evidence, not deployed-runtime behavior or a native logout
race proof. Separate cloud readback verifies the real compatibility setting.

Authenticated browser checks now load the portfolio, site overview, saved drafts
and named versions. QR Codes renders its controls but returns the previously
recorded permission denial for this login. That is not a QR data-access pass.
No restore, save, publication or other content mutation was performed. This
refreshes the previously pending read-only navigation check; it does not close
the full browser/two-customer/public acceptance matrix.

Independent harness review required explicit local-runtime limitations and exact
non-target annotation comparisons; both were added. Initial harness setup issues
(wrong content-download endpoint, CommonJS resolution of an ESM-only package, and
synchronous RPC errors escaping an assertion) were corrected before the passing
runs. They required no application-code change.

Evidence: `completion-release-{before,after}.json`, downloaded worker modules,
`completion-artifact-runtime-{before,candidate,after}.json`,
`completion-staging-smoke.json` and `completion-browser-*.txt` under the existing
verification directory. Full source verification remains 3,162 tests plus build,
typecheck and lint at this exact implementation commit. No production rollout
or main integration occurred. R06 remains partial; its cross-database fence,
CPU/preview isolation and complete cloud/browser acceptance work remain open.
