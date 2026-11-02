# Native CI remediation: the seven `cmd::edm` failures from run 41414219457 (2 November 2026)

Task `task_236d4ebb8d85`, dispatch `ctx_45dadf7b3587`. Input:
`.verification/ci-followup-20261102/native-41414219457/native-tests/test-edm.log`, which reported 20 passed
and 7 failed in `figcraft-engine --lib cmd::edm`.

**Evidence class.** These are source edits only. I ran no Cargo, rustc, clippy, rustfmt, WASM or Rust test,
and I claim no Rust test as passing. Linux CI is the parent's job.

The only code I executed was the repo's existing `node_modules/.bin/tsx`. I ran it read-only against the
shared `applyDesignerOperations` to produce the style-lock vectors (below). The scratch scripts are outside the
repo. I touched no DB, browser, provider, deploy, CI, git index or commit.

## Scope

| File | SHA-256 before (the source CI ran; line numbers in the log match) | SHA-256 after | Lines |
|---|---|---|---|
| `.verification/figflow-native-source-20261102/work/crates/engine/src/cmd/edm.rs` | `d5a7205cd08782a7d3307a21828af72ed69a09e58411b3979d1685d15ad9a97e` | `94ea7556bb168e2ad68b15441f8fc52c18ca2f095e0a53a7066818e88659653c` | 3251 → 3316 |

**Not touched:**
- Every other native file, including `edm_panel.rs`, `shortcuts.rs`, `menus.rs` and `browser_bridge.rs`.
- The tracked patch, pins and scripts.
- The three untracked designer browser fixtures.
- All other source.

**Invariants kept:**
- `DESIGNER_OPERATION_TYPES` still has the same six kinds.
- `designer_snapshot` still returns exactly `{operationId, operations}`.
- No apply, undo or redo is exposed through the bridge.
- No dependency was added.
- No lock, merge-token rule or image-bytes check was loosened.

## Root causes

### 1. Snapshot rebuild looked up image bytes by hash, but they are stored by block (production bug, 4 failures)

**Failing tests:**
- `edm_content_roundtrip_preserves_canonical_identity_and_locked_fields`
- `edm_image_url_change_requires_bytes_then_reopens_current_paint`
- `edm_modern_styled_import_is_visible_semantic_and_noop_lossless`
- `edm_content_edit_reflows_once_without_phantom_or_compound_edits`

All four failed with `edm_import: image bytes are required`, raised from inside `edm_snapshot`.

**Cause:**
- `import_block` reads `images.get(id)`, where `id` is the block ID. `import` and `decode_designer_images`
  both build that map by block ID.
- The newer reflowing `snapshot` instead passed `build_native` a map keyed by image hash:
  `ds.doc.images.iter().map(|(hash, …)| (hash.clone(), …))`.
- So any content handoff that contains an Image block failed to snapshot. This includes a no-op snapshot.
  The browser bridge forwards `edm_snapshot` unchanged (`browser_bridge.rs:211`), so production hit this too:
  every real email with an image failed with `engine_refused` at save.

**Fix:**
- `snapshot` now builds a map from block ID to `NativeImage`. Each entry uses the hash that the loop already
  proves is the paint's, which is either the verified replacement or the unchanged baseline paint.
- The bytes are read from the document store, which `assert_structure` has already checked equals the
  baseline plus the verified replacements.
- An image paint whose hash is missing is now refused rather than compared `None == None`. That direction is
  stricter, never looser.
- Side effect: replaced bytes that no block paints any more are no longer carried into the rebuilt store.

Image-bytes authority is unchanged:
- A changed URL still requires bytes.
- Fills changed before a replacement are still refused.
- The paint hash must still equal the expected hash.

### 2. Every style lock was malformed and matched nothing (production bug, 1 failure)

**Failing test:** `edm_designer_locks_and_module_metadata_cannot_be_bypassed`. A `set-style color` on a block
with `styleFields: ["text-1.data.style.color"]` was accepted.

**Cause:**
- `assert_style_lock` formatted `"{block_id}.data.{}.{}.{key}"`, which adds a separator after an empty or
  `mobile.` prefix. The resulting paths were `text-1.data..style.color` and
  `text-1.data.mobile..style.color`.
- The shared contract (`designDesigner.ts:214`) builds
  `${blockId}.data.${mobile ? 'mobile.' : ''}${style|props}.${key}`.
- Because of the extra dot, no `designerLocks.styleFields` entry ever matched. That covers own, mobile,
  inherited (root `textColor` → descendant `style.color`) and ancestor-semantic (`buttonBackgroundColor` →
  root `canvasColor`) locks. Native accepted operations that the server refuses.

**Fix:** use the shared path format exactly. `locked_style_path` itself was already a faithful port.

### 3. History-atomicity fixture dropped an existing merge token (stale fixture, 1 failure)

**Failing test:** `edm_designer_history_failures_are_atomic_for_native_and_invalid_log_changes`.

**Cause:**
- The `designer_design()` text is `Hello {{firstName}}`.
- The fixture set it to `Logged`, `Must roll back` and `Undo me`, each of which drops `{{firstName}}`.
- Both shared (`deny('mergeTokens')`) and native refuse that, correctly.
- The newer `…native_match…` fixture already uses `Logged {{firstName}}`.

**Fix:**
- All three texts now keep `{{firstName}}`.
- As a result, `invalid_batch` now fails on its intended invalid colour, not on the token. Before, it rolled
  back for the wrong reason.

**Same correction, test that already passed:** in `edm_designer_rejects_unlogged_canvas_text_and_geometry_changes`,
`Still forbidden` became `Still forbidden {{firstName}}`. Its rejection is now caused by the unlogged-canvas
mismatch it is meant to prove, not by the merge-token rule. This is a tightening.

### 4. Column-geometry fixture looked up a role that Button roots never have (stale fixture, 1 failure)

**Failing test:** `edm_policy_and_column_geometry_stay_bounded_and_non_overlapping`. It panicked on
`Option::unwrap` in `mapped(…, "button-1", "block")`.

**Cause:**
- `wrapper` tags a root with role `block`, but the Button arm then overwrites it with role `button`. Image
  does the same with `image`.
- Role `button` is the retained contract:
  - `edm_panel.rs:318` keys the Button URL field on it.
  - Other fixtures map `button-1` / `button`.

**Fix:**
- Measure the `button` root, which is the same wrapper node the fixture wanted.
- Compare the bottoms with an absolute tolerance of `1e-9`. Each bottom is computed in floats as
  `top + (tallest - h) + h`.

The tolerance is my judgement because this assertion has never executed. If the parent prefers exact
equality, Linux CI will decide whether that holds.

## Added regression tests (2)

Both are in `crates/engine/src/cmd/edm.rs`, `mod tests`. Neither has been compiled or run.

1. `edm_snapshot_rebuild_keys_verified_image_bytes_by_block_and_drops_replaced_bytes`
   - **Setup:** two Image blocks with different bytes.
   - **No-op snapshot:** returns the exact canonical and keeps each block's own paint hash.
   - **After a verified URL replacement:** only `image-1` changes, both blocks paint the replacement's hash,
     and the store holds only that hash.
   - **Follow-up snapshot:** needs no bytes and is idempotent.
   - **On the old source:** fails at the first snapshot.
2. `edm_designer_style_locks_match_shared_desktop_mobile_and_inherited_paths`
   - Uses 14 `(lock, operation, accepted)` vectors in `SHARED_STYLE_LOCK_VECTORS`.
   - They were produced by shared `applyDesignerOperations` on `designer_design()` with only `designerLocks`
     changed. Without the lock, shared accepts all 14 (checked).
   - Each vector asserts both the accept/refuse result and that the log grows only on acceptance.
   - The 14 vectors are 8 refusals and 6 acceptances. **On the old source:** all 8 refusals are accepted
     (traced), so the test fails.

**Pin list for the parent:** the engine `cmd::edm` set goes from 27 to 29 test names, the 27 previous names
plus these two. No test was renamed or removed.

## Expected CI outcome (traced, not executed)

- The 7 failing tests should pass, along with the 2 new ones. The other 20 are unaffected.
- One exception to "unaffected": one of those 20,
  `edm_designer_rejects_unlogged_canvas_text_and_geometry_changes`, now uses the tighter text above. The
  style-lock fix only changes outcomes where `designerLocks.styleFields` is set, and the only existing
  fixture that sets it is one of the 7.

## Residual limitations

- **Never executed.** Lines in the four snapshot tests after their first snapshot call have never run on
  Linux. One example is the replace → fill-edit refusal → restore sequence in
  `edm_image_url_change_requires_bytes_then_reopens_current_paint`.
  - I traced them against the new code: images stay in the store, hashes are content-addressed and fills
    equal what `build_native` writes.
  - That trace assumes `node.set` on a plain, non-instance node adds no `overrides` entry. I found no such
    insert outside component/instance code.
- **Line length.** Three new test lines exceed 150 characters (L7, rustfmt is parent-owned). Existing lines
  in this file already do.
- **Unchanged lows.** The lows deferred in `native-parity-final-fixes-20261102.md` (L2 residual, L3–L7) are
  unchanged.
- **Not done here.** The tracked patch, source pins, test-name receipts and Linux CI are parent-owned and were
  not regenerated.
