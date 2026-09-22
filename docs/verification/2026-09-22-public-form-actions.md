# Public form action workflow — 22 September 2026

Status: native admission, immutable result acknowledgement, atomic public
CMS completion, answer-free recovery and machine HTTP ingress are locally verified. Public execution remains unavailable until the remaining
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
- [x] Normalize result effects and pin immutable create-only effect identity.
- [x] Verify private D1 preparation; atomically install native records, audit and
      final receipt. Do not change authoring application/page/content heads.
- [ ] Named private Sandbox host reusing the metered action runtime/result store.
- [x] Machine-only native coordinator endpoint with bounded requests and safe errors.
- [x] Reload-safe native recovery using a secret and field digest, without answers.
- [ ] Bounded private control client and named host integration.
- [ ] Delivery form routing, trusted edge address, origin/rate checks, receipt UI.
- [ ] Browser Turnstile lifecycle and secret/intent retry state without field data.
- [ ] Fresh-human sealed release rollback reactivation.
- [ ] Full browser + Worker/D1 + PostgreSQL customer workflow and failure tests.
- [ ] Paired migration/configuration, staging acceptance, current-main release,
      production verification and public feature documentation sync.

## Current implementation

`server/utils/pageStudio/publicActionInvocations.ts` exposes internal
`admitPublishedFormAction`, `acknowledgePublishedFormAction` and
`completePublishedFormAction` and `recoverPublishedFormAction` compositions.
The machine-only `/internal/page-studio/published-action-invocations` route
accepts strict admit/acknowledge/complete/recover phase envelopes. It verifies
machine authentication before reading the bounded 80,000-byte request stream.
There is still no enabled browser form route in this slice.

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

Completion rereads the exact sealed action and acknowledged output, normalizes
only approved create effects, and pins their immutable digest before private D1
preparation. It reads back every exact prepared object, schema and freeze proof.
The byte verifier accepts a narrow preparation frame; human commit authorization
still requires its original full input and human preparation format.

A fresh published-authority transaction then checks the schema and storage
identity again, rejects existing record identities (including retained history),
and inserts record metadata, heads, provenance audit, CMS commit and the final
minimal received receipt atomically. It never updates application, content or
page/checkpoint heads. Raw action output and record IDs do not enter the public
receipt. Retrying a committed invocation returns that receipt without remote
preparation reads or another write. Empty effect plans need no D1 preparation.

An actual D1 restart test seeds the exact previously accepted schema preparation,
loses the public record preparation response, restarts workerd with persistent
D1, and retries through native PostgreSQL completion. It confirms one durable
record with explicit published-invocation provenance. This covers public storage
and native commit integration; the public browser/host/runtime journey remains
unchecked above.

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

## Atomic completion verification

- **135 tests passed** across six suites, including 61 real PostgreSQL
  publication/public-action cases, ordinary human CMS commits, creator action
  invocations, the connected metered Worker/R2/D1 coordinator, challenge and
  storage regressions. All enabled tests ran without skips in this final command.
  Log: `/private/tmp/root-public-effects-final.log`.
- New completion cases failed before implementation:
  `/private/tmp/root-public-effects-red.log`.
- Cases include empty plans, unapproved update effects, changed physical
  provenance/target, late package revocation, lost preparation responses,
  restart recovery, concurrent identical completion, competing creates for the
  same record, and rollback on audit failure or final-receipt failure.
- Scoped ESLint and diff whitespace checks passed. Server TypeScript has no
  diagnostics in the two changed implementation files; baseline errors remain.
  Logs: `/private/tmp/root-public-effects-lint-final.log` and
  `/private/tmp/root-public-effects-types-final.log`.
- The first restart test exposed an incorrect test persistence option; it was
  corrected to the repository's installed Miniflare `resourcePersistencePath`.
  The fixed test passed independently and in the final six-suite run. Each test
  disposes workerd and removes only its own temporary directory.

## Release requirements

Apply migration 427 before deploying the changed creator allowance query: it now
counts both ledger tables even while public execution is disabled. Migration 427
was applied automatically in disposable local PostgreSQL schemas and reapplied
without modifying retained ledger rows. Live installation remains part of the
paired release, alongside the earlier CMS/seal migrations.

Do not enable the public route or advertise public action completion while the
unchecked tasks remain. Keep production source, current-main ancestry, migration
results, deployed bindings and deployment IDs in the final release record.

## Reload recovery and private HTTP verification

Recovery accepts only the original publication/form/intent identity, receipt
secret and field digest, plus the current observed client address. It cannot
create a claim or authorize execution. Admission still requires real fields and
challenge verification. Completion independently rereads sealed definitions and
matches the retained input digest; no visitor answers need to be reconstructed.

Recovery acknowledges a saved deterministic result and finishes its CMS effects.
An absent result remains pending and charged. Storage transport errors, corrupt
bytes and revoked authority fail closed; they are not converted into pending.
Authority is checked again after an absent object lookup. Completed receipts
also require fresh authority, and concurrent recovery creates one record/audit.
The actual D1 restart case now recovers without the original answers.

Private HTTP responses use fixed error text. Server error logs include only the
status code, never raw provider/SQL/validation messages that could contain
visitor input or secrets. Human session credentials cannot authorize ingress.

- **188 tests passed**, eight suites, no skips: publication/recovery PostgreSQL,
  human CMS commits, creator invocations, connected Worker/R2/D1 coordinator,
  storage, challenge, private HTTP and control gateway. Log:
  `/private/tmp/root-public-recovery-final.log`.
- Recovery tests failed before implementation (13 expected failures); the HTTP
  suite failed on its missing handler before implementation. Logs:
  `/private/tmp/root-public-recovery-red.log`, `/private/tmp/root-public-http-red.log`.
- Scoped lint and whitespace checks pass. Server TypeScript retains pre-existing
  errors with no diagnostics in the changed implementation files. Logs:
  `/private/tmp/root-public-recovery-lint-final.log`,
  `/private/tmp/root-public-recovery-types.log`.
- Fresh fetch confirms the owned Dashboard branch includes current origin/main.
  No dependency installation, deployment, push or Actions run occurred.
