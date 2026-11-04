# CI recovery fixture repairs: six component/app assertions (3 November 2026)

Task `task_defd87a2ea33`, dispatch `ctx_7dec5c8cd1fd`. Branch `adme-dev/figflow-authoring-20261102`, HEAD `f13160e27`. Scope: six of the eight assertions that failed in general CI `41505334628`, across three test files.

- **Edited:** only the three test files listed below.
- **Unchanged:** no product, shared, native, SQL, database, migration 499, pins, frozen evidence or status-doc changes. No Git, install, build, Cargo, deploy or send.
- **Migration 499:** the independent 499 database review remains FAILED/INCOMPLETE. No SQL probe was reproduced, rerouted or retried.

## Root cause

All six failures are **test-harness drift**, not product defects.

Each of these tests extracts a function body from `app/components/email/builder/EdmFlyhubBuilder.client.vue` (`96b6682b…`), transpiles it, and evaluates it with `new Function(...)` using an explicit list of injected identifiers. Commit `f13160e27` (slice-5 campaign UI) added new references inside those extracted bodies but did not update the injected lists. Every referenced identifier exists in the real component scope:
- `designReadOwner` is imported at line 7;
- `loadedDesignRevisionId` is declared at line 81;
- `workspaceSavedSnapshot` is declared at line 1386;
- `workspaceSnapshot()` is declared at line 1387.

So the product is correct. The harness's evaluated scope is incomplete.

| Test | Extracted body | Missing identifier, and how the failure appeared |
|---|---|---|
| `test/app/edmNativeLibraryRecovery.test.ts` (2 cases) | `reopenNativeLibrary` | `designReadOwner` (persisted-owner identity check). `ReferenceError: designReadOwner is not defined` replaced the expected rejection message. |
| `test/components/emailComposerSaveWarning.test.ts` (3 cases) | `beginFigflow` | `workspaceSnapshot`, used by the new `designFlow.setLocalBaseline?.(workspaceSnapshot())` after a successful open. The `ReferenceError` was swallowed by the product's `catch {}`, so `showFigflow` stayed false. |
| `test/components/emailDesignLibraryComposerRecovery.test.ts` (1 case) | `save` (campaign branch) | `workspaceSavedSnapshot` (and `loadedDesignRevisionId` and `designFlow.draft`) in the new post-save bookkeeping. The `ReferenceError` was caught, so `save()` returned false. |

**Diagnostic evidence (isolated, product untouched):**
- `diagnose-begin.test.ts` → `diagnose-begin.log`: `SWALLOWED: ReferenceError workspaceSnapshot is not defined`. The open itself succeeded (`handoff: handoff-one`).
- `diagnose-save.mjs` → `diagnose-save.log`: `swallowed: ReferenceError workspaceSavedSnapshot is not defined`.
- The `red.log` assertion text for the native-library test names `designReadOwner is not defined` directly.

## Repairs (test-only, minimal)

1. **Native library recovery:** the real `designReadOwner` from `shared/emailRendering/designRoundtrip` is bound into the evaluated scope, not a stub. That keeps the extracted body's persisted-owner comparison exercised. No assertion changed.
2. **Composer save warning:**
   - The fixture provides `workspaceSnapshot()` over the composer document and name.
   - **Added coverage:** after a confirmed open, `designFlow.localBaseline` equals that snapshot. It stays `null` when designer admission is false and no open happens.
   - All original assertions are unchanged.
3. **Library composer recovery:**
   - The fixture provides `workspaceSavedSnapshot`, `loadedDesignRevisionId` and `designFlow.draft`.
   - **Added coverage:** a permitted campaign save records the saved snapshot and the confirmed campaign head. A save blocked during a library write leaves the snapshot unchanged.
   - All original assertions are unchanged.

No authorization, recovery or save assertion was weakened, skipped or removed (see `tests.diff`).

## Verification

Node `24.18.0`, existing dependencies, `--cache=false`. Evidence is in `.verification/ci-recovery-fixes-20261103/`.

| Check | Result | Evidence |
|---|---|---|
| Reproduction on unchanged tests | **6 failed, 11 passed (17); exit 1**. These are exactly the six CI assertions. | `red.log`, `source-before.txt` |
| Repaired three files | **17 passed, 0 failed, 0 skipped; exit 0** | `green.log`, `source-after.txt` |
| Mutation: copies of the repaired tests run against builder copies with the new slice-5 lines removed | **4 failed, 9 passed; exit 1**. The failures are precisely the new assertions (missing local baseline ×3, missing saved snapshot ×1). The `designer=false` control passes. | `mutation.log`, `mutation/` |
| Scoped ESLint on the three files | exit 0, no diagnostics | `lint.log` |

Product sources were confirmed unchanged:
- `EdmFlyhubBuilder.client.vue` `96b6682b…`;
- `useEdmDesignRoundtrip.ts` `a1d42c0e…`;
- `shared/emailRendering/designRoundtrip.ts` `e8d5064e…`.

These are recorded in `product-unchanged.txt`.

## Source hashes (SHA-256)

| File | Before | After |
|---|---|---|
| `test/app/edmNativeLibraryRecovery.test.ts` | `d7cc3630cea8e3ed278431a4b9bebcec151614cdb6382fd080080fd53932f91a` | `dee15456e2b11f9e503dd103242a5e0da23a8bdfe216bf887ec8a19b76f0a8a5` |
| `test/components/emailComposerSaveWarning.test.ts` | `6d0b0b943f527d8f5563112b8d89cdd1a82610b32663b13541976d15504c552f` | `f0f9c53808f85d746409dd1ac2258ffaff0b4c814a0aa6e96e113535fb88121d` |
| `test/components/emailDesignLibraryComposerRecovery.test.ts` | `1e9ac671ec81e73b0c87af5ea66bf3fe237e7410324c33a870cbb06a19eaa2ad` | `ef35ee3c2519272336cf56dda29dfaff1c99f8c60db408d37091e229b2c81407` |

## Limits

- **Fixture-level harnesses only.** These tests evaluate extracted component bodies with fixture I/O. They prove neither the full Nuxt shell nor the API, native, browser or hosted behaviour.
- **Two of the eight CI failures are out of scope.** They were assigned elsewhere (the image tests) and were not inspected or rerun here.
- **No full CI or full-suite rerun** was performed. A fresh general CI run on the integrated candidate remains the parent's gate.
- **Concurrent change outside scope:** `test/unit/emailNativeLibrary.test.ts` became modified during this task. It was not edited here and is outside this scope.
- **Structural risk:** the extraction harnesses stay brittle against future builder changes. Future product edits to these function bodies must update the injected identifier lists.
