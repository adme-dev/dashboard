# Product brief — editable creative concepts

## Problem and opportunity

AI gives the agency convincing concepts quickly, but the result is a flattened JPEG. A designer cannot reliably select a headline, change an offer, move a vehicle or produce mail-merge variants without rebuilding the artwork. XeroFlow already has Banner Studio, layer controls, image AI, text suggestions and an AI catalogue; the missing product is reliable reconstruction and proof of editability.

## User clarification — creation comes first

Paul clarified that the product must also **create finished campaign artwork at the quality of the supplied bold retail lifestyle poster**, using OpenAI image generation, then support decomposition and selected-element AI changes. A reusable prompting/style-template library follows proven generation styles. The previous reconstruction work is supporting infrastructure, not the complete product experience.

Specific quality reference: `/Users/paulgiurin/Documents/Projects/dashboard/output/eastern-subaru-mailout-20261026/codex-jpeg-concepts/concept-1-bold-retail-lifestyle-A4.jpg`. Preserve its bold angled retail typography, dimensional lettering, saturated blue/yellow panels, photographic OEM vehicles, leafy suburban family setting, textures and dense practical information. A generic photo with plain overlay text does not meet this reference. The original generation/edit prompts are available alongside the image in `bold-lifestyle-prompt.md` and `prompts.md`.

Requested sequence: campaign brief and supplied assets → generate complete creative concepts → choose/refine a concept → save a successful style as a reusable prompt template → separate/reconstruct useful elements → click an element and describe a change → preview/apply/undo → save/export. Existing flat-image upload remains an alternative entry point.

Style definitions should retain reference examples, composition/typography/effect guidance, variable campaign fields, original assets and the exact approved copy separately from the generated pixels. Example first style: Bold Retail Lifestyle. Names such as Premium Automotive or Editorial Lifestyle are potential future styles, not accepted deliverables. The library should capture proven recipes, not promise identical layouts from a text prompt alone.

Two text operations must be distinguished: AI visual edits can redraw lettering as pixels; native-text conversion must recover or reuse the actual wording and reconstruct editable typography, remove the old lettering underneath, and flag unmatched perspective/effects. Preserve the approved full-image concept for comparison. Do not sacrifice the visual reference silently to obtain nominal editability.

Official product references checked: [Lovart advanced editing](https://www.lovart.ai/docs/edit-your-design/advanced-ai-editing) documents object marking, element separation and font/content editing; [Artlist Image Editor](https://help.artlist.io/hc/en-us/articles/39390093322525-Artlist-AI-Tools-Using-the-Image-Editor) documents layered and spot edits. These are documented capabilities, not locally tested vendor outcomes. The supplied Artlist promotional PNG depicts a directing/timeline interface; the Image Editor documentation is the relevant workflow reference.

OpenAI's [image generation API](https://developers.openai.com/api/docs/guides/image-generation) supports references and masked edits, returning PNG/JPEG/WebP rather than a native layered project. Masks guide generation and do not guarantee exact boundaries. Proposed implementation: enforce selection scope in our document/compositing layer, preserving unselected layers and retaining before/after versions; evaluate boundary blending and native-text fidelity explicitly. Current repository generation registry exposes Recraft offer-card generation and Pruna approved-source upscaling, not an OpenAI full-artwork adapter. Provider integration and account access remain implementation work; built-in Codex output does not prove the deployed API uses the same model or achieves the same result.

## Selected-lettering clarification

Paul proposed right-clicking lettering to open a wording/instruction panel that uses the original as a visual reference. This is now specified in [PRD v2](PRD.md) and [LETTERING-WORKFLOW.md](LETTERING-WORKFLOW.md): native text reconstruction or AI raster redraw, preview in place, one undo, and persisted wording/reference for repeat edits. [Claude Design](https://claude.com/product/design) is an additional interaction reference for element-specific edits; no claim is made that it recovers arbitrary flattened typography.

## Users and job

- Designer/producer: bring an AI concept into production without losing its visual character.
- Account manager: revise selected approved copy, dates or locations without damaging the layout.
- Creative director: review fidelity and alternative headings with before/after comparison.
- Production operator: preserve native text and geometry for print and personalisation.

## Product promise

“Turn this concept into editable artwork.” The output is a working Banner Studio document, with honest identification of anything still flattened or requiring review. A generated PNG containing letters is not live text; an SVG embedded as a single image is not an editable vector group.

## User experience

Create from a brief or upload JPEG/PNG → choose client, brand kit and target format → supply approved copy and original assets → generate/review concepts or make the imported artwork editable → compare original/rebuilt design → review text, font matches and uncertain objects → select a heading → Edit with AI → preview/apply/undo → save/export. Save successful generation styles as reusable recipes.
Keep engine names and inference settings in admin controls. Use simple layer names such as Headline, Offer amount, Subaru vehicle, Background and Map labels.

## Initial deliverables

Creation-first increment: prove full campaign concept generation and the first reviewed Bold Retail Lifestyle recipe, followed by the two selected-lettering modes. These extend the earlier reconstruction deliverables below; the local letter-back proof does not fulfil them.

1. Reconstruct all four current Subaru sides in native Banner Studio documents.
2. Deliver reusable flat-image import and selected-text revision, not a one-off hardcoded Subaru template.
3. Provide transparent provider selection, costs and quality evidence through the existing AI catalogue.
4. Produce digital review exports; complete a separate verified CMYK print path before claiming mailhouse-ready output.
5. Publish accurate feature-page updates when the implemented capability is ready.

## Creative brief: Eastern Subaru

- Campaign: The Great Eastern Subaru Relocation Sale.
- Sale: 11–14 November 2026. Voucher: $500 off any new Subaru or XPENG, orders 11 November–13 December 2026. These are different periods.
- Sales: 99–101 Maroondah Highway, Ringwood VIC 3134.
- Service & Parts remains: 350–354 Main Street, Lilydale VIC 3140.
- Telephone: (03) 9126 0251. Parking front/rear; rear access via Seymour Street.
- New 1,600sqm showroom; letter signatory Luke Tabone, General Sales Manager.
- Launch night: Thursday 12 November; invite recipients to call to RSVP and confirm time. Do not invent the time.
- Vehicles: Subaru Trailseeker and XPENG G6, using original OEM/dealer assets supplied in the reference pack.
- Concept A: bold blue/yellow retail. Concept B: warm suburban summer family lifestyle, leafy park surroundings. **No beach/ocean/coastal imagery**. Generic lifestyle setting must not be presented as the actual dealership site.
- Reverse: personal letter, recipient merge placeholders, practical destinations/map and voucher/conditions.
- Map must distinguish Ringwood sales from Lilydale service; reconstruct using supplied map data, not model-invented streets.
- Wider group names in earlier sketch: Subaru, XPENG, Geely, DEEPAL, Foton. Offer applies only to Subaru and XPENG.
- Do not fabricate Luke's headshot/signature, QR destination, voucher code or customer data.

## Production context

A4 trim 210 × 297 mm. Current JPEG exports are 2480 × 3508 px at 300 dpi, resampled from approximately 1054 × 1492 generated originals; they are concept proofs, not native high-resolution photographic masters. Rebuilding live text improves typography, not the inherent detail in low-resolution raster images.
Earlier proofs proposed 3 mm bleed and a voucher separation at 242 mm. This is not an approved mailhouse specification, and current AI concepts do not share an exact perforation position. Duplex alignment, stock, fold/window, ICC profile, approved terms URL, tracking QR, portrait/signature and print-quality brand lockups remain production inputs.

## Scope boundary

Deliver reconstruction, selected-element editing and a practical production path. Foundation-model training, a general Illustrator replacement and lossless recovery of arbitrary flattened files are outside the first release. Exact Quiver parity is a research question, not a committed outcome.
