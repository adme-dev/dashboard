# EffectCraft 0.17.0 installed animation R&D

27 October 2026. **The matching official headless CLI passed a bounded native save/reopen/render and Lottie interchange proof.** EffectCraft can preserve editable text, eased position keys and intermediate alpha in this synthetic case. This is a useful candidate for an optional offline composition/render adapter; no Banner Studio integration or installed desktop GUI parity has been demonstrated.

## Scope and provenance

Worker task `task_fbf2f0d47751`, dispatch `ctx_b5943796fd31`, Orca run `run_666e5ba6039d`. Owned changes are this report and ignored `output/editable-artwork-animation/crafting-apps/effectcraft/`. Existing dirty application changes were preserved. Observed checkout: `adme-dev/banner-editable-artwork`, HEAD `d4560047ae045e14d337ccf062055dce83692fcb`, remote `adme-dev/dashboard`, local tracking comparison ahead one/behind zero. This worker did not fetch, commit, merge, deploy or change application code; the coordinator owns release freshness.

Initial scope excluded installations and GUI control. Coordinator message `msg_8e74c23dde93` explicitly permitted downloading a version-matched standalone CLI into the owned ignored output directory, running confined synthetic proofs, and stopping owned processes. This permission was used for an extracted helper only: no global installation, package setup, MCP registration, user-project access, user-settings changes, provider calls, uploads or purchases. The desktop GUI was never launched by this worker.

| Item | Measured value |
|---|---|
| Installed bundle | `/Applications/EffectCraft.app` |
| Bundle / executable version | `0.17.0` / `effectcraft 0.17.0` |
| Bundle ID | `ai.storyteller.effectcraft` |
| Build commit | `362474a843ddb67555d4c2d19ad6a590388aad0e` |
| Native executable | Universal Mach-O, x86_64 + arm64 |
| Signature | Developer ID Application: Learning Machines LLC, team `DJ6XS33FX8`; hardened runtime; notarization ticket reported stapled |
| Signature verification | `codesign --verify --deep --strict --verbose=2` exited 0 |
| Installed executable SHA-256 | `b8098b2b6fc22a502e013f35f893c5db62b4780d69c5924ecd8272302753812c` |
| Document declarations | `.ecproj`, `.ecprojx`, `application/x-effectcraft` |
| Bundle contents | Desktop executable, icon, plist and signing metadata; no CLI |

Evidence: [plist](../../../output/editable-artwork-animation/crafting-apps/effectcraft/plist.txt), [signature](../../../output/editable-artwork-animation/crafting-apps/effectcraft/signature.txt), [verification](../../../output/editable-artwork-animation/crafting-apps/effectcraft/signature-verify.txt), [binary hash](../../../output/editable-artwork-animation/crafting-apps/effectcraft/binary-sha256.txt). Signature verification is local integrity evidence, not a fresh online Gatekeeper assessment.

The official [v0.17.0 release](https://github.com/storytold/effectcraft/releases/tag/v0.17.0) resolves to the installed build commit. Selected upstream source was downloaded read-only at that exact commit, with [tree inventory](../../../output/editable-artwork-animation/crafting-apps/effectcraft/source-tree.json) and [local source snapshots](../../../output/editable-artwork-animation/crafting-apps/effectcraft/source/). No source compilation occurred.

REA 6.4.0 was already available. The authorized `rea inspect-artifact /Applications/EffectCraft.app --format json` exited 0 in approximately 0.89 seconds. Its [receipt](../../../output/editable-artwork-animation/crafting-apps/effectcraft/rea-inspect.json) inventories the artifact and explicitly limits itself to bounded static hypotheses; it did not execute or establish application semantics. Its directory digest is distinct from the executable SHA-256 above.

## Automation interface actually exercised

The installed desktop's `--version` exited 0; `--help` exited 1 with `unknown option --help`. Pinned [desktop argument parsing](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/apps/effectcraft/src/main.rs) shows both return before session logs/preferences/window startup. The desktop has a documented loopback control channel, but using it starts a window. No desktop-control probe was needed after the helper authorization.

No `effectcraft-cli` was initially found on PATH, `/usr/local/bin`, `/opt/homebrew/bin` or `~/.cargo/bin`. This is a bounded search, not a claim about every user folder. The pinned [agent guide](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/docs/agents.md) confirms macOS distributes its CLI separately.

The helper came from the official [effectcraft-cli-0.17.0-macos-universal.zip](https://github.com/storytold/effectcraft/releases/download/v0.17.0/effectcraft-cli-0.17.0-macos-universal.zip): 61,089,487 bytes, SHA-256 `e1d163a01c8cba4e5b453d52b3ebf17ae443a7d368cfe669a502511608bcd74a`. This matched both GitHub release asset metadata and the separately downloaded [SHA256SUMS.txt](https://github.com/storytold/effectcraft/releases/download/v0.17.0/SHA256SUMS.txt). The extracted CLI reports `effectcraft-cli 0.17.0`; its Developer ID is also Learning Machines LLC / `DJ6XS33FX8`, and strict signature verification passed. See [download receipt](../../../output/editable-artwork-animation/crafting-apps/effectcraft/helper-download-receipt.json) and [CLI signature](../../../output/editable-artwork-animation/crafting-apps/effectcraft/cli-signature.txt).

Actual `--help` and `mcp --help` exited 0. Discovery saved [CLI help](../../../output/editable-artwork-animation/crafting-apps/effectcraft/cli-help.txt), [MCP help](../../../output/editable-artwork-animation/crafting-apps/effectcraft/mcp-help.txt), [engine command schemas](../../../output/editable-artwork-animation/crafting-apps/effectcraft/commands.json) and [MCP tool schemas](../../../output/editable-artwork-animation/crafting-apps/effectcraft/mcp-tools.json).

All MCP sessions used:

```text
effectcraft-cli mcp --empty
  --automation-read-root <owned-output>/fixtures
  --automation-write-root <owned-output>/fixtures
EFFECTCRAFT_CONFIG_DIR=<owned-output>/config
```

No `--autosave`, bridge, GPU or script-evaluation mode. MCP initialized using protocol `2025-06-18` and reported `EffectCraft (headless)` version `0.17.0`. Runtime renderer metadata says **active CPU**, with reason that headless defaults to CPU unless `--gpu`; the project preference label “Mercury GPU Acceleration” does not override that runtime fact. Read/write roots are the documented confinement mechanism; no negative confinement attack test or network interception was performed.

## Measured native and render proof

[Fixture driver](../../../output/editable-artwork-animation/crafting-apps/effectcraft/prove.cjs) creates only synthetic content: a 320 × 180 composition at 24 fps, duration three seconds; native Arial text `SYNTHETIC`; and an 80 × 40 RGBA PNG with four known alpha bands. Text position has Easy Ease keys at 0 and 2 seconds; text opacity has linear keys at 0, 1 and 2 seconds. The image stays at 50% layer opacity, independent of the text animation.

| Sample time (s) | Text x from engine (px) | Text opacity (%) | Rendered maximum text alpha |
|---:|---:|---:|---:|
| 0 | 30 | 0 | 0 |
| 0.5 | 45.625 | 50 | 128 |
| 1 | 80 | 100 | 255 |
| 1.5 | 114.375 | 75 | 191 |
| 2 | 130 | 50 | 128 |

The position samples match cubic smoothstep for the chosen Easy Ease endpoints, including asymmetric quarter samples. Position changes are also observed in rendered text pixel bounds, not solely property queries. The initial text is partly off-canvas due to its default centered layout; the fixture intentionally retains this measured geometry and does not claim typography fidelity to Banner Studio.

At all five samples, source alpha `[0,64,128,255]` becomes `[0,32,64,128]`, with fully transparent background. Nonzero RGB samples return `[239,80,40]` for input `[240,80,40]`: a one-level red-channel quantization difference is retained in the evidence. This proves single multiplication of source alpha by 50% layer opacity for this case, not every blend mode or mask.

Native lifecycle assertions:

1. Save `synthetic.ecproj`, exit the creating MCP process, and open in a new process.
2. Compare the complete native text layer/property tree exactly, including keys, IDs and source text.
3. Render at 0.5 seconds: PNG bytes match the original render exactly.
4. Change native source text to `EDITED TITLE`, save separately, render, undo to `SYNTHETIC`, redo to `EDITED TITLE`.
5. Exit and open `edited.ecproj` in another fresh process: source text remains `EDITED TITLE`, native layer type remains `Text`.

The saved native file is readable JSON with `schema: 2` and `savedBy: 0.17.0`. It references the fixture PNG externally, so moving only the `.ecproj` is not a complete asset-package portability proof. `.ecprojx` is declared by the bundle but was not exercised.

Two lifecycle assertions in [proof evidence](../../../output/editable-artwork-animation/crafting-apps/effectcraft/proof-evidence.json) and eleven further assertions in [verification](../../../output/editable-artwork-animation/crafting-apps/effectcraft/verification.json) passed. These are 13 checks in this worker's synthetic suite, not additions to the earlier Banner Studio regression counts. [verify.cjs](../../../output/editable-artwork-animation/crafting-apps/effectcraft/verify.cjs) contains the independent pixel/property assertions.

The actual CLI render command also wrote a **12-frame RGBA PNG sequence**, 0–0.5 seconds at 24 fps. All 12 decoded files are 320 × 180, have the expected four alpha samples, and have distinct hashes. [Render receipt](../../../output/editable-artwork-animation/crafting-apps/effectcraft/sequence-render.json) records exit 0 and approximately 0.12 seconds wall time; this tiny fixture is not a production performance benchmark. [Sequence verification](../../../output/editable-artwork-animation/crafting-apps/effectcraft/sequence-verification.json) records each frame's hash and alpha values.

Visual inspection of [frame 1](../../../output/editable-artwork-animation/crafting-apps/effectcraft/fixtures/frame-1.png) confirms the synthetic title and alpha blocks. Numeric PNG decoding establishes transparency regardless of a viewer's background.

## Editable interchange and limits

`file.exportLottie` exported the synthetic composition with `textAsShapes: false`, then a fresh process ran `file.importLottie`, saved a new native project, rendered it, and edited its source text.

- Export and import both returned empty warning arrays for this fixture.
- Native text remained `Text` after import and accepted `LOTTIE EDIT`.
- The exported document contains native text and `Arial-Regular` font metadata; it does not embed font bytes. Font availability remains a portability dependency.
- The PNG asset is embedded as a base64 data URL (`e: 1`), preserving its original alpha.
- At 0.5 seconds the imported x position is `45.625010546875004`, about `0.00001055` px from the original.
- The same imported 0.5-second PNG is byte-identical to the original native render.

Artifacts: [Lottie JSON](../../../output/editable-artwork-animation/crafting-apps/effectcraft/fixtures/synthetic.lottie.json), [roundtrip native project](../../../output/editable-artwork-animation/crafting-apps/effectcraft/fixtures/lottie-roundtrip.ecproj), [roundtrip render](../../../output/editable-artwork-animation/crafting-apps/effectcraft/fixtures/lottie-roundtrip.png), [MCP request/reply transcript](../../../output/editable-artwork-animation/crafting-apps/effectcraft/interchange-mcp.json). This is EffectCraft→Lottie→EffectCraft equivalence for the fixture, **not an independent browser Lottie player test**.

The pinned [Lottie implementation](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/crates/lottie/src/lib.rs) maps temporal speed/influence to normalized Bézier tangents, spatial tangents, shape/text/image layers, masks and timing. Its [exporter](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/crates/lottie/src/export.rs) emits warnings or null substitutes for unsupported effects, video/image sequences, audio, cameras/lights, 3D models and some blend/matte cases. Text-as-shapes is a separate option that sacrifices editable wording. Those broader features were inspected in source, not runtime-proven here.

| Format / route | Evidence level | Integration consequence |
|---|---|---|
| `.ecproj` native JSON | Save, fresh-process reopen, edit, render passed | Preserves native semantics but requires EffectCraft schema and asset handling |
| Lottie `.json` | Export/import/edit/render passed for two-layer fixture | Promising portable animation subset; font and player compatibility gates remain |
| `.lottie` package | Documented/source-supported only | No package roundtrip assertion |
| RGBA PNG stills / sequence | Numeric alpha + frame-change checks passed | Reliable bounded flattened handoff; text is pixels in this output |
| ProRes 4444, VP9 WebM alpha | Listed by actual CLI help/upstream docs | Encoders and independent alpha decode untested |
| H.264/HEVC/AV1/GIF/TIFF/EXR | Listed by actual CLI help | Not rendered/validated in this task |
| Banner Studio animated HTML | Existing separate application capability | No EffectCraft HTML import/export adapter exists from this work |

## Banner Studio adapter gaps

Current local `app/types/banner-studio.ts` represents scalar keyframe channels (`opacity`, `x`, `y`, `scaleX`, `scaleY`, `rotation`) with outgoing GSAP/cubic-Bézier easing strings. Its motion paths use points plus chained path-fraction tweens. Current `app/utils/banner-html-builder.ts` applies those to DOM layers through GSAP. These inspected dirty-worktree files were not modified.

An adapter would need explicit conversions and independent acceptance for:

- **Coordinates and timing:** layer/comp seconds, frame snapping, offset/stretch/reverse behavior, absolute position versus DOM base x/y plus animated offsets, anchor and text baseline/justification, dimensions and transform order.
- **Easing:** EffectCraft per-key incoming/outgoing speed/influence and spatial tangents versus outgoing easing strings/path curviness. The demonstrated Easy Ease curve must not be equated with an arbitrary similarly named GSAP preset; compare sampled positions and pixels.
- **Units and compositing:** EffectCraft opacity/scale percentages versus Banner Studio unit conventions, source alpha, premultiplication/color conversion, masks and blend modes. Preserve one opacity application and explicitly reject unsupported effects.
- **Text:** retain native wording, font identity/weight, paragraph metrics and rich text where representable. Raster/glyph-shape fallback must be clearly marked as losing text editability.
- **Identity and protection:** map stable layer IDs separately from EffectCraft session IDs, preserve unselected/locked layers, and enforce existing managed-QR provenance and mutation exclusions. No QR asset was used here.
- **Persistence and delivery:** package assets, validate versioned schemas, surface every Lottie warning, constrain helper paths/time/memory, serialize edits, handle unknown write outcomes without blind retries, and verify generated data through current authenticated Banner Studio server boundaries.

A first adapter should be a deliberately small native text + PNG + 2D transform/opacity subset. Reuse the existing Banner timeline and protected mutation boundaries; this R&D does not justify replacing them or claiming general EffectCraft feature parity.

## Licensing and outstanding gates

Pinned [MIT](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/LICENSE-MIT) and [Apache-2.0](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/LICENSE-APACHE) files identify the code's dual-license choice. [Upstream credits](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/README.md#license-and-credits) separately require notices and retain individual asset licenses in [ATTRIBUTION.md](https://github.com/storytold/effectcraft/blob/362474a843ddb67555d4c2d19ad6a590388aad0e/ATTRIBUTION.md). Brand marks have separate restrictions. A redistributed helper/source fork still needs a dependency, notice, font and branding inventory; this task did not perform legal clearance or distribute anything.

Still open: desktop GUI interaction/parity, independent Lottie player/browser rendering, Banner Studio import/export adapter, customer artwork and full typography fidelity, complex/spatial paths, masks/mattes, GPU parity, video codecs and alpha decode, production-scale limits, hosted/provider delivery, print acceptance and release review. These are unexecuted acceptance gates, not failed synthetic assertions. No provider, customer or production integration was attempted.

## Reproduction and cleanup

With the retained matching helper and this workspace's already-installed `pngjs`, from the worktree root:

```sh
node output/editable-artwork-animation/crafting-apps/effectcraft/prove.cjs
node output/editable-artwork-animation/crafting-apps/effectcraft/verify.cjs
```

These commands overwrite only owned fixture/evidence files and start/stop their own confined MCP subprocesses. `sequence-render.json` records the separate exact CLI argv for sequence export. The scripts use bounded request/subprocess waits. [cleanup.json](../../../output/editable-artwork-animation/crafting-apps/effectcraft/cleanup.json) confirms no owned helper process remained; no desktop process was started. Downloaded helper and local evidence remain intentionally retained under the ignored output directory. [SHA-256 manifest](../../../output/editable-artwork-animation/crafting-apps/effectcraft/sha256-manifest.json) covers 95 evidence/source files captured at verification time; the archive digest is in the separate download receipt.
