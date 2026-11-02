# Native parity remediation source freeze — 2 November 2026

Task `task_69ec3ae73811`, dispatch `ctx_c40d8011e964`.

## Outcome

Remediated all five reviewed parity counterexamples and the parent-found egui borrow hazard, and added internal canonical operation-log Undo/Redo with focused Rust fixtures. The work is source-frozen for parent patch regeneration and Linux compilation; this worker did not run Cargo, Rust compilation, tests, WASM, deployment, or hosted acceptance.

Native edits are confined to the recovered source under `.verification/figflow-native-source-20261102/work/` (also available through `/private/tmp/figflow-roundtrip-native-work-20261101`):

- `crates/engine/src/cmd/edm.rs`
- `crates/ui-egui/src/edm_panel.rs`
- `crates/ui-egui/src/shortcuts.rs`

No root shared TypeScript, tracked browser bridge patch, source pin, configuration, dependency, or server operation contract was edited.

## Source fixes

1. **Immutable image reuse.** `EdmDesigner` now retains immutable baseline block-image and URL-to-verified-image maps. Every Image `set-props.url` resolves bytes from the baseline URL map, rather than conditionally retaining the target block's mutated bytes. Replay starts from the immutable per-block baseline map. Fixtures cover A→B→A, empty→B, repeated snapshots, distinct paint hashes, and history replay.
2. **Legal token lock parity.** The shared case-insensitive legal alternatives are represented directly, including `{{address}}`, `{{ address }}`, and arbitrary literal whitespace around `address`, `business_address`, and `company_address`. Capability agreement is enforced at import; text, style, and structural mutations are refused on locked blocks.
3. **Nested merge opener scanning.** Native token scanning now follows `/\{\{[^{}]+\}\}/g`: an invalid outer opener advances one byte so an inner valid opener can match. Nested, unmatched, empty, and multiple ordinary token fixtures are included.
4. **URL credential and fragment grammar.** Direct fragments are limited to `#[A-Za-z0-9_.:-]*`; HTTP(S) userinfo is rejected; HTTP, HTTPS, mailto, and tel positive controls remain for links, while Image URLs remain HTTPS-only. Credential-free absolute URLs may carry fragments, and rejected operations leave the log unchanged.
5. **Exact structural children.** Only EmailLayout/Container may own non-empty direct `childrenIds`. Non-ColumnsContainer blocks may not hide `columns[*].childrenIds`, even empty ones. ColumnsContainer requires exact column count, object columns, valid bounded child references, and valid nested structure.
6. **egui borrow hazard.** `designer_section` materializes text/url/alt/linkHref grants into an owned `BTreeSet` before mutable `FigApp` rendering calls. The old closure capturing `designer`/`app.session` is gone. `NativeImage` now derives `Debug`, matching the existing `EdmDesigner` derive and `ImageData` support.

## Canonical Undo/Redo

- Internal commands `edm_designer_undo` and `edm_designer_redo` operate on the canonical six-kind operation log, not generic canvas history.
- Undo pops the latest applied operation into the redo branch. Redo restores operations in original order. Both rebuild from the original baseline through the existing bounded operation validator and deterministic `designer_block_id` derivation.
- Apply, undo, and redo clone designer state and verify the native fingerprint before committing. Validation or rebuild failure leaves the document, applied log, and redo branch unchanged.
- A non-empty successful new apply clears redo. Empty apply and empty history commands do not invent operations.
- Panel Undo/Redo buttons call only the internal commands.
- Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z are intercepted in EDM designer mode before panel-field and native-text early returns, then routed through `run_binding` to the exact internal history commands. This is confirmed source routing; runtime keyboard behavior remains unexecuted in this worker.
- `edm_designer_snapshot` remains exactly `{operationId, operations}`. `DESIGNER_OPERATION_TYPES` remains the same six server kinds. No internal apply/undo/redo action was added to the browser bridge; the existing explicit browser allowlist remains designer import+snapshot only, and no history command name appears under `workers/craft-editors/`.

## New fixtures (all currently uncompiled and unexecuted)

In `crates/engine/src/cmd/edm.rs`:

1. `edm_designer_image_reuse_uses_immutable_baseline_for_aba_empty_and_snapshots`
   - Distinct A/B paint hashes; A→B→A; empty→B; repeated snapshots; two-byte image store.
2. `edm_designer_legal_address_tokens_lock_capabilities_and_every_mutation_kind`
   - Four legal token forms; advertised/native capability agreement; text/style/remove refusal; empty log after failures.
3. `edm_designer_merge_tokens_match_nested_unmatched_and_multiple_shared_scanning`
   - Nested opener, unmatched opener, multiple tokens, empty tokens, and a mutation that preserves the shared inner token.
4. `edm_designer_safe_url_rejects_credentials_and_invalid_fragment_shorthand`
   - Button/Image credential rejection; invalid direct fragment rejection; HTTP(S), mailto, tel, ordinary fragment, and absolute-URL fragment controls; HTTPS-only images.
5. `edm_designer_structural_children_require_exact_container_and_column_shapes`
   - Valid nested columns; non-container children; hidden non-container column references; direct ColumnsContainer children; count mismatch; missing references.
6. `edm_designer_undo_redo_replays_baseline_with_deterministic_ids_and_reorder`
   - Full undo to exact canonical/native baseline; empty-undo no-op; prefix-by-prefix redo; deterministic duplicate IDs and DFS child remap; same-list reorder; final native equality.
7. `edm_designer_history_restores_image_bytes_and_discards_redo_after_new_edit`
   - Image bytes across undo/redo and redo-branch invalidation after a new edit.
8. `edm_designer_history_failures_are_atomic_for_native_and_invalid_log_changes`
   - Unlogged native changes; mixed valid/invalid apply batch rollback; corrupted redo failure with unchanged native/log state.

Existing fixtures, including unlogged canvas rejection, image duplication, no-op baseline, mobile/style/structure, and deterministic duplication/reordering, remain in place.

## Exact native hashes

SHA-256, before → frozen:

- `crates/engine/src/cmd/edm.rs`
  - Before: `77a53f07329e1c76fe916a283f4ddf9b4cebccfda53713fce850cc7ee3edafbd`
  - Frozen: `644a9055b29bced99e0a9c6051a4a2f9d4a0f238d43695f71173cfce0d643c5c`
- `crates/ui-egui/src/edm_panel.rs`
  - Before: `00de937015151501b233807aa03759574fee22c82e8cad8eab5d6dabf82e646a`
  - Frozen: `2ff1f5c440ebf8bf2b9b6829eda916c8530072fcbb377f451b0c2489f48775f5`
- `crates/ui-egui/src/shortcuts.rs`
  - Before/upstream recovered: `ea96c020b0858d58143332fa0c1405c66f4c847eb6abfc8658c6f064e1b6164d`
  - Frozen: `37f141a03b3527518329c7a92fa1726451c022a576810041fc46f8342999a14d`

Frozen line counts: engine 2970, panel 338, shortcuts 641.

## Review and remaining verification limits

- Re-read all three changed native files end-to-end after editing.
- `git diff --no-index --check` reported no whitespace errors for all three files. The upstream shortcut diff contains only the EDM history interception/routing changes above.
- Reviewed shared `designDesigner.ts`, `designContract.ts`, `designCapabilities.ts`, `designActions.ts`, and `designRoundtrip.ts`, plus the current tracked browser bridge patch. No shared contract edits were made.
- Parent still must regenerate the tracked patch/source-pin/test-name receipts, compile Linux, run all old and new Rust fixtures, check formatting/clippy, and perform matching WASM/core bridge and hosted acceptance. Runtime keyboard behavior, paint output, and deployment behavior are not claimed verified here.
