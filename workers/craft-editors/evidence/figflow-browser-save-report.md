# FigFlow browser Save / Save as / Export: source report

Date: 2026-10-28 · Task `task_09a74b6a1769` · Dispatch `ctx_49aa2b45db3b`

Scope: source changes only, in `/private/tmp/flow-source-build-20261028/figcraft`. There are two patches: browser save/export
(§1–§6) and the XF mark follow-up (§7). Nothing was compiled, installed, deployed or
run. No server, authentication or file system was added. The branding patch was not modified.

## 1. Artifacts

| Item | Value |
|---|---|
| Baseline | `figcraft.tar.gz` (figcraft 0.11.2 @ `d4a303d4708602a9df1738960852d18b185a616b`) + `/private/tmp/figflow-branding.patch` (sha256 `f5198f5f6235c82047268910d343dd3d3fb8c1e74a62b1a106a49a63dafe60b9`, unchanged) |
| Patch | `/private/tmp/figflow-browser-save.patch` — sha256 `c48d5d59e2956da33ef593cf6179ce3c287c97a27da6082aa6e2eb3a741273eb` |
| Size | 27 files, +476 / −12 (8 Rust sources, 1 new test file, 18 locale catalogs) |

**Replay (verified on a fresh extraction):**

```sh
tar xzf figcraft.tar.gz && cd figcraft-d4a303d4708602a9df1738960852d18b185a616b
patch -p1 < /private/tmp/figflow-branding.patch
patch -p1 < /private/tmp/figflow-browser-save.patch
```

`patch -p1 --dry-run`, `git apply --check -p1` and the real apply all ran clean; no `.orig`/`.rej`; `diff -r` against the
working copy shows **no differences**. Before editing, the working copy matched tarball + branding patch exactly.

## 2. Root cause

`WebServices` (`apps/figcraft-web/src/web.rs`) already implements `downloads() -> true` and `download(name, bytes)` (Blob +
temporary `<a download>`), but only Variables ▸ Export consulted them. Every other save/export called `FigApp::pick_save` /
`pick_folder`, whose browser default future resolves to `None`, so the continuation never ran: **no error, no toast, no
download** (root's "Export page as PNG does nothing"). Save on an unsaved (path-less) browser document fell through to Save as
and died the same way.

## 3. What changed

All branching is on the existing `Services::downloads()` at the shared UI boundary; desktop (`downloads() == false`) takes the
untouched original code path in every function.

### Engine — `crates/engine/src/cmd/file.rs`
- **`save_in_memory(&mut Session) -> Result<(FileSnapshot, String, Vec<u8>)>`**: runs the same pre-save steps
  `Session::execute` runs before a native `file.save` (`branches::sync`, end the live text preview, end the version preview),
  takes a `FileSnapshot` of `branches::file_tab` (main file for a branch tab, with its branches) and encodes it with the
  existing `FileSnapshot::encode` → `figcraft_format::save_bytes_with_history`: content, thumbnail, version history and
  branches. These are the exact bytes desktop Save writes. File name `<safe_file_name(doc name)>.figcraft` (`Untitled` when
  empty).
- **`FileSnapshot::delivered(self, &mut Session) -> bool`**: marks the tab saved as of the snapshot without writing or inventing
  a path. Same staleness rule as the auto-save `save()` (tab closed, saved, reverted or re-pathed since → nothing marked). Edits
  made after the snapshot stay unsaved.
- `FileSnapshot::save` is refactored onto the shared `tab()` / `saved_in()` helpers. Behaviour is identical: same match, write
  before marking, same history/branch bookkeeping.

### Format — `crates/format/src/lib.rs`
- **`zip_files(iter of (name, bytes)) -> Result<Vec<u8>, FormatError>`**: a `.zip` built with the crate's existing `zip`
  dependency and `put` helper. PNG/JPG/WEBP/GIF members are stored, the rest deflated; a repeated name is refused explicitly.
  Placing it in `figcraft-format` (which already depends on `zip`) means **no new crate dependency and no `Cargo.lock` change**.

### UI — `crates/ui-egui/src`
- `lib.rs`
  - `save()` and `save_as_dialog()`: when `downloads()` is true, call `download_file()`.
  - `download_file()`: `save_in_memory` → `deliver` → `snapshot.delivered` → toast "Saved X.figcraft". If the download is
    refused, the file stays unsaved and a toast says "Couldn't download X.figcraft".
  - New shared helpers: `deliver(name, bytes)` (calls `Services::download` and shows a toast on failure) and
    `deliver_data(name, result)` (decodes a command's base64 `data`).
  - Engine-requested `dialog.saveAs` UI requests now reach the download path too.
- `export_panel.rs`
  - `save_one` downloads the result of `file.export` (no `path`; the engine already returns base64 `data`), named as the
    desktop dialog would suggest. This covers the page's **Export page as PNG**, the Design panel's single export, and the
    Export dialog's PNG/JPG/WebP/**SVG**/**PDF** presets.
  - **Multi-export:** `export_layers` with more than one job now calls `download_archive`. It runs `file.exportLayers` (no
    `dir`, so each file comes back as `data`), decodes each file and drops its base64 copy as it goes, zips the files, and
    downloads one `<doc>.zip`. A layer name's `/` folders stay folders inside the zip; names are already sanitised and
    de-duplicated by `jobs_for`/`export_path`, and `..` is dropped. The archive is capped at 512 MiB of payload, which gives a
    clear toast ("…too large to download in the browser (over 512 MB): export fewer layers at a time."). This covers the
    Design panel's "Export N layers", the Export dialog's "With the layers' export settings", and the Inspect tab's asset
    export.
- `dialogs.rs`: `.fig (experimental)` downloads `<doc>.fig`. The existing "left out" warnings toast is kept, and the export is
  not counted as a save. `save_fig` became `pub(crate)` (for the test).
- `menus.rs`: File ▸ Export frames to PDF downloads `<doc>.pdf`.
- `windows.rs`: "Save" in the close-window prompt. A file that the browser download saved synchronously now continues the
  close loop instead of staying open. The desktop branch is unchanged: there, a file that is still dirty means no dialog
  started, so the window stays open.
- `apps/figcraft-web/src/main.rs`: the stale crate doc ("no native file dialogs yet") now describes open/save/export.

### i18n (18 catalogs; `es-419` inherits `es`)
Two new `[ui]` keys. Each was added to `en.toml` and drafted for bn, cs, de, es, fi, fr (no-break space before `:`), id, ja,
ka, ko, nl, pl, pt-BR, ru, sv, tr, zh-Hans:
- `"Couldn't download {name}"`
- `"{name} is too large to download in the browser (over 512 MB): export fewer layers at a time."`

Placeholders were checked to match English. Every catalog parses as TOML, and no catalog has a key that English lacks
(mirrors `i18n_tests.rs`). All other strings reuse existing keys ("Saved {name}", "Exported {name}", the `.fig`
left-out plural). The `commands` and `menu` key sets are unchanged.

## 4. Preserved
- **Desktop:** every desktop path is untouched — native dialogs, path validation, `.fig`-is-an-export semantics, recents,
  auto-save. `platforms_with_save_dialogs_keep_them` plus the existing `save_as_tests`, `variables_export_ui_tests` and
  `file_menu_pdf` cover this.
- **Formats and ids:** `.figcraft` bytes are produced by the existing native encoder, and no format changed. Command ids, MCP
  surface, catalog, keymap, DOM ids, storage keys, env vars, crate names and the `figcraft://` scheme are all unchanged. No
  command was added and no command parameters changed.
- **Licensing:** LICENSE-*, NOTICE, ATTRIBUTION, credits and upstream authorship are untouched. All new code follows the
  upstream style (doc comments, no-panic lints: no `unwrap`/`expect`/indexing panics in shipped code).
- **Other apps:** only the FigFlow tree changed.

## 5. Regression tests added (not run — no compile per instructions)
- `crates/ui-egui/src/browser_save_tests.rs` (9 tests, a `Browser` Services that records downloads):
  - Save downloads a `.figcraft` that reloads with the same layers, is marked saved, makes up no path, and toasts.
  - Save as, then edit, then Save downloads twice, and the second file has the new layer.
  - A refused download leaves the file dirty and says so.
  - A version preview ends before saving, so the file itself is saved and not the version shown.
  - **Export page as PNG** downloads PNG bytes (the root repro).
  - SVG and PDF exports download.
  - Three export settings download one zip containing every job's name.
  - Frames PDF and `.fig` export download, and the file stays unsaved.
  - With a dialog-based platform, Save and Export still start a dialog and never download.
- `crates/format/src/lib.rs` `zip_files_keeps_each_file_under_its_name_and_refuses_repeats`: round-trips through
  `ZipArchive`, checks stored vs deflated, and checks that a duplicate name is refused.

## 6. Exact commands for root (after the shared-target build frees the queue)

Run from `/private/tmp/flow-source-build-20261028/figcraft`, with `CRAFT_FONTS_DIR=<pinned craft-fonts dir>` as for the web build.
`--locked` proves `Cargo.lock` is untouched.

```sh
cargo test --locked -p figcraft-ui-egui --lib browser_save_tests
cargo test --locked -p figcraft-ui-egui --lib save_as_tests
cargo test --locked -p figcraft-ui-egui --lib variables_export_ui_tests
cargo test --locked -p figcraft-ui-egui --lib i18n_tests
cargo test --locked -p figcraft-ui-egui --test it file_menu_pdf
cargo test --locked -p figcraft-format zip_files
cargo test --locked -p figcraft-engine autosave        # FileSnapshot::save refactor
cargo test --locked -p figcraft-engine save_format
cargo clippy --locked -p figcraft-engine -p figcraft-format -p figcraft-ui-egui --all-targets -- -D warnings
cargo check --locked -p figcraft-web --target wasm32-unknown-unknown
cargo fmt --all --check   # if a rustfmt is available; lines were checked by hand against max_width 150
# then the usual web build:
cd apps/figcraft-web && trunk build --release
```

Browser smoke test after the build:
1. Draw a rectangle, then Cmd/Ctrl+S → `Untitled.figcraft` downloads, the dirty dot clears, and re-opening it restores the
   file.
2. Page ▸ Export page as PNG → a `.png` downloads.
3. File ▸ Export… → SVG and PDF presets download.
4. Give a frame two export settings → "Export 1 layers"/dialog "Export N layers" → one `<file>.zip` downloads.

## 7. Follow-up: XF mark in the editor (`/private/tmp/figflow-xf-mark.patch`)

Requested mid-task by the coordinator: replace the in-editor corner icons with the XeroFlow mark (a white rounded square with
black "XF", MarketingNav style) and use regular white "XeroFlow" text wherever the wordmark is shown. This is kept as a
separate patch.

| Item | Value |
|---|---|
| Patch | `/private/tmp/figflow-xf-mark.patch` — sha256 `c2ee7ae4d4490b4361b0a8e776d8b8c3d7d21c0f57a2bf4af36115afdc50464c` |
| Files | `theme.rs`, `layers.rs`, `lib.rs` (test module registration), new `xf_mark_tests.rs` |
| Order | branding → browser-save → xf-mark. It also applies on branding alone (verified with `--dry-run`). |

**Verified:** fresh tarball + branding + browser-save + xf-mark (`git apply --check`, then `patch`, no `.orig`/`.rej`) is
identical to the working copy.

- `theme::paint_xf_mark(painter, rect)` (new, code-drawn, no image edits):
  - The square is white with a faint 1 px black-alpha edge, so it stays visible on light themes.
  - Corner radius is `side × 8/36`.
  - "XF" uses the semibold face, colour `#121317`, at `side × 0.4` and never under 10 px. A 36 px square gives 14 px
    letters, as on the marketing site.
- **Editor top-left corner:** the rail's main-menu button (`layers::rail`) now draws the mark at 24 px (the old code drew
  `Icon::Logo` at 18 px) inside the same 36×32 hit area. Egui id `rail_menu`, the "Main menu" tooltip and the a11y popup are
  unchanged.
- **Home sidebar and About window:** `paint_app_icon` keeps its signature and callers but draws the XF mark instead of the
  chameleon PNG texture. The texture cache id `figcraft_original_app_icon` is no longer created; it was a data key, not a
  widget id.
- **Wordmark:** `paint_wordmark` now draws "XeroFlow" in the regular face in the theme's text colour (white on the default
  dark theme). It replaces the two-tone "Fig"+"Flow". The About window's title, "About FigFlow", and its text keep the
  product name.
- **Tests:** `xf_mark_tests.rs` renders headless frames.
  - Editor: exactly one "XF" in the top-left corner, near-black, at least 10 px tall, on a white rounded square.
  - Home sidebar: the mark plus the "XeroFlow" wordmark, and no "Fig"/"Flow".
  - Existing tests are not affected: `home_recents_tests::images` already excludes the sidebar by x position, and nothing
    else asserts the old icon or wordmark.
- **Not changed (needs image assets or packaging, both out of bounds):**
  - The OS window/taskbar icon (`apps/figcraft/src/services.rs::window_icon`, chameleon PNG).
  - Packaging icons.
  - `assets/app-icon/*` (left in place, MIT/Apache originals).
  - The web build has no favicon.

Root commands for this patch (with those in §6):

```sh
cargo test --locked -p figcraft-ui-egui --lib xf_mark_tests
cargo test --locked -p figcraft-ui-egui --lib home_recents_tests
cargo test --locked -p figcraft-ui-egui --lib home_tests
```

## 8. Limitations / notes
- **"Saved" means handed to the browser.** `<a download>` gives no completion signal. If the user cancels a "Save as…" prompt
  that their browser shows, the file is still marked saved. A false return (Blob or URL failure) is detected and keeps it
  unsaved. There is still no save-in-place, no auto-save and no crash-recovery copy in the browser (unchanged; the
  Preferences checkbox stays hidden on wasm).
- **Save as cannot pick a name or `.fig` in the browser.** It always downloads `<doc>.figcraft`; `.fig` stays in Export ▸
  `.fig (experimental)`.
- **Memory:** exports go through the commands' base64 `data` (about 1.33× extra, transient). The zip path frees each base64
  copy as it decodes, and is capped at 512 MiB of payload. Exports remain bounded by the engine (≤ 1000 files per
  `exportLayers`; renders refuse "too large").
- **Out of scope:** some picks still need a path and still do nothing in the browser:
  - Variables ▸ Import… (`pick_open`).
  - Plugin import.
  - Any other `pick_open`/`pick_folder` caller.

  They were not part of this save/export task; the fix would be the same pattern with `pick_open_contents`.
- **Not compiled or tested here.** No Rust toolchain or rustfmt is on PATH in this session, and compiling was out of bounds.
  Type and borrow correctness was reviewed by hand line by line; the tests above are the gate.
- **Translations** of the two new strings are machine-drafted like the existing catalogs; native review is recommended, as
  before.
- Scratch dirs used for the baseline and verification (`/private/tmp/figflow-save-work`) were removed after verification.
