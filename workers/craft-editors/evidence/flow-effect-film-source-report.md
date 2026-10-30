# EffectFlow / FilmFlow source branding: report

Date: 2026-10-28 · Task: task_19fa39d403f2 · Dispatch: ctx_a111cf47a423

## Outcome

- Both owned source trees carry a display-only rebrand, with both apps renamed:
  - `/private/tmp/flow-source-build-20261028/effectcraft` → EffectFlow
  - `/private/tmp/flow-source-build-20261028/filmcraft` → FilmFlow
- Both trees were handed back to root as settled (checkpoint messages `msg_ec445fb9529f` and `msg_d4d6bfd2f5bc`). Neither has been changed since. The `effectcraft/dist/` directory is root's build output, not part of the patch.
- Patches against the immutable pinned archives:

  | Patch | Files | Lines | sha256 | Base archive (sha256) |
  |---|---|---|---|---|
  | `/private/tmp/effectflow-branding.patch` | 41 | +352 / −364 | `522aea89…6874` | `effectcraft.tar.gz` @ `362474a843ddb67555d4c2d19ad6a590388aad0e` (`ffc0bb25…509e`) |
  | `/private/tmp/filmflow-branding.patch` | 47 | +387 / −401 | `66ec0748…f8e` | `filmcraft.tar.gz` @ `30536bc5d0ddf690f2181b7b97182db8658a6038` (`c745f45a…738`) |

- **Replay verified.** For each app I extracted the tarball into a fresh directory, ran `patch -p1 --dry-run`, applied the patch, then ran `diff -r` against the owned tree. The result was byte-identical for both apps.
  ```
  tar xzf effectcraft.tar.gz && cd effectcraft-362474a8…   && patch -p1 < /private/tmp/effectflow-branding.patch
  tar xzf filmcraft.tar.gz   && cd filmcraft-30536bc5…     && patch -p1 < /private/tmp/filmflow-branding.patch
  ```
- **Reproducible generator:** `/private/tmp/flow-effect-film-scripts/rebrand.py` (sha256 `2dd31c67…d861`). Run it with `python3 -I rebrand.py <effectcraft|filmcraft> <tree>`.
  - It is deterministic and idempotent: a second run is a no-op, which I checked on both apps.
  - On a pristine tree it regenerates exactly the owned tree.
  - It works from an explicit catalogue of display strings plus per-file exact edits. It is **not** a global replace.
- **Not done, as instructed:** no compile, no toolchain install, no deploy, no binary or WASM patching, and no edits outside the two owned directories. The patches touch no `LICENSE*`, `NOTICE`, `ATTRIBUTION.md`, `*.attribution`, contributor or credits file, `Cargo.toml` or `Cargo.lock`.
- **Not verified:** `cargo test` was not run, because compiling was out of scope. The upstream test rules I could check statically are covered in "Tests" below.

## How the rename works (both apps)

1. **Catalogues.** The English text is the i18n lookup key in both apps. So the script rewrites each catalogue row's key and its translation together, then rewrites every source literal that is exactly that key, tests included. Keys therefore stay consistent between the code, the menu DSL and every translation table.
   - EffectCraft: the inline tables in `crates/ui-egui/src/i18n.rs` (11 menu catalogues) and `i18n/ui.rs` (8 panel catalogues). The language of each table is found from its `const` name.
   - FilmCraft: the 11 `crates/ui-egui/src/i18n/*.tsv` catalogues.
   - The app name is swapped as a token inside each translation (for example `Über EffectFlow…`, `EffectFlow-ის…`, `EffectFlowについて…`).
   - EffectCraft's menu tree (`TREE` raw string in `crates/engine/src/menus.rs`) is rewritten by (command, label) from the same map, so the "no stale menu rows" test stays aligned.
2. **New labels for links whose destination stays upstream.** Per coordinator direction, each old row was replaced 1:1 in every table that had it, with my own translations. The new labels are "Upstream Documentation / Community / Home Page / Source on GitHub / Issue Tracker / Tutorials" and "XeroFlow Creative Tools".
   - The translations use the natural "original project" phrasing in each language, for example "Dokumentation des Originalprojekts…", "上游项目文档…" and "Документация оригинального проекта…".
   - "XeroFlow Creative Tools" is kept untranslated as a product name.
3. **Explicit display edits.** These cover HTML and PWA copy, untranslated error messages, and bare app names in display position.
4. **Protected literals.** Bare literals `"EffectCraft"` / `"FilmCraft"` are never mapped by the catalogue pass, because they double as protocol values. Literals after `egui::Id::new(` are also protected.

## Link and brand decisions (coordinator-approved)

| Surface | Before | After | Destination |
|---|---|---|---|
| Help ▸ website (`help.website`) | ArtCraft Website | **XeroFlow Creative Tools** | **changed** to `https://xeroflow-creative-tools.adme-dev.workers.dev/` (new `links::LAUNCHER`) |
| About / Home / header web link | `getartcraft.com`, ArtCraft website, EffectCraft on getartcraft.com | XeroFlow Creative Tools (`help.website`) | launcher |
| Help ▸ app page (`help.appPage`) | EffectCraft Home Page / FilmCraft on getartcraft.com | Upstream Home Page | unchanged (upstream) |
| Help ▸ docs (`help.docs` / `help.filmcraftHelp`, F1) | EffectCraft Help… / FilmCraft Help… | Upstream Documentation… | unchanged (upstream GitHub docs) |
| Help ▸ Discord, header pill, About | Join the ArtCraft Discord… | Upstream Community… / "Upstream community" / "Upstream community (discord.gg/artcraft)" | unchanged (`discord.gg/artcraft`) |
| Help ▸ GitHub, About | EffectCraft on GitHub / Source code on GitHub | Upstream Source on GitHub / "Upstream source on GitHub" | unchanged |
| Help ▸ feedback / issues | Provide Feedback… / Report an Issue… | Upstream Issue Tracker… / Report an Upstream Issue… | unchanged |
| EffectCraft Help ▸ Online Tutorials | Online Tutorials… | Upstream Tutorials… | unchanged (upstream app page) |
| EffectCraft "Other ArtCraft Apps" / Home "More ArtCraft apps" | 6 upstream siblings → getartcraft.com | "Other XeroFlow Apps" / "More XeroFlow apps": PhotoFlow, VectorFlow, FilmFlow | **launcher** (`help.sibling` page kind). `kind: "github"` still opens the upstream repo. LightCraft, PdfCraft and DesignCraft were dropped (not XeroFlow apps). |
| FilmCraft Import screen "Join us on Discord" | Join us on Discord | Upstream community on Discord | unchanged |
| About blurb | "… Part of the ArtCraft family (of creative apps)." | "… **Based on the original EffectCraft / FilmCraft project by the ArtCraft team.**" | — |
| EffectCraft header + About mark | `include_bytes!(docs/brand/artcraft-mark.png)` | painted indigo rounded tile with a white "X" (`header::paint_logo`) | — |
| FilmCraft About + Import wordmark | `include_bytes!(docs/brand/artcraft-logo{,-white}.png)` | painted "XeroFlow" text (`brand::paint_wordmark`, same signature and return value) | — |

- The ArtCraft marks are therefore no longer compiled into either binary.
- The files in `docs/brand/` and their licence are untouched. The licence permits them "as part of copies of this repository".
- Author and credit text (contributors dialogs, "FilmCraft contributors" template author, golden-asset authors, `NOTICE`, `ATTRIBUTION.md`) is unchanged.

## Display strings renamed (web build)

**EffectFlow**
- **Web shell:** `index.html` (`<title>`, meta description, `Loading EffectFlow…`, `EffectFlow failed to start:`), `manifest.webmanifest` `name` and `short_name`, `js/host.js` device-lost text, and `api.rs` "EffectFlow is not running yet".
- **App menu:** `[mac] EffectFlow`, About / Hide / Quit EffectFlow, and the `File ▸ Import ▸ EffectFlow Project…` menu label.
- **Windows and screens:**
  - the window title `EffectFlow - <doc>`
  - the About title, heading and blurb
  - the Welcome screen ("Welcome to EffectFlow")
  - the "EffectFlow project" kind label
  - the Settings notes and crash prompt
  - the Learn panel blurb
  - the built-in effect licence note
  - the effects catalogue summary
  - the OCIO "Built-in (EffectFlow minimal)" popup label (the parameter stores the index)
  - the system-report `app` line
  - the clipboard notes `EffectFlow: N layers`
- **Messages:** engine errors (not a project / template / animation preset EffectFlow can open, limits, newer-version) and scripting error messages.
- **Demo project:** the comp "EffectFlow Intro" and the end card "Built with EffectFlow". `xtask` bench key updated to match.

**FilmFlow**
- **Web shell:** `index.html` (`<title>`, `Loading FilmFlow…`, `FilmFlow stopped working`, `FilmFlow failed to start:`) and `api.rs` "FilmFlow is not running yet".
- **Menus and dialogs:**
  - About FilmFlow, plus its heading and blurb
  - Quit / Hide FilmFlow
  - the "FilmFlow Project", "Selection as FilmFlow Project…" and "FilmFlow Graphics Template" labels
  - "FilmFlow hit an error"
  - the unsaved-changes prompts
- **Panels:** export-mode encoder notes, sequence-settings notes, settings notes (RAM, autosave, media cache, hardware decoding, plugins) and the `app.about` menu hint.
- **Messages:** errors for codecs (MPEG/MXF), import (MOGRT, `.fcgt` ZIP), newer project schema, shortcuts file, stacked panels, field order and interchange reports.
- **Other:** the system-report `app` line, the built-in voice licence line "Built into FilmFlow (project licence)", the End Credits template placeholder "Made with FilmFlow", and the demo project name "FilmFlow Demo".

**Test assertions updated** (literal display strings only):
- EffectFlow: `menus/tests.rs` (mac top level), `native_menu.rs` (uk/cs/ka translated "Hide EffectFlow"), `ui_keyframes.rs`, `ui_timeline_shapes.rs`, `home.rs` kind label, `tests_menu_cmds.rs`, `tests_limits.rs`.
- FilmFlow: `project_tools_tests.rs`, `file_tests.rs`, `format/src/lib.rs`, `format/tests/fixtures.rs`.

## Compatibility preserved (deliberately NOT renamed)

| Kind | EffectCraft | FilmCraft |
|---|---|---|
| Document formats | `.ecproj` / `.ecprojx`; XML root `<EffectCraftProject>` (`xml_project.rs` ROOT, `tests_m145`); `generator` metadata in templates and essential graphics; Lottie `generator` | `.fcproj` / `.fcgt`; `generator: "FilmCraft …"`; renderer ids `FilmCraft GPU Acceleration (wgpu)` / `FilmCraft Software Only (CPU)` (stored in projects and fixtures); `xmp:CreatorTool="FilmCraft"` |
| Interchange / container metadata | WebM MuxingApp / WritingApp | AAF / OMF `FilmCraft:*` tags and Company/Product/Platform, MXF company/product, OTIO `FilmCraftGenerator`, EBU STL / MCC creator, MP4 `©too`, DNG camera model, raster header, LUT/cube titles, decoder `name()` values (`FilmCraft HEVC`…, asserted in platform tests) |
| Storage / paths | `EffectCraft Auto-Save` (OPFS folder), Application Support / APPDATA dirs, portable markers, disk-cache dirs, `Documents/EffectCraft/Presets`, `EffectCraft Log.txt`, shortcut preset id `EffectCraft Default`, SW cache prefix `effectcraft-${VERSION}`, all localStorage / IndexedDB keys | `FilmCraft Previews`, Application Support / APPDATA dirs, `FilmCraft Logs`, voice-over dir, shortcut preset id `FilmCraft Default`, all storage keys |
| JS / agent / scripting API | `window.effectcraft`; scripting `$.os`, `version`, `File.fs`, BridgeTalk display name, ScriptUI `frameworkName`, `app.version` ("26.0 (EffectCraft …)"); MCP `serverInfo.name` | `window.filmcraftLoad` / `filmcraftFatal`, `start("filmcraft_canvas")`, MCP server ids |
| DOM ids / identifiers | `#loading`, `#status`, command ids (`help.*`, `app.*`), automation ids, egui `Id`s | `filmcraft_canvas`, `#fatal-title` etc., egui window ids `About FilmCraft` and `FilmCraft hit an error` (persisted window state) |
| Build / crates | crate names, `effectcraft-web` package, `effectcraft_web.wasm` / `_bg.wasm` output names, bundle id `ai.storyteller.effectcraft`, `Cargo.toml` descriptions | same (`filmcraft-*`, `filmcraft_web*`, `ai.storyteller.filmcraft`) |
| URLs | `links::{DISCORD, WEBSITE, APP_PAGE, GITHUB, ISSUES}` unchanged; `WEBSITE` is kept but no longer linked | same; `keyboard::HELP_URL` unchanged |

## Remaining user-visible "Craft" names (audit)

**Kept on purpose:**
- The About attribution "Based on the original EffectCraft / FilmCraft project by the ArtCraft team", and the upstream URLs it implies.
- `discord.gg/artcraft` in the FilmFlow header tooltip.
- **Storage names the user can see:**
  - the OPFS folder `EffectCraft Auto-Save` (in the file browser)
  - the shortcut preset names `EffectCraft Default` / `FilmCraft Default`
  - FilmFlow's `FilmCraft Previews` folder
  - the FilmFlow Project Settings renderer names `FilmCraft GPU Acceleration (wgpu)` / `FilmCraft Software Only (CPU)` (these are stored values)

  Renaming any of these needs a migration or alias layer, which is out of scope.
- **Visible only inside exported or saved files:**
  - EffectFlow: `EffectCraft Render Log`, the `EffectCraft Face Measurements` text export, generator fields
  - FilmFlow: LUT titles, interchange tags, MP4/MXF/AAF product metadata
- **Scripting API return values:** `$.os`, `app.version` and similar, so that existing scripts keep working.
- **FilmFlow decoder names** `FilmCraft H.264/HEVC/VP9/AV1/ProRes/…` (`crates/codecs/src/video.rs`). Platform tests assert them, and I couldn't confirm where they appear, so I left them alone. Low visibility (diagnostics).

**Not in the web build** (desktop, CLI, MCP or tooling only; not changed):
- **Desktop apps:** `apps/effectcraft/**` and `apps/filmcraft/**` (window titles, native dialogs, macOS App Nap reason, AppImage and `.desktop` entries, Windows resources in `build.rs`), and FilmCraft's macOS native app-menu title `Submenu::new("FilmCraft")`.
- **CLIs and agent servers:** `apps/*-cli`, the MCP `INSTRUCTIONS` / `serverInfo.title`, and EffectCraft `scripts.rs` command docs (I renamed the one EffectFlow description).
- **Tooling and packaging:** `xtask` parity reports, bench example output, `packaging/**`, `docs/**`, `README.md`, `AGENTS.md`, `CLAUDE.md`.
- **Comments and logs:** source comments, web-asset comments (`sw.js`, `worker.js`, `audio-worklet.js`), and `log::` lines (`webcodecs.rs` "using FilmCraft's decoder", `crash.rs` crash log).

**Outside the owned trees:**
- EffectCraft depends on FilmCraft crates through git at `filmcraft rev 2c5ba7a7`, which this patch can't change. Their error strings, such as "… (FilmCraft has no decoder for it)", can still surface during EffectFlow footage import.
- Fixing that needs a `[patch]` override or an updated rev. I didn't do it (it would mean editing `Cargo.toml` / `Cargo.lock` against a fetched dependency).

**Graphics:**
- The app icons and favicons stay: EffectCraft's unicorn (`favicon.svg`, PWA `icon-256/512.png` copied from `assets/app-icon/…effectcraft.png`) and FilmCraft's `favicon.png`.
- They are the upstream apps' own MIT / Apache-2.0 icons, not the ArtCraft trademark marks. Their sidecar attribution would need updating if they were replaced.
- Root can swap host-side icons (manifest, launcher) without rebuilding; the WASM does not embed the favicons.

## Exact pinned build requirements

| | EffectFlow (effectcraft 0.17.0 @ `362474a8`) | FilmFlow (filmcraft 0.13.0 @ `30536bc5`) |
|---|---|---|
| Rust | MSRV `rust-version = "1.95"` (workspace); no `rust-toolchain` file, edition 2024 | same |
| Target | `wasm32-unknown-unknown` | same |
| wasm-bindgen | crate `=0.2.129`; CLI must match `const WASM_BINDGEN = "0.2.129"` (xtask refuses others): `cargo install wasm-bindgen-cli --version 0.2.129 --locked` | same (`xtask/src/main.rs:282`) |
| wasm-opt | optional (binaryen): used automatically when on PATH (`-O2 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals`). Changes the WASM bytes, so keep it consistent between builds. | same |
| Build command | at tree root: `cargo xtask web` → `$CARGO_TARGET_DIR/web/dist` (default `target/`). `packaging/web/package.sh` builds and zips (needs `zip`). | same |
| Git deps (Cargo.lock, need network or a pre-filled cargo git cache) | craft-libs `9f75d3dc`, `82a24b00`, `5c874d51`; filmcraft `2c5ba7a7` (codecs, media, frame, …) | craft-libs `82a24b00`, `f0ad6c1e`, `5c874d51` |
| Fonts | none needed | `CRAFT_FONTS_DIR=<absolute path to a storytold/craft-fonts checkout>` (embedded by `crates/text/build.rs`; release builds use it; unset still builds but without Japanese/CJK fonts) |
| Notes | no `.git` in the tree; `packaging/env.sh` reads the SHA via `git rev-parse` (empty here; nothing in the Rust code reads it). The SW precache list and version are regenerated by `cargo xtask web`. | same `.git` note |

## Tests (static checks only; nothing compiled)

I emulated the upstream catalogue rules against the patched trees:

- **EffectFlow menus:**
  - no stale or duplicate `(command, label)` rows in any of the 11 menu catalogues
  - the `...` / bracket shape rule holds for every changed row
  - no double spaces
- **EffectFlow panels:**
  - no duplicate sources per language (including ka across both tables)
  - every renamed or new panel row is still requested by a converted panel literal, so `every_row_is_used_by_a_converted_panel` holds
- **FilmFlow TSV:** no duplicate entries, matching ellipsis and placeholders, and no empty translations.

Still to run by root, once building: `cargo test -p effectcraft-ui-egui -p effectcraft-engine`, `cargo test -p filmcraft-ui-egui -p filmcraft-engine -p filmcraft-format` (or `cargo xtask ci`).

## Artifacts

- Patches: `/private/tmp/effectflow-branding.patch`, `/private/tmp/filmflow-branding.patch`
- Generator: `/private/tmp/flow-effect-film-scripts/rebrand.py`
- Pristine extractions used for diffing: `/private/tmp/flow-effect-film-pristine/`
- Scratch (safe to delete): `/private/tmp/flow-effect-film-scratch/`
