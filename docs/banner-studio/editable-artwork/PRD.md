# PRD — Banner Studio editable artwork

Current continuation: [authenticated engine jobs](ENGINE-JOBS.md) connects saved-project authority, private preview storage and the pinned PhotoCraft/VectorCraft Linux worker through a default-off API. Final local evidence and hosted activation limits are recorded there. The separate [manual companion wording review](COMPANION-WORDING.md) preserves native text, exact platform font rendering, undo and fixture save/reopen. [Kimi’s completion audit](COMPLETION-AUDIT.md) records the broader unfinished requirements.

Version 2.1, 26 October 2026. Status: G1 creation/styles and G2 selected lettering implemented locally with explicit fixture browser evidence; live OpenAI and full PRD acceptance remain open. A real Qwen attempt failed without layers. See [current implementation checkpoint](V2-IMPLEMENTATION.md) for delivered scope and remaining gates. See [implementation log](IMPLEMENTATION-LOG.md) for tested scope.

## Outcome

Agency users can create campaign artwork at the visual quality of the supplied bold retail lifestyle reference, retain successful styles as reusable prompt recipes, and turn chosen concepts or existing JPEG/PNG assets into reviewable Banner Studio projects. They can select lettering or an image element, describe a change, preview it and apply it with undo while preserving layout, brand assets and commercial facts.

## End-to-end experience

Campaign brief + approved copy + OEM/brand assets → generate concepts using OpenAI through the existing AI catalogue → choose/refine a concept → save a proven style recipe → separate/reconstruct elements → select an element → Edit with AI in the existing inspector → preview/apply/undo → save/reopen/export. Existing artwork upload remains a supported entry point.

For selected lettering, the panel shows its visual reference, detected or approved wording, an instruction field and two explicit actions: **Recreate as editable text** and **Redraw with AI**. Native reconstruction produces Unicode/font/effect properties; redraw produces pixels while retaining the wording and recipe for later AI edits. Neither outcome may silently masquerade as the other. Full interaction, states and acceptance examples are in [selected-lettering workflow](LETTERING-WORKFLOW.md).

## Definitions

- Live text: stored Unicode and typography attributes rendered by the editor; still editable after save/reload.
- Raster layer: independently positioned image with alpha when appropriate; may still contain baked-in words.
- Vector asset: SVG geometry. An opaque image embedding SVG does not imply constituent path editing.
- Native reconstruction: text/shape/image composition with clean underlying background and provenance.
- Partial reconstruction: useful output with named unresolved items; never silently labelled fully editable.

## Functional requirements

| ID | Priority | Requirement and acceptance |
|---|---|---|
| R01 | P0 | Ingest authenticated JPEG/PNG assets with client/project ownership, source hash, actual dimensions and physical A4 metadata. Reject invalid or oversized inputs before inference. Preserve original. |
| R02 | P0 | Analyse text runs, bounding geometry, rotation, reading order, z-order, objects and typography confidence. Let supplied approved text override OCR; conflicts are shown for review. |
| R03 | P0 | Rebuild headings, offer amounts, dates, addresses, letter and terms as live text. No descriptions substituted for missing recognised text. Unsupported warped lettering is flagged, not outlined without disclosure. |
| R04 | P0 | Remove old text/objects from the background before overlaying extracted layers. Moving or hiding any reconstructed heading must not reveal its original duplicate. Never use the entire source as a supposedly clean background. |
| R05 | P0 | Separate product images with verified masks; prefer original OEM assets and brand lockups. Record asset source and whether generated or extracted. Preserve identity, wheels, badges and proportions. |
| R06 | P0 | Rebuild simple panels/rules/markers as native shapes; map labels as text. Reuse supplied road geometry. No whole-page vectorisation requirement. |
| R07 | P0 | Import with stable IDs, correct transforms and original stacking; retain custom A4 format. Save/reload preserves all layers and effects. Do not offset stacked layers as a gallery. |
| R08 | P0 | Original/rebuilt comparison and a review list show uncertain fonts, residual text, partial masks and flattened elements. A partial result requires deliberate acceptance before import. |
| R09 | P0 | Selected text → AI alternatives → preview → apply → undo/redo. Scope proposal to explicit layer IDs and base document revision; stale responses cannot modify a changed/deleted selection. |
| R10 | P0 | Commercial facts, approved brand assets and legal copy are protected by default. A creative rewrite cannot silently change $500, dates, addresses, phone, eligibility or merge fields. |
| R11 | P0 | Every model operation routes through existing capability/model policy and provider adapters. Report actual provider/model/version, fallback and request/cost evidence. Unsupported catalogue assignments fail clearly. |
| R12 | P0 | Durable asynchronous jobs have progress, cancellation, bounded retry, timeout and idempotent import. Tenant/client authorisation applies to every read, upload, retry and result access. |
| R13 | P0 | Preview/export preserves native text effects and source dimensions. RGB JPEG/PNG renders must match the editor; the editable document package must round-trip. No unverified CMYK/PDF-X claim. |
| R14 | P1 | Vectorise a selected graphic using replaceable vendor/local adapters. Sanitize SVG, retain grouping where representable, identify unsupported paths/effects, support recolour/transform. |
| R15 | P1 | Image-layer AI edit uses an explicit mask or scope, preview and undo; originals remain available. Unselected layers stay unchanged. |
| R16 | P1 | Pair front/back pages, keep linked commercial tokens consistent, support recipient/unique-code bindings and actual duplex-safe layout. Add validated print rendering with chosen ICC and bleed. |
| R17 | P1 | Expose job/proposal tools through the platform's existing authenticated MCP/action layer after API contracts are stable. Reuse catalogue authority, do not create alternate permission paths. |
| R18 | P0 | Generate complete campaign concepts from the brief, references and approved assets through an OpenAI adapter in the existing catalogue. Preserve exact copy separately from pixels, provenance and original concepts. Review against the supplied bold retail artwork; a plain photo/text overlay is not equivalent. |
| R19 | P1 | Save a visually reviewed generation as a versioned style recipe containing references, composition/type/effect guidance, variable fields, approved-copy bindings and model settings. Apply to another campaign without carrying over its client assets or facts. First style: Bold Retail Lifestyle. |
| R20 | P0 | Layer context menu and an accessible inspector action open Edit with AI for native text or selected raster lettering. Show the selected reference, wording and instruction; approved copy wins over OCR and uncertain detection requires correction. Reuse existing inspector and Nuxt UI components. |
| R21 | P0 | Recreate as editable text proposes a font/effect match and fit. Preview unsupported perspective/texture differences explicitly. Apply creates native text with exact requested wording, font controls and existing effects; preserve positioning and source provenance. |
| R22 | P0 | Redraw with AI uses selected lettering as reference and requested wording as an explicit input. Result stays labelled image lettering. Persist wording, instruction, reference and recipe so reopening the panel can regenerate it; do not claim direct font editing or deterministic visual equivalence. |
| R23 | P0 | Replace selected lettering and any required clean-background repair atomically as one undoable operation. Show the complete affected region before apply. Preserve unselected layer records; reject unresolved ghost text, unsafe overlapping content or stale revisions instead of changing the full poster silently. |
| R24 | P0 | Persist applied lettering recipe, generated assets and editability status through save/reload. Check output wording, fit, clipping and protected facts before apply; OCR agreement alone cannot prove fidelity. Failed/cancelled requests preserve the current artwork. |
| R25 | P0 | Insert an existing active same-client platform QR as a separate deterministic owned asset. Retain QR record identity and canonical platform short URL through undo/save/reopen. AI must not redraw, merge away or substitute QR pixels. Project persistence and client reassignment must verify QR and asset provenance; destinations and scan analytics remain owned by the existing QR module. |
| R26 | P1 | Support scoped retail layout edits such as promoting pizza/drinks/test drives to an invitation panel while shortening the letter. Preserve protected copy, map, QR and voucher, distinguish launch night from sale dates and invent no time/free claim. Preview the affected layers/region and apply atomically. Native scoped layout and invitation preview/apply are implemented locally; this pilot retains exact original body copy. Automatic flat-source repair and approved body shortening remain outstanding. See RETAIL-IMPLEMENTATION.md and RETAIL-EDIT-SCENARIO.md. |

## User stories

- As a producer, I can import the Subaru poster and edit the headline without the original letters appearing underneath.
- As an account manager, I can ask for a shorter heading and see whether it fits before applying it.
- As a designer, I can move a car independently without changing its OEM identity or leaving a visible hole.
- As a production operator, I can bind a customer name and voucher code while maintaining the approved offer and actual page size.
- As an admin, I can choose providers per capability and see measured cost, failure and fallback rather than a list of nominally supported models.
- As a producer, I can create a bold retail concept, save its successful style and reuse it with another approved campaign brief.
- As a designer, I can right-click raster lettering, type new words and choose a native reconstruction or an AI redraw while seeing what will change.

## Acceptance gates

A01: All four supplied sides reconstruct, save and reopen with every text block native or explicitly declared unresolved. All approved offer/date/address/phone/legal fields match exactly. For this pilot, unresolved required text blocks block acceptance.
A02: Hide/move each principal headline and offer layer; inspect the revealed region. No duplicate text remains. Objects do not conceal an unclean background.
A03: Apply a selected-heading rewrite, change selection during another pending request, delete a targeted layer, undo and redo. Only the intended non-stale proposal can apply. Unselected layer records remain unchanged.
A04: Export at A4 with embedded/available fonts and no clipping, overlap or missing superscripts. Reopen the saved project and compare rendered geometry. Native effects remain text-editable.
A05: Reject cross-client source/result access, hostile SVG, malformed input, malicious URL redirects and stale document revisions. Cancellation/retry cannot duplicate projects or exceed job budgets.
A06: Provider outage or failed segmentation results in retryable failure/partial review, never synthetic successful extraction.
A07: Two reviewers judge the reconstruction at least 4/5 on visual hierarchy, typography, object fidelity and background repair. Any wrong commercial fact, vehicle identity or coastal imagery in Concept B fails regardless of average.
A08: Existing banner templates, fonts, effects, image crop, saving, exports and QR navigation continue working in browser regression checks.
A09: Create and save a complete concept from the approved brief through the application API. Record actual model/request and cost when available. Review original OEM identity, exact commercial copy, bold angled typography, texture and leafy suburban setting. Built-in Codex generation alone does not satisfy this gate.
A10: Save a successful style recipe and use it for a second campaign fixture. Only explicitly supplied assets/copy carry over; source client material does not leak. Record recipe version and evaluate visual fidelity rather than claiming identical output.
A11: Select raster “RELOCATION SALE”, open Edit with AI, enter “GRAND OPENING”, preview and apply each supported output mode in separate drafts. Native mode must allow subsequent direct wording/font edits; redraw mode must remain an image with a reopenable wording/reference recipe. Use a non-approved test draft for this creative change; production facts remain locked.
A12: Hide/move the replacement to inspect for duplicate lettering; save/reopen, edit again, undo/redo and compare unselected records. Force failed generation, wrong rendered wording, overlap, cancellation, selection changes and stale revisions. None may silently apply or destroy the original.

## Evaluation set and measures

Seed with four Subaru sides; before broader release expand to at least 20 authorised creatives covering straight/skewed headlines, dense legal text, gradients, transparent products, overlapping subjects, low-resolution inputs and missing fonts. Keep a held-out subset when tuning.
Measure exact critical-field agreement, per-block text error, bounding geometry, visible ghosting, actual editability, reviewer correction minutes, provider success, billed cost and latency. Pixel similarity alone cannot prove editability. Human review distinguishes approved source replacements from reconstruction errors.
Proposed pilot targets, to validate experimentally: median manual cleanup ≤10 minutes/page; normal import p95 ≤120 seconds on the chosen hosted service; request acknowledgement ≤2 seconds; local selected-text change visible ≤200 ms after apply. These are targets, not measured results.
Pilot cost ceiling proposed at USD 1/page and USD 0.05/text proposal, configurable and enforced before dispatch; not vendor price claims or authorisation for a paid benchmark. Revisit using measured invoice/usage evidence.

## Non-goals and unresolved decisions

No one-click guarantee of exact original fonts, hidden pixels or layout recovery. No generation of official logos, signature likenesses or final legal copy. No raster-to-SVG photographic poster tracing as the default. No vendor model cloning.
Decide after the first benchmark: provider availability and price; accepted fidelity tolerance; whether selectable SVG groups are enough or path-node editing is needed; approved print renderer/profile; whether native effects cover the tilted display headline. [Provider readiness](PROVIDER-READINESS.md) records Qwen-Layered, Seedream and LayerD as decomposition candidates, Nano Banana/MiniMax and Qwen editing distinctions, and OmniPSD native-text research. Documentation does not establish tested output quality.

## Rollout

Feature flag → internal four-page pilot → broader held-out evaluation → documented operator review → staged acceptance → existing guarded release workflow. Marketing pages describe only proven functionality.

## Managed QR and retail-edit acceptance additions

A13: Insert a registered same-client QR, decode its exported image to the canonical platform short URL, preserve record/asset identity after save/reopen, and undo/redo without changing other layers. Reject inactive/cross-client/forged assets and unsafe AI or canvas replacements. Local fixtures are not live registration or scan-analytics proof.

A14: Execute the retail invitation scenario with an affected-region preview, exact protected facts and one-step undo. The native implementation passes source/tests and actual Nuxt fixture preview/apply/undo/save/reopen; evidence is tracked in RETAIL-IMPLEMENTATION.md. Automatic flattened-source repair and shortening approved letter copy remain separate pending gates.

## R12 local implementation checkpoint — 27 October 2026

Persisted attempt identity/progress, cancellation, three-attempt explicit retry, ten-minute access-time expiry and transactionally idempotent imports are locally implemented. Saved-job UI resumes across close/reload and imports with one undo. [JOB-RELIABILITY.md](JOB-RELIABILITY.md) records independent local PostgreSQL and browser fixture evidence. R12 remains partially delivered: manual retry is synchronous, inline fallback lacks durable dispatch, and hosted execution/provider cancellation/billing guarantees are unverified. This does not satisfy automatic four-page reconstruction.

The asynchronous continuation in [ASYNC-JOBS.md](ASYNC-JOBS.md) now separates queued retry admission from execution, binds submission to the reviewed attempt, reserves one dispatch and registers the no-queue fallback with request lifetime support. It supersedes the synchronous-retry limitation above. Hosted durability, process-death recovery, provider quality and the full reconstruction acceptance gates remain open.

The next [dispatch recovery increment](DISPATCH-RECOVERY.md) persists delivery intent with each queued generation and adds bounded same-generation queue redelivery after interrupted dispatch. It never restarts running inference or automatically creates a provider retry. Recovery is default-off and authenticated; direct request-lifetime fallback is now loopback development/test only. Local regression passes 914 tests / 5 skipped; independent database evidence is recorded separately. Hosted scheduler/queue/provider acceptance, absolute cost ceilings and full artwork reconstruction remain open, so R12 is not marked fully accepted.


## Approved continuation: layer animation and mask fidelity (27 October)

Connect canvas/timeline right-click Animate and Add Tween to the existing Animation inspector and engine, with one-step undo, stale-target/lock/QR guards, native text preservation, save/reopen and animated HTML parity. Preserve established mask/target animation controls even where new menu actions exclude them.

Verify RGBA source alpha independently of layer opacity, normal/inverted rectangular and elliptical masks, playback/reset, undo and saved-project reload in the actual editor. Maintain separate tests of numeric export pixels and Vue component behavior. General brush masks, feather/density, rotated/skewed masks and multiple masks on one target remain outside this bounded increment. See [evidence and current status](ANIMATION-WORKFLOW.md).

ArtCraft/PhotoCraft is a public-source architecture/interoperability reference. The [source investigation](ARTCRAFT-RND.md) does not authorize replacing project persistence with an embedded editor or claim automatic raster-to-native text recovery. A measured PSD/native-text/mask round-trip spike must precede a production interchange adapter.
