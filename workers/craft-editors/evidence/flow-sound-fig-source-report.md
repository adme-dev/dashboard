# SoundFlow / FigFlow source branding report

Date: 2026-10-28 · Task `task_9e6326df0679` · Dispatch `ctx_428e8afed035`

Scope: source-level renaming of visible UI display names: SoundCraft → **SoundFlow**, FigCraft →
**FigFlow**. Nothing was compiled, installed, deployed or binary-patched. I edited only
`/private/tmp/flow-source-build-20261028/{soundcraft,figcraft}`.

## 1. Sources and patches

| App | Upstream | Archive (sha256) | Patch (sha256) | Files |
|---|---|---|---|---|
| SoundFlow | soundcraft 0.13.1 @ `01b39850ad16e84b45904ba07bd5cec7cf96c4b7` | `soundcraft.tar.gz` `522e138a…5865e` | `/private/tmp/soundflow-branding.patch` `a16064cd739678be03cb1c1f059dac81dfcf445ce0dca90faea846617c137e4d` | 17 |
| FigFlow | figcraft 0.11.2 @ `d4a303d4708602a9df1738960852d18b185a616b` | `figcraft.tar.gz` `04710e78…9aaa6` | `/private/tmp/figflow-branding.patch` `f5198f5f6235c82047268910d343dd3d3fb8c1e74a62b1a106a49a63dafe60b9` | 56 (37 Rust/HTML + 19 locale catalogs) |

Before editing, I confirmed that both working copies matched their tarballs exactly
(`diff -rq` → no differences).

**Replay (verified):** paths are relative to the tar's top folder (`a/…`, `b/…`).

```sh
tar xzf soundcraft.tar.gz && cd soundcraft-01b39850ad16e84b45904ba07bd5cec7cf96c4b7 && patch -p1 < /private/tmp/soundflow-branding.patch
tar xzf figcraft.tar.gz   && cd figcraft-d4a303d4708602a9df1738960852d18b185a616b   && patch -p1 < /private/tmp/figflow-branding.patch
```

For each patch, `patch -p1 --dry-run`, the real apply and `git apply --check` all ran clean on a
fresh extraction. Afterwards `diff -r` against the working copy showed **no differences**, and no
`.orig` or `.rej` files were left. SoundFlow was handed back to root at a checkpoint and has not
changed since.

The edits are reproducible from the scripts in `/private/tmp/flowsf-scripts/`. Each one checks
the expected match count before writing:
- `replace.py` with `soundflow-spec.json` and `figflow-about-spec.json`;
- `lines.py`, which renames on listed lines only;
- `locales.py`, for the FigFlow catalogs.

The one hand edit is the rustfmt-style re-wrap of the FigFlow credit line (`dialogs.rs`).

## 2. What changed

### SoundFlow (17 files)
- **Web shell:** `apps/soundcraft-web/index.html` (`<title>`, "Loading SoundFlow…") and
  `apps/soundcraft-web/src/web.rs` ("SoundFlow failed to start", picker label "SoundFlow Session").
- **Desktop:**
  - `apps/soundcraft/src/main.rs`: window titles, file-dialog filter labels, `--version` output,
    and the title test strings.
  - `apps/soundcraft/src/native_menu.rs`: the macOS app menu, About, Hide and Quit items.
- **UI** (`crates/ui-egui`):
  - `menus.rs`: the `window.about` label, the SoundFlow menu and About item.
  - `panels.rs`: the About window (see §3).
  - `lib.rs`: the internal-error and restart messages.
- **User-visible errors:**
  - `crates/model/src/session.rs`
  - `crates/engine/src/{io.rs,autosave.rs,clip_group_file.rs,cmd/track_more.rs}`
  - `crates/video/src/movie.rs`
  - `crates/clap-host/src/ffi.rs` (one error message only)
- **CLI and MCP prose:**
  - `apps/soundcraft-cli/src/main.rs` (`SoundFlow CLI x.y.z`)
  - `crates/automation/src/{lib.rs,mcp.rs}`: reach/describe messages, MCP instructions and the
    `list_commands` description.

### FigFlow (56 files)
- **Web shell:** `apps/figcraft-web/index.html` (title, loading text) and
  `apps/figcraft-web/src/web.rs` (start failure).
- **Desktop:** `apps/figcraft/src/{main.rs,startup.rs,services.rs}`: `--version`, usage errors,
  window title, error-dialog title, and the "FigFlow (.figcraft)" dialog filter.
- **UI** (`crates/ui-egui/src`):
  - `dialogs.rs`: About (see §3), the window-failure text, the invite-link checkbox, and the
    "Back to the FigFlow server" hint.
  - `windows.rs`: the window title, "<doc> – FigFlow".
  - `toolbar.rs`: About in the Help menu.
  - `live.rs`, `plugins_ui.rs`, `dev_compare.rs`, `import_report.rs`.
  - `theme.rs`: the two-tone wordmark is now "Fig"+"Flow". It is FigCraft's own wordmark, not an
    ArtCraft mark, and is used in the home sidebar and the About window.
- **Engine:** `crates/engine/src/{catalog.rs,cmd/view.rs,cmd/file.rs,invite_links.rs,live.rs}`:
  the "About FigFlow" label, the invite-link command label, a params doc and one live error.
- **Format, plugin and collab messages:**
  - `crates/format/src/{lib.rs,fig/export.rs,rest/props.rs}`
  - `crates/plugin/src/{manifest.rs,bundle.rs,sandbox.rs}`
  - `crates/collab-net/src/{web.rs,guest.rs,manage.rs,links.rs}`
- **CLI, MCP and server prose:**
  - `apps/figcraft-cli/src/main.rs`
  - `crates/mcp/src/{server.rs,tools.rs,prompts.rs,resources.rs,backend.rs}`: `serverInfo.title`
    is now "FigFlow"; `serverInfo.name` stays `figcraft`.
  - `apps/figcraft-server/src/{cli.rs,store.rs}`
- **Tests kept in step:** `crates/ui-egui/src/live_join_tests.rs` (browser note text) and
  `crates/collab-net/src/links_tests.rs` (registry description "URL:FigFlow invite link").
- **i18n:** all 19 `crates/ui-egui/locales/*.toml`.
  - Keys are English text, so 16 keys were renamed in the code and in every catalog together.
  - Checked: every new key appears in the Rust source, no old key remains, and no catalog has a
    key that English lacks (mirrors `i18n_tests.rs`). All catalogs still parse as TOML.
  - The `commands` and `menu` key sets are unchanged.
  - Comment headers (`# FigCraft interface strings…`) were left alone.
  - Grammar was adjusted for the new name's vowel-final sound:
    - Finnish: `FigFlow'sta`, `FigFlow'ssa`, `FigFlow'n`.
    - Turkish: `FigFlow'da`, `FigFlow'yu`, `FigFlow'nun`.
  - **Native-speaker review recommended** for fi, tr, ka (`FigFlow-ის` kept as is) and for the
    new About strings below.

## 3. Brand license and attribution (both apps)

**No ArtCraft logo or mark is drawn by either app.** I grepped every `include_bytes`/asset path:
- No UI code references `docs/brand/*`.
- The app icons (nightingale, chameleon) and FigCraft's code-drawn `Icon::Logo` are originals under
  MIT/Apache, per `ATTRIBUTION.md`.

So there was no graphic to remove. What I changed was the text and links that presented the build
as an ArtCraft product, following the coordinator's navigation decisions:

| Before | After |
|---|---|
| "…from the ArtCraft team." / "…part of the ArtCraft Crafting Apps." | "…part of XeroFlow Creative Tools." |
| "Made by the ArtCraft team and community." (FigCraft) | "Based on the original FigCraft project by the ArtCraft team." Sound has its own line: "Based on the original SoundCraft project by the ArtCraft team." |
| Link `getartcraft.com/apps/<app>` (website) | **XeroFlow Creative Tools** → `https://xeroflow-creative-tools.adme-dev.workers.dev/` |
| "Join us on Discord" → `discord.gg/artcraft` | **Upstream community** → same Discord URL. Translated in all FigFlow catalogs. |

Preserved: the "Dual-licensed MIT OR Apache-2.0" line, the contributor and model credits tabs, and
all `LICENSE-*`, `NOTICE`, `ATTRIBUTION.md` and `docs/brand/` files.

## 4. Deliberately preserved (still says SoundCraft/FigCraft, or ArtCraft)

Most of these are compatibility identifiers, storage, formats or non-UI surfaces. A few are display
metadata that root should decide on; those are marked ⚠.

- **Storage, ids and keys:**
  - eframe app names `run_native("SoundCraft"/"FigCraft")`: persistence keys.
  - App ids `ai.storyteller.*`.
  - Config dirs (`…/SoundCraft`, `SoundCraftData`, `…/FigCraft`).
  - All `SOUNDCRAFT_*` / `FIGCRAFT_*` env vars.
  - DOM ids `soundcraft_canvas`/`soundcraft_loading`, `figcraft_canvas`/`figcraft_loading`.
  - Crate, binary and package names; the `FileKind::FigCraft` enum.
- **Formats and protocols:**
  - File extensions `.scraft`/`.scraftz`/`.figcraft`.
  - The `figcraft://` URL scheme and `soundcraft://session` MCP URI.
  - MCP `serverInfo.name`.
  - Plugin ABI module `figcraft`; the plugin SDK message "not running inside FigCraft".
  - CLAP/VST3 host identity strings that plugins see ("SoundCraft", "SoundCraft contributors",
    GitHub URL; window-class names).
- **Output-file metadata:** MusicXML `<software>SoundCraft</software>`; PDF creator/producer
  "FigCraft". ⚠ Visible in a PDF viewer's properties.
- **Diagnostics:** log lines ("SoundCraft starting", "SoundCraft x (os arch)") and FigCraft's
  control-server stderr/JSON messages (agents may parse them).
- **⚠ Windows desktop build metadata (not the web build):**
  - `apps/soundcraft/build.rs` ProductName/FileDescription.
  - `apps/figcraft/build.rs` ProductName/FileDescription and **`CompanyName = "ArtCraft"`**, which
    must change before any Windows desktop FigFlow ships.
- **⚠ Root-owned packaging:** `packaging/**` (Info.plist, `.wxs`, metainfo, nfpm, dmg) still says
  SoundCraft/FigCraft.
- **⚠ Upstream links kept:**
  - FigFlow Help ▸ "Help page" (`open.help`) still opens `https://getartcraft.com/apps/figcraft`.
    The label is generic, and changing it means touching an 18-language command label.
  - The window-failure text still says "please report it at github.com/storytold/figcraft/issues".
- **The About "Version"** shows the upstream version (0.13.1 / 0.11.2).
- **Unchanged text:** README, AGENTS, docs, ROADMAP, Cargo `description` fields, code comments, and
  the incumbent menu catalog `crates/engine/catalog/menus.txt` (Sound).
- **Generated docs:** parity docs generated by `cargo xtask parity` may differ if regenerated.
  Neither the web build nor the tests read them.

## 5. Exact web-build commands (root runs them; not run here)

Both use Trunk with `public_url = "./"` and `dist = "../../dist/web"`, so output lands in
`<repo>/dist/web`. Both need the `wasm32-unknown-unknown` target. Cargo.lock pins wasm-bindgen
0.2.129 (matching root's CLI) and eframe 0.36.2.

```sh
# SoundFlow (rust-version 1.90; no font build input)
cd /private/tmp/flow-source-build-20261028/soundcraft/apps/soundcraft-web && trunk build --release
# or packaging: (cd /private/tmp/flow-source-build-20261028/soundcraft && packaging/web/package.sh)

# FigFlow (rust-version 1.95; Cargo profile `web-release` from index.html: opt-level z, fat LTO)
# .cargo/config.toml sets CRAFT_FONTS_DIR=../craft-fonts (relative to the repo). Point it at root's pinned fonts:
cd /private/tmp/flow-source-build-20261028/figcraft/apps/figcraft-web && CRAFT_FONTS_DIR=<pinned craft-fonts dir> trunk build --release
# packaging/web/package.sh adds a 24 MiB .wasm gate (upstream 0.11.1 was 22.2 MiB; these string edits are a few hundred bytes)
```

Both `index.html` files ask Trunk for `wasm-opt` (`data-wasm-opt="z"`). If binaryen's `wasm-opt`
isn't on PATH, Trunk tries to download it.

Not compiled or tested. All edits are string literals, plus one wrapped method chain.

## 6. Browser limitations (from the web source at these commits, not the release notes)

### SoundFlow (`apps/soundcraft-web/src/web.rs`, `crates/playback`)
- **Open / import:** works.
  - File ▸ Open Session…, Import ▸ Audio… and Import ▸ MIDI… swap the path prompt for the
    browser's file picker (`rfd::AsyncFileDialog`) and read the file's bytes.
  - Drag-and-drop onto the page also works: sessions open, MIDI/audio import, and audio dropped on
    an instrument track or Sampler loads that sampler.
  - Audio import extensions: wav, bwf, aif/aiff/aifc, flac, mp3, ogg/oga, m4a/m4b, aac, mp4, caf,
    mkv, webm.
- **Save / export:** works as a **download only**.
  - Save writes one bundle `<name>.scraftz` (the `.scraft` plus its `Audio Files/`).
  - Every save or export (wav, aif, flac, mid, svg, txt, json, musicxml) goes through the engine's
    delivery hook as an `<a download>` Blob.
  - There's no save-in-place and no file system. Upstream lists "Web build can drop unsaved edits"
    (#136).
- **Audio playback:** WebAudio through cpal. The `index.html` shim resumes the suspended
  AudioContext on the first pointer, touch or key gesture, so the first click may be needed before
  sound. Without an audio device the playback falls back to a silent clock.
- **Recording: not supported.** `record::Recorder` writes takes to disk paths, and upstream docs
  say "The web build has no recording". I didn't verify this at runtime.
- **Also unavailable in the browser:**
  - CLAP, VST3 and AU third-party plugins (native FFI hosts).
  - User plugin presets ("User presets need the desktop app").
  - The TCP control channel.
  - Autosave to disk.
- **Startup and flags:** starts on the synthesised demo session; `?empty` gives a blank one.
  `?webgl` forces WebGL2.

### FigFlow (`apps/figcraft-web/src/web.rs`, `crates/ui-egui/src/lib.rs`)
- **Open / Import / Place image:** works. A hidden `<input type="file">` reads the file's contents
  (`pick_open_contents`), with cancel and focus fallbacks.
  - Open takes `.figcraft`, `.fig` (best effort), JSON, SVG and images.
  - Import takes svg, png, jpg/jpeg, webp, gif, tif/tiff, figcraft and fig.
  - Files over 512 MB are refused ("too large to open in the browser").
  - The crate doc that says "no native file dialogs yet" is **stale** for opening.
- **Save / Save as / Export: NOT wired in the browser.**
  - `WebServices` overrides `pick_open_contents` and `download`, but not `pick_save` or
    `pick_folder`.
  - So `save_as_dialog`, the `.fig` export and the export panel (PNG/JPG/SVG/PDF; single file or
    folder) get `None` and do nothing. A file with no native path falls into Save as, so Save does
    nothing either.
  - The only download path is Variables ▸ export (`variables_panel.rs`, `services.downloads()`).
  - Work therefore can't be saved from the browser except by copy/paste or a live/server session.
- **Clipboard:** copy text and PNG works through egui output. Paste arrives as paste events; the
  page can't read the clipboard on demand.
- **Not persisted:** `save_prefs` and `emergency_save` aren't implemented for the web, so no
  preferences or crash-recovery copies are kept.
- **Live collaboration:** can join desktop-hosted sessions or files on a FigFlow server. An https
  page can only use `wss://` links, and the browser can't host a session. `#join=<link>`
  auto-joins.
- **Links** open in a new tab (`noopener,noreferrer`).
- **Fonts:** CJK falls back if no CJK faces are built in (picked by `CRAFT_FONTS_DIR`).
  `?webgl` forces WebGL2.

## 7. Review performed
- Read every hunk in both patches.
- Checked rustfmt's 150-column limit on changed lines by hand: rustfmt isn't in the isolated
  toolchain, and I didn't install it.
  - The only line that needed it was the FigFlow credit line, which I wrapped the way rustfmt
    does.
  - Every other line over 150 is a long string literal that was already over before.
- No identifier, URL endpoint, DOM id, storage key, crate name, license or credit changed (§4).
- Tests that assert the changed strings were updated. Nothing else in either tree asserts the old
  wording: I grepped every changed phrase across both trees.
