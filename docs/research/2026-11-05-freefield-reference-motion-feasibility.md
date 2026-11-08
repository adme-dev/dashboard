# FF-RD04 and FF-RD05 — reference sheet and camera-motion feasibility

**Reviewed:** 5 November 2026

**Status:** Discovery complete for the current integration. Provider execution and semantic evaluation were not performed. No feature is promoted, no commercial use is approved, and no acceptance fixture was generated.

**Our source reviewed:** `1f502c3ebdda0b6bc34cab86fe9681b9be3612f1` (5 November 2026, `fix(video): keep browser editor out of the Pages SSR bundle`). The 4 November R&D note used baseline `c39b8b7f4a79f73350e2a1c4620075f87881a6c5`. This pass did not change application code.

**Freefield inspiration revision:** [`neuregex/freefield@e5fa71b`](https://github.com/neuregex/freefield/tree/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca). Manifests were read from that commit. They were not re-run.

**Parent review:** [2026-11-04 Freefield R&D](./2026-11-04-freefield-video-rd.md). Storyboard boundaries stay in the [PRD](../superpowers/specs/2026-11-04-video-storyboard-producer-prd.md) and [task list](../superpowers/plans/2026-11-04-video-storyboard-producer.md).

**Evidence captured this pass:** gitignored `.verification/video-rd/grok/2026-11-05-ff-rd04-rd05/`. The Cloudflare input schema JSON listed in that directory's README was saved. The Seedance model page, Freefield manifests, Cameraman model card, MiniMax H3 licence, and LTX-2.x licence were read on 5 November 2026 and were not retained in full. No credentials, customer media, weight downloads, package installs, paid generations, or provider calls were made. Other partner terms were not reviewed.

## Decision

| Item | Decision | What that means |
|---|---|---|
| FF-RD04 structured reference-sheet preview and style consistency | **Defer** | No eligible existing integration submits a role-preserving reference sheet or a distinct style input. Published Seedance reference-image fields are unwired and disagree with the page's broader marketing sentence. Semantic quality is unevaluated. |
| FF-RD05 Freefield camera-copy | **Reject** for product promotion | The [Cameraman v2 card](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2) limits the adapter to research and non-commercial use. The [reviewed manifest](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/camera-copy/app.json) runs that LTX-2.3 adapter on LTX-2.5 and says it has not been run there. It is not integrated here. |
| FF-RD05 Freefield reshoot | **Reject** for product promotion | The [MiniMax H3 community licence](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE) excludes the US, UK, EU and Republic of Korea and requires separate authorization above USD 20 million yearly revenue. The [reshoot manifest](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/reshoot/app.json) leaves a turbo weight's licence unstated and emits a warp-guide video beside the result. It is not integrated here. |
| FF-RD05 as prompt camera language, generic image-to-video, Vidu start/end frames, PixVerse `motion_mode`, or Seedance `camera_fixed` | **Reject** as this capability | Those are different controls. None copies a reference camera path or performs a measured reshoot. |
| A later look at Seedance `reference_video` | **Defer** | The published schema has one optional video string described as style/motion guidance. This repository does not send it. Motion semantics, rights and full-duration behavior are unknown. |

No new provider, GPU runtime, weight host, or backend is selected.

## What was inspected

Application authority:

- `server/utils/video-generation/modelRegistry.ts` and `types.ts`
- `server/utils/video-generation/cfInputs.ts` and `providers/aiGatewayProvider.ts`
- `server/api/agency/video/generation/jobs.post.ts`
- `server/utils/video-generation/compliance.ts` and `sourceAssets.ts`
- `app/utils/videoGenerationForm.ts` and `app/utils/video/generationTemplates.ts`
- `shared/video/storyboardRecipes.ts`, `server/utils/video-storyboard/planning.ts`, `server/utils/video-storyboard/references.ts`
- Storyboard production and continuity filenames named by T10–T14

Provider documents read on 5 November 2026. Schema JSON was saved. The other pages were not retained in full. This list is the review boundary. It is not a review of every partner's terms.

- [Seedance 2.0 input schema](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/schema-input.json) and [Seedance 2.0 Fast input schema](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0-fast/schema-input.json)
- [Wan 2.7 I2V](https://developers.cloudflare.com/ai/models/alibaba/wan-2.7-i2v/schema-input.json), [Hailuo 2.3 Fast](https://developers.cloudflare.com/ai/models/minimax/hailuo-2.3-fast/schema-input.json), [Hailuo 2.3](https://developers.cloudflare.com/ai/models/minimax/hailuo-2.3/schema-input.json), [Runway Gen-4.5](https://developers.cloudflare.com/ai/models/runwayml/gen-4.5/schema-input.json), [Vidu Q3 Pro](https://developers.cloudflare.com/ai/models/vidu/q3-pro/schema-input.json), [PixVerse v5.6](https://developers.cloudflare.com/ai/models/pixverse/v5.6/schema-input.json), [Veo 3.1](https://developers.cloudflare.com/ai/models/google/veo-3.1/schema-input.json), and [Veo 3.1 Fast](https://developers.cloudflare.com/ai/models/google/veo-3.1-fast/schema-input.json) input schemas
- [Seedance 2.0 model page](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/), including its parameter table and examples
- [Cameraman v2 model card](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2)
- [MiniMax H3 Community License Agreement](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE), license date 2 August 2026
- [LTX-2.x Community License Agreement](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x), license date 11 August 2026, amended 29 October 2026

## Current implemented baseline

The active generation catalogue is Cloudflare AI Gateway. Selectable models on this revision are only:

| Registry id | Gateway model id | Registered mode | Extra capability flags |
|---|---|---|---|
| `aigateway/seedance-i2v` | `bytedance/seedance-2.0-fast` | image-to-video | extend, end frame and video-to-video all false |
| `aigateway/seedance-2-i2v` | `bytedance/seedance-2.0` | image-to-video | same conservative flags; native audio flag true |
| `aigateway/wan-i2v` | `alibaba/wan-2.7-i2v` | image-to-video | conservative flags |
| `aigateway/hailuo-i2v` | `minimax/hailuo-2.3-fast` | image-to-video | conservative flags |
| `aigateway/vidu-i2v` | `vidu/q3-pro` | image-to-video | `endFrame: true`; extend and video-to-video false |

Runway Gen-4.5 (`runwayml/gen-4.5`), PixVerse v5.6 (`pixverse/v5.6`), Hailuo text-to-video (`minimax/hailuo-2.3`), Veo 3.1 Fast and internal Veo 3.1 are registered with `defaultEnabled: false` or an internal surface. The dormant `gateway/i2v-dormant` model is `safetyClass: 'disabled'`. MuAPI ids are absent from the registry. No registry entry publishes a weight filename, checkpoint step, or content hash. The gateway model string is the identity this integration can name.

`VideoGenerationCapabilities` contains three booleans: `extendVideo`, `endFrame`, and `videoToVideo`. There is no reference-sheet, style-asset, camera-reference, or reshoot flag. `listVideoGenerationModels()` keeps `videoToVideo` and `extendVideo` false for every model. The unit test locks that shape.

The job API accepts at most two source ids. A second id is allowed only when `capabilities.endFrame` is true, which today is only Vidu. The provider copies URL 0 to the start image and URL 1 to Vidu `end_image`. The composer draft keeps a single `sourceAssetId`. `supportsAdvancedVideoAction()` exposes extend, end-frame, and video-to-video, and video-to-video stays false.

Recipe controls in `StoryboardRecipeValuesSchema` are `targetFormat`, `durationSeconds`, one `primaryMovement` (`static`, `push_in`, `pull_out`, `pan_left`, `pan_right`, `orbit`), `visualLook`, `pacing`, and `extraDirection`. The schema comment and `storyboardRecipeGuidance()` label movement and look as prompt guidance. A request that supplies two movements, such as `['pan_left', 'orbit']`, fails validation. Planning writes that guidance string into every generated shot's `visualDirection` and sets `referenceRoles` to an empty array. Catalogue role hints (`product`, `presenter`, `location`, `style`) therefore do not become shot bindings or provider inputs by themselves.

Generation templates such as "slow cinematic camera push-in", "360-degree orbit", and "showroom walkaround" are prompt strings on an image-to-video draft. They do not set a provider camera field.

Storyboard reference sets pin a role, source kind, asset id, and content hash, with a separate project usage approval. A generation-approved source can still have unknown project usage rights. Changed bytes, revocation, wrong-client access, and brand-kit changes fail closed. Those pins are provenance for assembly. This pass found no code that places them into `buildCfVideoInputs()`.

T10–T14 files named by the plan (`production.ts`, `videoStoryboardProduction.ts`, `continuity.ts`, `audioDirection.ts`, and their planned tests) are not in this revision. `prepareContinuitySource` and `ShotProductionAttempt` are not implemented. R1 reference and recipe behavior is present. R2 production and R3 continuity are not.

## Prompt language versus enforced inputs

An enforced input, for this note, is a field present in the provider's published input schema and actually emitted by `buildCfVideoInputs()` for a request the job API can accept.

| Surface | What the operator can say or store | What the current Gateway request can contain |
|---|---|---|
| Recipe `primaryMovement` / `visualLook` | One editorial token, copied into shot direction text | Prompt string only |
| Generation-template camera sentences | Free prompt text, including preservation sentences | Prompt string plus one start image on image-to-video |
| Storyboard roles | Up to four of product, presenter, location, style, pinned to canonical assets | Nothing in the provider body |
| Vidu second source | Approved end frame when the model flag allows it | `start_image` and `end_image` |
| Seedance `camera_fixed` | Not exposed | Not sent. The 5 November schema describes it as a boolean that fixes camera position |
| Seedance `reference_images` | Not exposed | Not sent. Schema max is 4 URLs, and the full-model description says they cannot be combined with 1080p or first/last-frame images |
| Seedance `reference_video` | Not exposed | Not sent. Schema type is one string, described as style/motion guidance |
| PixVerse `motion_mode` | Not exposed | Not sent. Schema enum is `normal` or `fast`, with fast limited to duration 5 and unavailable at 1080p |
| Hailuo `prompt_optimizer` | Not exposed | Hard-coded `true` on Hailuo requests |
| Freefield azimuth, elevation, distance, sheet image, style gallery, reference clip | Not in our catalogue | No corresponding request |

Every fetched schema declares `additionalProperties: false`. That declaration is the published contract. Live gateway enforcement of it was not tested, so it does not prove that an unnamed field would be rejected. The established fact is narrower: `buildCfVideoInputs()` omits reference-sheet, reference-video, and camera-control fields. A field listed in a schema stays unused by this integration until that mapper emits it and the job policy accepts the bytes.

### Gateway schema inventory, fetched 5 November 2026

Saved copies are under `.verification/video-rd/grok/2026-11-05-ff-rd04-rd05/schemas/`. Each item below links to the public schema that was stored.

[`bytedance/seedance-2.0`](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/schema-input.json) properties: `prompt`, `image`, `reference_video`, `last_frame_image`, `reference_images` (maxItems 4), `duration` 4–12, `resolution` `480p|720p|1080p|4k`, `aspect_ratio`, `fps` const 24, `camera_fixed`, `generate_audio`, `watermark`, `seed`, `use_virtual_avatar`. Required array: `prompt`, `duration`, `resolution`, `aspect_ratio`, `fps`, `camera_fixed`, `watermark`, `use_virtual_avatar`.

[`bytedance/seedance-2.0-fast`](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0-fast/schema-input.json) has the same property names. Its resolution enum is `480p|720p`. Its `reference_images` description says they cannot be used with first/last-frame images. Required array matches the full model.

The [Seedance 2.0 model page](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/) introduction says the model supports "up to 9 images, 3 videos, 3 audio files", video editing, and video extension. The fetched schema has four reference images, one reference-video string, and no audio-input property. The page's own examples omit `fps`, `camera_fixed`, `watermark`, and `use_virtual_avatar` even though the schema marks them required. Pricing rows distinguish video-input seconds from non-video-input seconds. Those rows are billing copy on that page. They are not a request our worker sends, and they do not prove a three-video or three-audio input. ByteDance's own product terms were not reviewed.

Our June-dated mapper emits `prompt`, clamped `duration`, `aspect_ratio`, `resolution`, optional `image`, and `generate_audio: true` on `bytedance/seedance-2.0` only. It does not emit the reference, last-frame, camera, fps, watermark, seed, or virtual-avatar fields. The fast registry entry lists `1080p`, while the fetched fast schema and mapper allow `480p` and `720p`. Whether the live gateway rejects the smaller payload was not tested. The unit test currently expects that smaller payload.

[`alibaba/wan-2.7-i2v`](https://developers.cloudflare.com/ai/models/alibaba/wan-2.7-i2v/schema-input.json) properties: required `image`, plus `prompt`, `negative_prompt`, `resolution` `720P|1080P`, `duration` 2–15, `seed`, `watermark`. No reference list and no camera field. A prompt that says "camera orbits" is text. Alibaba's terms were not reviewed.

[`minimax/hailuo-2.3-fast`](https://developers.cloudflare.com/ai/models/minimax/hailuo-2.3-fast/schema-input.json) properties: required `first_frame_image`, `prompt_optimizer`, `fast_pretreatment`, `duration` 6 or 10, `resolution` `768P|1080P`, plus `prompt`. The [non-fast Hailuo schema](https://developers.cloudflare.com/ai/models/minimax/hailuo-2.3/schema-input.json) does not require `first_frame_image`. Neither schema has a second image, a video reference, or a camera control. Our mapper always sets `prompt_optimizer: true` and `fast_pretreatment: false`. Optimizer behavior on preservation wording was not measured. Hailuo commercial terms were not reviewed. These schemas are not the MiniMax H3 weight licence.

[`runwayml/gen-4.5`](https://developers.cloudflare.com/ai/models/runwayml/gen-4.5/schema-input.json) properties: required `prompt`, `ratio`, `duration` 2–10, plus one `image_input`, `seed`, and `content_moderation.public_figure_threshold` (`auto` or `low`). No reference video. The model is not selectable. Runway's terms were not reviewed.

[`vidu/q3-pro`](https://developers.cloudflare.com/ai/models/vidu/q3-pro/schema-input.json) properties: required `duration` 1–16 and `resolution` `540p|720p|1080p`, plus `prompt`, `start_image`, `end_image`, `audio`, and text-to-video-only `aspect_ratio`. `end_image` must accompany `start_image`. That is the one extra input this integration emits. It constrains the last frame. It does not accept a style sheet or a camera clip. Vidu's terms were not reviewed.

[`pixverse/v5.6`](https://developers.cloudflare.com/ai/models/pixverse/v5.6/schema-input.json) properties: required `prompt`, `duration` 5, 8 or 10, `aspect_ratio`, `quality`, `generate_audio`, plus one base64 `image_input`, `negative_prompt`, `seed`, and `motion_mode`. `motion_mode` is a speed enum. It is not sent. PixVerse's terms were not reviewed.

[`google/veo-3.1`](https://developers.cloudflare.com/ai/models/google/veo-3.1/schema-input.json) and [`google/veo-3.1-fast`](https://developers.cloudflare.com/ai/models/google/veo-3.1-fast/schema-input.json) properties: required `prompt`, string `duration` `4s|6s|8s`, `aspect_ratio`, `resolution` `720p|1080p`, `generate_audio`, plus one base64 `image_input`. Registry modes for both Veo entries are text-to-video, so the job API does not offer them as image-to-video. Google's generative-media terms were not reviewed.

No fetched schema contains azimuth, elevation, distance, a warp-guide output, a role-addressed sheet, or an ordered list of camera moves.

## Freefield manifests at e5fa71b

These describe upstream workflows. They are not our runtime.

**Genjutsu** ([`apps/genjutsu/app.json`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/genjutsu/app.json)) takes one reference-sheet image and a prompt that names elements by position. The sheet is an IC-LoRA guide, not the first frame. Weights named in the manifest:

- `Lightricks/LTX-2.5` int8 transformer, Gemma text encoder, video VAE, audio VAE, all `license: "LTX-2.x Community License"`, `gated: true`
- `Lightricks/LTX-2.5-22b-IC-LoRA-Ingredients` file `ltx-2.5-22b-ic-lora-ingredients-0.9.safetensors`, same licence, gated

Custom node `Lightricks/ComfyUI-LTXVideo` commit `44c8a36b7c31ee00b4271daed11dc2a4aa481140`. The manifest says "Not run yet." No output hash or semantic result exists even in the upstream note.

**Mixed Media** ([`apps/mixed-media/app.json`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/mixed-media/app.json)) restyles a clip. A named look is a prompt string applied while FLUX redraws the first frame, and an edge guide holds structure. The manifest's own lab note says a look placed only in the prompt returned photoreal footage for 14 of 16 looks, and that strength 1.0 held the look for about the first second while 0.7 held further. That is the author's report for run `20261023-124332-h100`, not a result we reproduced. The Union Control file is `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` on an LTX-2.5 graph. The manifest labels FLUX 3 Klein weights as gated under "FLUX Kommunity License". That licence text was not opened. This is a video-conditioned restyle, not a storyboard role sheet.

**Camera Copy** ([`apps/camera-copy/app.json`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/camera-copy/app.json)) takes a first-frame image plus a clip "whose camera motion you want". The manifest says Cameraman v2 was trained on LTX-2.3 and has not been run on 2.5. The adapter file is `Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2` / `LTX2.3-22B_IC-LoRA-Cameraman_v2_14000.safetensors`. The manifest licence string is "Research only, non-commercial (see model card)". The [Hugging Face card](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2), published 11 July 2026, says the same and reports checkpoint step 14,000, rank/alpha 64/64, and a limitation that complex compound motions may not transfer reliably. The [file page](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2/blob/main/LTX2.3-22B_IC-LoRA-Cameraman_v2_14000.safetensors) displays SHA256 `4e3bf4284158620cfb0874bd6774f5cc6fc8fc5b9a5474892efb2e31f696bacc`. That hash was not recomputed here because the weight was not downloaded.

**Reshoot** ([`apps/reshoot/app.json`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/reshoot/app.json)) takes a clip plus azimuth, elevation, and distance sliders. Outputs are node 38 "New angle" and node 41 "Warp guide". The manifest says the warp guide is the reprojection with holes in magenta, which MiniMax H3 fills. Named weights include MiniMax H3 int8 diffusion, Qwen3-VL text encoder, video and audio VAEs, MoGe (`MIT`), `Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1` at step 3500, and `lightx2v/Minimax-h3-Turbo` file `minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`. The turbo entry's licence string is "Not stated on the model card". CrossView node commit `fbb1e93c7193329ff3ce7c17f95166b539687876`. Upstream timing notes are the author's, not ours.

## Rights and commercial limits

This is a source reading, not a legal opinion or a clearance to ship.

**Cameraman v2.** The [model card](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2) says the adapter is for research and is not intended for commercial use. Agency client delivery would be commercial. Promotion is rejected on that text alone. The full card was read and not saved.

**LTX-2.x weights used by genjutsu, mixed-media, and camera-copy.** The [agreement](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x) read from Lightricks' repository, license date 11 August 2026 and amended 29 October 2026, requires entities with annual revenues of at least USD 10,000,000 to obtain a paid licence except for a narrow non-commercial purpose. Client production and end-user impact are outside that non-commercial purpose. The agreement also keeps use restrictions, output responsibility, and provenance/watermark obligations on the licensee. Several weights are gated. The full agreement was read and not saved. No Lightricks commercial agreement was requested or recorded.

**MiniMax H3.** The [2 August 2026 community agreement](https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE) defines the applicable territory as worldwide except the European Union, the United Kingdom, the Republic of Korea, and the United States. Section V.4 also restricts outputs outside that territory. Section IV.1 requires prior written authorization when commercial products and services generate more than USD 20 million yearly revenue. Section IV.2 requires the product UI to display "MiniMax H3". Exhibit A prohibits impersonation without consent and undisclosed machine-generated public information. Australia is not in the excluded-territory list. That fact does not authorize client videos, distribution into an excluded territory, or use of the unstated turbo weight. The full agreement was read and not saved. Hosted MiniMax API terms were not reviewed. This integration does not call those weights. The Cloudflare Hailuo model ids above are a different product surface, and their commercial terms were not reviewed either.

**Cloudflare partner models.** The [Seedance page](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/) labels the model third-party and links to [ByteDance's Seedance 2.0 page](https://seed.bytedance.com/en/seedance2_0). That ByteDance page was not reviewed. The schema describes `use_virtual_avatar` as a route for virtual avatars that would otherwise be blocked by face or deepfake detection. Real-person reference acceptance was not tested. No ByteDance order form, content-credential addendum, or agency approval is on file in this pass. Veo, Runway, Wan, Vidu, PixVerse, and Hailuo commercial terms were not opened. Schema shape for those ids is an integration finding, not a terms review.

**Our policy.** Vehicle text-to-video is blocked. Vehicle image-to-video requires an approved source asset and provenance (`userId`, `tenantId`, `projectId`, `idempotencyKey`). Approval is an authorization to use the asset, not a promise that the output preserves badging, proportions, or copy. Storyboard usage approval is a second, project-scoped decision.

No output from this pass is commercially approved.

## Provenance and identity requirements

Any later evaluation has to preserve these records before a human looks at pictures:

- Registry id, gateway model id, and the schema fetch date. A gateway id is not a weight hash.
- Recipe id and version, resolved values, and the exact prompt string after guidance is applied.
- Each reference role, source kind, asset id, content hash, and project usage-approval actor/time. Brand-kit hash when used.
- The constructed sheet's own hash and a map from sheet region to those source ids. The sheet is a derivative, not a replacement for the sources.
- The normalized provider body, including fields the schema allows and this code omits. Omission must stay visible. Dropping a reference and still running is a failed preparation, not a successful single-image fallback.
- Seed when the provider reports one. Unknown seed stays unknown. Replay is not promised.
- Output artifact role, media probe, duration, and content hash. A warp guide, edge map, or input clip cannot be stored as the final video.
- Separate execution status and semantic status. Job success does not approve identity.

Identity review for dealer material stays with a person: bodywork, grille, wheels, lamps, badging, proportions, and offer text. Generated pixels do not certify OEM identity. Required logos and exact copy stay in reviewed overlays. The parent note's preference still holds: if a future sheet experiment is authorized, use artistic brand material before accuracy-critical vehicle material. Hailuo's hard-coded prompt optimizer can change preservation wording before the model sees it. That rewritten prompt is not returned by our mapper, so a Hailuo run would need the provider's actual prompt, if available, before anyone treats the wording as what was enforced.

This pass scopes its own fixtures to owned synthetic media. A presenter-shaped still in that protocol is a geometric stand-in for the role. It is not a product rule against a later consented presenter reference. The [parent review](./2026-11-04-freefield-video-rd.md) excludes face swaps, identity replacement, and voice cloning. It does not exclude presenter references. The Seedance `use_virtual_avatar` description, the [Cameraman card](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2), and MiniMax H3 Exhibit A are limits on those named routes and weights. They are not a product-wide ban.

## Bounded fixture protocol

This protocol was not executed. No images were synthesized, no hashes were produced, and no scores exist.

This protocol uses fixtures created for this test and owned by the project. It does not use customer, dealer, OEM, or real-person media, and it does not download the Freefield sample files. That limit applies to this unevaluated protocol. It does not decide whether a later consented presenter reference can be used.

**FF-RD04 sheet, only after an integration actually sends the references**

1. Build four synthetic stills with unique geometric marks: a product-like object, a non-person presenter shape, a location card, and a style swatch. Record role, id, and content hash.
2. Compose one sheet, store its hash, and keep the region map. A reviewer must be able to see the sheet before any generation.
3. Prepare two requests with the same prompt: one that includes the provider reference field, and one that puts the same words in the prompt with a single unrelated start frame. If the reference field is absent from the submitted body, stop. Do not score the single-image run as sheet support.
4. Probe the returned file. Duration must cover the requested interval within one frame at the container frame rate. Sample the first frame, 25%, 50%, 75%, the last frame, and any shot change. Record whether each mark is present, whether the sheet's side-by-side layout leaks into the picture, and whether style survives past the first second.
5. A promote candidate needs the reference field in the submitted body, a human pass across the whole duration, and a new unreviewed state on every model or recipe revision. This pass does not create that candidate.

**FF-RD05 motion, only after a commercially eligible wired input exists**

1. Do not start with camera-copy or reshoot weights unless a later legal review accepts their licences in writing. That acceptance is not implied here.
2. Use one synthetic camera clip with a single movement, such as a slow push-in, and one synthetic start image with stable marks. Keep a second clip unused so a prompt-only run can be compared.
3. Submit the reference clip only through a field the schema and our request both contain. A prompt that names the move, a Vidu end frame, PixVerse `motion_mode`, or Seedance `camera_fixed` is a different arm, scored separately.
4. Compare requested and observed motion at the same timestamps as above. One primary move only. Record reversals, ignored motion, geometry drift, and extra objects that the prompt's equipment words may have introduced.
5. If a workflow can return a guide plus a fill, store them under different roles. Readiness fails when the guide is the only file.
6. Human review is required. No numeric quality score is defined, and none should be invented from a successful HTTP status.

Until those preconditions exist, the protocol stays on paper.

## How this maps to T10–T14

These tasks are not implemented. This research does not start them or satisfy their acceptance rows.

| Task | Still unimplemented | What FF-RD04 / FF-RD05 would require from it later |
|---|---|---|
| T10 take approval and accounting | No shot-attempt ledger or storyboard budget tests | A sheet or motion run would be a new quoted attempt with input hashes, model identity, unknown seed called unknown, and no free reroll. No spend is authorized by this note. |
| T11 coordinator and existing providers | No storyboard production workflow | T11's own rule is that an unsupported multi-reference input is not silently discarded. Today's mapper has nowhere to put a sheet or a camera clip, so the eligible route cannot execute either action. Vidu's end frame stays the only second-image route, and it is not a sheet or a reshoot. |
| T12 review, comparison, A15 | No shot-production UI or versioned semantic record | Full-duration identity and motion review belongs here once a real artifact exists. Comparison of unequal durations does not create reference support. A14/A15 remain pending. |
| T13 final-frame continuity | No continuity service | Continuation is a hashed last raw frame fed through the approved-source path. That is adjacent to Vidu's end frame and distinct from copying an external camera move. A11 remains pending. |
| T14 directed audio | No audio-direction service | Native-audio flags on Seedance 2.0, Vidu, and PixVerse do not carry style or camera references. Exact speech stays outside generated scenery. |

P9 recipe work already records movement as prompt guidance. That satisfies the need to label the control honestly. It does not implement FF-RD04 or FF-RD05.

## Tests run

Command, from the worktree, on 5 November 2026:

```bash
pnpm exec vitest run test/video-generation/modelRegistry.test.ts test/video-generation/cfInputs.test.ts test/video-generation/aiGatewayProvider.test.ts test/video/storyboardRecipes.test.ts test/video/storyboardReferences.test.ts --reporter=verbose
```

Result: 5 files passed, 57 tests passed, duration 1.24s. The run confirms the conservative capability flags, the current mapper's omission of reference and camera fields, Vidu's end-image behavior, recipe rejection of multiple movements, and reference approval/isolation behavior. The tests encode the 10 June 2026 schema comments. They do not prove that the 5 November 2026 Seedance required fields are accepted or rejected live.

No browser pass, render, or paid provider call was involved. There is no user-facing behavior change to verify.

## Evidence still required before any promotion

- A written product decision to wire a specific schema field, followed by code that refuses to drop undeclared references. Not started here.
- A live, credentialed schema check against the gateway for one synthetic request, recorded as accept or reject, with the normalized body. The published Seedance page currently disagrees with itself on required fields and on reference counts.
- Provider terms for that exact field, including real-person and video-input pricing. Seedance video-input prices on the model page are higher than still-image prices and were not quoted for an allowance.
- For any self-hosted alternative, a licence review that names the weight file, hash, territory, revenue threshold, and output-distribution rules. Camera-copy and reshoot fail that review on the documents read here.
- Full-duration human review of owned synthetic fixtures, with execution and semantic results stored separately. No media was produced, so this evidence does not exist.
- T10–T12 implementation and their own acceptance evidence before a storyboard control could expose the feature. T13 remains a different continuity design.

## Unknowns left open

Live gateway enforcement of the 5 November Seedance schema, including `additionalProperties` and the required fields, is unknown. Whether `reference_video` follows camera geometry, visual style, or subject identity is unknown. Whether `reference_images` preserve a composed sheet better than a single start frame is unknown. Hailuo optimizer rewrites are unknown. ByteDance, Google, Runway, Alibaba, Vidu, PixVerse, and Hailuo commercial terms were not reviewed. The MiniMax H3 and LTX-2.x agreements were read and not saved in full. No quality score, output hash, cost, or acceptance result is available because no generation ran.
