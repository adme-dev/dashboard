# Task 6 — Shared ambiguity-clarification policy

## Outcome

The assistant now has one universal runtime safety clause: when supplied or
retrieved data has multiple plausible matching entities and the user has not
selected one uniquely, it asks the user to choose. It must not guess, act,
prepare a proposal, or claim an effect.

The clause is the existing shared `spotlightSystemClause()` primitive, already
consumed by the agency tool loop, portal tool loop, single-shot chat prompt,
and canonical evaluation model-input builder. This keeps production and
evaluation on one policy source rather than adding evaluator-only guidance.

## Root cause

The shared clause previously only described how to handle marked untrusted
data. Individual entity-resolution tools already returned disambiguation and
avoided proposals when a match was non-unique, but no universal prompt
invariant covered supplied or retrieved ambiguous data before tool selection.

The canonical evaluator therefore also lacked a generic decision contract for
clarification. Its exact model-input contract is included in preflight and
execution identity hashing, so changing the shared clause changes the
evaluation prompt identity.

## Test-first evidence

- **RED:** Node 24 focused tests failed in all four real prompt consumers and
  the evaluator because the shared clause did not contain the ambiguity guard;
  the evaluation input also lacked the clarification decision semantics.
- **GREEN:** the same suite passed after the single shared clause and canonical
  evaluator contract were added.
- A preflighted approval is rejected before executor construction when the
  shared policy is deliberately removed, proving the exact-input identity
  binding detects the change.
- Existing real client and task disambiguation tests remain green.

## Evaluation semantics

The canonical evaluation input now states that non-unique entities require
clarification; a clarification or refusal selects no tool and has no effect;
and clarification or refusal alone does not constitute a scope violation or
approval bypass. Scoring rules, zero-tolerance outcomes, and case material are
unchanged.

## Verification

All commands ran with Node `v24.18.0`.

- Focused: 8 files / 92 tests passed (`evaluationOrchestrator`,
  `evaluationModelExecutor`, shared-policy prompt paths, and entity tools).
- Full AI suite: 123 files / 1,060 tests passed (`pnpm vitest run test/ai`).
- Typecheck: `pnpm typecheck` passed.
- `git diff --check` passed.

The stricter serialized contract made an existing empty-preamble executor test
exceed its intentionally narrow 3,000-token test ceiling. Its test-only pack
ceiling is now 4,000, retaining the same successful empty-preamble-path
coverage without changing runtime admission or safety scoring.

No live preflight, approval, model execution, spend, release, deployment, or
environment mutation was performed.
