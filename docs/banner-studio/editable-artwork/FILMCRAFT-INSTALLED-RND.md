# FilmCraft 0.13.0 installed-app and interchange R&D

27 October 2026. Bounded local research for Banner Studio; no application implementation, commit or deployment.

**Result:** FilmCraft is a viable local native-title/timeline and transparent-video export candidate. The matching official headless CLI passed synthetic native save/reopen, editable-text undo, position animation, PNG alpha and ProRes 4444 alpha checks. **OTIO is not a lossless editable-title bridge:** the measured export/re-import converts a native graphic title into offline media. Desktop GUI parity and real Banner Studio artwork remain untested.

## Installed artifact and provenance

| Observation | Measured result |
| --- | --- |
| Installed bundle | `/Applications/FilmCraft.app` |
| Bundle/version | `ai.storyteller.filmcraft`, `0.13.0` |
| Embedded source commit | `30536bc5d0ddf690f2181b7b97182db8658a6038` |
| Architecture | Universal Mach-O, arm64 and x86_64 |
| Signature | Developer ID Application: Learning Machines LLC (`DJ6XS33FX8`); stapled notarization ticket |
| Verification | `codesign --verify --deep --strict --verbose=2` succeeded |
| Document association | `.fcproj`, `application/x-filmcraft`, JSON-conforming UTI `ai.storyteller.filmcraft.project` |
| Safe executable checks | Installed desktop `--help` and `--version` both exited 0 |

The embedded commit matches the [official v0.13.0 release](https://github.com/storytold/filmcraft/releases/tag/v0.13.0). Source analysis below is pinned to that commit, not current main. The official [versioned agent guide](https://github.com/storytold/filmcraft/blob/30536bc5d0ddf690f2181b7b97182db8658a6038/docs/agents.md) identifies the macOS CLI as a separate release asset; it is absent from the app bundle, PATH and the checked `/usr/local/bin` and `/opt/homebrew/bin` folders.

The coordinator explicitly permitted downloading the matching standalone helper into the owned ignored output directory. No global install, package setup or MCP registration occurred:

- Asset: [filmcraft-cli-0.13.0-macos-universal.zip](https://github.com/storytold/filmcraft/releases/download/v0.13.0/filmcraft-cli-0.13.0-macos-universal.zip).
- Published GitHub release asset digest and measured SHA-256 both equal `d77d94f2efc3ed88d0c10189d9707ca87ccffed41008f995d40b892b84479994`.
- Executed helper reports `filmcraft-cli 0.13.0`; its code-signature metadata is retained separately. Desktop signature verification does not substitute for CLI provenance.
- REA 6.4.0 `inspect-artifact` completed static bundle inventory: 18 artifact nodes, no integrity contradiction. Its generic JavaScript follow-up suggestion was not relevant evidence for this native Rust/Mach-O app. No REA installation, update or setup occurred.

Evidence root: [`output/editable-artwork-animation/crafting-apps/filmcraft/`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/). Important receipts: `metadata.txt`, `signature.txt`, `signature-verification.txt`, `desktop-help.txt`, `desktop-version.txt`, `cli-provenance.json`, `cli-signature.txt`, `release.json`, `rea-inspect.json`, and `source-manifest.json` (pinned source URLs and hashes).

## Measured local proof

The synthetic fixture has a 320 × 180 Rec.709 sequence at 25 fps, lasting two seconds / 50 frames. Video track 1 carries a generated 96 × 48 RGBA PNG with alpha stripes 0, 128 and 255. Video track 2 carries native point text `Banner QA — fi 123`, Inter Bold at 20 px, with position keyframes at 0 and 1.6 seconds. No customer artwork, QR asset or existing project was accessed.

| Check | Result and evidence |
| --- | --- |
| Native creation | CLI created project, sequence, native text and imported PNG; each command succeeded (`create-results.jsonl`) |
| Save/reopen | A fresh CLI process opened `synthetic.fcproj`; `file.saveCopy` produced `reopened.fcproj` byte-identically, SHA-256 `50c26c147ab3aaa8b55aedb091dcfa2a544b1e1e8873ea36eebaba1094464ac4` |
| Editable text | `graphics.setText` changed the string; `graphics.list` exposed it; `edit.undo` restored the original complete project object (`edit-undo-results.json`, `undo-restored.fcproj`) |
| Animation | Native text position `(12,28)` → `(72,28)`; decoded start/end renders measured text pixel bounds `[13,13,196,28]` → `[73,13,256,28]`, exactly 60 px horizontal movement |
| Transparent PNG export | `alpha:true` PNG sequence exported two frames; independently decoded pixel alpha at stripe centers is 0/128/255; outside content is 0 |
| Default opaque behavior | `alpha:false` PNG sequence is opaque, including empty canvas; half-alpha green becomes `[0,162,72,255]` over black rather than the original `[0,220,100,128]` |
| Transparent ProRes | `proresProfile:"4444", alpha:true` exported 50 frames, 588,105 bytes; FFprobe sees ProRes 4444, `yuva444p12le`, 320 × 180, 25/1 fps, 2 seconds |
| ProRes decoded alpha | Independent FFmpeg RGBA decode measures 0/129/255 at the three stripe centers, within one 8-bit level of the source; empty canvas is transparent |
| Export completeness | All tested media exports returned `offlineMedia:[]` |
| OTIO export/re-import | Export succeeds with an explicit native-graphic loss warning; fresh import links the PNG but reports the title as offline media named `Graphic`; native `ItemKind::Graphic` becomes `ItemKind::Media` |
| MCP discovery | Isolated stdio initialization and `tools/list` succeeded and exited 0; no MCP tools were used to control a desktop window |

Main receipt: [`proof-evidence.json`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/proof-evidence.json). Inspectable outputs: [`synthetic.fcproj`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/synthetic.fcproj), [`synthetic-alpha.mov`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/synthetic-alpha.mov), [`start.png`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/start.png), [`end.png`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/end.png), and [`synthetic.otio`](../../../output/editable-artwork-animation/crafting-apps/filmcraft/synthetic.otio). The PNG was visually inspected as well as decoded. `prores-ffprobe.json` records the independent movie inspection.

Reproduction inputs are `create.jsonl`, `edit-export.jsonl`, `edit-undo.jsonl` and `verify-proof.py`. All helper invocations use explicit `--data-dir` and `FILMCRAFT_DATA_DIR` under the fixture root. The initial attempt to combine `--save-as` with `inspect` did not write a file despite exit 0; the verified procedure uses explicit `file.saveCopy`. An unavailable Python Pillow module was not installed; independent pixel validation uses the already-installed FFmpeg instead.

## Exact native integration shape

Measured native envelope:

```json
{
  "format": "filmcraft.project",
  "schema_version": 13,
  "generator": "FilmCraft 0.13.0",
  "project": { "name": "…", "settings": {}, "root": {}, "items": {}, "next_id": 9 },
  "view": {}
}
```

The empty objects above abbreviate full objects, not a minimal valid project. Use the saved fixture as the exact serialization example. [Versioned project-file documentation](https://github.com/storytold/filmcraft/blob/30536bc5d0ddf690f2181b7b97182db8658a6038/docs/project-files.md) describes version migrations, atomic saves and optional view state.

- `project.items` is keyed by decimal item ID strings. Item 3 contains `kind.Sequence`; `settings.frame_rate` is `{ "num":25, "den":1 }`, with `width`, `height`, `par` and color settings. `video_tracks` is an ordered array; each track contains `items`.
- A timeline item carries numeric `id`, source `item`, `start`, `duration`, `source_in`, `speed`, `enabled`, and `effects`. Time is integer ticks: **254,016,000,000 ticks/second**. Here duration is `508032000000` and the second keyframe is at `406425600000`.
- The title source is item 4: `kind.Graphic:{width:320,height:180,rate:{num:25,den:1}}`. Clip 5 references it. Its `graphic_text` effect is the native editable layer; intrinsic `motion`, `opacity` and `time_remap` effects are also stored.
- The PNG is item 7: `kind.Media.media.File.path` references the external file; `info.video.has_alpha` is true. The measured project uses an absolute asset path. Asset bytes and fonts are not embedded in this fixture.
- Graphic effect order is paint order, first behind last. Images imported through `graphics.newFromFile` are separate timeline clips, not image layers inside a graphic clip ([versioned graphics guide](https://github.com/storytold/filmcraft/blob/30536bc5d0ddf690f2181b7b97182db8658a6038/docs/graphics.md)).

Measured parameter representation:

```json
{
  "text": { "value": { "Text": "Banner QA — fi 123" } },
  "font": { "value": { "Text": "Inter" } },
  "font_style": { "value": { "Text": "Bold" } },
  "position": {
    "value": { "Vec2": { "x": 12.0, "y": 28.0 } },
    "keyframes": [
      { "time": 0, "value": { "Vec2": { "x": 12.0, "y": 28.0 } }, "interp": "Linear", "out_influence": 0.3333333333333333, "in_influence": 0.3333333333333333 },
      { "time": 406425600000, "value": { "Vec2": { "x": 72.0, "y": 28.0 } }, "interp": "Linear", "out_influence": 0.3333333333333333, "in_influence": 0.3333333333333333 }
    ]
  }
}
```

Source also defines tagged `Float`, `Color`, `Bool`, `Choice`, `Curve`, and `Path` parameter values; temporal modes include Hold, Bezier, AutoBezier, ContinuousBezier, EaseIn and EaseOut. Those additional interpolation modes were not exercised. Native conversion should translate Banner Studio timing/GSAP semantics explicitly rather than assume an identical easing vocabulary.

Prefer an adapter issuing documented commands, then saving the app-produced native project, over handwritten schema construction. The measured command sequence uses `file.newProject`, `file.newSequence`, `graphics.newText`, `file.import`, `timeline.place`, `effects.setParam` with `keyframe:true`, `file.saveAs`, and `file.exportMedia`. Exact command contracts are retained in `cli-commands.txt`.

## Typography and alpha boundaries

**Measured typography:** `fonts.list system=false` reports bundled Inter Regular, Medium, SemiBold, Bold and Italic; the fixture's Inter Bold string remains native through reopen/edit/undo and rasterizes successfully. Bundled families also include JetBrains Mono, Noto Serif, BIZ UDMincho/UDPGothic, Shippori Mincho and several Noto Sans scripts. The 20 px fixture's point-text baseline origin is `(12,28)`; its reported layout bounds differ from its actual ink bounds, so a Banner Studio top-left text box cannot be copied as a FilmCraft baseline coordinate without conversion.

**Source-only typography:** point text originates on the first baseline; paragraph text originates at the top-left of its box. Source parameters include tracking in 1/1000 em, extra leading in px, kerning, ligatures, baseline shift, faux styles, caps, box size, fill/stroke/shadow and per-character styles. The text engine claims OpenType shaping and bidi support. No cross-engine visual match, font substitution, custom font packaging, multilingual shaping or responsive paragraph-layout acceptance is established by this single Latin fixture.

**Source-only alpha format policy:** [export settings](https://github.com/storytold/filmcraft/blob/30536bc5d0ddf690f2181b7b97182db8658a6038/crates/export/src/lib.rs) specify opt-in alpha for PNG, TIFF, Targa, OpenEXR and ProRes 4444/4444 XQ. Default `alpha:false` flattens over black; unsupported formats ignore the flag. OpenEXR uses premultiplied alpha, while the other named paths use straight alpha. PNG and ProRes 4444 are measured above; TIFF/Targa/EXR, 4444 XQ, HDR and other codecs are untested. The source comments also flag that the ProRes float HDR input path carries no alpha. Do not extrapolate this SDR proof to HDR transparency or ordinary H.264/ProRes 422.

## Interchange decision

| Path | What can be relied on here |
| --- | --- |
| Native `.fcproj` + external media | Measured editable text, position keys, timeline and transparent still preservation; recommended local authoring handoff |
| PNG sequence + explicit alpha | Measured transparent frames; suitable rendered-layer fallback with frame rate, sequence order and geometry in a sidecar; text editability is lost |
| ProRes 4444 + explicit alpha | Measured transparent flattened movie; suitable video interchange candidate, subject to destination decoder acceptance |
| OTIO | Measured timeline/media handoff, but native graphic title returns as offline media even though effects appear in FilmCraft metadata |
| FCP7 XML / FCPXML / EDL / AAF / OMF | Source-only support, not tested here; not an editable-title preservation route |

The [versioned interchange README](https://github.com/storytold/filmcraft/blob/30536bc5d0ddf690f2181b7b97182db8658a6038/crates/interchange/README.md) explicitly describes graphic/adjustment losses: FCP7 writes a media-less clip with FilmCraft filter IDs that is skipped on import; FCPXML writes a media-less clip not read back; AAF writes a gap; EDL writes an ordinary event; OMF carries no video. OTIO uses `Timeline.1`, `Stack.1`, `Track.1`, clips/references and frame-based `RationalTime.1`; FilmCraft-specific fields live under `metadata.filmcraft`. Metadata presence is not proof of a native title round-trip.

For Banner Studio, keep the editable design, protected text/QR provenance and semantic layer identities canonical in Banner Studio. A future local bridge can map supported text and timing to native FilmCraft commands, pass approved RGBA assets as external media, preserve an explicit ID/timing/font manifest, and deliver either `.fcproj` or a labeled flattened movie. This research does not implement that adapter or infer that FilmCraft can recover editable design from a flat flyer.

## Acceptance still open and cleanup

- Installed desktop GUI open/save/reopen and preview/export parity: root-owned, not performed here. The tested CLI is a separate verified v0.13.0 release artifact, not the app executable.
- Actual Banner Studio project export/import, reverse mapping, z-order/masks/crops/easing and font metric fidelity; there is no application integration yet.
- Browser/platform playback of transparent ProRes, production-size performance, long timelines and color-managed/HDR acceptance.
- Real retail artwork, protected QR rendering/scanning, customer approval, commercial print, hosted deployment and provider delivery remain separate gates.

No desktop control port or GUI session was started. All owned CLI/MCP processes exited; no background server remains from this worker. Only this report and the ignored FilmCraft evidence directory were written. Shared dirty application work, existing user projects/settings, credentials, provider services, installs, commits and deployment were not changed; the standalone helper exception was explicitly granted by the coordinator and stayed inside the evidence directory.
