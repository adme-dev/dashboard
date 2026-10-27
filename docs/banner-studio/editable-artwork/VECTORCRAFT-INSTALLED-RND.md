# VectorCraft 0.17.0 installed-app R&D

Date: 27 October 2026 (Australia/Melbourne). Scope: local synthetic native text/vector/SVG interchange for Banner Studio. **Verdict: useful editable vector authoring and interchange candidate; bounded installed-desktop and matching CLI/MCP proof passed. Banner Studio integration, production font fidelity, animation and print acceptance remain untested.**

## Evidence boundaries and authorization

- Worker owns this report and ignored `output/editable-artwork-animation/crafting-apps/vectorcraft/` only. Existing dirty application work was preserved. No application-code edits, credentials, providers, upload, global install, MCP registration, commits or deployment occurred.
- Initial assignment prohibited installation and reserved GUI control to the coordinator. Coordinator dispatch `ctx_cbfbebe52609` subsequently authorized downloading the official matching standalone CLI into owned ignored output, and an isolated command-controlled desktop process. No keyboard, mouse or accessibility driving occurred.
- Public source was read as untrusted reference. No repository build, package setup script or upstream instructions were executed. The two local proof harnesses were authored for these bounded fixtures.
- Both owned helper processes exited normally with code 0. No existing application process was stopped. `VECTORCRAFT_NO_PREFS=1`, an owned `VECTORCRAFT_CONFIG_DIR`, and explicit fixture read/write roots prevented using the normal profile. Process argv, overrides and exit receipts are retained.
- Workspace was `adme-dev/banner-editable-artwork`, HEAD `d4560047ae045e14d337ccf062055dce83692fcb`; locally recorded `origin/main` was `4a68e92367fbcffd08a3f6a6a6e4537c71195937` (1 ahead, 0 behind). This research worker did not refresh remote application refs or claim release readiness.

## Installed identity and official provenance — observed

| Item | Finding |
|---|---|
| Installed path | `/Applications/VectorCraft.app` |
| Bundle identifier | `ai.storyteller.vectorcraft` |
| Bundle short/build version; safe CLI version | `0.17.0`; `vectorcraft 0.17.0` |
| Bundle build commit | `43313f9451de7ab5b909801006b8881458f2bf04` |
| Architecture | Universal Mach-O, x86_64 and arm64 |
| Desktop executable SHA-256 | `110ae3e6937b20ec4fab125e8b1d57c14ef10667c7342189a63e72cf5c7a71b8` |
| Signature | Developer ID Application: Learning Machines LLC (`DJ6XS33FX8`), hardened runtime, stapled notarization ticket |
| Verification | `codesign --verify --deep --strict --verbose=2` exit 0; `spctl --assess --type execute -vv` exit 0, accepted / Notarized Developer ID |
| Official source/release | [`storytold/vectorcraft` at the installed commit](https://github.com/storytold/vectorcraft/tree/43313f9451de7ab5b909801006b8881458f2bf04); [`v0.17.0`](https://github.com/storytold/vectorcraft/releases/tag/v0.17.0) release target matches it, published `2026-10-25T14:01:11Z` |

Bundle metadata, signatures and release metadata establish the reported identity and publisher. They do not establish reproducible-build equivalence between the executable and source.

## Automation discovery — observed and exercised

The desktop executable's `--help` and `--version` returned successfully without opening a window. Help advertises a localhost JSON control channel (`--control <port>`), read/write roots, and explicitly directs headless/MCP users to **vectorcraft-cli**. There is no CLI helper in the macOS app bundle; no existing `vectorcraft-cli` was found on PATH or in the checked common bin directories. The pinned [MCP documentation](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/docs/mcp.md) agrees that macOS uses a separate CLI release asset.

After coordinator authorization, the standalone [official matching CLI archive](https://github.com/storytold/vectorcraft/releases/download/v0.17.0/vectorcraft-cli-0.17.0-macos-universal.zip) was downloaded into the ignored evidence directory, safely extracted there and run there. Archive SHA-256 `dee6d447c42615662ea81a612fedd0c221b14ac51dbe72e45f3d435fdc511641` exactly matched the release's [published checksum file](https://github.com/storytold/vectorcraft/releases/download/v0.17.0/SHA256SUMS.txt). Its Developer ID signature names the same team, and strict signature verification passed. No global installation was made.

- CLI help/version/catalogue succeeded; runtime catalogue contained **811 commands**.
- Headless stdio MCP initialization negotiated `2025-06-18`, reported server version `0.17.0`, and listed **32 tools**. The proof used 38 JSON-RPC requests with explicit fixture read/write roots.
- Installed desktop was launched with a dynamically selected loopback control port and isolated profile flags. Ten documented control requests opened/edited/saved/exported/reopened synthetic files and quit that owned process.
- `rea inspect-artifact /Applications/VectorCraft.app --format json` used the coordinator-identified existing REA installation. It completed a bounded static inventory (34 nodes, 41 occurrences, 40 edges). REA explicitly says this does not execute the app or prove format semantics; no suggested follow-up probes were executed.

The pinned [control protocol](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/docs/control-protocol.md) describes the unauthenticated loopback listener, filesystem roots and isolated configuration variables. These are useful local automation mechanisms, not a hosted authorization boundary.

## Synthetic save/reopen proof — observed

Fixture: 640 × 360 points, one native text object, affine skew/tilt, an orange vector rectangle clipped by a rectangle, and a blue vector rectangle with a mid-gray opacity mask. No customer assets, protected commercial copy, QR codes or external resources were used.

| Operation | Result |
|---|---|
| MCP creates `SYNTHETIC SALE`, native save/reopen, then changes wording | Native text remains editable as `SYNTHETIC OPEN DAY`; style and transform survive |
| Native text transform | Exact saved affine `[1, 0.12, -0.18, 1, 42.4, 74.8]` retained through edit |
| Unselected vectors during text change | Clip group and opacity-mask records unchanged byte-for-byte after JSON normalization |
| Plain SVG export | 1 `<text>`, 4 `<path>`, 1 `<clipPath>`, 1 `<mask>`, no `<image>` |
| Explicit Create Outlines on a copy | No native text remains; SVG has 20 paths and zero text elements; native outline groups include compound paths |
| Plain SVG reopen and native resave | Exact words remain in a native text object; **native layer records are not identical**, including an extra group and loss of native live-rectangle metadata |
| SVG with `preserveEditing: true`, reopen and native resave | Layer records equal the original native records exactly for this fixture |
| Installed desktop opens native fixture and changes words | `DESKTOP REOPEN VERIFIED` saved as native text, with SVG and PNG output |
| Installed desktop reopens its saved native document | Native layer records remain exactly equal; unselected clips/mask unchanged |

`verification.json` records **13 passing structural/lifecycle checks**. The original native and plain-SVG-reopened PNGs are both 640 × 360, with **0 differing pixels out of 230,400** and maximum channel difference 0. Pixel probes verify transparent regions outside clip/mask, alpha 255 inside the clip, and alpha 128 inside the mid-gray mask. This compares the two paths through VectorCraft's own renderer; it is not an independent browser or Banner Studio renderer validation.

The native PNG and installed desktop render were visually inspected. `ui.render` from the desktop uses a white background; the MCP PNG export is transparent. The desktop render is an artboard render, not a screenshot or a manual GUI usability test.

**Font substitution is a real observed limitation.** All three MCP PNG exports warned that requested Inter Bold was rendered using Inter SemiBold. Native records still request Inter Bold. Equal pixels between native and SVG reopen therefore prove consistent fallback here, not exact requested font fidelity. Font resolution must be checked before outlining or approving customer work.

## Version-pinned source findings — source-only beyond this fixture

- [Native format implementation](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/format/src/lib.rs): current native format is version 4, with optional gzip and large binary blobs after the JSON. This fixture used uncompressed small JSON. A general integration must handle the versioned format rather than assume every native file is plain JSON.
- [Document node model](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/doc/src/node.rs) and [text model](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/doc/src/text.rs): text runs/style/affine transforms, paths, compound paths, clipped groups and separate opacity-mask artwork are distinct native structures. Our fixture exercises a small subset.
- [SVG exporter](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/svg/src/export.rs): ordinary text can be emitted as live text, but some typography is automatically outlined, including vertical type, ruby, certain inline-on-path content, small capitals, superscript/subscript and tab leaders. A claim that all SVG text remains keyboard editable would be false. SVG Tiny 1.2 omits opacity masks with a warning.
- [SVG importer](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/svg/src/import/text.rs): reconstructs text and text-on-path, with warnings for unsupported cases. This does not imply arbitrary vendor SVGs round-trip without loss.
- [Preserve Editing tests](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/crates/engine/src/cmd/fileio/tests_svgedit.rs): native data embedded in SVG is tied to the markup; source tests cover reverting to plain SVG when markup changes. These upstream tests were read, not run. Their existence is separate from our observed fixture result.
- [Typography guide](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/docs/typography-lettering.md): distinguishes editable type from paths and does not offer TTF/OTF font authoring. Its prose identifies v0.13.1 applicability even in this v0.17.0 commit; runtime proof and current implementation take priority over that older narrative.

## Licensing inventory

Installed `NOTICE`, `LICENSE-MIT`, `LICENSE-APACHE` and `ASSETS.md` identify project code as MIT OR Apache-2.0. The notice separately excludes ArtCraft names/wordmarks/logos from those code licenses and lists third-party font/icon/dependency licenses, including OFL fonts. This is a source/package inventory, not a clearance of every asset for Banner Studio redistribution. Preserve applicable notices and review individual reused assets; no upstream implementation or branding was copied into application code.

## Banner Studio feasibility and next gates

1. **Good fit for a local vector authoring sidecar or bounded worker experiment.** Documented commands, headless rendering and native text separation are real. Prefer a small explicit adapter with version-pinned inputs and outputs; a native macOS process cannot run directly inside a Cloudflare Worker. WebAssembly/library deployment feasibility remains source-only and needs a separate build/resource evaluation.
2. **Retain native originals and exact copy metadata.** Plain SVG is portable drawing content, but does not preserve all native editing structure. Preserve Editing improves VectorCraft round-trip through its own metadata; it does not make Banner Studio understand that metadata. Outlined lettering must remain labelled paths, with the editable original retained.
3. **Do not equate this with flat-image reconstruction.** This proof starts with synthetic native objects. Raster-to-layer recovery, original vehicle fidelity, hidden background repair, exact supplied artwork/fonts, QR ownership, hostile SVG sanitization and protected-fact enforcement are all untested.
4. **Required integration experiment:** map native text/styles/transforms, clip groups and luminance masks into Banner Studio; compare browser/editor/export output; change wording; save/reopen; check undo and unselected layers. Include missing fonts, nested clips, affine transforms and unsupported text before accepting interchange. Source says some special text becomes outlines, so loss reporting is necessary.
5. **Remaining boundaries:** animation/timeline preservation, full customer campaigns, independent SVG renderer equivalence, PDF/CMYK/bleed/font embedding/print acceptance, hosted sandboxing/resource limits and deployment were not evaluated.

## Exact artifacts and reproduction

All paths below are relative to ignored `output/editable-artwork-animation/crafting-apps/vectorcraft/`:

| Evidence | Paths |
|---|---|
| Installed identity | `bundle-info.json`, `binary.sha256`, `signature.txt`, `signature-verify.txt`, `gatekeeper.txt`, `help.txt`, `version.txt` |
| Official version/source receipts | `release.json`, `commit.json`, `tree.json`, `source/` (22 pinned files), `source-provenance.json`, `manifest.sha256.json` |
| Matching CLI provenance | `cli-download.json`, `SHA256SUMS.txt`, `vectorcraft-cli-0.17.0-macos-universal.zip`, `cli-helper/`, `cli-signature.txt`, `cli-signature-verify.txt`, `cli-version.txt`, `cli-help.txt` |
| Runtime automation inventory | `cli-commands.json`, `mcp-tools.json`, `cli-discovery.json` |
| REA static inventory | `rea-inspect.json`, `rea-inspect.stderr.txt` |
| Executed harnesses | `proof.py`, `desktop-proof.py`, `verify-proof.py`, `verify-pixels.mjs` |
| Complete runtime exchanges | `mcp-transcript.json`, `desktop-transcript.json`, `mcp-process.json`, `desktop-process.json`, `mcp.stderr.txt`, `desktop.stdout.txt`, `desktop.stderr.txt` |
| Structural/pixel results | `verification.json`, `pixel-verification.json`, `baseline-inspect.json`, `reopened-inspect.json`, `svg-reopened-inspect.json`, `desktop-before-inspect.json`, `desktop-reopened-inspect.json`, `proof-identities.json` |
| Editable originals | `fixtures/native-before.vectorcraft`, `fixtures/native-edited.vectorcraft`, `fixtures/desktop-edited.vectorcraft`, `fixtures/desktop-reopened.vectorcraft` |
| Explicit path conversion | `fixtures/outlined.vectorcraft`, `fixtures/outlined.svg` |
| SVG interchange | `fixtures/native-before.svg`, `fixtures/native-edited.svg`, `fixtures/svg-reopened.vectorcraft`, `fixtures/preserve-editing.svg`, `fixtures/preserve-reopened.vectorcraft`, `fixtures/desktop-edited.svg` |
| Render evidence | `fixtures/native-before.png`, `fixtures/native-edited.png`, `fixtures/svg-reopened.png`, `fixtures/desktop-edited.png` |

From the worktree root, `python3 output/editable-artwork-animation/crafting-apps/vectorcraft/verify-proof.py` rechecks the existing structural artifacts without launching the app, and `node output/editable-artwork-animation/crafting-apps/vectorcraft/verify-pixels.mjs` rechecks the PNG pixels using the already installed `pngjs` package. `proof.py` recreates MCP fixtures using the downloaded local helper; `desktop-proof.py` launches and quits an isolated installed app and should run only with the same explicit coordinator authorization and no competing fixture writer. Both have bounded waits and only stop their own process.
