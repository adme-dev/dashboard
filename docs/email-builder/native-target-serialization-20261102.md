# Native designer: structural target serialization (2 November 2026)

Task `task_9f7b08c07dcc`, dispatch `ctx_4997406ad034`. Trigger: the actual matching package `a41e18d3`
emitted an `add-section` with `"columnIndex": null`. The capture
`.verification/figflow-designer-browser/native-edited.json` (`result.operations[2]`) is:

```json
{"columnIndex": null, "index": 1, "op": "add-section", "parentId": "root", "sectionType": "Spacer"}
```

The real panel refused this before any proposal request was made.

**Evidence class.** These are source edits only. I ran no Cargo, rustc, clippy, rustfmt, WASM or Rust test,
and I claim no Rust test as passing.

The only code I executed was the repo's existing `node_modules/.bin/tsx`. I ran it read-only against the
shared `designerCapabilities` and `applyDesignerOperations` to produce the vectors below. The scripts are
session scratch, outside the repo.

I left the captured browser snapshot and the prepared browser files unchanged. I did not loosen the shared
parser. I touched no DB, browser, provider, deploy, CI, git index or commit.

## Files

Paths are under `.verification/figflow-native-source-20261102/work/crates/`.

| File | SHA-256 before | SHA-256 after | Lines |
|---|---|---|---|
| `ui-egui/src/edm_panel.rs` | `29c04c475348e49464293b949ebe444424a7acfaea98aefd4f88c5c917961068` | `6b3bdaeb6f4d82a3b1dccfbff2a0f3829cc508080658db383ef8a0ee5effec00` | 361 → 522 |
| `engine/src/cmd/edm.rs` | `94ea7556bb168e2ad68b15441f8fc52c18ca2f095e0a53a7066818e88659653c` (the CI-remediation freeze) | `6f6b23fe0207cd97b66e2e8e363b93e7c2c959a6fa482098e12a8d70a13915b2` | 3316 → 3434 |

No other native file was changed. I grepped the rest of `ui-egui/src` and found no other `columnIndex` emitter.

## Root cause

**The contract.** Shared `Target` (`shared/emailRendering/designDesigner.ts:35`) is
`{ parentId: Id, columnIndex: z.number().int().min(0).max(2).optional(), index: z.number().int().min(0).max(300) }`.
`.optional()` admits an absent key, never `null`.

**The panel bug.**
- The panel built its four structural operations (add, move up, move down, duplicate) with
  `json!({… "columnIndex": target.column_index …})`.
- `serde_json` serializes `None` as `null`, so every target under `root` or a `Container` emitted
  `"columnIndex": null`.
- Shared parsing then fails with `invalid_type` (expected number). That covers both
  `parseDesignerRoundtripRequest` (the proposal) and `applyDesignerOperations`.

**Why native did not catch it.**
- The engine read `operation.get("columnIndex").and_then(Value::as_u64)`. That turned `null`, `"0"`, `true`,
  `-1`, `0.5`, `[0]` and `{}` silently into "no column".
- So the native canvas applied an operation the server refuses.
- For a `ColumnsContainer` parent, `"columnIndex": "1"` was only refused later as "columnIndex is required",
  and `3` was refused as a missing column. That was the right outcome for the wrong reason.

## Fix

1. **Panel emitter (`edm_panel.rs`).** One constructor, `structural_operation`, builds the shared `Target`.
   It inserts `columnIndex` only when the target has a column, and keeps 0 (and 1–2) for a
   `ColumnsContainer`.
   - `add_section_operation`, `move_section_operation` and `duplicate_section_operation` wrap it.
   - The four call sites use these wrappers.
   - `remove-section` has no target and is unchanged.
2. **Engine admission (`edm.rs`).** The new `designer_column_index` mirrors the shared optional integer:
   - An absent key gives `None`.
   - A present value must be an integral number in 0..=2. This reuses `bounded_number`. `1.0` is admitted
     because `JSON.parse` yields 1, which shared accepts.
   - Anything else is refused with `invalid columnIndex`.

   Both structural sites use it: `add-section`, and `move-section` / `duplicate-section`. Whether a column
   is required (`ColumnsContainer`) or forbidden (`EmailLayout`, `Container`) is still decided by
   `assert_designer_target`. A column outside the parent's actual columns is still refused by
   `designer_child_ids_at`.

Nothing else changed:
- The six operation kinds, `{operationId, operations}` and the browser allowlist.
- Locks, merge tokens and image authority.
- The props/style flow.

## Shared vectors

- **Design.** Root, `text-1`, a two-column `cols` (column 0 = `c0-a`, `c0-b`; column 1 empty) and a nested
  Container `box` (`box-a`, `box-b`). All text is granted.
- **Capabilities.** Shared `designerCapabilities` output, used for import, so native capabilities are checked
  against shared rather than against themselves.
- **36 operation verdicts from shared `applyDesignerOperations`.** Fed as JSON text to both runtimes:
  - **16 accepted:** the 13 panel shapes below, plus column 1, column `1.0`, and a move into column 1.
  - **20 refused:**
    - `null` at the root, nested-container and column level, for add, move and duplicate
    - a missing index for a `ColumnsContainer` parent (add and move)
    - `"0"`, `"1"`, `true`, `[0]`, `{}`, `-1`, `0.5`, `3`
    - column 2 on a two-column parent
    - `columnIndex: 0` on the root or a Container
- **Native trace.** Every verdict traces the same way through the new native admission.

## Regression tests (3, none compiled or run)

**`engine/src/cmd/edm.rs`:**
- `edm_designer_structural_column_index_follows_shared_optional_integer_target`
  - Runs all 36 shared verdicts, asserting that each is accepted or refused and that the log grows only on
    acceptance.
  - Directly asserts that an absent key is `None`, `0` is `Some(0)` and `null` is an error.
  - On the old source it fails on `null` at the root (the captured operation) and on the other wrong-type
    vectors.

**`ui-egui/src/edm_panel.rs`, `mod tests`:**
- `edm_panel_structural_targets_omit_absent_column_and_keep_column_zero`
  - Root and nested targets: add, move and duplicate have no `columnIndex` key and no `null`.
  - Columns 0, 1 and 2 are kept exactly for add, move and duplicate.
- `edm_panel_structural_emission_matches_shared_targets_and_engine_admits_it`
  - Uses the real `EdmDesigner::insertion_target` / `location` on the shared design.
  - Emits root, nested and column-0 add; move up/down in the root, the Container and column 0; and
    duplicate in all three.
  - Each operation must equal the shared-accepted JSON exactly, then be admitted and logged once by
    `edm_designer_apply` in a fresh session.

**Pin counts for the parent:**
- Engine `cmd::edm` goes from 29 to 30 names.
- `edm_panel` goes from 1 to 3.
- No test was renamed or removed.

## Residual limitations

- **Not executed.** No Rust was compiled or run, and there is no WASM or real-browser structural
  acceptance. The separate real-WASM worker still records the structural failure, because its build is
  the old package.
- **`index` is not aligned.** It still reads `as_u64`, so native refuses `1.0` while shared accepts it. That
  fails closed, and the panel only emits integers.
- **Long lines.** Some new test lines and the embedded JSON literals exceed 150 characters. rustfmt is
  parent-owned.
- **Not done here.** The tracked patch, pins, expected test counts and Linux CI are parent-owned and were
  not regenerated.

## Coordinator review before Linux CI

The new panel fixture initially bound a local `designer` variable over its
same-named helper, then attempted to call the helper later in the function.
Coordinator renamed the helper to `target_designer`, retaining the assertions
and production fix. This was found by source review before compilation. Final
file hashes and exact30 engine/8 bridge/8 UI expected test names are recorded
in `evidence/native-designer-source-20261102.json`; the worker hash table above
describes its earlier freeze. Patch dry run, strict workflow input validation,
shell syntax and diff checks pass. Rust/WASM execution is still pending.
