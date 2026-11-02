# Native parity remediation: final adversarial review (2 November 2026)

Task `task_450ca450200d`, dispatch `ctx_9a12322680f5`. This was a single bounded, read-only review of the
source freeze described in `native-parity-remediation-20261102.md`.

## Scope and evidence class

- **Frozen native source** (`.verification/figflow-native-source-20261102/work/`). The SHA-256 hashes I
  re-computed match the freeze record:
  - `crates/engine/src/cmd/edm.rs`: `644a9055…3c5c`
  - `crates/ui-egui/src/edm_panel.rs`: `2ff1f5c4…75f5`
  - `crates/ui-egui/src/shortcuts.rs`: `37f141a0…a14d`
- **Shared contract.** I compared against `shared/emailRendering/designDesigner.ts`, `designContract.ts`,
  `designCapabilities.ts` and `designActions.ts`.
- **Everything below is from reading the source only.** I did not run Cargo, rustc, clippy, rustfmt, any
  tests, WASM, a browser, or a keyboard. No compile result, test result or runtime behaviour is claimed. A
  "compile hazard" is a type error I derived by reading the code. Each "counterexample" is an input traced
  by hand through both implementations.
- **Paths.** Native paths are relative to `.verification/figflow-native-source-20261102/work/`. Shared
  paths are relative to the repo root.
- **No changes.** I edited no source and staged or committed nothing. This file is the only artifact.

## Summary

| # | Severity | Area | Verdict |
|---|---|---|---|
| H1 | **High** | Test compile hazard (fix 5 fixture) | Confirmed by source |
| M1 | Medium | Fix 2: legal lock parity (residual) | Confirmed by source |
| M2 | Medium | Fix 2 proof: capability-agreement fixture checks native against itself | Confirmed by source |
| M3 | Medium | Fix 4: credentials in `mailto:`/`tel:` authority | Confirmed by source |
| M4 | Medium | Keyboard: Cmd/Ctrl+Z can no longer undo unrecorded canvas edits | Confirmed by source; runtime unexecuted |
| M5 | Medium | Keyboard: Cmd/Ctrl+Z inside a focused panel field | Confirmed by source; runtime unexecuted |
| L1–L8 | Low | See below | Mixed |

No finding for:
- fix 3 (nested merge-token scanning)
- fix 5 (structural children), except L4
- fix 6 (egui borrow): compiles on source review
- atomic undo/redo replay and deterministic IDs in the engine
- browser bridge allowlist, the six server operation kinds, and the `{operationId, operations}` snapshot shape

---

## High

### H1. A new fixture fails to compile and blocks every engine test

- **Where:** `crates/engine/src/cmd/edm.rs:2851`, in
  `edm_designer_structural_children_require_exact_container_and_column_shapes`.
- **The code:**
  ```rust
  assert_eq!(child_ids(&valid["blocks"]["columns"]), vec!["nested-container"]);
  ```
- **Why it fails to compile:**
  - `child_ids` returns `crate::Result<Vec<String>>` (`edm.rs:207`). That is
    `std::result::Result<Vec<String>, EngineError>` (`engine/src/lib.rs:117`).
  - `EngineError` derives only `Debug` and `thiserror::Error` (`lib.rs:85-86`). It has no `PartialEq`.
  - No `PartialEq<Vec<&str>>` impl exists for `Result<Vec<String>, EngineError>`.
  - The `assert_eq!` is therefore error E0277 ("can't compare").
- **Effect:**
  - The `#[cfg(test)] mod tests` block won't build. `cargo test -p <engine>` fails before any test runs.
  - This blocks the old fixtures and all eight new ones, including undo/redo and the image fixtures.
  - The non-test build is not affected.
- **Smallest fix (parent owns it):** unwrap on the left (`child_ids(...).unwrap()`). The comparison is then
  `Vec<String>` against `Vec<&str>`, which compiles via `String: PartialEq<&str>`.

## Medium

### M1. Native still misses shared legal-lock matches (fix 2 residual)

- **Native:** `crates/engine/src/cmd/edm.rs:1335-1346` (`legal_props_locked`).
- **Shared:** `shared/emailRendering/designDesigner.ts:68`:
  ```
  /unsubscribe|email[_ -]?preferences|postal[_ -]?address|mailing[_ -]?address|\{\{\s*(?:address|business_address|company_address)\s*\}\}/i
  ```
  It is tested against `JSON.stringify(props)` (`:83`).

There are two divergences. In both, shared locks the block and native does not.

1. **Zero-width separator.** In the shared regex, `[_ -]?` is optional, so `emailpreferences`,
   `postaladdress` and `mailingaddress` match. The native marker list only has the three separated forms of
   each.
   - Counterexample: a Text block with a `text` grant and text `Manage your {{emailPreferencesUrl}}`, or
     `Our {{postalAddress}}`. After lowercasing, the text contains `emailpreferences` / `postaladdress`.
   - Shared `ownLocked` is true, so `editable=false`. Native `own_locked` is false (no other lock applies),
     so `editable=true`.
2. **Overlapping `{{`.** Native scans with `legal.match_indices("{{")`, which returns non-overlapping
   matches.
   - Counterexample: `{{{address}}}` (Handlebars triple-stash). Native only finds the `{{` at offset k. Its
     candidate is `{address}}}`, which fails `strip_prefix("address")`, and the inner `{{` at k+1 is never
     tried.
   - The shared regex matches `{{address}}` at k+1.
   - The same applies to `{{{ company_address }}}` and `x{{{{address}}`.

**Consequences:**
- **At import:** `validate_designer_capabilities` (`edm.rs:1514-1543`) compares the shared-advertised
  `editable` value with the native one. It fails with "capability block mismatch", so these templates
  cannot be opened in the native designer. This fails closed, but it is a parity break.
- **During a session:** suppose an author types plain prose such as `postaladdress` into a granted text
  field. Merge-token preservation does not stop this because no `{{` is involved. Shared now treats the
  block as locked; native keeps it editable. Native then accepts follow-up `set-style`, `move-section` or
  `remove-section` operations on that block that `applyDesignerOperations` will refuse on the server. The
  whole snapshot is then rejected at save time.

### M2. The fix 2 fixture cannot detect shared/native disagreement

- **Where:** `crates/engine/src/cmd/edm.rs:2567-2574` and `2794-2809`.
- **The problem:**
  - The fixture's helper `designer_capabilities` builds the "advertised" capabilities by calling the native
    `designer_capability` (`:2570`).
  - So in `edm_designer_legal_address_tokens_lock_capabilities_and_every_mutation_kind`, "advertised and
    native agree" is a tautology: native is compared with native.
  - The recovery requirement (`native-parity-recovery-20261102.md` item 2) was to prove agreement between
    shared and native capabilities.
- **Counterexample:** swap any M1 input (`{{{address}}}`, `{{postalAddress}}`) into the fixture's token
  list. The import still succeeds, because native capabilities are fed back to native validation. The only
  failure is the fixture's own `editable == false` assertion. Nothing would catch a design where shared
  says locked and native says editable.
- **Also:** the "structural mutation refusal" proof only exercises `remove-section`.
  `move-section` and `duplicate-section` refusal on legal blocks is not exercised.
- **What would close the gap:** a cross-runtime vector, where the shared `designerCapabilities()` output
  for a fixed design is pinned as a JSON fixture and fed to the native import.

### M3. Native accepts credentials in `mailto:`/`tel:` URLs (fix 4)

- **Native:** `crates/engine/src/cmd/edm.rs:159-185`, `valid_url`. The `@`-in-authority check runs only
  for http(s) (`:177`).
- **Shared:** `designDesigner.ts:166-175`. `safeLink` rejects any URL whose WHATWG `URL` has a non-empty
  `username` or `password`.
- **Counterexample:**
  - A Button `url`, or an Image `linkHref`, set to `mailto://user:pass@example.invalid` or
    `tel://user@example.invalid`.
  - WHATWG parses an authority for non-special schemes that are followed by `//`. So shared sees
    `username = "user"` and rejects the URL.
  - Native lowercases the scheme to `mailto` / `tel`, skips the authority block, and returns `true`.
- **Effect:**
  - The native designer logs a `set-props` operation that the server's `applyDesignerOperations` rejects
    (`deny('url')` / `deny('linkHref')`), so the snapshot is refused.
  - Meanwhile the native canvas shows a credential-bearing link.
  - Image `url` is not affected (HTTPS only).
- **Note:** the new fixture
  (`edm_designer_safe_url_rejects_credentials_and_invalid_fragment_shorthand`, `:2826-2842`) only tests
  credentials on `https`.

### M4. Keyboard undo can no longer recover unrecorded native edits

- **Where:** `crates/ui-egui/src/shortcuts.rs:95-114` (`handle_edm_history`), the call at `:125-127`, and
  the `run_binding` arms at `:294-299`.
- **What changed:** in any designer document, every Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z is routed to
  `edm_designer_undo` / `edm_designer_redo`. This happens before the text-editing path (`:141-145`
  `text_keys`, whose `:568-571` used to end the edit and run the generic `edit.undo`).
- **Why that matters:** canvas edits are still possible in designer documents, and they go into generic
  history. The existing fixture `edm_designer_rejects_unlogged_canvas_text_and_geometry_changes`
  (`edm.rs:2686-2699`) uses `node.set` / `node.create` to prove this. Both designer history commands refuse
  as soon as the native document diverges:
  - `designer_history` checks `designer_native_matches` and returns "unsupported native change"
    (`edm.rs:2203-2205`).
  - It returns "editor busy" when `text_edit` is set (`:2199-2201`).
- **Counterexample (unexecuted):**
  1. Import the designer.
  2. Drag a block, or double-click a text node and type.
  3. Press Cmd+Z.
  - Before this change, generic undo reverted the unrecorded edit and the native fingerprint matched again.
  - Now `edm_designer_undo` fails (a toast via `FigApp::failed`), the canvas edit stays, and every later
    `apply`, `undo`, `redo` and `snapshot` keeps failing.
  - During text editing, Cmd+Z only reports "editor busy" and the typed characters remain.
  - The only recovery left is the Edit menu (see L1).
- **Status:** confirmed from source. The actual keyboard behaviour, and whether the browser build delivers
  Cmd+Z to egui at all, is unexecuted.

### M5. Cmd/Ctrl+Z in a focused panel field undoes an unrelated canonical operation

- **Where:** `shortcuts.rs:125-127` runs before the panel-field gate at `:130-135`. The relevant field code
  is `widgets.rs:533-576` (`text_field_in` commits on lost focus whether or not the text changed:
  `:561-563`) and `edm_panel.rs:62-68`.
- **Counterexample (unexecuted):**
  1. Use the Text field to apply `set-props text-1 → "Hi {{firstName}}"` (operation count 1).
  2. Click the field again. Its buffer is `"Hi {{firstName}}"`.
  3. Press Cmd+Z. `handle_edm_history` runs `edm_designer_undo`: the canonical text reverts to
     `"Hello {{firstName}}"` and the redo count becomes 1. egui's own TextEdit also processes the same event,
     because `ctx.input` does not consume it.
  4. Click away. `text_field_in` returns the stale buffer, and `props_text` applies
     `set-props "Hi {{firstName}}"`. A non-empty apply clears redo (`edm.rs:2183-2185`).
- **Net effect:** the user's undo is silently re-applied and the redo branch is lost.
- **Also:** editing the command-palette query (`app.ui.palette`) is intercepted the same way.

## Low

- **L1. Menu and control routes bypass the operation log.**
  - Edit ▸ Undo/Redo in the main menu goes `menus.rs:363-364` → `invoke` → generic `app.run` (`:275-277`).
    The control API `ui.key` in text context goes through `control.rs:285-287` → `menus::invoke`. Neither
    path goes through `run_binding`.
  - In a designer document, generic history only holds unrecorded native edits. Generic Undo is therefore
    effectively the recovery path for M4, not a source of corruption.
  - Counterexample: after a generic menu Undo, a designer apply, then menu Redo restores a doc snapshot
    taken before that apply. This wedges the designer through the mismatch check.
  - The freeze document's claims are limited to "panel buttons + keyboard", so this is a scope note.
- **L2. Whitespace class differs between JS `\s` and Rust `char::is_whitespace`.**
  - U+FEFF: shared `\s` matches it (both the legal regex and `safeLink`'s `/[\s<>"'…]/`). Rust does not.
  - U+0085 is the reverse.
  - Counterexample: `{{\u{FEFF}address}}` is locked by shared but not by native. A Button url
    `https://example.invalid/\u{FEFF}` is rejected by shared but accepted by native.
  - Affects `edm.rs:160` and `edm.rs:1341-1344`.
- **L3. Native accepts URLs that WHATWG cannot parse.**
  - Examples: `https://[x`, `http://:80`, `https://ex%ample.com`.
  - Native only requires a non-empty, `@`-free authority (`edm.rs:178-183`). Shared `new URL(...)` throws.
  - This fails closed at the server (snapshot refused).
  - Native is stricter in the other direction (for example `https://a\@b`).
- **L4. A null `columnsCount` is handled differently.**
  - Shared `designChildIds` uses `columnsCount ?? 2` (`designContract.ts:153`). `props` is
    `z.record(z.unknown())` (`:33`), so `null` is admitted and becomes 2.
  - Native `child_ids` (`edm.rs:226-229`) rejects `Some(Null)` as "invalid columnsCount".
  - This fails closed at import.
- **L5. Same-URL images with different bytes.**
  - The baseline URL→bytes map is first-block-wins (`edm.rs:1596-1601`). Import never checks that blocks
    sharing a URL also share bytes.
  - Counterexample: suppose `img-1` and `img-2` share a URL but the browser envelope supplies different
    bytes. A canonical no-op `set-props url` (the same URL) on `img-2` then repaints it with `img-1`'s bytes
    (`edm.rs:1985-1990`).
  - Unlikely, because the browser fetches bytes per URL.
- **L6. Undo/redo may stall the UI (plausible, unmeasured).**
  - Every undo or redo replays up to 300 operations from the baseline.
  - Each operation re-runs `validate_designer_design` plus capability checks. `designer_inherited_lock`
    computes descendants for every block, which is O(B²).
  - `handle_edm_history` does not filter `repeat`, so holding Cmd+Z queues a full replay per auto-repeat
    event. This could stall the UI on WASM.
- **L7. Formatting.** `edm_panel.rs:178-262`: the body of `if capability.editable {` is not indented, and
  several lines exceed `max_width = 150` (`rustfmt.toml`). `cargo fmt --check` will report diffs. Parent
  owns formatting.
- **L8. The early return skips the rest of `handle()` for that frame.**
  - On a frame containing Cmd+Z, that includes `text_keys`, which must run every frame during text editing
    to keep the IME composition alive (`shortcuts.rs:138-142`).
  - It also includes any other same-frame chords, and the `selection_spacing::cancel` handling that the
    generic path applies to undo (`:338`).

## Checked with no finding

- **Fix 1 (immutable image reuse).** `edm.rs:1213-1225`, `1596-1611`, `1985-1991`, `2154-2163`.
  - Every changed Image URL now resolves bytes from `baseline_url_images`.
  - A→B→A, empty→B and replay all reset from `baseline_block_images`.
  - `doc.images` is rebuilt from the per-block map (`:943`), so the "two images in store" fixture assertion
    holds on source reading.
  - Every non-empty baseline Image URL must carry bytes at import (`:1555-1572`), so every URL that shared
    `existingImages` admits has bytes.
- **Fix 3 (merge tokens).** `edm.rs:1782-1804` is equivalent to `/\{\{[^{}]+\}\}/g`.
  - A failed opener advances one byte. A success advances past `}}`.
  - Slice boundaries are always on ASCII braces.
  - Sort-order differences (UTF-8 vs UTF-16) don't matter, because both sides of the comparison use the
    native sort.
- **Fix 5 (structure).** `edm.rs:207-252` matches `designChildIds`:
  - container-only direct children
  - no hidden `columns[*].childrenIds` on non-ColumnsContainer blocks, even empty ones
  - exact column count, object columns, and Id arrays with at most 300 entries

  The only exception is L4.
- **Fix 6 (egui borrow).** `edm_panel.rs:146-157`.
  - Every value taken from `ds`/`designer` is owned: the cloned block, `kind`, `capability`, `location`,
    `insertion`, the counts, and `list_len`.
  - `content_grants` is a `BTreeSet<&'static str>`, and `allows` captures only that local set. `contains`
    with a `&str` resolves through `&str: Borrow<str>`.
  - No use of `ds` or `designer` follows line 157, so NLL ends the shared borrow of `app.session` before the
    first `&mut app` call.
  - `NativeImage` now derives `Debug` (`edm.rs:73`), and `ImageData` is `Clone, Debug, PartialEq`
    (`doc/src/lib.rs:151`), so `#[derive(Clone, Debug)] EdmDesigner` is satisfied.
- **Atomic replay** (`edm.rs:2146-2226`).
  - Apply, undo and redo all mutate a clone and commit only after a successful rebuild.
  - The undo closure's disjoint borrow of `designer.redo_operations` is sound (edition 2024; the receiver
    `pop()` finishes first).
  - `operation_index` is `operations.len()` both on the live path and during replay, so generated IDs are
    identical.
  - An empty apply or empty history does not clear redo or invent operations.
  - The session's `Err` path also restores `ds.doc` (`lib.rs:1004-1014`).
  - Both history commands are `history: false`, so no generic undo steps are created (`lib.rs:1096`,
    `1103-1109`).
- **Shortcut source compile check** (`shortcuts.rs:95-114`). The pattern
  `Event::Key { key: Key::Z, physical_key, pressed: true, modifiers, .. }`, the
  `lookup(..).map(|b| b.id).filter(|id| matches!(*id, …))` chain, and the `run_binding(app, &'static str)`
  call type-check on reading. The keymap binds only `Cmd+Z` and `Shift+Cmd+Z` (`keymap.rs:296-297`), so
  there is no `Ctrl+Y` path that escapes the `Key::Z` filter.
- **Bridge surface.**
  - `browser_bridge.rs:126-139` and `:173` still allow only designer import and snapshot; no undo, redo or
    apply.
  - `DESIGNER_OPERATION_TYPES` is unchanged at six kinds (`edm.rs:1209`).
  - `designer_snapshot` still returns exactly `{operationId, operations}` (`edm.rs:1629-1642`).

## Not verified here (parent-owned)

- **Compilation.** Whether test and non-test targets compile on Linux, and clippy and rustfmt results. H1
  is the one compile blocker found by reading the source.
- **Undo fixture baseline equality.** The undo fixture's "pristine native" check (`edm.rs:2895`) compares
  a fresh `build_native` + `normalize` result (`lib.rs:1089-1091`) with the import document, which went
  through `DocState::new` (`lib.rs:419-425`). It passes only if both of those are serialization no-ops on
  `build_native` output. The existing apply→snapshot fixtures depend on the same `normalize` assumption,
  but I have no executed evidence.
- **Runtime behaviour.** Keyboard delivery in the desktop and WASM builds, paint output, and hosted / core
  bridge acceptance.
