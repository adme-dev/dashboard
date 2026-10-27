# Provider readiness

Current checkpoint: [V2-IMPLEMENTATION.md](V2-IMPLEMENTATION.md). OpenAI generation/reference-edit and native typography adapters are implemented, but no OpenAI credentials or live output were verified. Actual Nuxt proofs use explicit fixtures. A subsequent real Qwen Space attempt failed with no layers; see the live-attempt section below. Earlier research observations are historical and do not override this result.

## Model comparison — 26 October 2026

Paul requested an explicit comparison beyond the existing Qwen integration. Two parallel research agents checked primary model/API documentation and release availability. This is capability research, not an output-quality ranking: no candidate was run against the supplied automotive poster. Existing synthetic Qwen tests establish importer behavior only.

| Candidate | Documented output and practical role | Availability / limitation |
|---|---|---|
| [Qwen-Image-Layered](https://huggingface.co/Qwen/Qwen-Image-Layered) | Whole-image decomposition into multiple RGBA raster layers; variable and recursive decomposition. | Public Apache-2.0 code/weights. Existing integration candidate; lettering remains pixels. |
| [Seedream 5.0 Pro / Flash](https://docs.byteplus.com/en/docs/modelark/image-generation-api) | `layer_decomposition: true` returns a base plus up to 16 transparent PNG layers, with stacking order, bounds and descriptions. | Hosted API. Cropped layers need coordinate-aware import rather than the Qwen full-frame contract. Text is raster. Credentials, entitlement and quality unverified. |
| [LayerD](https://github.com/CyberAgentAILab/LayerD) | Graphic-design decomposition with PSD/SVG export. | Public Apache-2.0 code and [matting weights](https://huggingface.co/cyberagent/layerd-birefnet); dependencies retain separate terms. [Export documentation](https://github.com/CyberAgentAILab/LayerD/blob/main/docs/export.md) explicitly preserves text as raster images, including SVG. |
| [Nano Banana](https://ai.google.dev/gemini-api/docs/image-generation) | Generation and conversational image editing; candidate for concept creation and selected-image repair. | Reviewed API does not document automatic registered-layer decomposition. PNG output alone does not prove transparency or a layer stack. |
| [MiniMax Image-01](https://platform.minimax.io/docs/api-reference/image-generation-i2i) | Image generation with character-reference input. | No registered-layer or native-text output contract found. Do not infer image-model open weights from MiniMax's open language models. |
| [Qwen-Image-2.1](https://qwen.ai/blog?id=qwen-image-2.1) | Native RGBA generation/editing and subject extraction; useful for individual layers. | Different from whole-document Layered decomposition. Published weights use the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE), requiring separate permission for commercial use of the materials. |
| [OmniPSD](https://arxiv.org/html/2512.09247v1) | Paper describes image/text-to-PSD and an OCR, font retrieval and rerendering stage producing native editable PSD text. | [Repository](https://github.com/showlab/OmniPSD) exists, but complete trained task checkpoints and packaged native-text export were not verified. Repository uses CC BY-NC-SA 4.0, with separate base-model terms. Research reference, not a proven drop-in integration. |

The user's word “Sunday” remains unidentified; it has not been silently mapped to Seedream.

Next quality comparison: run the same approved leafy automotive artwork through Qwen-Layered, Seedream and LayerD when an inference runtime is available. Compare recomposition against the original; car edges, shadows and occluded pixels; heading isolation; clean background after hiding text; exact offer/legal copy; resolution; elapsed time and actual cost. A valid PNG stack is not sufficient acceptance evidence.

For generation-first work, retain approved Unicode copy and style parameters before image generation. Rebuild copy with existing native text/effects instead of treating a text-shaped PNG as editable type. Save successful generation recipes only after visual review. No new adapter, provider inference, weight download or purchase was performed for this comparison.

Historical readiness observation before the later Qwen attempt: no application-provider inference or subscription purchase had been performed. Built-in image generation was used separately for the clean plate, with billing details unavailable.

| Boundary | Evidence | Limit |
|---|---|---|
| Hosted Banner Studio | Available Chrome session navigates to `/auth` | Dissector/Qwen authenticated UI and extraction success not verified |
| Local credentials | `.env` absent; DATABASE_URL, GROQ_API_KEY, GEMINI_API_KEY, GOOGLE_AI_API_KEY, HF_TOKEN, QUIVERAI_API_KEY and CLOUDFLARE_API_TOKEN absent from process environment | No live catalogue assignment/usage or database write verified |
| Qwen public Space | GET `https://qwen-qwen-image-layered.hf.space/config` returned HTTP 200 | Historical GET only; later real upload/inference attempt failed and returned no accepted layers |
| Quiver | GET `https://api.quiver.ai/v1/models` without credentials returned HTTP 401 | No account model discovery, paid benchmark, price or latency measurement |
| Background repair | Built-in image_gen produced the inspected clean plate | Model/version/request ID/cost not exposed; outside deployed application catalogue |
| Copy rewrite local browser | Existing inspector/catalogue request contract exercised using an explicitly labelled deterministic HTTP test response | Proves selection, preview/apply/undo; does not prove live model output |

## Official documentation refresh

[Quiver image-to-SVG](https://docs.quiver.ai/developers/models/image-to-svg) currently documents `POST /v1/svgs/vectorizations`, examples with `arrow-2`, detailed-image option `arrow-2-telos`, and account discovery via `GET /v1/models`. Supports image URL or base64 inputs and streamed reasoning/draft/content events. Documented decoded limits: 12,582,912 bytes, 4096 × 4096 pixels and 16,777,216 total pixels. Telos rejects sampling parameters accepted by Arrow 2; adapters must use discovered model capabilities. This supports evaluating selected graphics; it does not establish native Banner Studio text recovery or path-node editing.

[Qwen's model card](https://huggingface.co/Qwen/Qwen-Image-Layered) describes RGBA layer decomposition, Apache-2.0 licensing, and 640/1024 resolution buckets (640 recommended). Raster separation remains distinct from native typography. No source here discloses Quiver's proprietary training implementation or proves parity with a native reconstruction pipeline.

Decision unchanged: deterministic native copy/shapes plus original assets first; replaceable image/vector providers after account-scoped capability and bounded-cost evidence. Do not treat public config, a documented endpoint or mocked response as successful reconstruction.

## Historical parallel investigation follow-up (before live attempt below)

The [official Qwen demo source](https://huggingface.co/spaces/Qwen/Qwen-Image-Layered/blob/main/app.py) stacks PNGs at the same origin and creates PPTX pictures, not native text. Its prompt describes the overall input; it does not explicitly control each layer's semantics. Read-only public config still exposes `infer_1` with ten inputs and three outputs, matching the existing adapter. No endpoint-name drift was demonstrated. Local integration bugs were confirmed and corrected; no model inference was run.

[Quiver's test-key sandbox](https://docs.quiver.ai/developers/guides/sandbox-and-test-keys) is non-billable and returns deterministic mock SVG without model inference. It requires a test key and could verify a future adapter contract, but cannot establish output quality. No Quiver app adapter or test-key call was added in this continuation.


## Subsequent implementation and live Qwen attempt

OpenAI catalogue defaults are `banner_artwork_generate`/`banner_lettering_raster` → `openai/gpt-image-1.5`, and `banner_lettering_native` → `openai/gpt-4.1-mini`. Real SDK adapter and scoped assets exist; absent credentials are an explicit failure. No OpenAI output quality, exact rendered wording, OEM fidelity, account entitlement, measured price or hosted persistence has been established. See V2-IMPLEMENTATION.md for byte/pixel/rate/time bounds and the distinction from unimplemented absolute dollar ceilings.

`benchmark-qwen.ts` now records reproducible local evidence and defaults to dry-run. A later explicit `--run` uploaded the approved bold lifestyle A4 source (2480×3508, source SHA-256 `b496bdc49cb9207bb6dd8a997e2d56b86df8e6f7f483eb14d9814fbee03cf256`) via deterministic local JPEG→PNG conversion. Evidence: `output/banner-provider-benchmarks/2026-10-26T07-10-28-456Z-b496bdc49cb9/evidence.json`. At 07:10:28 UTC, four layers/50 steps/guidance 4 were requested. The Space returned an error/no valid complete result after about 10.1 seconds. Status **failed**, layers empty, composite null, cost/request ID unknown. This establishes an unsuccessful real attempt, not decomposition quality or native text recovery.

Seedream account/runtime and LayerD inference runtime/weights remain unavailable; neither comparator ran. Quiver has no application adapter or live quality benchmark. No subscription purchase or deployment occurred. The 20-case and same-source multi-model quality comparisons remain outstanding.
