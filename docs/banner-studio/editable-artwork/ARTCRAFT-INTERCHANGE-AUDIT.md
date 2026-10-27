# ArtCraft v0.41.0 interchange audit

27 October 2026 — source inspection and installed bundle metadata only.

**Decision:** do not build a production ArtCraft document adapter now. A bounded image/shape scene converter is technically plausible, but the inspected Canvas format cannot carry Banner Studio native lettering or layer masks, and a supported installed-app file entry point remains unverified. PhotoCraft is a separate, more promising candidate for layered text/mask interchange; its PSD and MCP capabilities are not installed ArtCraft capabilities.

## Evidence and version boundary

- Read [ARTCRAFT-RND.md](ARTCRAFT-RND.md) and its pinned extracts first. That investigation's ArtCraft revision, `1f969a9224934a55417daf10359a6fb1458b63f4`, is **20 commits ahead** of the release tag according to the [GitHub comparison][comparison]. It must not stand in for the installed version. The three previously pinned ArtCraft extracts (moodboard types, canvas helper and inpaint toolbar) are byte-identical to the release copies; comparison results are in the evidence manifest.
- `/Applications/ArtCraft.app/Contents/Info.plist` reports identifier `ai.artcraft.app`, short version and build `0.41.0`. The [release][release] tag is **`artcraft-v0.41.0`**, resolving to **`c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9`**; its [Tauri configuration][tauri] also reports 0.41.0. This matches metadata, not a reproducible-build or installed-binary provenance attestation.
- PhotoCraft findings below apply only to the previously pinned **`a0ce166acd2a64ff1200f793d4006db61c09f4d6`** source. The unversioned [suite page][apps] identifies PhotoCraft separately as early alpha; neither that page nor current default-branch source proves features in an installed ArtCraft build. No PhotoCraft installation/version was established by this audit.
- Ignored evidence: `output/editable-artwork-animation/artcraft/interchange-audit/`. It contains filtered bundle metadata, GitHub release/tag/commit/tree/comparison receipts, 30 release-pinned source extracts and a SHA-256 manifest. Only public GETs and a read of bundle metadata were used; no app launch, settings/account/credential inspection, install, provider invocation, app-code edit, commit or deployment.
- Dashboard snapshot: branch `adme-dev/banner-editable-artwork`, HEAD `d4560047ae045e14d337ccf062055dce83692fcb`; existing `origin/main` ref `4a68e92367fbcffd08a3f6a6a6e4537c71195937`, one local commit ahead, no upstream configured. No fetch/reconciliation was needed for this bounded documentation audit; this is not a current-main release attestation. Unrelated dirty work was preserved.

## ArtCraft release-source findings

| Surface | What v0.41.0 source establishes | Interchange consequence |
| --- | --- | --- |
| Canvas / PageDraw text | [Node.ts][node] defines rectangle, circle, triangle and image; brush lines live in the scene store. No native text node in this model. | Native Banner text cannot be transferred here without loss. Raster text is an explicit, lossy preview only. |
| Moodboard text | [TextNode contract][moodtypes] stores text, font size and color plus bounds/rotation/order. [Renderer][textrender] uses Konva text; [edit overlay][textedit] changes the string and records history. No font family, weight, tracking or richer typography fields in that contract. | Basic editable notes exist, but are insufficient for Banner lettering fidelity. This is not raster-to-text recovery. |
| Canvas masks | [Scene store][scene] keeps `inpaintLineNodes` separately; [toolbar][inpaint] supplies add/erase and brush size. [PageDraw][pagedraw] crops that layer to the base image; [worker][worker] encodes PNG mask bytes for generation. | An AI inpainting region is not a persistent per-layer visibility mask. Do not map Banner rect/ellipse target masks or PhotoCraft density/feather onto it as equivalent. |
| Canvas save/load | [Scene store][scene] serializes version `"2.0"`: ordered `drawNodes`, inpaint strokes, brush settings, fill and aspect-ratio enum. Local image files become `imageDataUrl`; URL images can remain external. File helper names output `mirai-scene-YYYY-MM-DD.json`. | Source functions exist; an accessible installed UI action/API to call them was not established. This is an internal scene format, not PSD or a complete portable project. |
| Scene fidelity limits | The same serializer omits base-image identity/bytes, exact blank-canvas dimensions and broader editor state. Zero scale becomes one through `scaleX/scaleY || 1`; image restore is asynchronous and import returns before loads finish. | A JSON success boolean is insufficient acceptance. Carry authoritative dimensions/assets outside this format and reject unsupported transforms. |
| Moodboard storage | [Version-1 document][mooddoc] stores board and canvas state. It drops tokenless blob images, strips blob URLs with media tokens, and later resolves those tokens. [Desktop adapter][moodadapter] supplies uploads/library/generation references but no optional remote persistence implementation; [sync][moodsync] still maintains the local replica. | Internal persistence is not a user-facing document exchange protocol. Do not inject settings/localStorage or assume remote save, portable assets or external file import/export. |

### Import and execution boundaries

These are actual source call paths, not hypothetical cautions:

- **Canvas initial “Select Image”/drop:** [BaseImageSelector][baseselector] calls `uploadImage`, then looks up the returned media token. Blank Canvas instead constructs a local blank-canvas descriptor. The overlay image handler in [PageDraw][pagedraw] creates local image nodes; that narrower path does not make every import local.
- **Moodboard local image add/drop/paste:** [addCanvasImageFromFile][moodadd] places a blob image and starts `adapter.uploadImage` in the background; the desktop adapter calls `UploadImageMedia`. The grid's [image-entry helper][boardentry] does the same. An import may transmit the file before any Generate action.
- **Generation:** the [desktop PageDraw wrapper][desktopdraw] binds edit/inpaint to `GenerateImage` and background removal to `EnqueueImageBgRemoval`. These internal Tauri/React seams are not an established external document-control API. Mask PNG generation also does not prove downloaded output will retain transparency.
- **Automation:** the release tree includes [MCP session API types][mcpsession]. Those establish session request/response contracts, not a local layer editor or PhotoCraft's `command_run`. No supported ArtCraft external document/MCP/CLI control contract was established in the inspected paths. This is a bounded finding, not a claim that the repository contains no MCP-related code.

## Separate PhotoCraft candidate

The pinned [PhotoCraft document model][photodoc] has native text plus distinct pixel/vector masks; [type commands][phototype] support edits, and [mask commands][photomask] handle density/feather. Its [headless implementation][photoheadless] supports layered saves including PSD, PSB, OpenRaster and `.pcraft`; its [PSD crate][photopsd] is a file reader/writer whose unmodified-byte preservation does not itself prove a converted Banner document retains editable text, typography or rendering.

The [MCP contract][photomcp] documents inspection, previews and commands, but batches are sequential and non-atomic. Its [web hosting contract][photoweb] uses file pickers/downloads and has no server document storage, desktop TCP server or web autosave. An iframe alone supplies neither a document/save bridge nor XeroFlow tenancy and managed-QR enforcement. A desktop companion or separately evaluated conversion worker is plausible; native Rust execution is not a drop-in operation inside the current Pages runtime.

## Feasible next spike and acceptance gates

1. **First prove the installed entry point.** In a separately authorized GUI session, locate a supported Canvas scene Open/Save path and save a synthetic blank scene. If none is exposed, stop the ArtCraft file-adapter spike; source methods alone do not justify app injection or a fork. Record app version and actual artifacts. No customer artwork is needed.
2. **Only then prototype the limited converter.** Emit version-2.0 scene JSON for an allowlisted static image/rectangle subset with embedded PNG assets, ordered IDs and explicit transforms. Keep a Banner-owned sidecar containing document size, source revision, asset hashes, layer-ID mapping and loss report. Exclude native text, masks, animation, effects, links and protected legal/map/QR content; reject them or require an explicitly chosen flattened preview. A sidecar preserves Banner data, not native editability in ArtCraft.
3. **Verify import and reopen, not merely parse.** Use a synthetic 512×512 fixture with an RGBA image, two overlapping shapes and nonzero offsets. Inspect layer order, exact dimensions, decoded alpha at selected pixels, transforms and asset independence after save/reopen. Capture transmission behavior before file entry; Canvas base import and Moodboard imports are upload paths. Keep generation/background-removal actions unused for this test. All of these runtime checks remain open.
4. **Prefer a separate PhotoCraft fidelity spike for native lettering.** Pin the actual PhotoCraft binary/build first. Use native heading text with a specified font, an RGBA image, an inverted vector mask and a soft pixel mask. Save/reopen native format and PSD, edit the heading, and inspect text content/font/weight/spacing, bounds, masks, alpha and effects. Compare composited pixels separately from structural preservation; missing fonts or unsupported effects must produce a loss report. No PhotoCraft/PSD round trip was run here.
5. **Before any return import:** validate a versioned schema and bounded dimensions/assets; do not fetch arbitrary URLs or trust external IDs/QR provenance. Preview against the current Banner revision, retain original assets and protected layers server-side, then apply only approved changes as one undoable Banner operation. A partial external command batch must not partially replace the canonical project. Test stale revisions, malformed files and protected-region changes. Hosted storage, tenancy, provider output and print/scan acceptance remain separate gates.

**Delivered:** a versioned source audit and a concrete acceptance plan. Verification checked 36 evidence-file hashes, all 30 tagged extracts and every report reference label/ArtCraft source path. **Not delivered:** an adapter, runtime round-trip proof or a release. Coordinator GUI observations are separate evidence and are not presented here as this worker's tests.

[release]: https://github.com/storytold/artcraft/releases/tag/artcraft-v0.41.0
[comparison]: https://github.com/storytold/artcraft/compare/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9...1f969a9224934a55417daf10359a6fb1458b63f4
[apps]: https://getartcraft.com/apps
[tauri]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/crates/desktop/artcraft/tauri.conf.json
[node]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/pagedraw/src/lib/Node.ts
[scene]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/pagedraw/src/lib/stores/SceneState.ts#L1054-L1229
[moodtypes]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/canvas/types.ts
[textrender]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/canvas/nodes/TextNode.tsx
[textedit]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/canvas/TextEditOverlay.tsx
[inpaint]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/pagedraw/src/lib/components/ui/InpaintToolBar.tsx
[pagedraw]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/pagedraw/src/lib/PageDraw.tsx
[worker]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/pagedraw/src/lib/utilities/generatePipeline.worker.ts
[mooddoc]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/persistence/documents.ts
[moodadapter]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/apps/artcraft/app/src/pages/PageMoodboard/desktopMoodboardAdapter.tsx
[moodsync]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/persistence/moodboardSync.ts
[baseselector]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/apps/artcraft/app/src/pages/PageDraw/BaseImageSelector.tsx
[moodadd]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/canvas/addCanvasImageFile.ts
[boardentry]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/libs/components/moodboard/src/lib/boards/useBoardItemEntry.tsx
[desktopdraw]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/frontend/apps/artcraft/app/src/pages/PageDraw/PageDraw.tsx
[mcpsession]: https://github.com/storytold/artcraft/blob/c3844acdadf630db0c17ec1d1512bcf6bbc1b4f9/crates/api_clients/artcraft/artcraft_api_defs/src/mcp_sessions/create_mcp_session.rs
[photodoc]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/doc/src/lib.rs
[phototype]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/engine/src/type_cmds.rs
[photomask]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/engine/src/layer_mask_props_cmds.rs
[photoheadless]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/automation/src/headless.rs
[photopsd]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/crates/psd/README.md
[photomcp]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/docs/mcp.md
[photoweb]: https://github.com/storytold/photocraft/blob/a0ce166acd2a64ff1200f793d4006db61c09f4d6/packaging/web/README.md
