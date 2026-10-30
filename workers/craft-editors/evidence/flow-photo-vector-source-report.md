# PhotoFlow / VectorFlow source branding: report

Date: 2026-10-28 · Task: task_c2ee0e523fb2 · Dispatch: ctx_649745633c79

## Result

| App | Pinned archive (untouched) | Source tree (edited) | Patch | Files | Replay |
|---|---|---|---|---|---|
| PhotoCraft → **PhotoFlow** | `photocraft.tar.gz` sha256 `511d22ee…5a1a9` (commit `b1794c6e0608ccfc887213dcf58398977c5cb75e`) | `/private/tmp/flow-source-build-20261028/photocraft` | `/private/tmp/photoflow-branding.patch` sha256 `60dddd1891d888cacc4842951600c3d460018aa79cc9ca6d935d215371d9861e` | 62 (753+/784−) | OK |
| VectorCraft → **VectorFlow** | `vectorcraft.tar.gz` sha256 `e09f4431…f376d` (commit `43313f9451de7ab5b909801006b8881458f2bf04`) | `/private/tmp/flow-source-build-20261028/vectorcraft` | `/private/tmp/vectorflow-branding.patch` sha256 `9c8ca0e626e47b9dd72abe528bbfd2ef0fbfa6bc2166bc61d94b2aba0a0131d5` | 77 (1176+/1244−) | OK |

**Replay test.** Before editing, each source tree was identical to its archive (`diff -rq` against a fresh extract). For each app I extracted the archive again into an empty dir, ran `patch -p1 < <patch>` from the top-level `<app>-<sha>/` directory, and compared the result with the edited source tree using `diff -rq`. There were no differences. The patches are `diff -ruN a/ b/`, so apply them with `-p1`.

**Re-running the edit.** The edit is a script, not hand-made: `python3 -I /private/tmp/flow-pv-tools/rebrand.py photocraft|vectorcraft <pristine-root>`, with the label translations in `translations.py`. It checks the match count of every exact edit, so it fails on anything other than these exact pins and refuses to run twice on the same tree. Each run writes a per-edit log to `/private/tmp/flow-pv-tools/<app>-rebrand.log`, which also lists every line kept on purpose. The static checker `verify.py <app> <root>` writes `/private/tmp/flow-pv-tools/<app>-verify.txt`. Tool sha256: rebrand.py `3b388480…284b`, translations.py `2db4d02b…3de11623`, verify.py `26e0e3ee…faca`.

**Not done** (per instructions): no compiler, toolchain install, build, deploy, binary patching, or edits outside the two source dirs. The original archives were not changed. **No Rust compile or test has been run**, so `cargo test` is the first real check (see "Risks").

## Coordinator decisions applied

The coordinator's reply of 2026-10-28 and the brand-licence note:

- The app's own name becomes PhotoFlow / VectorFlow wherever the UI shows it.
- Website/home links now open `https://xeroflow-creative-tools.adme-dev.workers.dev/` and are labelled **XeroFlow Creative Tools**.
- Upstream links keep their destinations and are relabelled **Upstream Website / Upstream Source / Upstream Community**: getartcraft.com, github.com/storytold/<app> and discord.gg/artcraft. The update/release endpoint (`github.com/storytold/photocraft/releases`) is unchanged.
- The About box carries plain-text attribution: "Based on the original PhotoCraft/VectorCraft project by the ArtCraft team." Credits, author and licence text are unchanged.
- No upstream logo artwork is drawn in the UI. The title-bar/About mark, previously the kitsune/dragon PNG via `include_bytes!`, is now a code-drawn monogram tile ("PF"/"VF"). The ArtCraft marks in `docs/brand/` were never used by the UI, and the files themselves are untouched.

## What changed

### PhotoFlow (`photocraft`)
- **Web shell.** In `apps/photocraft-web/index.html` and `apps/photocraft-web-boot/index.html`: `<title>`, "Loading PhotoFlow…" and the stalled-load hint. Element ids (`photocraft_canvas`, `photocraft_loading`, `photocraft_stalled`), keyframes and trunk links are unchanged.
- **WASM-side text.**
  - `apps/photocraft-web/src/web.rs`: the start-failure HTML.
  - `apps/photocraft-web-boot/src/main.rs`: download and retry messages.
- **Display-string brand pass over `crates/ui-egui/src`** (80 replacements, code lines only, comments untouched):
  - app menu `APP_NAME`, window/title-bar title and the theme width measurement for it;
  - Home title, About title and blurb, Updates window, GPU/System Info text;
  - screen colour picker title, Wayland/clipboard notices, preferences and shortcut-set messages;
  - the "PhotoFlow Defaults" display label, the "Default PhotoFlow Size" preset, rasterize/print dialog titles, KYS import messages;
  - Actions plural, and the matching test assertions.
- **Help menu labels** (`crates/engine/src/shell_commands.rs`; command ids unchanged):
  - help.discord → "Upstream Community…"
  - help.website → "XeroFlow Creative Tools"
  - help.artcraftWebsite → "Upstream Website"
  - help.github → "Upstream Source"
  - help.about → "About PhotoFlow"
- **Links** (`crates/ui-egui/src/links.rs`):
  - `APP_PAGE` now points to the launcher.
  - The Discord button reads "Upstream Community".
  - The link row reads "XeroFlow Creative Tools · Upstream source · Upstream website".
  - The URL test is updated.
- **About** (`dialogs.rs`): the new attribution line.
- **Status/error messages shown in the UI** (engine, io, raw, codecs; 15 literals). Examples: HEIC not in build, JPEG XL DNG in browser, face detection in browser, XCF/ABR/PSD warnings, droplet/script/tip/gradient/swatch/smart-filter/ATN step errors.
- **Brand mark.** `crates/ui-egui/src/brand.rs` was rewritten as the monogram. `mark_rect` is still recorded for the existing title-bar tests, and the brand test now asserts that no 128 px image texture is uploaded.
- **Tests updated where they assert display text:**
  - in `crates/ui-egui/src`: `native_menu.rs`, `panels.rs`, `menus.rs`, `menu_nav_tests.rs`, `credits_tests.rs`, `shortcut_set_tests.rs`, `kys_import_tests.rs`, `notices.rs`, `new_doc_ui.rs`, `canvas.rs` (button label), `i18n/live_tests.rs`;
  - `apps/photocraft/tests/mac_menu_appkit.rs`.
- **Catalogs.** The 20 populated `crates/ui-egui/src/i18n/*.tsv` files were updated; `hi.tsv` had no affected rows.
  - The name is replaced in source key and translation alike.
  - Link rows were remapped to the new labels with new translations.
  - "PhotoCraft website" and "PhotoCraft Website" both map to "XeroFlow Creative Tools", so one duplicate row was dropped per catalog.
  - The attribution row was inserted after the About blurb.

### VectorFlow (`vectorcraft`)
- **Web shell** (`apps/vectorcraft-web/index.html`): `<title>`, `apple-mobile-web-app-title` and the loading text. `vectorcraft_canvas` and `vectorcraft_loading` are unchanged.
- **WASM-side text.**
  - `web.rs`: the start-failure notice and "Loading VectorFlow…" (via `@msg`).
  - `api.rs`: the "VectorFlow is not running yet" rejection.
- **Brand pass over `crates/**` (except `crates/mcp`, `crates/testkit`, `render/examples`)** plus `apps/vectorcraft-web/src` (103 replacements):
  - app menu title and the in-window filter on it (`menus.rs`), `APP_NAME`, Hide/Quit, About, "VectorFlow Help…", Welcome;
  - window/app-bar title, preference hints, recovery/script-check/missing-fonts/confirm dialog text, shortcut-import text;
  - the app-sense status/error/warning messages in engine/format/eps/svg/metafile/affinity/color/pdf (e.g. "file version … is newer than this VectorFlow supports"), plus their `@msg` catalog keys;
  - save-option tooltips that name the app ("older VectorFlow versions");
  - the "VectorFlow Shortcuts.json" default name;
  - every test that asserts those strings.
- **Desktop.** `apps/vectorcraft/src/main.rs` only: the 5 GPU-start messages, because they share `@msg` catalog rows with the web build.
- **Help commands** (`crates/engine/src/cmd/help.rs` labels and `menus.rs`):
  - help.discord → "Upstream Community"
  - help.website → "Upstream Website" (still getartcraft.com)
  - help.appPage → "XeroFlow Creative Tools", which now returns the launcher URL (`LAUNCHER_URL`)
  - help.github → "Upstream Source"
  - The engine and UI URL tests are updated.
- **Community panel** (`community.rs`):
  - button "Upstream community"; hover "Upstream community on Discord (discord.gg/artcraft)";
  - links "Upstream website", "XeroFlow Creative Tools", "Upstream source".
- **About** (`dialogs/about.rs`): title, the "VectorFlow" name label, and "Based on the original VectorCraft project by the ArtCraft team. MIT OR Apache-2.0. Fonts: … Icons: Lucide (ISC) + VectorCraft." The icon credit stays as-is because it is attribution.
- **Shortcut preset.** "VectorCraft Defaults" becomes **"VectorFlow Defaults"**, and `("VectorCraft Defaults", "VectorFlow Defaults")` is added to upstream's own `LEGACY_PRESETS` migration. Stored preferences and `shortcuts.preset {name:"VectorCraft Defaults"}` keep working.
- **i18n tests.** `MENU_KEEP_AS_IS` now lists "VectorFlow" and "XeroFlow Creative Tools".
- **Brand mark.** `brand.rs` is now the monogram. `chrome.rs` `system_mode_hides_the_mark` now checks the painted rect, not the PNG texture.
- **Catalogs.** All 24 `*.tsv` files were updated.
  - Brand pass on keys and translations.
  - Link and About rows remapped with translations.
  - The "XeroFlow Creative Tools" rows were dropped, because the name is kept in English (`MENU_KEEP_AS_IS`; a kept name may not have a row in the 18 keeper catalogs).
  - The 6 non-keeper catalogs' "VectorCraft" identity row became "VectorFlow".

## Compatibility contracts preserved (deliberately NOT renamed)

| Kind | PhotoFlow | VectorFlow |
|---|---|---|
| DOM ids the WASM looks up | `photocraft_canvas`, `photocraft_loading`, `photocraft_stalled` | `vectorcraft_canvas`, `vectorcraft_loading` |
| JS/API globals, storage, caches | `photocraft.*` IndexedDB, `photocraft-*` localStorage keys | `window.vectorcraft`, `vectorcraft-*` keys, `vectorcraft-recovery/` |
| Command ids / protocol | `help.*` ids incl. `help.artcraftWebsite`; engine `DEFAULTS_NAME` "PhotoCraft Defaults" (the `useSet`/`activeSet` value and the reserved name check) | all command ids; `help.links` keys; the MCP crate (`serverInfo` title, instructions, tool docs) |
| Persisted names | "PhotoCraft Actions" default action set (`DEFAULT_SET`) and the set name written into `.kys` exports | "VectorCraft Default" PDF preset id (also in `[VectorCraft Default]`, "Differences from VectorCraft Default:"), "VectorCraft Generic CMYK (SWOP-like)" profile name, "VectorCraft Templates" folder, "VectorCraft Save for Web" temp folders |
| File formats and bytes | ICC profile descriptions "(PhotoCraft)", "PhotoCraft Coated CMYK", EPS `%%Creator: PhotoCraft`, XMP `x:xmptk`, DPX creator, `.cube` comment, droplet script header, `.PhotoCraft-face-` font aliases | `%VectorCraft_BeginData/EndData`, `VectorCraft_Legacy` procset, EPS/AI `%%Creator`, PDF creator/producer and the editing-data `/Desc`, native-format `generator`, TIFF Software, EMF description, the PostScript `product` value; format labels "VectorCraft" / "VectorCraft Template" / "VectorCraft Swatches (.vcswatches)" and format-sense messages ("not a VectorCraft file", "isn't a VectorCraft document", "save as VectorCraft…", "VectorCraft documents: one locked object…") |
| Build/crate/paths | crate and package names, binaries, `Trunk.toml`, artifact names, `assets/app-icon/*` files (not deleted) | the same |
| Agent-facing docs | engine command parameter docs (`atn_cmds`, `layer_menu_cmds`), MCP `INSTRUCTIONS` | `cmd!` parameter docs (including the clean-room provenance notes in `effects`, "chosen VectorCraft defaults"), the help.discord description |
| Legal/attribution | LICENSE-*, NOTICE, ATTRIBUTION.md, `docs/brand/LICENSE-brand.txt`, credits, `LICENSE-translations.txt`, plug-in example author lines | the same, plus "Icons: Lucide (ISC) + VectorCraft." |

## Remaining user-visible "Craft" strings (audit)

The full line lists are the "code lines still naming…" sections of `/private/tmp/flow-pv-tools/<app>-verify.txt`.

1. **Intentional attribution:**
   - "Based on the original PhotoCraft/VectorCraft project by the ArtCraft team.";
   - "… Icons: Lucide (ISC) + VectorCraft.";
   - the hover URL text "discord.gg/artcraft" and the link destinations.
2. **PhotoFlow, persisted/protocol names that a user can see:**
   - the Actions panel's default set "PhotoCraft Actions";
   - the set name inside exported `.kys` files;
   - built-in ICC profile names in colour-settings lists;
   - The shortcut dialog shows "PhotoFlow Defaults", but the engine id stays "PhotoCraft Defaults".
3. **VectorFlow, format names in Save/Export/Place UI:**
   - "VectorCraft", "VectorCraft Template", "VectorCraft Swatches (.vcswatches)";
   - "VectorCraft documents…" (Place), "save as VectorCraft…" fidelity notes;
   - the PDF preset "VectorCraft Default" and "[VectorCraft Default]";
   - the colour profile "VectorCraft Generic CMYK (SWOP-like)".
   These name the file format or persisted presets. Renaming them needs a migration plan, as for the shortcut preset.
4. **Desktop-only, not in the web build:**
   - `apps/photocraft/src/*` and `apps/vectorcraft/src/*`: window titles, logs, portable/profile directory names, mac/portal file filters, Windows resource metadata (`build.rs` ProductName);
   - `photocraft-cli` / `vectorcraft-cli` help text;
   - `packaging/**`, `docs/**`, README files.
5. **Stale catalog rows not referenced by code at these pins:**
   - PhotoFlow: "Join the ArtCraft Discord ({url})" and an old Wayland row; they are never shown.
   - VectorFlow: the "Noto Sans SC" About variant was remapped anyway.
6. **Test/sample data, never shown:** bidi/type-tool sample text, temp-dir names, plug-in debug names (`"PhotoCraft tool cursor"` etc.).
7. **Outside these trees** (host-owned): `Cargo.toml` package `description`s, the root launcher/iframe titles, and served `HOSTING.md`/README files in the release zips.

## Exact build requirements (root, sequential)

- **Toolchain** (the coordinator reports these installed in isolation): Rust 1.95 with target `wasm32-unknown-unknown`, `trunk` 0.21.14, wasm-bindgen 0.2.129, and `wasm-opt` for `data-wasm-opt="z"`.
- **Disk.** Build one app at a time (12 GiB free). Point `CARGO_TARGET_DIR` at a per-app dir, or reuse one sequentially.
- **PhotoFlow.** Run from the photocraft source root: `packaging/web/package.sh`. It runs:
  - `(cd apps/photocraft-web && trunk build --release)`, with features `heif` and profile `wasm-release` (`index.html` link);
  - then `(cd apps/photocraft-web-boot && trunk build --release)`.
  - It then splits the gzipped app wasm into `app/*.part-*` + `parts.txt` (20 MiB parts, 24 MiB file cap) and zips `photocraft-web-<version>`.
  - Fonts: optional `fonts/manifest.txt` at host time.
- **VectorFlow.** Run from the vectorcraft source root: `CRAFT_FONTS_DIR=<craft-fonts checkout at the release pin> packaging/web/package.sh`. It runs `(cd apps/vectorcraft-web && trunk build --release)`, whose `post_build` hook runs `cargo xtask web-fonts`, and then zips `vectorcraft-web-<version>`.
- **SRI.** Because display strings live in the WASM, the filehashes, `integrity="sha384-…"` attributes, boot part names and `parts.txt` all change. Host config must take the new artifact names from the built `index.html` and must not reuse old hashes.
- **Suggested gate before hosting** (not run here):
  - `cargo test -p photocraft-ui-egui -p photocraft-engine`
  - `cargo test -p vectorcraft-ui-egui -p vectorcraft-engine -p vectorcraft-eps -p vectorcraft-metafile -p vectorcraft-format -p vectorcraft-pdf`
  - `cargo fmt --check` and `cargo clippy`; upstream's full gate is `cargo xtask ci`.

## Risks / not verified

- **Not compiled.** The only new Rust code is the two `brand.rs` monograms and the `help.rs` `LAUNCHER_URL`; everything else changes string literals. `brand.rs` uses egui `Painter::rect_filled` / `Painter::text`, `CornerRadius::same(u8)` and `FontId::proportional`; check against the pinned egui version.
- **Translations are mine** (clean-room, from the English meaning): about 6 new phrases in 25 languages, in `translations.py`. Native-speaker review is recommended, especially for ka, hi, el and bg.
- **Static checks run.** `verify.py` mimics the catalog tests: no duplicate rows, placeholders and ellipses match. Every renamed catalog key is present in code (except the stale rows already noted). It cannot run upstream's scanner-based tests, such as `partial_catalogs_only_translate_strings_the_ui_shows`.
- **Loose ends:**
  - The "Upstream Community" button replaces "Join us on Discord" at the same text length, so the narrow-canvas clipping test should still hold.
  - A user can still create a custom PhotoFlow shortcut set named "PhotoFlow Defaults", because the engine reserves only the "PhotoCraft Defaults" id. Cosmetic; a possible follow-up.
  - `rustfmt`: two string literals exceed `max_width` (about.rs's About string, and an existing-style long literal). rustfmt leaves literals alone, and `error_on_line_overflow` is off.
