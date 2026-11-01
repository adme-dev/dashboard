# Durable continuation admission evidence

An admission digest cannot reconstruct a native head after a process restart. Persist the exact planned native request and previous head before dispatch, then retain the observed native result separately. Both records are append-only and stay attached to the original operation, continuation grant, event identity and journal cursor. A timed-out call is inspected; creating a replacement event is not a retry strategy.

## Implementation and acceptance

1. Add migration482 with immutable planned/observed records. Serialize writes on the original site, validate canonical digests and grant/cursor linkage, and enforce one event per grant/action. Real PostgreSQL tests must reject changed retries, concurrent planners, updates/deletes, foreign grants and observations without a plan.
2. Add a bounded persistence reader/writer. Exact retries return the same saved bytes; changed retries fail. A planned record holds the full request and previous head (each at most64KiB). An observed record holds the full native result (at most64KiB). Tests prove restart reconstruction and read corruption rejection.
3. Integrate the generated native verifier and current-authority controller separately. The persistence helper verifies byte integrity and relational ownership only; it never validates native transition semantics or grants permission. Before dispatch, the controller must verify the request/previous-head transition, fresh authority and exact current physical state. Before recording an observation it must verify the actual native result against that saved request/previous head. Before journal advancement it must repeat current authority, exact cursor and physical receipt checks.

## Recovery rules

- Planned bytes are committed before any native dispatch, with the caller's final current-authority/clock fence in the same transaction.
- An observed result is historical evidence, including after its grant expires. Saving it is not authorization to advance a stale journal or perform another effect.
- Fresh renewal cannot manufacture a different event for an existing grant/action. An unresolved old event requires independent native inspection.
- No public route, activation, provider call, or automatically scheduled retry is introduced by this persistence change.
- Production migration follows review and disposable PostgreSQL verification. Existing customer records must remain unchanged.

## Verification boundary

Six genuine PostgreSQL cases exercise reconnect/readback, exact retries, orphan and altered observations, concurrent same-site writers, foreign operation reads, stale cursor rejection, enable ordering, distinct revocation, post-expiry observation, immutable history, corrupt readback and per-object size limits. Migration482 runs twice in the disposable schema. The minimal native-head test objects deliberately do not claim native semantic validity.

The SQL trigger verifies the complete evidence envelope hash, payload representation and relational grant/cursor ownership. The helper additionally recomputes nested request/previous/grant digests and checks basic identities. Neither replaces the generated native transition verifier. A controller must never turn a successful storage read or idempotent planned-byte retry directly into permission to dispatch.
