# Selected lettering — interaction and acceptance

Product direction agreed with Paul, 26 October 2026. Native typography proposals and isolated-raster lettering reconstruction/redraw are now implemented locally in the existing context menu/inspector, with explicit-fixture Nuxt proof of preview/apply/undo/save/reopen. Live OpenAI quality remains unverified. Flat-poster clean-background repair is absent and blocked; native-to-raster redraw without an owned separated raster reference is explicitly unavailable. This document retains the full R20–R24/A11–A12 target; see [current implementation and limits](V2-IMPLEMENTATION.md) for delivered scope.

## Entry and panel

Select a native text layer or a separated raster-lettering layer. Right-click → **Edit with AI**, or use the equivalent inspector action accessible without a context menu. A region in a still-flat poster first requires a proposed extraction/repair boundary; selecting a rectangle does not establish a clean independent layer.

Extend the existing inspector rather than opening a second editor. Show:

- Selected artwork thumbnail and layer name.
- **Text**: editable wording, taken from approved copy when available, otherwise clearly marked as detected. Expose conflicts and missing/uncertain words for correction. Never substitute a visual description for the wording.
- **Instructions**: e.g. “Keep the angle, bold lettering, colours and depth.”
- **Recreate as editable text** and **Redraw with AI**, with a brief explanation of the resulting editability.
- Before/after preview in the actual composition, changed-region indication, fit/fidelity warnings and Apply/Discard actions.

Provider/model choices belong in existing administrative catalogue controls. Normal users should choose the outcome. Use Nuxt UI fields/components, existing text effects, font controls and copy inspector; read the required frontend-design skill before form implementation.

## Two output modes

**Recreate as editable text:** use the wording and selected visual reference to propose typography and supported native effects. Preserve the source transform where representable. Show missing fonts, perspective/warp or texture approximations before apply. The result stores real text and remains directly editable after save/reload. If matching fails, keep the proposal unresolved; do not silently turn it into an image or outlines.

**Redraw with AI:** use the selected artwork as reference and the new wording as requested content. The result is raster lettering with suitable transparency and placement. Keep its wording, instruction and reference as editable recipe metadata, so a later wording change can request another generation. This is convenient AI editing of an image, not direct typography editing. Verify the visible result; metadata containing the right words does not establish correct rendered text.

Example: select “RELOCATION SALE”, change Text to “GRAND OPENING”, retain the blue/yellow angled style, preview and apply. This is a creative test draft, not permission to change approved campaign meaning. Commercial tokens and legal fields keep existing lock rules.

## Safe replacement and state

States: selected → wording review → generating → preview ready → applied. Failure/cancellation returns to unchanged artwork; unresolved fidelity or background repair remains review-required. Selecting another layer, changing project/revision or deleting a target invalidates the pending proposal. Discard never changes the document.

Preview must include any background repair required beneath the old lettering. For an already separated clean layer, replace only that layer. For baked-in lettering, prepare both repaired pixels and replacement before allowing apply. If the affected area overlaps a car, logo or another protected element, expose that boundary and block unresolved damage. An image provider's mask is guidance; document-level scope enforcement remains our responsibility.

Apply commits replacement, necessary repair and recipe together, as one undo transaction. Preserve the original asset and prior metadata for comparison and undo. Save/reload retains the applied recipe and referenced assets; cross-session undo is not promised unless supported by the existing editor. Undo/redo in the active session must restore the complete prior/applied state.

## Recipe and access

Implemented versioned layer recipe metadata retains mode, source wording, exact requested wording, instruction, original reference, source revision and full proposal evidence; asset IDs/hashes travel in the proposal. The broader target additionally includes source region/mask and repair provenance. Target metadata: mode, requested wording, instruction, owned original reference asset/hash, source region/mask, selected IDs, source revision, native style proposal or generated asset refs, actual provider/model/request evidence, warnings and verification status. Keep typography controls authoritative for native layers. If the user manually changes native wording/style, invalidate or refresh cached proposal data so reopening cannot restore stale text.

Store reusable style recipes separately from individual layer edit recipes. A style supplies composition/effect guidance and variables; a layer recipe records a particular source and edit. Tenant/client access applies to both and every referenced asset. Store no secrets; keep customer copy out of operational logs. Unavailable cost/model evidence is marked unknown, not invented.

## Acceptance evidence

For each mode, capture source, panel, preview, applied image, hide/move check and save/reopen evidence. Inspect native Layer fields or raster recipe metadata as appropriate. Exercise wrong generated words, unsupported effects, clipping, residual letters, overlap, stale result, cancellation and provider failure. Confirm unselected layer records stay unchanged, replacement/repair undo together and protected copy remains exact. No provider quality claim can be based on synthetic importer fixtures.

## Product references

[Claude Design](https://claude.com/product/design) documents selected-element comments, direct text editing and adjustment controls. Use this as an interaction reference; it does not establish flattened-poster typography recovery. [Lovart](https://www.lovart.ai/docs/edit-your-design/advanced-ai-editing) and [Artlist](https://help.artlist.io/hc/en-us/articles/39390093322525-Artlist-AI-Tools-Using-the-Image-Editor) are additional documented workflow references, not locally benchmarked outcomes. See [model research](PROVIDER-READINESS.md) for output types and current availability limits.
