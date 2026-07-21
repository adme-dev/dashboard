# AI evaluation run persistence

## Purpose

`evaluationRunPersistence.ts` stores the redacted evidence produced by the deterministic evaluation runner. It does not expose an HTTP endpoint, call a model, execute a tool, seed a catalog, or activate an assistant.

## Safety boundary

- A caller supplies a server-generated UUID, department, exact evaluation-suite/material identity, and server-derived actor.
- Starting the same UUID again is idempotent only when department, actor, suite, pack/capability, model, prompt digest, and toolset digest all match.
- Results are accepted only while the run row is locked in `running` state.
- Every result is validated against the redacted `EvaluationCaseResult` contract before the first insert. Raw prompts, raw model output, fixtures, credentials, and tool mutation handles are not part of that contract.
- Case-result inserts and the terminal run update share one database transaction. A constraint, trigger, or finalization failure rolls back all inserted results.
- `error` outcomes contribute to the database `failed_count`. Completed gates pass only when every result passes.
- Failed or cancelled runs may retain their validated partial evidence, but have no release-eligible gate value.
- A same-payload retry of sealed evidence returns the existing run. A differing retry fails with `evaluation_run_terminal_conflict`.

Database triggers from migration 271 provide the final enforcement layer: cases must belong to the sealed suite, results may only be inserted during a running run, completed counts must equal the full suite, material identity is immutable, and terminal evidence cannot be changed or deleted.

## Verification

Run the focused checks with Node 24:

```bash
pnpm exec vitest run \
  test/ai/evaluationRunPersistence.test.ts \
  test/ai/evaluationRunPersistencePostgres.test.ts \
  test/ai/deterministicEvaluationRunner.test.ts \
  test/ai/governanceContracts.test.ts

pnpm exec eslint \
  server/utils/ai/governance/evaluationRunPersistence.ts \
  test/ai/evaluationRunPersistence.test.ts \
  test/ai/evaluationRunPersistencePostgres.test.ts
```

## Deliberately not enabled

There is no launch route or production executor yet. Before adding one, require administrator authorization, load only immutable synthetic cases for the requested suite, generate the run UUID server-side, use a simulation-only executor, apply provider and wall-clock budgets, and expose only bounded status/evidence reads. Department ownership and pilot membership must be approved before any suites or releases are seeded.
