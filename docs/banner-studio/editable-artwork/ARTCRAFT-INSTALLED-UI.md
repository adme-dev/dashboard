# ArtCraft 0.41.0 installed workflow check

27 October 2026. Coordinator inspected the already-running `/Applications/ArtCraft.app` through Orca accessibility and screenshots. Two supervised agents separately inspected the bundle and versioned public source. See [installed inventory](ARTCRAFT-INSTALLED-INVENTORY.md) and [interchange audit](ARTCRAFT-INTERCHANGE-AUDIT.md). This extends the earlier [source-only research](ARTCRAFT-RND.md); it is not a Banner Studio integration or an AI-quality benchmark.

## Result

**ArtCraft has basic editable text in its Moodboard. The installed checks do not establish Photoshop-style flyer reconstruction, a supported external editor bridge or layered PSD interchange.** Image Editor opens a separate Canvas focused on drawing and prompted image generation. PhotoCraft remains the relevant separate application for a native-text/mask/PSD interoperability experiment.

| Installed check | Observed result | Limit |
|---|---|---|
| App identity | Running `ai.artcraft.app`; installed bundle reports 0.41.0 and passes signature verification | Release-tag source comparison is not a reproducible binary build |
| Image Editor | Blank 512 × 512 Canvas opened; shape, image, brush, eraser, prompt, model and generation controls visible | No original flyer imported; no native text or portable layered save established here |
| Brush controls | Colour, hue, alpha and brush-size controls visible; eraser exposes size | This is not proof of nondestructive per-layer pixel-mask storage or alpha round-trip fidelity |
| Moodboard text | T tool creates a `Note` text object; exact wording can be edited in a textarea and committed by leaving the field | Basic text, not recovered lettering or production typography acceptance |
| Undo/redo | Toolbar Undo restored `Note` after committed wording change; Redo restored the test wording | Tested a single text edit, not an imported multi-layer document |
| Reload | Webview Reload → home → Moodboard retained the object; double-click reopened exact `BANNER STUDIO LOCAL TYPE TEST` | Local application persistence, not a portable document export/import or platform project save |
| Text fit | Small default text box visibly clipped the long test wording even though all text survived reload | Requires fit measurement; a text object alone does not prove usable flyer lettering |
| Right-click | Tested Moodboard text produced the webview Reload/Inspect Element menu | No layer-scoped AI action was established on this path |
| Provider access | UI displayed 0 Credits and a generation cost | No Generate action, provider inference or spend attempted |

## Procedure and retained evidence

All raw accessibility receipts, 27 screenshots and a SHA-256 manifest are in ignored `output/editable-artwork-animation/artcraft/installed-ui/`.

1. Home → Image Editor → Blank Canvas → 512 × 512 → Create Canvas. Inspected shape, brush and eraser controls (`01`–`08`). Two synthetic rectangle-drag attempts produced no visible shape. Drawing success is therefore **unverified**, not a finding that the application cannot draw.
2. Home → Moodboard, initially empty → Canvas → T → canvas click. Set a generic test string in the exposed textarea. The first Escape action cancelled the edit and restored `Note`; filename `14-type-committed.json` is an attempted action label, not proof of a commit. Undo then removed that first test object (`09`–`15`).
3. Created a fresh Note, set `BANNER STUDIO LOCAL TYPE TEST`, and pressed Tab to commit. Screenshot `17-type-blur.png` shows the text rendered with clipping in its default box. Undo screenshot `18-undo-committed-type.png` shows `Note`; Redo restored the wording (`16`–`19`).
4. Right-clicked the text and used the observed Reload menu. Reopened Moodboard, then double-clicked the object. Receipt `25-reopened-type-readback.json` exposes the full exact string as editable text after reload (`20`–`25`). No account storage was inspected or injected.
5. Removed only the created test object and returned to the initial home screen (`26`–`27`). The previously running user application remains open. No existing project or asset was deleted.

Actions often report unverified accessibility/synthetic input. Findings above rely on subsequent rendered state and exact text readback, not merely an action return code. Five receipt consistency checks pass in `manifest.json`; these are research-evidence checks, not application regression tests. Screenshots and receipts retain the failed/cancelled attempts explicitly.

## Integration consequences

Continue Banner Studio's existing native text, image/vector layers, catalogue, protected regions, selected-heading preview/apply and undo. ArtCraft is a useful interaction reference, but this inspection found no ready document adapter to implement faithfully.

The versioned-source audit found that initial Canvas image selection and Moodboard image imports can upload media before generation. Only blank canvases and a generic text fixture were used here; no client artwork was imported. Internal Tauri commands are not a supported external API. No private protocol, account data or credentials were extracted.

The next useful installed application is **PhotoCraft**, offered separately as free early alpha on the [official apps index](https://getartcraft.com/apps). A bounded local test should inspect its actual CLI/MCP support, create native text plus RGBA/vector/pixel masks, save and reopen a native document and PSD, then compare text, font, alpha, masks and offsets. Installation/source claims alone do not pass that test. No additional suite applications or paid subscription are needed for this investigation.

No application code, provider integration, deployment or client publication was added in this research increment. Live AI quality, automatic raster-to-native lettering and Photoshop interchange remain unverified.
