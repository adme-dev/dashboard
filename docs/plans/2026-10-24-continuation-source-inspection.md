# Retained source inspection input

Status: private input reader and evidence binder; no native RPC route, controller dispatch or customer activation.

The original freeze preparation retained its source-draft request and association hashes in PostgreSQL. It did not retain the complete observed source bootstrap. The new continuation cannot reconstruct that observation from a digest, and must not reuse the expired early-phase authority callback.

`readContinuationSourceInspectionSeed` runs inside a current continuation-authority transaction. It checks the retained source execution, descriptor, admission/application lineage, source-freeze preparation and resource/catalogue binding. It recreates the exact historical source-ready request and returns the five original context pins plus the freeze preparation. Original login/deadline fields remain historical; they are not refreshed or accepted as current permission. The caller supplies fresh operator authority separately and finishes the transaction with the current authority/clock fence.

The native read-only bootstrap inspection must validate the current head, actual completed claims, provider selection and tenant physical state. Its first result carries no continuation grant or executable progress. `bindContinuationSourceBootstrap` validates the returned readiness result using the existing full verifier, derives the freeze association from the observed bootstrap, compares the exact saved hashes and reconstructs the original claim-mode freeze envelope. The envelope is a request, not a receipt. The controller must additionally validate the full bootstrap response, descriptor, current fence and before/after authority, then conduct the complete second inspection before issuing any new review or grant.

The reader does not perform network I/O, renew an entitlement, change a historical recovery head or write a phase claim. It requires the caller's current context/site lock and final fence; direct invocation is not authorization.

Three genuine PostgreSQL lifecycle tests prove exact readiness/freeze-envelope reconstruction, preservation after natural historical deadline expiry and rejection of borrowed source identity/corrupted retained descriptor projections/changed bootstrap association. Native provider observations in this fixture remain synthetic, explicitly separated from the real database lifecycle. CI runs the new tests alongside the continuation authority suite. Hosted bootstrap/full-inspection acceptance remains outstanding.
