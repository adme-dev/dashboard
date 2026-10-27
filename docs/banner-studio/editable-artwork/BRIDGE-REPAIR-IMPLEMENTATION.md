# Document bridge and lettering repair implementation

Approved by Paul on 27 October 2026 after the installed Craft application proofs. This increment turns the measured interfaces into a bounded document bridge and adds reviewed background repair plus native lettering to the existing editor. Existing generation/style recipes, native copy inspector, timeline and managed QR remain the product foundation.

## Source and ownership

Coordinator fetched `origin/main` from `adme-dev/dashboard` before code work. Main `4a68e92367fbcffd08a3f6a6a6e4537c71195937` is already included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb` (one ahead, zero behind). No rebase needed. Preserve dirty implementation and the parent checkout. No merge, deployment, publication, global install or subscription purchase.

Run `run_666e5ba6039d`:

- Document bridge: `task_80a4002f27a7`, dispatch `ctx_b242e989b94e`. Owns new shared bridge module, PhotoCraft scripts, focused tests and DOCUMENT-BRIDGE.md.
- Repair server: `task_49a00869dad6`, dispatch `ctx_22f18ee4e95c`. Owns repair contract, endpoint, artwork utilities and server tests.
- Repair editor: `task_94ac508faaf3`, dispatch `ctx_d6e2edc6d39c`. Owns repair inspector/composable, scoped canvas preview and frontend tests.
- Coordinator: integration review, actual Nuxt fixture proof, public feature documentation and final evidence accounting.

## Concrete contracts

Repair selects one saved owned image and a reviewed rectangular region in normalized image coordinates. Request includes saved revision, source transcription and exact replacement wording. The server authorizes the source, validates protected content and geometry, then makes at most one configured image-provider call. It composites only the repair rectangle into the original decoded image. Pixels outside the rectangle remain exact. A proposal never saves the project by itself.

The editor previews the repaired image together with a separate native text layer. Review is required before one undoable application. Selection, input, project or source-revision changes invalidate the proposal. Existing native typography and AI editing apply to the new text after reconstruction. Unsupported crops, masks, transforms, animation and protected targets fail explicitly rather than receiving guessed mappings. Manual source transcription is not verified OCR; local provider fixtures cannot establish repair quality.

The PhotoCraft bridge exports a supported subset with a source snapshot and stable identities. Unsupported layers remain in Banner Studio. Return edits must match the source revision and approved editable layers; protected copy/map/QR metadata remains authoritative in Banner. Save/reopen, actual native text editing and mask/alpha evidence are required. Desktop execution is a local companion proof, not a Cloudflare runtime capability.

## Verification sequence

1. Focused server and editor tests: ownership, bounds, facts/protected layers, stale responses, cancellation, deterministic outside-region pixels, preview without mutation and one-step undo.
2. Actual installed PhotoCraft document exchange, with honest supported-feature and font limits.
3. Actual Nuxt browser proof using the local-lifestyle reference, deterministic provider fixtures and file-backed API persistence. Record preview, native text, protected-layer preservation, undo/redo and save/reopen; exercise existing font, animation and mask controls where appropriate.
4. Combined relevant regressions, scoped lint and integration review. Update this report with results and remaining live/hosted gates.

## Final local checkpoint

The bounded implementation and review are complete locally. Broader PRD, provider quality, hosted integration and print gates remain open.

| Scope | Result | Evidence |
|---|---|---|
| Repair server | Owned source/revision validation, one configured provider call, inward rectangle and exact outside RGBA, protected overlap guards | [Server report](LETTERING-REPAIR-SERVER.md) and CPU image tests |
| Repair editor | Region/wording review, separate native text, original comparison, one apply/undo, saved provenance and cancellation fences | [UI report](LETTERING-REPAIR-UI.md) |
| Actual Nuxt browser | Passed: Impact native heading, preview/review, 10 fixture saves, undo/redo/reopen, right-click tween and visible motion; QR unchanged | `output/editable-artwork-repair/ui/ui-evidence.json`, `06-reopened.png`, `motion-samples.json` |
| Pixel scope | All 1,444,072 pixels outside the rectangle exact; 122,676 inside pixels changed | Browser evidence, source/output PNGs and server tests |
| PhotoCraft bridge | Reusable local export/import CLI, supported subset and guarded wording-only proposal; 15 native predicates pass | [Bridge report](DOCUMENT-BRIDGE.md); `output/editable-artwork-bridge/latest.json` |
| Review | P1 return text overflow and P2 missing repair provenance fixed; independent 169-test run passed | [Independent review](BRIDGE-REPAIR-REVIEW.md) |
| Regression | 1,214 passed, 19 skipped across 121 selected files; 114 files passed, 7 skipped | `output/editable-artwork-bridge-repair-regression.log` and recorded file list |
| Final bridge follow-up | 55 focused tests passed including real native artifact through editor store, after serialization-preservation correction | Bridge final report and `editor-store-evidence.json` |
| Lint | Scoped new/changed repair and bridge source/test lint passed; whitespace check passed | `output/editable-artwork-bridge-repair-lint.log` |

The broad suite's skips are explicit opt-in browser/benchmark cases, including the real bridge artifact case when its path is absent. The actual repair browser script and real bridge artifact case were separately invoked and passed. No full repository typecheck/build claim is made; the existing banner types file has unrelated lint errors outside the added optional metadata field.

Browser repair uses a deliberately white synthetic provider patch in the letter's white heading area. It proves editor behavior and pixel boundaries, not naturally recovered background, OCR, ghost-free AI quality or hosted storage. Remaining body text in that flat-source proof is still pixels. The separate earlier curated 124-layer lifestyle pilot remains preserved.

PhotoCraft maps 15 supported layers: the background, 13 original protected texts and a separately labelled supported Arial Bold heading 125. The original Arial900/multiline heading is explicitly excluded. Return edits only 125 and preserves all 124 original layer records; this is not full flyer fidelity. Native mask proof preserves alpha 128 under an independently toggled inverted rectangle and returns exact pixels on undo. Final accepted proof: `output/editable-artwork-bridge/proof-2026-10-27T01-54-38-678Z`. The store test uses the exact native artifacts with recorded fit metrics and fixture API persistence; no product bridge UI is claimed.

During work the shared origin/main ref advanced to `ec2b67ff4d7952ca0ea33a4cd98365a1d9a18798`, leaving HEAD 1 ahead/5 behind. Those five commits change only `docs/runbooks/ita-dealer-completion-ledger-20261026.md`; inspection found no application or scoped documentation overlap. The start-of-turn fresh-main checkpoint above remains historical. No merge/rebase was attempted across the shared dirty implementation. Refresh and integrate current main before release or the next code continuation.

## Online engines direction

Paul clarified that unattended workflows must not depend on the user's computer and added VectorCraft, EffectCraft, FilmCraft, FigCraft and SoundCraft. [ONLINE-ENGINE-DESIGN.md](ONLINE-ENGINE-DESIGN.md) records browser editing plus isolated hosted engines, source-backed WebAssembly/headless capabilities, per-engine loss reports and print gates. Only the PhotoCraft local companion is implemented in this increment. No VPS, web embed, other engine adapter or production job service was provisioned.


## Worker and runtime settlement

Repair server, repair UI, provenance follow-up, PhotoCraft bridge and independent review all succeeded and were accepted/released in Orca run `run_666e5ba6039d`, with transcripts archived. Final coordinator bridge run passes55 tests with the current native artifact. The owned Nuxt process exited and port3137 is closed; PhotoCraft processes record their own exits and closed ports. No reclaimable worker terminal remains. The Orca card is in review.
