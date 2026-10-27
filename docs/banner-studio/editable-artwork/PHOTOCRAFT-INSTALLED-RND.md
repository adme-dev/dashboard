# PhotoCraft installed text, alpha and mask proof

27 October 2026. The installed **PhotoCraft 0.16.0** passed a bounded native-document and PSD round trip with editable text and independent masks. Fifteen acceptance checks pass. This is measured local behavior, not proof of automatic lettering extraction, Adobe Photoshop compatibility or a Banner Studio integration.

## Binary and execution provenance

`/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft --version` reports `photocraft 0.16.0 (b1794c6e0, 2026-10-25)`. The [official v0.16.0 source tag](https://github.com/storytold/photocraft/tree/v0.16.0) resolves to `b1794c6e0608ccfc887213dcf58398977c5cb75e`. Local deep/strict signature verification exits 0. Full executable hash and command receipts are retained in `identity.json`; version correspondence is not a reproducible-build attestation.

The macOS bundle contains the desktop executable. This proof used that installed executable's documented loopback JSON control interface, not a separately downloaded CLI. It was launched with an isolated `PHOTOCRAFT_CONFIG_DIR`, read/write roots limited to the fixture directory, a locally generated private control-token file and `--safe-gpu`. No user settings, existing projects or credentials were read. The generated control token is not included in reports or evidence manifests.

The [version-pinned control protocol](https://github.com/storytold/photocraft/blob/b1794c6e0608ccfc887213dcf58398977c5cb75e/docs/control-protocol.md) supplied `engine.commands`, `engine.execute`, `app.open`, `app.save` and `app.quit`. Runtime command discovery supplied actual parameter contracts. Every request and response except authentication is retained. The process exited after `app.quit`; its port was confirmed closed.

## Actual fixture and results

The fixture is 256 × 256 RGBA, with two separate layers:

- A native `RELOCATION SALE` heading: Arial Bold, 20 pt, weight 700, blue, translated to baseline `(20, 50)`.
- A raster image with source alpha 128 in its coloured region; a separate feathered pixel mask with density 0.8 and feather 4 px; and an independent inverted vector rectangle producing a transparent central hole.

| Check | Measured result |
|---|---|
| Native `.pcraft` save/reopen | Two layers retained; heading remains `Type`, image remains `Pixel`; both mask types present |
| PSD save/reopen in PhotoCraft | Same layer structure, exact wording, character runs and text transform retained |
| Wording edit and undo | Reopened native and PSD headings changed to `LOCAL FAMILY SALE`; Undo restored `RELOCATION SALE` |
| Font edit and undo | Reopened PSD changed to Helvetica 22 pt, weight 400; Undo restored Arial Bold 20 pt, weight 700 |
| Mask properties | Original native archive and native re-export of reopened PSD retain density 0.8, feather 4 and vector inversion |
| Render fidelity | Native reopen, PSD reopen and both wording undos each rendered **zero changed pixels**, maximum channel difference 0, against the original composite |
| Independent mask storage | Disabling the vector mask revealed original centre alpha 128; disabling the pixel mask restored edge alpha 128 while the vector hole stayed transparent |
| Final restoration | Both mask toggles and font change were undone; the final PNG matches the original pixel-for-pixel |

Selected original PNG samples: untouched transparent pixel `(0,0)` = RGBA `(0,0,0,0)`; image interior `(60,160)` = `(240,80,40,128)`; vector hole `(130,160)` = transparent; feather transition alpha at x=25, 40, 43, 50 along y=160 = **28, 80, 96, 121**. These samples and the mask-disable probes establish real fractional alpha and separate mask coverage, rather than a screenshot that merely looks transparent.

PNG export correctly returned a warning that the two layers were flattened and their editable mask/blend structure was not kept. Native and PSD save/open returned no warnings for this fixture. This is **PhotoCraft-to-PhotoCraft PSD** evidence; opening the file in Adobe Photoshop has not been tested.

## Evidence and reproduction

Ignored local evidence root: `output/editable-artwork-animation/crafting-apps/photocraft/`.

- `fixture.pcraft`, `fixture.psd`, `fixture.png`: original editable artifacts and rendered composite.
- `20`–`29` receipts: native/PSD reopen, structure, wording edit, undo and renders.
- `32`–`44` receipts: independent mask toggles, font editing, undo and native re-export.
- `pixel-comparison.json`, `mask-independence.json`, `acceptance.json`: numeric comparisons, fifteen checked predicates, output hashes and process cleanup.
- `native-manifest.json`: decoded native archive manifest, with separate raster surface, pixel mask, vector path and text content.
- `46-final-desktop.png`: actual installed editor showing native type and both mask thumbnails.
- `control.py`, `build-fixture.py`, `finish-fixture.py`, `roundtrip.py`, `independence.py`: retained investigation drivers. They require an explicitly started isolated app process and its `runtime.json`; they are a chronological research transcript, not a production adapter or single-command regression runner.

The first driver attempted Deselect after adding the selection mask. PhotoCraft had already consumed the selection and rejected Deselect with `no selection`. Document inspection confirmed the mask existed; execution continued from that verified state without replaying the preceding edits. The failed receipt remains. The explicitly selected CPU renderer displayed a CPU notice; it was dismissed with Keep Using CPU. No GPU comparison is claimed. Python Pillow was unavailable, so decoded pixel comparisons used the repository's installed Sharp package; no package installation was needed.

## What to use in Banner Studio

PhotoCraft supplies a concrete reference architecture: native type and its formatting survive independently of raster pixels; pixel and vector masks remain separate editable objects; layer changes use an undoable engine command; saving a flat image reports the loss of editability. These properties match the Banner Studio direction.

A bounded desktop companion or isolated conversion service is now supported by a real synthetic proof. Before implementing a production adapter, map Banner layer IDs, dimensions, transforms, text effects and assets explicitly; preserve protected copy/map/QR metadata outside external files; report unsupported features; and preview return edits against the current project revision before applying one undoable change. The native archive manifest is inspectable but is not automatically a stable cross-version interchange contract.

Native Rust control/CLI execution is not available inside Cloudflare Pages. A browser WASM build would require a separately proven asset/save bridge. Rich typography, missing-font handling, real campaign scale, printing, Photoshop interoperability and an actual Banner project round trip remain open. This experiment does not turn a flattened image into native text.

The pinned repository includes MIT and Apache-2.0 license files; bundled fonts have their own OFL notices. No upstream implementation or bundled font was copied into Banner Studio.

## REA use

The user suggested [morluto/rea](https://github.com/morluto/rea). Existing `rea` version 6.4.0 was used with `inspect-artifact /Applications/PhotoCraft.app --format json`, producing a local artifact inventory and evidence digest in `../rea/photocraft-artifact.json` under the evidence root's parent. REA did not install/register tools, patch the app, run a decompiler or recover its source in this experiment. Official source plus the running engine provided the behavioral evidence; REA provided static bundle evidence. No provider inference, upload, purchase, deployment or client publication occurred.
