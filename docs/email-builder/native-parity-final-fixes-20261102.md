# Native parity: final-review fixes (2 November 2026)

Task `task_71ae85312bc3`, dispatch `ctx_e8ffac59fc2a`. This fixes H1 and M1–M5 from
`native-parity-final-review-20261102.md`, in the recovered native source at
`.verification/figflow-native-source-20261102/work/`.

**Evidence class.** These changes are source edits only, and none of them has been compiled or run. Per the
coordinator's resource policy I ran no Cargo, rustc, clippy, rustfmt, wasm or Rust test, and no browser or
keyboard session. Linux CI is the parent's job. Every "fails before / passes after" statement below comes
from reading and tracing the source.

The only code I executed was the repo's existing `node_modules/.bin/tsx`. I ran it read-only against the
shared TypeScript to produce the expected vectors (see "Shared-derived vectors"). I installed nothing and
touched no DB, provider, deploy, commit or staging.

## Scope

**Files edited** (paths relative to `.verification/figflow-native-source-20261102/work/`):

| File | Frozen SHA-256 (before) | New SHA-256 | Lines |
|---|---|---|---|
| `crates/engine/src/cmd/edm.rs` | `644a9055b29bced99e0a9c6051a4a2f9d4a0f238d43695f71173cfce0d643c5c` | `e665c48837cc4dd0336fe38e319da21d2d5c5cb5624d731856d09e04f0b4e065` | 2970 → 3251 |
| `crates/ui-egui/src/edm_panel.rs` | `2ff1f5c440ebf8bf2b9b6829eda916c8530072fcbb377f451b0c2489f48775f5` | `29c04c475348e49464293b949ebe444424a7acfaea98aefd4f88c5c917961068` | 338 → 361 |
| `crates/ui-egui/src/shortcuts.rs` | `37f141a03b3527518329c7a92fa1726451c022a576810041fc46f8342999a14d` | `ffb6640fc2f662e534860aab4e0934c2ab70eedb63805cf6cdf1721cde8084db` | 641 → 791 |

**Not touched:**
- Everything else: the tracked patch, pins, config, root tests and the root repo.
- `Cargo.toml` and the crate manifests, which still match `base/`.
- `Cargo.lock`, which is byte-identical to `base/` (`539397…5b94`).
- `browser_bridge.rs`.
- The live-save incident.

**Invariants preserved:**
- `DESIGNER_OPERATION_TYPES` still has the same six kinds.
- `designer_snapshot` still returns exactly `{operationId, operations}`.
- No apply, undo or redo is exported through the browser bridge. The bridge test that refuses
  `edm_designer_apply` is untouched.
- No dependency was added.
- No existing fixture was weakened. The only edits to existing fixtures are the H1 `.unwrap()` and two added
  refusal assertions.

## Findings re-checked against shared source before editing

| # | Re-verified? | Notes |
|---|---|---|
| H1 | Yes | `child_ids` returns `crate::Result<Vec<String>>`, and `EngineError` has no `PartialEq`. |
| M1 | Yes | Both counterexamples hold. A third input also diverged: `{{\u0085address}}`. Rust `is_whitespace` treats U+0085 as whitespace and JS `\s` does not, so native locked a block that shared leaves editable. |
| M2 | Yes | Also found **N1**, a real divergence that a self-derived fixture could never show (below). |
| M3 | Yes | `mailto://user:pass@…` and `tel://user@…` are refused by shared and were accepted by native. |
| M4 / M5 | Yes, from source | `handle_edm_history` ran before the panel-field, palette and text-edit gates. |

**N1 (new, Medium, fixed).**
- Native `canInsert` was false for any container whose subtree contains a linked module block. The old
  rule was `!linked.iter().any(|id| descendants.contains(id))`.
- Shared `designerCapabilities` only refuses insertion when the block itself sits inside a module root's
  subtree. A container that merely holds a module can still insert, and shared `add-section` checks only
  `linked.has(parentId)`.
- Consequence: any real design with `moduleInstances` under `root` failed native import with "capability
  block mismatch" once shared capabilities were fed in, and native refused adds that the server accepts.
  The existing module fixture never caught this because native capabilities were compared with native.

## Fixes

1. **H1.** `assert_eq!(child_ids(...).unwrap(), vec!["nested-container"])`.
2. **M1: exact shared legal regex.** `legal_props_locked` now uses an overlapping offset scan
   (`match_offsets`) that mirrors how the regex tries every offset:
   - `unsubscribe`
   - `email|postal|mailing`, then an optional single `[_ -]` separator, then `preferences|address`, which
     covers the no-separator forms
   - `{{` at every offset (so `{{{address}}}` and `x{{{{address}}` match), then optional `\s`, the marker,
     optional `\s`, then `}}`

   Two exact-parity details are part of the same rewrite:
   - **Case.** It uses `to_ascii_lowercase`. Without the `u` flag, JS `/i` folds only ASCII letters.
   - **Whitespace.** A new `js_whitespace` matches ECMAScript `\s` exactly: it includes U+FEFF and excludes
     U+0085.

   This closes the matching half of L2.
3. **M2 / N1.** `can_insert` now uses `!linked.contains(block_id)`, which is the shared semantics. Proof
   comes from the shared-derived vectors below, not from native agreeing with itself.
4. **M3: URL authority.**
   - `valid_url` now reads the WHATWG authority after `scheme://` for every allowed scheme. For mailto and
     tel, any `@` in that authority is refused.
   - HTTP(S) still requires a non-empty, `@`-free authority.
   - `mailto:team@example.invalid` has no authority and is still accepted.
   - The character screen now uses `js_whitespace`, so U+FEFF is refused as in `safeLink`. `is_control` is
     kept, so U+0085 and the other C1 codes are still refused. That direction is stricter than shared,
     never looser.
5. **M4 / M5: keyboard.**
   - Removed `handle_edm_history` and its early return. `handle()` again lets panel fields (`typing` or
     `field_focused`) and the palette keep their keys. During canvas text editing, `text_keys` keeps its
     original Cmd/Ctrl+Z: end the edit, then generic `edit.undo`, which reverts the unlogged typing.
   - Canvas Cmd/Ctrl+Z reaches `run_binding` exactly once, through `key_event`. Its `edit.undo` /
     `edit.redo` arms go to `edm_designer_undo` / `redo` only when `edm_canonical_history` holds:
     - the document is a designer document,
     - there is no interaction and no text edit, and
     - the new `EdmDesigner::native_matches(&Document)` (a public wrapper over `designer_native_matches`)
       confirms the canvas is exactly what the log built.
   - Otherwise the key falls through to generic `menus::invoke`. A pending unlogged native edit is
     therefore undone by the generic history that recorded it, after which the next press replays the log.
6. **Stale-field recommit (M5, panel side).**
   - In `edm_panel.rs`, the text and combo field helpers (`props_text`, `props_choice`, `style_text_field`,
     `style_choice`) now drop a commit whose value equals what the field showed (`changed`).
   - Previously, focusing a field and clicking away logged a no-op `set-props` / `set-style`, which also
     cleared the redo branch.
   - Number fields are unchanged; they commit only on an edit.

## Shared-derived vectors (M2)

- **How they were produced.** I generated them on 2 November 2026 by running the shared
  `designerCapabilities`, `applyDesignerOperations` and `legal` regex (`shared/emailRendering/designDesigner.ts`)
  through `tsx`. The generator script is session scratch, outside the repo:
  `…/chat-scratch/2c1fd486794e5ec7d9083ff6539584a0/vec/gen.mts`.
- **Where they live.** The outputs are pinned verbatim as constants in the `edm.rs` tests:
  `SHARED_VECTOR_DESIGN`, `SHARED_VECTOR_CAPABILITIES`, `SHARED_VECTOR_MUTATIONS`, `SHARED_VECTOR_LINKS`
  and `SHARED_LEGAL_TEXT`.
- **What the vector design covers:**
  - each M1 form
  - FEFF, a NEL control and near-miss controls
  - an `UNSUBSCRIBE` Button
  - a Container whose prop locks its descendant
  - a linked module under `root` (N1)
  - a ColumnsContainer
- **Shared results:**
  - **Capabilities.** `root` is editable=false and canInsert=true; `columns` is canInsert=true; every legal
    block, `legal-parent`, `inner-text`, `module` and `module-text` are editable=false; `plain-near` and
    `plain-nel` are editable=true.
  - **Mutations.** Shared refuses all five mutation kinds (text, style, move, duplicate, remove) on every
    legal or inherited block. On plain blocks it accepts style, move, duplicate and remove, and refuses
    text because of merge tokens.
  - **Links.** mailto and tel credentials are refused, `mailto://example.invalid` and `mailto:?to=…` are
    accepted, and an `https` URL ending in U+FEFF is refused.
- **Before vs after.**
  - On the frozen source, `edm_designer_shared_capability_vectors_import_and_tampering_is_refused` fails
    for the M1 blocks, for `plain-nel` and for `root` canInsert (N1).
  - On the frozen source, the link vectors fail for the four credential URLs and FEFF.
  - On the new source, all three trace to pass.

## Added and changed test names (all uncompiled and unexecuted)

`crates/engine/src/cmd/edm.rs`:
- **Fixed (H1):** `edm_designer_structural_children_require_exact_container_and_column_shapes`
- **Extended with move-section and duplicate-section refusal:**
  `edm_designer_legal_address_tokens_lock_capabilities_and_every_mutation_kind`
- **New:**
  - `edm_designer_legal_lock_follows_shared_regex_offsets_separators_and_js_whitespace`
  - `edm_designer_shared_capability_vectors_import_and_tampering_is_refused`
  - `edm_designer_shared_mutation_vectors_refuse_text_style_move_duplicate_and_remove`
  - `edm_designer_shared_link_vectors_reject_authority_credentials_for_every_scheme`
  - `edm_designer_native_match_tracks_unlogged_edits_and_their_generic_undo`

`crates/ui-egui/src/shortcuts.rs`, in the new `#[cfg(test)] mod edm_history_key_tests`. These are headless
egui tests through `crate::layers_drag_tests::Ui`, and the design's capabilities are shared-derived.
- `edm_canvas_cmd_z_replays_the_canonical_log_once_per_press`
- `edm_canvas_cmd_z_undoes_an_unlogged_native_edit_generically_before_the_log`: fails on the frozen source
  (M4)
- `edm_cmd_z_in_a_panel_field_or_the_palette_leaves_the_log_alone`: fails on the frozen source (M5). It
  uses `app.field_focus = true`, a pattern `paste_image_tests.rs` already uses.
- `edm_cmd_z_while_editing_canvas_text_ends_the_edit_and_undoes_the_typing_generically`: fails on the frozen
  source, where it reports "editor busy"

`crates/ui-egui/src/edm_panel.rs`, in the new `#[cfg(test)] mod tests`:
- `edm_panel_field_commit_logs_only_a_changed_value`

## Deferred lows (not implemented)

- **L1.** Edit ▸ Undo/Redo in the menu and the control API `ui.key` text path still go to generic history.
  Generic history is the recovery path for unlogged edits. Menu Redo after a designer apply can still wedge
  the designer through the mismatch check.
- **L2 (partly done).** Done: whitespace parity in the legal matcher, and U+FEFF in `valid_url`.
  Deferred: `valid_url` still refuses U+0085, DEL and C1 controls, which shared accepts. This fails closed.
- **L3.** Native still accepts some URLs that WHATWG cannot parse, such as `https://[x`. It is still
  stricter elsewhere: `https://@host` is accepted by shared and refused by native, and `mailto://@host` is
  now the same. All of these fail closed.
- **L4.** A null `columnsCount` is still rejected natively (shared treats it as `?? 2`). This is separable
  from the M fixes, so it was not touched. It fails closed at import.
- **L5.** Same-URL images with different bytes.
- **L6.** Replay cost, including auto-repeat on Cmd+Z, which `key_event` still allows for undo.
- **L7.** Formatting. Many existing lines in `edm.rs` and `edm_panel.rs` exceed 150 characters and the body
  of `if capability.editable {` is still unindented. The parent owns `cargo fmt`. The new code keeps lines
  ≤150 except the pinned JSON string literal (one 315-character line) and two `edm_panel.rs` call lines
  that rustfmt can wrap.
- **L8.** Resolved, because the early return was removed.

## Remaining acceptance (parent-owned, honest status)

- **Linux CI must still prove:**
  - compilation of test and non-test targets
  - `cargo test` for the engine and ui-egui, including the five new engine fixtures, the four keyboard
    fixtures and the panel fixture
  - clippy with `-D warnings`, rustfmt and wasm
- **Unexecuted assumptions:**
  - Native build/layout accepts the vector texts containing U+FEFF and U+0085.
  - `normalize` is a no-op on designer rebuilds. The new native-match fixture and the existing undo fixture
    both rely on this.
  - Headless egui delivers Cmd/Ctrl+Z through `key_event`, and Enter begins canvas text editing on a
    designer text node.
- **Not done at all:** keyboard behaviour on a real desktop or WASM window, and whether the browser delivers
  Cmd+Z to egui rather than to the page. The headless tests cover routing only.
- **Not regenerated here:** the tracked patch, source pins, test-name receipts, and hosted / core bridge
  acceptance.

## Coordinator disposition before CI

The coordinator regraded L1 as a functional history issue: a person using the
visible Edit menu must get the same canonical Undo/Redo behavior as the keyboard.
The current source now routes eligible menu history through the same internal
canonical commands; mismatched native edits still use generic undo for recovery.
The control API text-edit path remains generic while editing, as required.
`edm_canonical_history` is crate-visible only; the browser allowlist is unchanged.
The coordinator added `edm_menu_history_uses_the_canonical_log_and_preserves_native_recovery`
to cover menu undo/redo, generic recovery and refusal to apply stale generic redo
after a canonical edit. This is still an uncompiled fixture, not a passed test.

This adds `crates/ui-egui/src/menus.rs` to the changed native inputs and updates
`shortcuts.rs`. Final per-file hashes and the complete expected 27 engine,
eight bridge and six UI test names are in `evidence/native-designer-source-20261102.json`.
The earlier worker hash table describes its freeze, before this coordinator
addition. Deferred lows L2-residual and L3–L7 remain recorded; none allows a server
policy bypass. Full URL grammar, null-column normalization and performance still
need their own evidence if encountered during actual-WASM acceptance.
