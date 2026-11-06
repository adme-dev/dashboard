# Freefield FF-RD01–03 — matting, upscale and reframe evidence

**Research date:** 5 November 2026

**Source reviewed:** dashboard `1f502c3ebdda0b6bc34cab86fe9681b9be3612f1`

**Scope:** FF-RD01 video matting, FF-RD02 controlled upscaling and FF-RD03 generative reframing only. FF-RD04/05 are owned separately.

**Status:** capability/terms discovery and deterministic local baselines complete; provider execution, commercial approval and full-clip model evaluation remain pending.

## Decisions

| Item | Current decision | Discovery result | What is not satisfied |
|---|---|---|---|
| FF-RD01 — video matting | **Defer product promotion. Advance `bria/v-rmbg-3.0` only to a separately authorized synthetic evaluation.** | A hosted model exists through the existing Cloudflare AI Gateway route. Local ProRes 4444 alpha decode/composite works. | No registered/executable action, approved commercial/privacy terms, provider output, hair/glass/spokes/motion-edge evaluation, production-container check or separate matte artifact contract. |
| FF-RD02 — controlled upscale | **Defer product promotion. Evaluate `black-forest-labs/flux-video-upscale` with `creativity: 0` first.** | A source-faithful hosted mode exists through the existing AI Gateway route. Deterministic current-renderer and Lanczos baselines now have equal-size reference measurements. | No video-upscale action/adapter, approved terms/data handling, provider output, detail/flicker/skin/logo evaluation, actual cost/latency/memory or safe high-resolution finalization. |
| FF-RD03 — generative reframe | **Defer. Do not represent Cloudflare Aleph 2 as an expand integration. Evaluate native Runway `aleph2` only after commercial approval and deployed baseline verification.** | Native Runway documents `targetAspectRatio` for expand/outpaint. Cloudflare's Aleph schema does not expose it. The pre-fix production `.mjs` ignored `clip.fit`; the bounded local correction below now proves TypeScript/MJS parity, without deployed acceptance. | No supported expand request contract, native asynchronous provider adapter, approved terms, full-clip preservation/border evaluation, Linux/deployed parity acceptance or cost evidence. |

No FF-RD01–03 research checklist item is marked complete by this report. No provider was called, no paid output was created, no licence was accepted and no new GPU/backend was selected. The appropriate next state is **discovery complete / authorized provider evaluation pending**, not “R&D criterion satisfied.”

## Method and evidence boundary

Reviewed the canonical video-generation registry and provider adapter, creative image registry, asset-intelligence registry/worker, timeline and composite renderer, finalization/probing and focused tests. Official provider/model documentation and terms were retrieved on 5 November 2026; pages without a visible revision date are cited as retrieved on that date rather than assigned one.

Local evidence is under [`../../.verification/video-rd/kimi/`](../../.verification/video-rd/kimi/):

- [`run-local-fixtures.ts`](../../.verification/video-rd/kimi/run-local-fixtures.ts) — reproducible owned synthetic generator and renderer harness.
- [`fixture-commands.log`](../../.verification/video-rd/kimi/fixture-commands.log) — 36 FFmpeg/ffprobe commands from the final successful run.
- [`fixture-results.json`](../../.verification/video-rd/kimi/fixture-results.json) — hashes, probes, filters and measured results.
- [`fixture-run.log`](../../.verification/video-rd/kimi/fixture-run.log), [`offline-tests.log`](../../.verification/video-rd/kimi/offline-tests.log) and [`seedance-crosscheck-tests.log`](../../.verification/video-rd/kimi/seedance-crosscheck-tests.log) — execution receipts.
- [`artifacts/`](../../.verification/video-rd/kimi/artifacts/) — small locally generated media, not model outputs and not customer assets.

The fixtures use a two-second, 24 fps synthetic pattern with 48 frames and a tone track. FFmpeg 8.0.1 and ffprobe were already installed. No download, dependency install, credential access, customer media, Docker image, deployment or external message occurred. The host FFmpeg lacks `drawtext`, so the generator uses `testsrc2`, a grid and moving geometric shapes. Local macOS results do not establish Linux/container parity or provider model quality.

## Current implemented baseline

### Generation and asset-action authority

- `server/utils/video-generation/modelRegistry.ts:3-7` conservatively sets `extendVideo`, `endFrame` and `videoToVideo` false; only Vidu Q3 enables an end frame. No registered model enables video-to-video transformation. The registry contains Seedance, Wan, Hailuo, Runway Gen-4.5, Vidu, PixVerse and Veo generation entries, not matting, video-upscale or expand actions.
- `server/utils/video-generation/types.ts:1-14` models generation modes and three capabilities, not transformation roles. `server/utils/video-generation/providers/types.ts:3-30` accepts prompt, source image URLs, duration/aspect/resolution and returns one output URL with no output role, alpha, warning or measured media.
- `server/utils/video-generation/providers/aiGatewayProvider.ts:43-59` builds only the registered generation payload. `server/utils/video-generation/cfInputs.ts:68-168` maps image/start/end-frame inputs; it does not send `reference_video`, `video_uri`, `input_video` or `targetAspectRatio`. Cloudflare's Seedance 2.0 documentation describes video references/editing, but that is **not** supported by this XeroFlow adapter and cannot be repurposed by changing a prompt.
- Cross-checking the [FF-RD04/05 source review](./2026-11-05-freefield-reference-motion-feasibility.md) found a separate contract drift relevant to any future evaluation: the Fast registry entry advertises 1080p, while the [5 November Fast input schema](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0-fast/schema-input.json) and mapper allow only 480p/720p. The schema also marks fields required that the mapper and documentation examples omit. These are published-contract/code gaps, not observed live gateway failures; the 22 passing mapper/registry tests confirm current code intent only.
- `server/utils/creative-generation/modelRegistry.ts:14-23` registers `aigateway/pruna-upscale` / `pruna/p-image-upscale`. The [official Cloudflare schema](https://developers.cloudflare.com/ai/models/pruna/p-image-upscale/) accepts an **image**, not a video. Its vehicle restriction against generative detail/realism is useful policy precedent but not video support.
- `server/utils/video-asset-intelligence/registry.ts:45-198` defines PNG/image derivatives. `replicate/sam-2` is disabled and commented only as “future video mask tracking”; `bria/rmbg` and `huggingface/birefnet` are disabled image background-removal entries. The public [Replicate `meta/sam-2` page](https://replicate.com/meta/sam-2) is explicitly “Segment Anything v2 (for Images)” and accepts an image.
- This is an execution gap, not just missing UI: `workers/asset-intelligence/src/providers.ts:219-223` throws “requires configured provider runtime” for background removal, object segmentation, layer decomposition and mask lift. `server/api/agency/video/assets/[id]/extract.post.ts:11-22` excludes those actions from the deployed queue path. `mask-only` copies a brush PNG; it does not track video.

### Renderer, output and synchronization

- The TypeScript planner exposes fit/fill/crop at `server/utils/audio/videoCompositeGraph.ts:46-64`: fit scales down and pads, fill stretches, crop scales up and centre-crops. It composites video over a black base, then overlays/captions, and emits H.264 `yuv420p` at `:220` and `:248-250`. Final MP4 delivery is intentionally opaque; transparency matters while compositing an input.
- The actual Worker imports the `.mjs` port at `workers/audio-jobs/src/videoCompositeContainer.ts:11`, and the container executes it at `workers/audio-jobs/container/server.mjs:121-128`. **Pre-fix discovery:** that port had only legacy fit behaviour for uploaded footage and ignored `clip.fit`; existing parity tests used the default fit and missed crop/fill. The local correction section below records the repair and new explicit-mode regressions.
- A video clip has one `r2_key` and no matte/alpha role in `server/utils/audio/timelineSchema.ts:38-55`. A pre-matted RGBA video can be an input, but a separate reusable matte cannot be paired with a source through an explicit synchronized contract.
- `server/utils/video-generation/finalize.ts:39-61` buffers the entire provider result, hardcodes `output.mp4` / `video/mp4`, performs no media probe and records requested duration rather than measured output. Its own comments identify the Pages memory limit and duplicate-finalization window. Large ProRes/upscaled outputs must not enter this path unchanged.
- `shared/video-storyboard/mediaProbe.ts:8-13` currently returns kind/duration/dimensions, not codec, frame count, frame rate, alpha or audio-channel timing. `workers/audio-jobs/container/mediaProbe.mjs:74-138` fully decodes bounded input but likewise does not certify alpha or frame/audio synchronization. These are missing acceptance fields, not evidence that a provider preserves them.

## Official capability and terms discovery

Cloudflare catalogue availability is not XeroFlow registration, account entitlement, commercial approval or evaluation evidence. The following identifiers are exact; no identifier was inferred from a Freefield manifest.

| Capability | Official contract found | Relevance and limit |
|---|---|---|
| Video matting | Cloudflare [`bria/v-rmbg-3.0`](https://developers.cloudflare.com/ai/models/bria/v-rmbg-3.0/): `video`, `background_color`, `output_container_and_codec`, `auto_zoom`, `preserve_audio`, `spill_suppression`; up to 60 seconds; listed at **$0.0225 per second** (the page does not further qualify the unit). Transparent output requires **`mov_proresks`** on this gateway schema. Other presets can fall back to black with `warning`. | Best first candidate because it uses the existing AI Gateway binding shape. Not registered in XeroFlow. It returns a processed video, not a documented second matte output. |
| Video matting alternative | Replicate [`bria/video-remove-background`](https://replicate.com/bria/video-remove-background) and its [machine-readable model card](https://replicate.com/bria/video-remove-background/llms.txt): `video_url`, `background_color`, `output_container_and_codec`, `preserve_audio`; alpha presets include `webm_vp9`, `mov_proresks`, `mkv_vp9`; up to 60 seconds. | Existing Replicate ecosystem, but no executable runtime for this action. Public pages surfaced inconsistent prices ($0.05/output second on the model/API search result versus $4.20/1000 seconds on the schema search result), so a current quote is unresolved. |
| Controlled upscale | Cloudflare [`black-forest-labs/flux-video-upscale`](https://developers.cloudflare.com/ai/models/black-forest-labs/flux-video-upscale/) and [raw input schema](https://developers.cloudflare.com/ai/models/black-forest-labs/flux-video-upscale/schema-input.json): `input_video`, `upscale_factor` 1.5–3, **`creativity` exactly 0 or 1**, optional `prompt`, `safety_tolerance`; up to 20 seconds/50 MB; listed at **$0.07 per megapixel-second precise** and **$0.10 creative**. [Upstream BFL documentation](https://docs.bfl.ml/flux_tools/flux_video_upscale) adds source maximum 2560×1440, approximately 14.4 MP output cap, aspect-ratio/audio preservation and an approximately one-hour signed result URL. | Preferred evaluation candidate. `creativity: 0` is the source-faithful mode for faces/products/brand assets and must be sent explicitly: upstream BFL defaults to `creativity: 1`, while the Cloudflare schema declares no default. BFL explicitly warns that creative mode can drift identity/products. Published price is not an actual XeroFlow charge. |
| Upscale alternatives | Replicate [`bria/video-increase-resolution`](https://replicate.com/bria/video-increase-resolution): `desired_increase`, codec/container, `preserve_audio`, up to 60 seconds and 8K. Replicate [`topazlabs/video-upscale`](https://replicate.com/topazlabs/video-upscale): `video`, `target_resolution`, `target_fps`, with output-size/fps-dependent pricing. Runway [`magnific_video_upscaler_creative`](https://docs.dev.runwayml.com/api.md), `POST /v1/video_upscale`: up to 30 seconds, `720p`/`1k`/`2k`/`4k`, creativity/sharpen/grain/flavor/fps controls. | Secondary candidates only; no reason to provision a new GPU backend. Do not compare list prices until the exact route, output frames and current quote are fixed. BRIA's price was not established in this pass. Topaz changes fps by contract, so a synchronization-preserving evaluation must pin fps explicitly. |
| Generative expand | Native Runway [`aleph2`](https://docs.dev.runwayml.com/openapi.json), `POST /v1/video_to_video`: `videoUri` up to 30 seconds plus **`targetAspectRatio`** = `16:9`, `4:3`, `3:2`, `1:1`, `2:3`, `3:4`, `9:16` or `21:9`; the schema explicitly says expand/outpaint and letterboxing before generation. [Runway's tutorial](https://academy.runwayml.com/tutorial/how-to-expand-videos) independently describes Aleph 2.0 aspect-ratio expansion. [Pricing](https://docs.dev.runwayml.com/guides/pricing/) is 28 credits/second with a 56-credit minimum; credits are listed at $0.01. | Exact native candidate, but no XeroFlow native Runway task adapter. Expansion is not established by generic video editing or by `ratio`. |
| Aleph through Cloudflare | Cloudflare [`runwayml/aleph-2`](https://developers.cloudflare.com/ai/models/runwayml/aleph-2/): `prompt`, `video_uri`, keyframes/prompt images, seed/moderation and billing `duration`; listed at **$0.336/second**. | The schema has **no `targetAspectRatio`**. It is an editing candidate, not a verified reframe integration. Do not silently pass the native field through a schema with `additionalProperties: false`. |

Freefield's pinned manifests were used only as leads: [`video-remove-bg`](https://raw.githubusercontent.com/neuregex/freefield/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/video-remove-bg/app.json) uses per-frame BiRefNet; [`upscale-video`](https://raw.githubusercontent.com/neuregex/freefield/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/upscale-video/app.json) names SeedVR2 3B int8; [`reframe`](https://raw.githubusercontent.com/neuregex/freefield/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/reframe/app.json) names LTX-2.5 with a gated LTX-2.3 In-Outpainting IC-LoRA and explicitly says “Not run yet.” Their `ready` state and licence strings establish neither XeroFlow commercial eligibility nor output quality. No self-hosted ComfyUI/Modal path is recommended.

### Commercial and data terms remain explicit gates

- [BRIA's public terms](https://bria.ai/terms-of-use) say advanced AI features and commercial-use rights require an active paid subscription or valid licensing agreement; the ordinary account grant is personal/non-commercial. [BRIA's enterprise terms](https://www.bria.ai/terms-and-conditions) are order-dependent, address output rights and restrictions, prohibit training other generative models on output, require preservation of applicable AI marking, and state that Customer Content must not include personal data. The current XeroFlow order, paid entitlement, presenter/personal-data permission, retention and downstream Replicate/Cloudflare applicability were not inspected and remain **unknown**. Do not submit presenter footage on the strength of “commercially safe data” marketing.
- [BFL terms](https://blackforestlabs.ai/terms-of-service/) claim no ownership of Input/Output but include a broad licence to use content to provide/develop/train/improve services, with an opt-out process, and separate restrictions on commercial exploitation of the Services versus Outputs. Current Developer/Gateway terms, order, training and retention settings must be reviewed before client footage is used. No opt-out or acceptance was performed here.
- [Runway's commercial-use guidance](https://dev.runwayml.com/learn/commercial-use) says Runway does not claim outputs or restrict their commercial use subject to its agreement/Usage Policy; contractual no-training, zero retention and IP indemnity are described as Enterprise features. [Runway's terms](https://runwayml.com/terms-of-use) were last updated 23 October 2026. Current XeroFlow plan and actual data terms are unknown.
- [Replicate's terms](https://replicate.com/terms), last updated 1 April 2026, grant output rights for commercial use **subject to Third Party Terms**, and require customers to review model-specific terms. A Replicate “Official model” badge means stable API/pricing/availability, not blanket commercial clearance.
- Every source still needs its own usage approval, trademark/likeness/audio rights and disclosure/provenance review. Provider output permission does not clear customer inputs or generated surroundings.

## FF-RD01 — video background removal / reusable matte

### Supported versus missing integration contract

**Supported by the candidate documentation:** approved source URL → `bria/v-rmbg-3.0` with `background_color: "Transparent"`, `output_container_and_codec: "mov_proresks"`, `auto_zoom: false`, `preserve_audio: true` and explicit spill setting. Expected role is `foreground_video` (RGBA ProRes), with source lineage, model/request identity, provider warning and measured media. Keep the original immutable and never select the derivative automatically.

**Missing in XeroFlow:** action/model registry entry and executable adapter; approved source URL resolution for video; output-role/warning schema; ProRes-safe streaming finalization and content type; codec/pix_fmt/frame-rate/frame-count/alpha/audio probe; source/result comparison; and tenant/project budget/policy. A separate `matte_video` plus `foreground_video` pair is **not documented** by the Cloudflare candidate. If a reusable independent matte is required, a provider that returns it must be evaluated separately; an alpha cutout is the currently documented reusable alternative.

**Local renderer result:** the current graph can decode and alpha-composite a ProRes 4444 input, but there is no explicit matte-track role. This is enough to justify a bounded evaluation, not enough to claim full renderer compatibility.

### Owned fixture protocol and proposed acceptance gate

Create five owned five-second, 24 fps clips (120 frames), with ground-truth alpha and tone impulses at 0, 1.5, 3.5 and 4.5 seconds: hard-edged product with exact synthetic mark; fine hair-like 1 px strands; semi-transparent glass over a moving pattern; rotating thin spokes; and fast subject motion with occlusion against a high-contrast border. Use vector/generated media only, preserve source and ground-truth hashes, and run one reviewed provider request per fixture after authorization. No cherry-picked thumbnail or free reroll.

Proposed gate, **not measured**:

1. Every output is ProRes with real alpha, no black-fallback warning, same dimensions, 120 frames at 24 fps and five-second duration within one frame; audio impulse drift is at most one frame. Source/result/output hashes and actual provider request/receipt are recorded.
2. Solid product/spokes foreground has per-frame IoU median ≥0.95 and 5th percentile ≥0.90 against ground truth. Hair/glass alpha MAE is ≤0.10; static-region temporal alpha MAE is ≤0.03. Review all five clips in motion for spill, holes and edge chatter.
3. All five pass human product/presenter-edge review with no severity-1 defect; the alpha input composites correctly in the Linux production container and survives canonical finalization/probing.
4. Promote only with commercial/privacy approval and a recorded actual cost/latency receipt. Reject this candidate for the use case on opaque/wrong-alpha output, hard synchronization failure, or severe edge failure in two or more categories. Otherwise defer with the failed categories named.

**Exact remaining evidence:** current order/DPA/commercial decision; provider model/revision and request IDs; all five source/GT/result hashes; full-clip alpha metrics and human review; frame/audio probes; actual billed seconds, amount/currency and queue/provider/finalization latency; Linux container and bounded storage results; independent-matte requirement decision.

## FF-RD02 — controlled video upscaling

### Supported versus missing integration contract

**Supported by the candidate documentation:** approved MP4 URL/base64 → `black-forest-labs/flux-video-upscale` with `upscale_factor` and **`creativity: 0` sent explicitly** for product/identity footage. Upstream BFL defaults to `creativity: 1`; the Cloudflare schema declares no default, so omission is not a documented precise-mode request. Expected role is `upscaled_video`, retaining source aspect ratio and audio. Creative mode requires a separately authorized experiment and is unsuitable for accuracy-critical vehicle/text evaluation.

**Missing in XeroFlow:** video-upscale action and per-model payload/result adapter, target/output-megapixel quote, safe expiry-aware download, streaming/probe/finalization, original preservation and explicit derivative approval. Current image Pruna policy cannot be reused as proof of video capability. The existing whole-output buffer is a hard blocker for long/high-resolution promotion; provider-side memory may remain unavailable and must be recorded as unknown rather than invented.

### Deterministic baseline measured here

The harness downsampled a lossless 320×180 master to 160×90, then enlarged to the same 320×180 output with the current renderer and Lanczos. Against the lossless master:

| Path | PSNR average (dB) | SSIM All |
|---|---:|---:|
| Current production `.mjs` scale | 23.923535 | 0.787308 |
| Explicit Lanczos | 23.955492 | 0.786600 |

Both produced 48 frames at 24 fps and two-second outputs with audio. Lanczos is +0.031957 dB PSNR; current scale is +0.000708 SSIM. These tiny, fixture-specific differences are **not** evidence that one is perceptually better, nor an AI-upscale score. They establish the equal-size comparison procedure and baseline artifacts only.

### Owned fixture protocol and proposed acceptance gate

Use five owned five-second masters at 1280×720/24 fps with tone impulses: exact small text/logo and product geometry; skin/hair; fine spokes/line detail; fast motion/static regions for flicker; and noisy low-light compression. Downsample each to 640×360, then compare current renderer, Lanczos and `creativity: 0` at identical 1280×720 output. Keep original/master/baseline/provider hashes and evaluate the entire clips.

Proposed gate, **not measured**:

1. Frame count/rate, aspect ratio and duration match within one frame; audio markers remain within one frame; no fps change or unrequested crop. Final MP4 probes and plays through the canonical renderer.
2. No invented/changed required text, logo, badge or product geometry and no severity-1 skin/identity drift or temporal flicker. Record semantic failures separately from execution status.
3. Against the lossless masters, median SSIM is no more than 0.005 below the better deterministic baseline, and no individual fixture is more than 0.01 below it; PSNR/SSIM support, but do not replace, full-clip human review. Any changed text/logo is a rejection regardless of aggregate score.
4. Record quoted and actual charge/currency, billable output megapixel-seconds, queue/provider/transfer/finalization latency and XeroFlow finalization peak memory. Promote only if all preservation gates pass and quality adds measurable/reviewed value over the deterministic baseline. Defer marginal gains; reject creative mode for accuracy-critical footage and reject any candidate that alters required identity/copy.

**Exact remaining evidence:** current BFL/Gateway commercial and data decision; provider outputs/request revisions/receipts; all baseline/model full-clip metrics and reviews; actual cost/latency/memory; expiry-safe streaming and high-resolution finalization; canonical renderer and Linux verification. The local harness did not measure peak memory and no provider latency/cost exists yet.

## FF-RD03 — optional generative format expansion

### Supported versus missing integration contract

**Supported by native Runway documentation:** `aleph2` on `POST /v1/video_to_video` with source `videoUri` and explicit `targetAspectRatio`, asynchronous task ID/polling and temporary output download. The integration must label it generative outpaint, preserve the source and compose exact-copy overlays **after** expansion.

**Not supported by the current route:** Cloudflare Aleph has no target-ratio field; registered Gen-4.5 is not Aleph; the generic XeroFlow adapter has no native asynchronous Runway task lifecycle or expand field. A prompt such as “expand to 9:16” is not a verified native control. A new native API adapter would be required if Cloudflare does not expose the field; this is still a hosted-provider decision, not a new GPU backend.

**Pre-fix deterministic blocker found:** production and TypeScript planners disagreed, so the original comparison baseline was false. The bounded local correction is recorded below; Linux/deployed acceptance remains a separate gate.

### Pre-fix deterministic baseline measured before the correction

For 160×90 landscape input to 90×160 portrait output, the pre-fix production `.mjs` fit/fill/crop outputs all had SHA-256 `0acd79a8ae5cd7554a6a519cc84d3b477286957f1b5d833a5f91d3ffb25e7073` and identical scale-decrease/pad filters. The TypeScript fit output matched that hash; TypeScript fill and crop had distinct hashes and the expected stretch/crop filters. Visual inspection confirmed production “crop” was letterboxed fit, while TypeScript crop filled the portrait frame. All outputs contained 48 frames and two seconds of audio. These original artifacts remain unchanged in `.verification/video-rd/kimi/artifacts/`.

### Owned fixture protocol and proposed acceptance gate

Use three owned five-second 16:9 sources—a static product with exact mark, a moving subject crossing the frame, and a moving-camera parallax scene—and expand each to 9:16, 1:1 and 21:9 (nine source/target cases). Render fit/fill/crop at the identical target dimensions, then native `aleph2` with the explicit target ratio. Include stationary border landmarks and audio impulses. Review newly invented surroundings separately from source preservation; add exact-copy overlays only after the transform.

Proposed gate, **not measured**:

1. Repeat the now-passing local TypeScript/`.mjs` parity checks in the Linux production container. Every output preserves frame count/rate/duration and audio markers within one frame, with measured dimensions and no unrequested fps conversion.
2. Register the original source region to the result; source-region SSIM is ≥0.98, with no human-observed subject warp, changed text/logo/product geometry or duplicated subject. Border landmarks remain coherent through every frame, including camera motion.
3. All nine cases pass preservation review, and a reviewer judges generative expansion more useful than the best deterministic alternative in at least six; otherwise keep the unchanged deterministic fallback and defer. Any invented advertising copy/logo is a rejection. Reject the candidate if severe source warping or border failure occurs in more than one case.
4. Record actual native task/estimated/final credits, currency, latency and output hashes, plus full-clip human review of invented surroundings. Commercial/data approval is required before customer media.

**Exact remaining evidence:** Linux/deployed parity acceptance; native account/endpoint entitlement and current commercial/data decision; native expand request/receipt and exact ratio behavior; all nine source/baseline/result comparisons; source-region and border metrics; full-clip semantic review; actual cost/latency; post-transform overlay and canonical-render inspection.

## Local alpha compatibility result

The owned ProRes 4444 source probes as `yuva444p12le`, 160×90, 24 fps, 48 frames and 2.000 seconds. `alphaextract` returns eight zero bytes for the sampled transparent corner. After the current `.mjs` composite:

- transparent-corner luma samples are `[0,0,0,0]` (black base), versus `[75,76,76,75]` for the opaque green control;
- output is H.264 `yuv420p`, 24 fps, 48 video frames and 2.000 seconds;
- AAC audio is 48 kHz stereo and 2.000 seconds;
- output SHA-256 and full probe are in `fixture-results.json`.

This proves the bounded local decode/composite path only. It does not prove BRIA matte quality, straight versus premultiplied alpha handling across arbitrary provider files, production Linux codec availability, independent matte synchronization or safe large-file finalization. Those remain acceptance evidence.

## Offline test receipt

Command:

```sh
pnpm exec vitest run \
  test/video/assetIntelligenceRegistry.test.ts \
  test/workers/asset-intelligence/providers.test.ts \
  test/video/clipEffects.test.ts \
  test/audio/videoCompositeGraph.test.ts \
  test/audio/videoCompositeGraphSync.test.ts \
  test/audio/videoCompositeRenderWorker.test.ts
```

Result: **6 test files, 47 tests passed** (Vitest 4.1.10). The warning about Vite native config and `__dirname` is unrelated to this research. These tests confirm current registry intent and legacy/default rendering, not video matting/upscale/outpaint execution or non-default production fit parity.

Cross-check command: `pnpm exec vitest run test/video-generation/modelRegistry.test.ts test/video-generation/cfInputs.test.ts`. Result: **2 files, 22 tests passed**. These tests lock the conservative flags and existing smaller Seedance payload; they do not prove that the live gateway accepts it or that 1080p Fast works.

Fixture command:

```sh
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json \
  .verification/video-rd/kimi/run-local-fixtures.ts
```

Final result: `status: ok`, 36 logged commands. Media was probed and visually inspected after generation. No provider/GPU/full-clip evaluation was available within the authorized no-spend scope.

## Local correction — production framing parity

After the pre-fix discovery above, the production framing bug was repaired locally without changing the TypeScript behavior authority or any UI/provider contract.

**Changed source:**

- `workers/audio-jobs/container/videoCompositeGraph.mjs` now mirrors `resolveVideoClipFit()` and `videoClipFitFilters()` from TypeScript and uses them for both uploaded footage and `still_kenburns`. Explicit fit/fill/crop works; missing fit retains uploaded=fit and still=crop; unknown values use those same fallbacks.
- `test/audio/videoCompositeGraphSync.test.ts` now compares complete TypeScript/MJS plans for both source types across all three explicit modes, missing-fit defaults and unknown-fit fallback.

**RED before repair:** `pnpm exec vitest run test/audio/videoCompositeGraphSync.test.ts` produced **4 failures / 12 passes out of 16**: uploaded fill/crop and still fit/fill failed; defaults, legacy fit/crop and unknown fallback passed. Receipt: [`pre-fix-tests.log`](../../.verification/video-rd/kimi/framing-fix/pre-fix-tests.log).

**GREEN after repair:** the same suite passes **16/16** ([`post-fix-sync-tests.log`](../../.verification/video-rd/kimi/framing-fix/post-fix-sync-tests.log)). The focused command below then passed **7 files / 99 tests** ([`focused-tests.log`](../../.verification/video-rd/kimi/framing-fix/focused-tests.log)):

```sh
pnpm exec vitest run \
  test/audio/videoCompositeGraphSync.test.ts \
  test/audio/videoCompositeGraph.test.ts \
  test/audio/videoCompositeRenderWorker.test.ts \
  test/video/clipEffects.test.ts \
  test/video/clipEffectsEdit.test.ts \
  test/audio/timelineSchema.test.ts \
  test/audio/timelineEditAv.test.ts
```

**Fresh real-FFmpeg verification:** `pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json .verification/video-rd/kimi/framing-fix/run-framing-fixtures.ts` completed with 31 logged commands ([`fixture-run.log`](../../.verification/video-rd/kimi/framing-fix/fixture-run.log), [`commands.log`](../../.verification/video-rd/kimi/framing-fix/commands.log), [`results.json`](../../.verification/video-rd/kimi/framing-fix/results.json)). Ten paired cases—two source types × (fit/fill/crop/default/unknown)—produced 20 renders. Every production/TypeScript pair has identical filters and byte-identical MP4 output; every output has 48 frames, 24 fps and 2.000-second video/audio.

The repaired uploaded fit remains byte-identical to the original pre-fix fit, SHA-256 `0acd79a8ae5cd7554a6a519cc84d3b477286957f1b5d833a5f91d3ffb25e7073`. Repaired fill/crop match the original pre-fix TypeScript outputs (`cf45e23975b2727c176857d47527a7ddef42b1439130dfa7f6c50e8c57de6a0f` and `bac36661a82f46d50a1e1d7ad9a00a07aa39d5712d57e2d05576cbec7f72b9db`). Fresh media is isolated under [`framing-fix/artifacts/`](../../.verification/video-rd/kimi/framing-fix/artifacts/); the original pre-fix media and results were not overwritten. Visual checks confirm letterboxed fit, stretched fill and centre-cropped output.

**Integration:** source and regression tests were committed locally as `3ed6af33b` after Grok found no important framing-repair issue. The broader integration rerun passed 901 tests across 137 files with four workers; an initial run had one five-second brand-kit test timeout. Final parity verification passed 16/16. Logs are under `.verification/video-rd/integration/`.

**Limits:** this is locally committed source and macOS FFmpeg evidence only. The actual Linux production container, hosted renderer, deployed acceptance and all provider/full-clip FF-RD evaluations remain unverified. This correction removes the deterministic baseline defect; it does not complete FF-RD03 or any other research criterion.

## Required next decision

Authorize or decline a bounded synthetic-only provider evaluation, with an exact route and project allowance, after commercial/privacy review. Preferred order: BRIA matting alpha output → FLUX precise upscale → native Runway expand after the framing correction receives Linux/deployed verification. If authorization or a supported contract is unavailable, retain the capability gaps above; do not substitute a new GPU backend or mark the R&D criteria complete from documentation and deterministic fixtures alone.
