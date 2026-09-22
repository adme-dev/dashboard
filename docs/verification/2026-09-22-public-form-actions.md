# Public form action workflow — 22 September 2026

Status: native admission and immutable result acknowledgement are implemented
and locally verified. Public execution remains unavailable until the remaining
integration and hosted acceptance gates below pass. No deployment occurred.

## Task checklist

- [x] Separate public principal from publisher login and creator session.
- [x] Mandatory bounded Turnstile verification bound to exact publication/intent.
- [x] Public preparation provenance supporting create-only record operations.
- [x] Immutable public invocation/charge ledger (migration 427).
- [x] Shared allowance across creator and public actions, sites and environments.
- [x] Sealed form/action/input verification followed by fresh atomic admission.
- [x] Same-intent retries recover one claim without another dispatch or charge.
- [x] Read and acknowledge exact deterministic private Worker result bytes.
- [ ] Normalize result effects and pin immutable create-only effect identity.
- [ ] Verify private D1 preparation; atomically install native records, audit and
      final receipt. Do not change authoring application/page/content heads.
- [ ] Named private Sandbox host reusing the metered action runtime/result store.
- [ ] Machine-only native coordinator endpoint and bounded control client.
- [ ] Delivery form routing, trusted edge address, origin/rate checks, receipt UI.
- [ ] Browser Turnstile lifecycle and secret/intent retry state without field data.
- [ ] Fresh-human sealed release rollback reactivation.
- [ ] Full browser + Worker/D1 + PostgreSQL customer workflow and failure tests.
- [ ] Paired migration/configuration, staging acceptance, current-main release,
      production verification and public feature documentation sync.

## Current implementation

`server/utils/pageStudio/publicActionInvocations.ts` exposes internal
`admitPublishedFormAction` and `acknowledgePublishedFormAction` compositions.
There is no newly exposed browser or machine route in this slice.

Admission validates the strict private-host request and independently resolves
current hostname, delivery environment, release, activation epoch and sealed
recovery bytes. Only a public page's exact eligible form and finite create-only
action can admit input. Undeclared fields fail before challenge verification.
Guest collection data is empty. Public forms never inherit publisher access.

The ledger stores field and receipt-secret hashes, not raw submitted fields,
receipt secrets or challenge tokens. Secret comparison uses constant-time hash
comparison. IP address and a fresh challenge token are excluded from durable
retry identity, permitting a valid retained request to recover after a network
change without requesting another challenge or charge.

Challenge verification and private object reads finish outside SQL transactions.
Fresh native authority then checks package, publication and exact write schemas,
reserves the shared client allowance, and inserts the execution claim atomically.
An unrelated authoring application advance does not invalidate a published form;
changing a required schema does. Native transactions do not retry automatically.

Only the first claimant receives `dispatchGranted: true`. A replay cannot obtain
another dispatch, including when the first response was lost before execution.
The trusted host receives the prepared request/action/input privately for the
existing metered runtime. That descriptor must never be returned to a browser.

Acknowledgement constructs the deterministic private result key from the saved
execution identity and rereads actual bounded canonical envelope bytes. Changed
claim identity, malformed/oversized/missing bytes or revoked authority cannot
settle the row. Verified engine success enters `result_ready`; engine failure
enters `execution_failed`. Both remain charged. Neither creates a final received
receipt. CMS effects must commit before reporting a successful submission.

## Verification

- Shared allowance and existing action runtime/coordinator regressions: **63
  tests passed**, including **26 PostgreSQL allowance cases**. Log:
  `/private/tmp/root-public-quota-regression.log`.
- Final public admission/result/storage/challenge regression: **67 tests passed**,
  including **48 real PostgreSQL publication/action cases**. Log:
  `/private/tmp/root-public-admission-final.log`.
- New tests failed before their implementations were added. Logs:
  `/private/tmp/root-public-admission-red.log` and
  `/private/tmp/root-public-result-red.log`.
- Scoped ESLint and `git diff --check` passed. Server TypeScript retains baseline
  errors; no diagnostics refer to the owned implementation files. Logs:
  `/private/tmp/root-public-admission-lint-final.log` and
  `/private/tmp/root-public-result-types.log`.

Cases cover concurrent identical claims, retry identity conflicts, publisher
login revocation without guest impersonation, late package/schema/allowance
changes, unrelated authoring advance, rejected undeclared fields, unknown work
remaining charged, successful/failed retained results, absent/changed/oversized
result bytes, late activation revocation, and acknowledgement without a claim.
External Turnstile responses are controlled fixtures; hosted challenge keys and
real browser verification remain an activation gate.

## Release requirements

Apply migration 427 before deploying the changed creator allowance query: it now
counts both ledger tables even while public execution is disabled. Migration 427
was applied automatically in disposable local PostgreSQL schemas and reapplied
without modifying retained ledger rows. Live installation remains part of the
paired release, alongside the earlier CMS/seal migrations.

Do not enable the public route or advertise public action completion while the
unchecked tasks remain. Keep production source, current-main ancestry, migration
results, deployed bindings and deployment IDs in the final release record.
