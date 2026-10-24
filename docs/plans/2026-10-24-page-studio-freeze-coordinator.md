# Explicit recovery freeze coordinator

The private Dashboard coordinator executes only an existing immutable freeze pair. It first reads fresh PostgreSQL authority and the retained request/association, performs native readiness inspection outside the transaction, and reconstructs the complete initial-claim envelope from that result. The existing full linkage verifier rejects a readiness result inconsistent with the retained source identity.

After readiness, another transaction verifies current authority and unchanged retained rows. One explicit native execution follows outside locks. The native executor must acquire the D1 effect, allow writes only for the acquiring execution, inspect retained uncertainty, read the actual tenant fence and settle the claim. Dashboard independently verifies the returned receipt/claim/settlement equations, then rechecks PostgreSQL authority and retained rows before returning it. The final database clock follows comparisons. No automatic remote retry, upload, install or alternate invocation is performed.

The callbacks are captured invocation-scoped host capabilities, not client-supplied transport choices. Environment, descriptor, runner and callbacks are checked across awaits. The future fixed adapter is responsible for native binding capture; no HTTP route or customer permission is exposed here. Completed effect status remains authoritative in native D1; Dashboard does not create an unrelated optimistic completion row.

Tests use the genuine disposable PostgreSQL lifecycle and real authority callbacks, with an explicitly synthetic native completion boundary. They prove calls occur outside PG locks, exact invocation replay, no automatic retry after uncertainty, changed readiness/receipt/callback/policy denial and owner-session expiry after remote execution. They do not establish physical D1 mutation or acquired settlement; paired actual Studio coordinator evidence and authenticated hosted acceptance remain separate gates.


## Fixed native binding adapter

`customerTransferRecoverySourceFreezeNative.ts` exposes separate trusted-server
preparation and execution entrypoints. It captures the exact provisioner ready
and freeze RPC methods, retaining native receiver semantics without repeated
property-identity comparison. Missing methods deny without legacy fallback.
Preparation invokes only readiness; it cannot acquire a freeze claim. Execution
requires both methods before any database transaction and delegates full-result
verification to the existing coordinator.

The adapter checks binding, production environment, runner and host descriptor
identity around every RPC and transaction and before returning. Existing current
PG policy and immutable-pair checks remain in the delegated implementations.
No new HTTP route, browser input, config enablement or customer access is added.

Six real disposable-PG regressions cover fresh callable wrappers for preparation
and execution, missing old-artifact methods, and binding/method/environment drift
following readiness. Native responses in these PG tests remain synthetic; the
separate native Workerd capability test establishes actual wrapper behavior.
