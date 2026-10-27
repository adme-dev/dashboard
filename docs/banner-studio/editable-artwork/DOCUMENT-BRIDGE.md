# Bounded local PhotoCraft document bridge

27 October 2026. A local companion now exports a supported Banner project subset to an actual editable PhotoCraft 0.16.0 document and proposes a guarded wording-only return. Unsupported content stays unchanged in a complete Banner project sidecar. This is a partial document bridge, not complete artwork interchange, automatic lettering recovery, a hosted service or print acceptance.

## Implemented surface

- `shared/bannerDocumentBridge.ts`: supported-feature assessment, canonical SHA-256 bindings, full source snapshot, stable Banner/native layer mapping, return planning and apply-time revalidation. No application/store/server files are modified by this bridge worker.
- `scripts/banner-studio/photocraft-bridge.ts`: reusable `exportPhotoCraftProject`, `proposePhotoCraftReturn`, `createPhotoCraftTextMeasurer` and local CLI.
- `photocraft-control.ts`: installed binary/version check, private token, unique loopback port, isolated configuration and scoped read/write roots, command receipts, owned-process shutdown and port-closed verification. Mutations are never automatically retried.
- `photocraft-read-archive.py`: bounded ZIP inspection without extracting entries. Duplicate/traversal entries, unsupported versions, excessive sizes and missing payloads reject.
- `photocraft-bridge-proof.ts`: repeatable actual installed-app acceptance using the real local lifestyle source and an explicit synthetic mask fixture.

Only the installed `/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft` reporting `0.16.0 (b1794c6e0, 2026-10-25)` is accepted. The native archive generator must be `photocraft-format 0.16.0`, format version 1. Earlier source/binary provenance is in [the installed-app report](PHOTOCRAFT-INSTALLED-RND.md). No upstream code or bundled font is copied into the project.

## Supported features and explicit exclusions

| Feature | Bounded behavior |
|---|---|
| Text | Single line, left aligned, normal style, six-digit opaque colour, no tracking or effects; an exact installed family/weight/PostScript face is required. Source layout uses measured ascent/descent and line height. Source text that needs wrapping is excluded. |
| Glyphs | Printable basic Latin/Latin-1 and a small declared set of smart quotes, dashes and bullets. Complex scripts, emoji and unproven glyph coverage reject. |
| Images | Embedded PNG only, at most 24 million data-URL characters, decoded dimensions at most 4096 each, one frame, integer placement inside the canvas, explicit `fit: fill`. RGB/RGBA bytes are placed independently; source alpha is retained. |
| Masks | One independent opaque rectangular Banner mask per image, including inversion, becomes an independent native vector mask. Multi-target masks require all targets to be representable. Ellipses, multiple incoming masks, transformed/hidden/translucent masks and unsupported targets are excluded together. |
| Pixel masks | No Banner pixel-mask importer is claimed. Independent PhotoCraft pixel-mask behavior remains the earlier synthetic R&D proof. This bridge demonstrates source pixel alpha plus a separate rectangular vector mask. |
| Protected state | Logo and managed QR stay in the sidecar. Copy-locked, locked or conservatively screened copy can be represented natively but cannot be returned with wording changes. All source metadata, map shapes and unsupported layers remain in the snapshot. |
| Return | Wording only, against the original mapped identity. Changing font, transform, layer order/count/identity, image bytes, mask or other native properties rejects the entire proposal. |
| Canvas and resources | One artboard per export, dimensions 1–4096, at most 500 source layers and 32 requested font families. Source JSON is bounded to 64 MiB through the CLI; text raster measurement has a separate resource budget. Native ZIP is limited to 256 MiB, 512 MiB expanded entries, 10,000 entries and an 8 MiB manifest. |

Animations, feed bindings, rich runs, text effects, clipping, non-normal blending, rotation/pivots, shape conversion, image crops/contain/cover and unknown layer properties are not silently approximated. Each excluded layer has reasons in the assessment. There is no flattened placeholder for unsupported artwork, so the exported preview visibly contains only its supported subset.

The real lifestyle heading `id:5` uses multiline Arial 900 and negative tracking. The installed Arial faces are 400/700 plus their italic variants: no Arial 900. The original heading is excluded, never silently downgraded. The proof appends a separately labelled `id:125` heading in explicitly selected Arial Bold 700, with approved wording `COME CELEBRATE OUR NEW HOME`; it does not alter the original 124 layers to make export pass.

## Local command use

Run from the worktree root. All explicit CLI paths must resolve beneath this workspace's `output/`; project-controlled paths and URLs are never fetched. Output directories must be new, and their parent must already exist. The native app is required for both export and trusted return-fit measurement.

```sh
pnpm exec tsx scripts/banner-studio/photocraft-bridge.ts export \
  --project output/editable-artwork-pilot/project.json \
  --board custom_2480x3508 --width 2480 --height 3508 \
  --revision 1 --out output/editable-artwork-bridge/my-export
```

Export produces `document.pcraft`, `document-sidecar.json`, `document-binding.json`, `document-assessment.json`, native archive evidence and control receipts. Retain the printed sidecar SHA-256 in the originating trusted session. The companion cannot know an editor's live epoch: the operator/integrator must supply the current revision when exporting and returning, alongside the full current project snapshot. A saved binding file is evidence, not independent authority if an attacker can replace it along with the sidecar.

After explicitly editing a copy of the native document locally:

```sh
pnpm exec tsx scripts/banner-studio/photocraft-bridge.ts import \
  --sidecar output/editable-artwork-bridge/my-export/document-sidecar.json \
  --sidecar-sha256 THE_DIGEST_RETAINED_AT_EXPORT \
  --project output/my-current-project.json --revision 1 \
  --native output/my-edited-document.pcraft \
  --out output/editable-artwork-bridge/my-return
```

Import inspects the archive, checks actual compressed raster/mask payload hashes as well as the native manifest, constructs only approved text/style in an owned scratch document to measure fit, and writes `proposal.json` plus `returned-document.json`. It does not open the returned archive in PhotoCraft, execute its data, fetch its assets or overwrite the Banner project. The digest shown above is a placeholder that must be replaced with the actual trusted export digest.

## Return and undo integration contract

`planBridgeReturn` requires the trusted sidecar digest, current project/revision and returned native document. A changed heading also requires a trusted `measureText(layer, text)` callback returning `{ left, top, right, bottom }` relative to the unchanged Banner box. Missing, nonfinite, negative-bearing or overflowing measurements reject. Fit claims supplied by the external document are never accepted. The local adapter uses exact native font metrics; an editor integration should measure the final Banner renderer too before acceptance.

The planner owns JSON snapshots before its first await and synchronously rechecks all caller inputs after its final await. It emits `before`, `after`, `changes`, `textFit`, source/sidecar/return hashes and the original revision. `validateBridgeApply` repeats all checks and measurements and rejects a changed reviewed plan or any intervening input change.

The host must supply its fresh project/revision, preserve the trusted originating digest, and check its live editor epoch immediately before invoking the existing single-history transaction with the validated canvas. Do not apply one layer at a time. `before` supplies the inverse; undo/redo/save remain the host store's responsibility. The coordinator owns [the editor-store integration tests](../../../test/banner/documentBridgeEditor.test.ts); those include fixture persistence and an opt-in actual-native-artifact case. No new product UI or server endpoint is claimed here.

Only derived text raster caches, derived PSD text cache data, UTF-8 run lengths, the saved filename and PhotoCraft's ephemeral document session ID are normalized when comparing native documents. Native layer IDs and every other native property remain binding. The normalized cache data is never imported into Banner.

## Actual acceptance evidence

Run:

```sh
pnpm exec tsx scripts/banner-studio/photocraft-bridge-proof.ts
pnpm exec vitest run test/banner/documentBridge.test.ts test/banner/documentBridgeArchive.test.ts
```

Ignored evidence is under `output/editable-artwork-bridge/`; `latest.json` identifies the accepted run. Each proof retains:

- `original-project.json` and `bridge-source-project.json`: original 124-layer lifestyle source and explicit 125-layer fixture source.
- `lifestyle.pcraft`, `lifestyle-return.pcraft`: actual saved native documents; 15 mapped layers comprise the real background, 13 original protected text layers and the explicitly rebuilt heading.
- `lifestyle-sidecar.json`, `lifestyle-binding.json`, `lifestyle-return-document.json`, `lifestyle-plan.json`, `lifestyle-applied-project.json`: reviewable identities, hashes, exact return and proposed saved Banner state.
- `lifestyle-before.png`, `lifestyle-after.png`, `lifestyle-undone.png`: supported-subset renders. Native text undo restores the initial RGBA pixels exactly.
- `mask.pcraft`, `mask-enabled.png`, `mask-disabled.png`, `mask-restored.png`, `alpha-mask-evidence.json`: separate synthetic alpha/mask proof. Outside `(0,0)` is transparent; `(50,150)` is `[240,80,40,128]`; hole `(100,150)` is transparent with the mask enabled and `[240,80,40,128]` with it disabled. Undo restores all pixels exactly.
- `acceptance.json`, `source-provenance.json`, `process.json`: fifteen checked predicates, exact source hashes/HEAD/main, installed identity, process exit and closed control port. Tokens are deleted during owned-process cleanup and excluded from reports.

The saved edited native document reopens with exact wording `COME CELEBRATE WITH US`. Return changes only layer 125; the original 124 layers remain exact. An actual edit to protected native copy rejects. An actual native mask toggle rejects. A 1,599-character otherwise-safe replacement fails fresh measured fit. Stale revision, tampered sidecar/plan, unsupported style/transform/structure, missing/overflowing metrics, concurrent input mutation and altered raster bytes are covered by focused tests.

Final worker checkpoint: `output/editable-artwork-bridge/proof-2026-10-27T01-54-38-678Z/`. All fifteen native predicates passed against the recorded source hashes, which were independently reread and matched after execution. The fitted return is `{left:0, top:0, right:1381.4453125, bottom:120}` inside the unchanged 2233 × 140 heading box. Focused tests pass **55/55 across three files**, including the coordinator-owned opt-in actual-artifact editor case (52 pure/archive cases and three store cases). Scoped ESLint passes. Both reusable CLI commands also passed: `cli-export-125513/` and `cli-return-125513/`, with receipts in the proof's `cli-smoke-receipts.json`; all three owned control ports were verified closed. Standalone `tsc` without Nuxt-generated alias/global context encountered existing imported application alias/auto-import errors and was not a clean typecheck; no errors named the bridge files.

The proof records HEAD `d4560047ae045e14d337ccf062055dce83692fcb` and the remote main visible at execution. The coordinator refreshed main during this run and reported unrelated ITA-ledger divergence. This is local verification, not current-main integration or release freshness; no merge/rebase/commit/deployment was performed by this worker.

During implementation, retained failed receipts exposed the empty-document Close All restriction, the one-layer minimum, UTF-8 native run lengths, regenerated document session IDs and Paste's tight-content centring behavior. The adapter now handles those explicitly. The final positive alpha proof uses clipboard document coordinates; it does not use a centre argument that would shift transparent-margin images.

No hosted deployment, provider inference, purchase, external upload, global installation, commit or client publication occurred. Full lifestyle fidelity, original heading typography, automatic reconstruction, browser/native pixel parity, Adobe compatibility, CMYK and commercial print approval remain outside this acceptance.
