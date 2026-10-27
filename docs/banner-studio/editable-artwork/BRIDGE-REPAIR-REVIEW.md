# Document bridge and lettering repair review

27 October 2026. Read-only review of the dirty `adme-dev/banner-editable-artwork` worktree; this report is the reviewer's only authored file. No provider call, live DB/storage mutation, deployment or commit. Review dispatch: `ctx_d489e7d547c3`.

Status: **both concrete findings corrected and locally verified; no remaining blocking finding in the reviewed increment**. This is bounded local review acceptance, not release approval or live-provider quality acceptance.

## Findings

### BR1 — P1: returned wording bypasses the export-time fit check

Initial locations: `shared/bannerDocumentBridge.ts:198–215`, `scripts/banner-studio/photocraft-bridge.ts:53–58`, `app/components/banner/layers/Text.client.vue:124–125`, `app/components/banner/Artboard.client.vue:89`.

The export adapter measures point-text fit, but `planBridgeReturn` originally accepted any safe replacement up to 4,000 characters without measuring it. `validateBridgeApply` repeated that incomplete check. Export explicitly excludes `clipToBounds`; Banner's renderer wraps text and leaves overflow visible. Consequently an ordinary wording change can paint beyond its unchanged layer rectangle and cover protected copy/map/QR. Preserving protected layer records does not preserve their visible content; `assertManagedQrTransition` validates QR properties, not neighboring glyph coverage.

Reproduction, performed read-only against the actual saved PhotoCraft proof at `output/editable-artwork-bridge/proof-2026-10-27T01-45-18-736Z`: load `lifestyle-sidecar.json` and `lifestyle-return-document.json`; find the native mapping for Banner layer 125; set its content text to `'WELCOME '.repeat(200).trim()` and update its sole run and paragraph lengths to the UTF-8 byte length. Pass the unchanged trusted sidecar hash/source/revision to `planBridgeReturn`, then `validateBridgeApply`. Both accepted 1,599 characters at font size 100 in the original 2,233×140 box, with `clipToBounds: false`. Only the text property changed. No live process or project was mutated by this probe.

Required correction: reject return/application without fresh trusted text measurement proving the replacement fits the original bounds; never trust geometry/cache claims supplied by the returned archive. Test missing measurement, overflowing replacement, negative bearings, stale changes during asynchronous measurement and an actual native edit. Do not fix by silently clipping words or modifying unrelated geometry. Bridge owner acknowledged and implemented the measurement gate.

**Disposition: closed locally after correction.** Changed text now requires an independently supplied `BridgeTextMeasurer`; missing, nonfinite, nonpositive or overflowing bounds fail. Measurements become part of the reviewed plan and are repeated at apply. Input JSON is snapshotted before asynchronous work and synchronously compared at completion, including project, revision, sidecar and returned document; apply also fences the reviewed plan. The CLI measures approved source typography in a new scratch native document, verifies the exact font face and rejects unsupported fallback. Reviewer repeated actual-sidecar negative probes for missing metrics, overflow and source mutation; all rejected. Regression coverage also rejects negative bearings, NaN, changed apply measurements and asynchronous mutations of project/returned/sidecar/revision. No unrelated geometry is changed. A future browser integration must supply its own trusted actual renderer measurement; replayed archive claims are not sufficient.

### RR1 — P2: applying repair loses source and generation provenance on save/reopen

Initial location: `app/composables/useBannerLetteringRepair.ts:135–147`, plus `apply()` and `server/utils/banner/artwork.ts:234–245`.

The candidate originally kept only the replacement background URL and new native text, explicitly deleting the background's old `letteringRecipe`. Neither resulting layer retained the original asset ID/URL/hash, reviewed normalized and pixel region, proposal/revision, source wording, instruction, provider/model/request evidence or background hash. The asset insertion only attaches generic `ai-artwork`/`review-required` tags, while invocation metadata lacks the source relation. Session undo can restore the original, but a saved/reopened canvas cannot trace the repair to its original source or reconstruct its review evidence. The initial save/reopen test checks exact native text and canvas equality, which does not detect absent metadata.

Reproduction: generate/apply using `test/banner/letteringRepairProposal.test.ts`'s fixture, serialize `studio.getCanvasData()`, load it into a fresh project and inspect the background/native text. The response's `sourceAssetId`, `sourceImageHash`, `region`, `pixelRegion`, `proposalId` and `evidence` are absent from both. This contradicts PRD R21/R24 and `TECHNICAL-DESIGN.md`'s persisted source/provenance requirement. UI documentation explicitly describes this omission; it is not an undocumented test assumption.

Required correction: versioned JSON-safe repair metadata binding the two resulting layers to source/output assets, bounds, exact wording and actual provider evidence, retained through atomic undo/redo and save/reopen. Historical provenance should remain historical when users later edit native wording/style; do not represent old review as a new approval. Coordinator assigned a separate worker to this correction.

**Disposition: closed locally after correction.** `LetteringRepairMetadata` / `Layer.letteringRepair` now preserve a version-1, fixed-shape record on both background and text: proposal/project/source revision, source asset/URL/hash, normalized/pixel region, source/replacement wording, background asset dimensions/hash, actual provider/model/request ID, review-required status and related layer IDs. Payload fields are bounded, opaque provider extras are excluded, and prior repair metadata is not recursively nested. This is historical provenance, not an approval attestation or an isolated-lettering regeneration recipe. The correction does not store the freeform repair instruction; exact replay/regeneration remains outside its contract. Reviewer reran five repair suites after the correction: **114 tests passed**, including JSON save payload roundtrip/reopen and atomic undo/redo metadata assertions.

## Verification and evidence boundaries

- Reviewer executed seven focused suites: `documentBridge`, `documentBridgeEditor`, `letteringRepairProposal`, `letteringRepairImage`, `bannerLetteringRepairUi`, server API `bannerLetteringRepair`, and server utility `bannerLetteringRepair`: **149 tests passed**. Separate `documentBridgeArchive.test.ts`: **3 tests passed**. The Vite native-config migration advisory was non-failing.
- Final combined run after both fixes: **8 files, 169 tests passed, no skips**, with `BANNER_BRIDGE_PROOF_ROOT=output/editable-artwork-bridge/proof-2026-10-27T01-49-23-069Z`. This includes the opt-in actual PhotoCraft artifact through editor apply/undo/redo/save/reopen and regenerates that proof directory's `editor-store-evidence.json`. Its test measurement callback replays the recorded bounds only for the exact bound wording: this is artifact validation, not a production browser measurer.
- Tests exercise real PNG/JPEG CPU decoding/compositing with deterministic fixture outputs, rejected protected overlaps, stale project/source handling, one provider invocation, cleanup, cancellation, proposal hashes, atomic undo and mocked persistence. They do not exercise live auth/DB/R2 or image-provider quality.
- Inspected coordinator evidence `output/editable-artwork-repair/ui/ui-evidence.json`, run starting `2026-10-27T01:49:27.599Z`: passed actual Nuxt panel/native font/tween/undo/save/reload checks, 1 synthetic repair, 10 fixture saves, 0 live-provider calls, 0 scan requests. It explicitly uses a white rectangle, not recovered natural background. This report did not rerun that browser proof.
- Inspected bridge proof `proof-2026-10-27T01-49-23-069Z/acceptance.json`: 15 checks, including actual long-text rejection, edited native reopen, exact raster payloads, independent inverted mask/alpha, native undo, rejection of protected text/mask edits, and exact preservation of original 124 Banner layers. `process.json` records PhotoCraft 0.16.0 build b1794c6e0, exit 0 and closed control port. This proof includes the fit gate; the later synchronous staleness hardening is covered by the final tests. See final source hashes below.
- PhotoCraft scope is partial export plus **wording-only return**. The original Arial 900 heading is excluded, and a separate supported Arial 700 heading 125 is added explicitly for the proof. Raster/mask payloads are immutable on return; most unsupported layers remain only in the authoritative sidecar. This is not a complete artwork-fidelity round trip, a Banner product import UI or a Cloudflare capability.
- No additional independently demonstrated server authorization, owned-source, outside-region alpha, undo or protected-QR-identity defect found in this bounded review. The inside-region generated pixels and manually transcribed source remain human-review boundaries.

## Source checkpoint and remaining work

HEAD is `d4560047ae045e14d337ccf062055dce83692fcb`; observed local `origin/main` is `ec2b67ff4d7952ca0ea33a4cd98365a1d9a18798`, with `HEAD...origin/main` = `1 5`. The original implementation document's `1 0` / main `4a68e923…` checkpoint is stale. No fetch/rebase/integration was performed by this reviewer; preserve dirty work and reconcile onto current main before any release.

Remaining: authorised real-provider repair quality review (ghost lettering, seams, adjacent objects), hosted authorization/private asset persistence and production/print acceptance. These are unproved gates, not defects closed by synthetic fixtures. No further implementation edit is requested by this review. Coordinator retains integration ownership.

Final reviewed source SHA-256 checkpoint:

```text
ff7a3fa348d02d18883cbdc722eb6262b7a58ea9b536cb31464edce12d1c4b71  shared/bannerLetteringRepair.ts
626043385bcd1833c4dd2c92b7fa2d05c9f90e0b52463e23b2848039e4ff4d95  server/api/agency/banner-studio/ai/repair-lettering.post.ts
97c1273c72fb08e6cf7f1dcfb8610dc1abbdb17487c828e3cf8abf2253bfad55  server/utils/banner/artwork.ts
8772aa4dea0431f69f58e210e2eccccb8237952502464cff7944648a97447ffb  server/utils/banner/artworkValidation.ts
93f0822dafccde0ad3be75e954a85f6e7ff396452598cd2246bfa29b8e031a66  app/composables/useBannerLetteringRepair.ts
798e09f58420fea0e441cffeb27fe33bb35a12f93c99d5e31675a401e90ef6fd  app/components/banner/inspector/LetteringRepair.vue
111dee3fb1435ceceb4a03ab2059586c5b94bd39d9902146daf50b8730c316d7  app/types/banner-studio.ts
998f7bdbaddf0d76f3e7e5ebd5f76bf538b97010bdc5024926ac30ec08fd83e5  shared/bannerDocumentBridge.ts
d63da6d88ab9eb98cb59b738ca7a1f7ea727ae1cde2e5723f8e05a782a9e1a92  scripts/banner-studio/photocraft-bridge.ts
47e689375a622cab482b20f2b8792586ae39332e682ef618de96e2aa7c47e4fa  scripts/banner-studio/photocraft-control.ts
e20245c99b1b8ebe7782e1cea101cdd1b8572053d58f4c8a285fe118038900e4  scripts/banner-studio/photocraft-read-archive.py
```
