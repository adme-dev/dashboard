# Deterministic AI evaluation runner

## Scope

`runDeterministicEvaluation` is the pure scoring and execution-control layer for governed capability evaluations. It does not load production data, persist results, promote releases, or expose a live tool executor. A database repository and an isolated model/fixture harness remain separate follow-up slices.

## Isolation contract

Each executor call receives:

- a cloned and recursively frozen synthetic scope fixture;
- a cloned prompt/context and bounded tool-name list;
- `executionMode: simulation`;
- `sideEffectsAllowed: false`;
- a derived abort signal with an enforced deadline.

The request contains no database client, vendor credential, mutation callback, or general tool-execution function. A production executor must run in an environment with no live write bindings and return observations only.

## Deterministic gates

The runner calculates these checks without model judgment:

- exact expected tool set, including duplicate/hallucinated-tool rejection;
- every required source reference present;
- no scope violation;
- no case-declared prohibited effect;
- no approval-boundary bypass;
- per-case input/output token, cost, and latency ceilings.

Recognised rubric dimensions map to those checks. Unknown or subjective dimensions are never auto-scored; a deterministically safe case becomes `human_review`. Any deterministic mismatch becomes `fail`, and invalid executor output or a case-budget breach becomes `error`.

The release gate passes only when every selected case passes. Human-review, fail, and error results all keep the gate closed.

## Run controls

- Case manifests are version-validated, bounded to 500 cases, required to have unique IDs and versioned keys, and snapshotted before the first call.
- Tool names and fixtures use the existing bounded governance contracts.
- Execution is sequential and preserves manifest order.
- A caller abort cancels the run before or during a model call.
- A hung executor is stopped by `Promise.race`, receives an aborted derived signal, and produces a bounded error/failure result.
- Per-case token/cost/latency ceilings and a total-cost/wall-clock ceiling are enforced.
- Stored-result-shaped output contains deterministic checks, unique observed names, opaque trace references, token/cost/latency totals, and no raw prompt/output payload.

## Required production follow-up

Before a real evaluation can be launched:

1. Add the transactionally safe run/result persistence adapter.
2. Add an owner/admin launch/cancel API that derives actor and department scope server-side.
3. Add a fixture-only model executor with no live mutation bindings.
4. Seed approved synthetic suites and draft packs after accountable department ownership is assigned.
5. Display results and unresolved human review in Model Ops.
