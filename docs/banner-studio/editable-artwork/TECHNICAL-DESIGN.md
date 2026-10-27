# Technical design and source audit

Current continuation: [authenticated engine jobs](ENGINE-JOBS.md) connects saved-project authority, private preview storage and the pinned PhotoCraft/VectorCraft Linux worker through a default-off API. Final local evidence and hosted activation limits are recorded there. The separate [manual companion wording review](COMPANION-WORDING.md) preserves native text, exact platform font rendering, undo and fixture save/reopen. [Kimi’s completion audit](COMPLETION-AUDIT.md) records the broader unfinished requirements.

Status: G1/G2 API and editor paths and bounded asynchronous Dissector jobs are implemented locally. See [creation/editing limits](V2-IMPLEMENTATION.md), [job implementation](ASYNC-JOBS.md) and [dispatch recovery continuation](DISPATCH-RECOVERY.md). Broader automatic reconstruction remains proposed. Baseline inspected at 294d5fc10082ee627ccfd9d7eeb604b79b4bc82e on 26 October 2026. The baseline table below describes pre-fix findings; [IMPLEMENTATION-LOG.md](IMPLEMENTATION-LOG.md) records subsequent Qwen registration, signed-asset, Dissector failure and native-copy corrections. Source presence does not establish hosted availability.

## Creation and selected-lettering extension

PRD v2 adds generation before reconstruction: owned brief/copy/assets → catalogue-routed OpenAI generation → retained concept candidates → reviewed style recipe → existing reconstruction path. Preserve approved Unicode copy and OEM asset references independently of generated pixels. Version style recipes with reference assets, composition/type/effect guidance, variables and supported model settings; keep client-specific data separate and scoped. The OpenAI adapter, concept review/import and versioned canvas style recipes are now implemented locally. Their fixture proof does not establish live provider quality or hosted persistence.

Extend the existing inspector/context menu with the [lettering workflow](LETTERING-WORKFLOW.md). Implemented catalogue keys are `banner_artwork_generate`, `banner_lettering_native` and `banner_lettering_raster`, using explicit OpenAI allowlists and no hidden fallback. Their routes are `ai/generate` and `ai/lettering`; exact contracts, limits and provider defaults are in V2-IMPLEMENTATION.md. The wider analyse/extract/repair workflow remains incomplete.

A lettering proposal binds project/page/layer IDs, base revision, owned reference hash and saved layer transform, exact requested wording, instruction and mode. Native proposals contain validated text/style/effect fields; raster proposals contain owned output asset references plus retained wording/recipe metadata. Both carry warnings and actual provider evidence. Do not pass arbitrary provider-generated patches into the document store.

Preview renders a candidate without mutating the saved document. Scope includes the selected replacement and explicitly identified background repair only. Validate wording, dimensions, alpha, clipping, protected tokens, revision and all asset permissions. Isolated lettering replacement retains its existing one-undo transaction. The separate `ai/repair-lettering` route now supports a reviewed rectangle on an eligible static image: it repairs only the inward-rounded source pixels and proposes a full background plus separate native text. Both changes commit in one existing canvas transaction; failure/cancellation leaves the original unchanged. Full automatic poster reconstruction remains unsupported. See BRIDGE-REPAIR-IMPLEMENTATION.md and the repair server/UI reports. Apply must not modify unselected layer records. Provider masks do not enforce this application invariant.

Persist a versioned optional lettering-recipe metadata field compatible with existing Layer/canvas_data serialization. Preserve original asset references and provenance, verify save/reload, and invalidate cached proposals when manual native-text edits change wording/style. Reopening a raster recipe enables regeneration; it does not turn the image into editable Unicode. Applied recipe metadata is now `Layer.letteringRecipe`; styles/concepts use optional artboard `artworkCreation`. No migration was required. Current requests are synchronous proposals; durable jobs remain outstanding. Project saves use an atomic revision predicate, but realtime layer-add does not broadcast accompanying artworkCreation provenance/style metadata; collaborators need refresh for that metadata.

## Existing implementation to reuse

| Path | Finding |
|---|---|
| server/utils/bannerDissector.ts | Vision manifest and mask extraction; hardcoded Gemini/Workers AI/Groq chain. Final fallback invents a generic multi-layer manifest when all models fail. Replace this success-shaped fallback in the reconstruction path. |
| server/utils/bannerDissectorPipeline.ts:62 | Background uses complete source image; failed segmentation also substitutes source image. This leaves baked-in text and objects under new layers. |
| server/api/agency/banner-studio/dissect/[jobId]/import.post.ts | Imports native layers, maps live/graphic text to text and defaults to mrec. Missing tokens may become descriptions; typography and custom sizes need proper reconstruction. |
| server/utils/qwenLayerDecomposer.ts:1 | Calls public Qwen Hugging Face Space via Gradio. Separate RGBA images are returned, not native text. Hosted service readiness has not been proven. |
| app/composables/useDecompose.ts:70 | Adds returned images with staggered offsets, not their original registered placement. Useful asset extraction, not faithful recomposition. |
| app/components/banner/inspector/Text.vue | Existing selected-text AI suggestions, font picker and apply action; extend instead of creating a second text inspector. |
| server/api/agency/banner-studio/ai/copy-suggest.post.ts | Uses brand context and banner_copy_suggest model assignments. Preserve existing catalogue path. |
| app/types/banner-studio.ts; shared/bannerEffects.ts | Native text already supports rotation, stroke, shadows, depth, texture and gradient attributes. Avoid flattening these effects. |
| server/utils/ai/modelAssignments.ts; modelRegistry.ts | Existing model registry/assignment infrastructure; provider support is explicit. New image/vector providers need capability-aware adapters, not arbitrary strings. |
| docs/decisions/ADR-005-governed-ai-capability-catalog.md | Reuse versioned capability/evaluation evidence and existing authority. Do not create parallel catalogue permissions. |

## Proposed processing

The implemented job path reuses `/api/agency/banner-studio/dissect`, `banner_dissections`, the existing `JOBS_QUEUE` and platform execution ledger. It does not introduce the provisional `/reconstruction/jobs` routes below. Owner-authorised explicit retries reserve a queued generation bound to the reviewed attempt identity. Only that exact queued generation can claim execution; duplicate or late deliveries cannot restart provider work. Cancellation and deadlines fence subsequent writes, and import records a result/revision-bound receipt in the project transaction. Creation and lettering proposal endpoints remain synchronous and separate from this job path.

The recovery continuation adds versioned delivery intent to the same manifest, database-clock leases, finite transport redelivery and a default-off authenticated cron endpoint. It resends an unstarted generation without creating a new provider attempt. Running inference is never reclaimed. Hosted queue/scheduler acceptance remains a separate gate; see DISPATCH-RECOVERY.md for implementation and evidence status.

Ingest owned asset → immutable source metadata → OCR/layout analysis → match approved copy/assets → detect masks → repair background → reconstruct text/shapes/assets → render comparison → review → atomic native import.
Use Workers/Queues or existing job infrastructure for orchestration, R2 for assets, Neon for job/manifests/proposals. Run GPU inference through managed endpoints or dedicated GPU workers, not inside an ordinary Pages request. First audit existing render/dissection queues before introducing another job system.
Persist state transitions: queued → analysing → extracting → rebuilding → validating → review_ready → imported; terminal failed/cancelled. A partial result is a review condition, not “complete”. Each stage records input hashes, outputs, attempts, timing and warnings.

## Document contract (new metadata; compatibility adapter required)

Store versioned reconstruction metadata alongside existing canvas_data; do not silently replace the legacy Layer schema.
- document: schemaVersion, sourceAssetId/hash, clientId, projectId, baseRevision, physical size/unit, canvas size, source pixel size, pages, font requirements, warnings.
- element: stable ID, semantic role, native type, transform/bounds, z-order, optional group/parent, text/runs/style, asset reference, token binding, lock policy, extraction confidence, provenance.
- provenance: source-region/mask, original OEM asset match, provider/model/version/request ID, prompt digest, generated/reconstructed flags; no secrets.
- status per element: native_text, native_shape, raster_asset, svg_asset, needs_review, unresolved.
- effects: reuse native recipes; keep skew/warp unsupported unless the renderer/exporter both support them. Never quietly substitute outlined lettering.
- tokens: offer amount, sale period and voucher period remain separate; merge fields remain typed bindings. Stable names per page, no duplicate generic “price” collisions.

Provider-neutral operations: analyseLayout, extractObject, repairBackground, vectorizeGraphic, suggestCopy. Each declares input/output modalities, max dimensions, alpha/mask support, timeout, licence reference, data retention and estimated/actual cost. Reuse banner_copy_suggest; proposed feature keys for the new stages must be registered in existing catalogue policy with tests. Do not assume every VLM or image generator implements every operation.
Route Nano Banana/other image-editing providers only after their official capability and account availability are verified. GLM is a candidate for vision/text analysis only if the chosen model supports the required structured output; neither name proves layered output.

## API proposal (names provisional)

- POST /api/agency/banner-studio/reconstruction/jobs: owned assetId, optional projectId, target page metadata, approved-copy/asset references, idempotency key. Returns 202 and jobId.
- GET /.../jobs/:id: scoped status, progress, review summary and owned result refs.
- POST /.../jobs/:id/cancel: persist cancellation; no result application after cancellation.
- POST /.../jobs/:id/import: expected project revision plus accepted manifest hash; all-or-nothing revision write and idempotent receipt.
- POST /.../text-proposals: project/page/selectedLayerIds, baseRevision, instruction and protected-token references. Reuse/extend existing copy-suggest route where compatible.
- POST /.../text-proposals/:id/apply: expectedRevision; reject stale/changed/deleted layer; one undo transaction.
Asset IDs resolve server-side. Do not accept arbitrary external image URLs where an existing owned asset can be used.

## Boundaries and correctness

Validate ownership at every stage, including worker/result callbacks. Validate image dimensions before decode; enforce byte/pixel/time/output limits. Parse and sanitize SVG with scripts/events/foreignObject/external references disabled and complexity bounded; no regex-only sanitization. Check redirects/private addresses when external downloads are required. Log request IDs and redacted measurements, not customer letters or credentials.
Cancellation blocks late imports, not already incurred provider charges; record incurred cost accurately. Per-process counters are not a distributed budget/concurrency system. Retry only transient errors with durable keys and bounded cost. Preserve original project and create a new revision/project; never automatically replace an approved artwork.

## Print boundary

Browser canvas export is RGB. Editable text/geometry should feed a dedicated print renderer with embedded fonts, approved ICC conversion, trim/bleed boxes and preflight. Only a verified artifact may be described as CMYK or PDF/X. PNG/JPEG layering cannot recover detail missing from the source.
