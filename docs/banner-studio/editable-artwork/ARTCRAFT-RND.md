# ArtCraft / PhotoCraft source investigation

Follow-up: the [installed ArtCraft 0.41.0 workflow check](ARTCRAFT-INSTALLED-UI.md) now verifies basic Moodboard text editing, undo/redo and reload, with a separate [bundle inventory](ARTCRAFT-INSTALLED-INVENTORY.md) and [versioned source audit](ARTCRAFT-INTERCHANGE-AUDIT.md). The source-only boundaries below describe this earlier research checkpoint.

27 October 2026. Paul supplied app.getartcraft.com, getartcraft.com/download and getartcraft.com/apps as an integration reference. This is public-source inspection, not a claim of installed or tested ArtCraft execution. No account, subscription, installer, provider inference or deployment was used. The web fetch of app.getartcraft.com failed; authenticated behavior is unverified.

## Finding

PhotoCraft is the most relevant part of this suite for masks, alpha, native lettering and Photoshop document interchange. ArtCraft itself is the AI composition/generation application. Its documented 2D composition and masked inpainting are useful interaction references; they do not establish automatic recovery of native type from a JPEG. The [apps index](https://getartcraft.com/apps) labels PhotoCraft early alpha and several sibling applications in development.

Public repository revisions inspected:

- PhotoCraft: `a0ce166acd2a64ff1200f793d4006db61c09f4d6`.
- ArtCraft: `1f969a9224934a55417daf10359a6fb1458b63f4`.

Both repositories contain MIT and Apache license files. Preserve the applicable notices and check individual bundled assets if reusing source; no upstream implementation has been copied into Banner Studio in this investigation. Pinned source extracts, tree inventories and revision receipts are local ignored material under `output/editable-artwork-animation/artcraft/`.

## What the inspected implementation establishes

| Area | Source evidence | Implication for Banner Studio |
|---|---|---|
| Native lettering | `TextLayer` contains text and typography; `type.edit` supports text replacement and undoable edits. | A text editor/renderer can preserve words and styling after reconstruction. It does not recognize arbitrary raster lettering by itself. |
| Masks | `Layer` stores pixel and vector masks separately; pixel masks retain density and feather. `layer.layerMask.edit` changes those properties without rewriting mask pixels. | Keep editable masks separate from source image alpha; future brush masks should not destructively erase source images. |
| Compositing | `combined_mask` combines enabled masks and uses cached mask surfaces. | Pixel alpha, layer opacity and mask coverage need one well-defined multiplication path, tested numerically. |
| Automation | Headless `command_run` routes to engine execution; MCP exposes command discovery, document inspection and bounded previews. | A desktop companion or isolated conversion worker is technically plausible; there is no native Rust CLI execution inside our Cloudflare Pages runtime. |
| Browser distribution | Self-hosted WASM build and iframe embedding are documented. File open/save is browser picker/download based; web autosave and server document storage are absent. | An iframe is a separate editor, not a completed integration with project storage, R2, tenancy, undo or managed QR. |

Pinned sources: [document model](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/doc/src/lib.rs), [type commands](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/engine/src/type_cmds.rs), [mask property commands](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/engine/src/layer_mask_props_cmds.rs), [mask compositor](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/compose/src/masks.rs), [headless dispatcher](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/automation/src/headless.rs).

## Integration decision

ArtCraft's web source also provides concrete workflow references. The [inpaint toolbar](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/frontend/libs/components/pagedraw/src/lib/components/ui/InpaintToolBar.tsx) exposes add/erase and brush size. Its [canvas helper](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/frontend/libs/components/pagedraw/src/lib/utilities/canvasHelpers.ts) creates a normalized offscreen canvas and uses source-in compositing to retain alpha while recoloring mask pixels. These are region-guided raster editing operations, not native text extraction. The [moodboard node contract](https://github.com/storytold/artcraft/blob/1f969a9224934a55417daf10359a6fb1458b63f4/frontend/libs/components/moodboard/src/lib/canvas/types.ts) separately models image, video, text and grouped nodes. Banner Studio already has richer native text/effect state, so a future bridge must map fields explicitly rather than substituting this simpler moodboard schema.

Continue the existing Banner Studio editor and AI catalogue. Adopt the documented separation of native type, untouched image pixels and editable masks as a reference architecture. Finish actual component/export alpha and mask parity now; do not replace the current editor during this increment.

The next bounded interoperability spike should create a small document containing native heading text, an RGBA image, an inverted vector mask and a soft pixel mask; save/reopen it through PhotoCraft and inspect layers rather than judging a flattened screenshot. Measure text/font preservation, mask coverage, alpha, offsets, effects and undo. Test PSD interoperability explicitly: a vendor round-trip claim does not demonstrate our Banner Studio conversion.

If that spike passes, implement a versioned document/asset interchange adapter or a companion editor. Keep platform project identity, protected legal/map/QR regions and original assets authoritative. Any return import must be previewed and applied as one undoable operation. Export unsupported features with explicit loss reporting instead of silently rasterizing text. A browser embed requires a separately proven bridge for asset transfer and save events; the inspected hosting documentation does not establish such an API.

MCP batches are sequential and **not atomic** according to the [automation contract](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/docs/mcp.md). A future adapter must inspect partial outcomes and use a duplicated document for proposals. [Browser hosting contract](https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/packaging/web/README.md).

## Remaining limits

No ArtCraft/PhotoCraft binary was executed, no PSD round trip was measured, and no production integration was added. Brush-painted masks, feather/density controls and general affine mask transforms are not established Banner Studio capabilities by this research. AI selection, background repair, raster-to-native lettering and model fidelity remain separate evaluation problems. See [animation and alpha proof](ANIMATION-WORKFLOW.md) for local implementation evidence.
