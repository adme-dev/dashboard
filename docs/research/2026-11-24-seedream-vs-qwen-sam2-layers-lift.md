# Seedream vs Qwen Image Layered + SAM-2 for Video Studio "Separate layers" and "Lift"

Date: 2026-11-24. R&D only: no product code changed, nothing called with a key, **no live test run**.

## Recommendation

**Use BytePlus Seedream for "Separate layers", and try it first for "Lift". Do not set up Replicate yet.**

- **Separate layers → Seedream 5.5** (`dola-seedream-5-5-261028`). It does real decomposition: one flattened image in, one filled base image plus separate RGBA PNG layers out, with position, stacking order and a name for each layer. That is more than Qwen Image Layered returns.
- **Lift → Seedream first, SAM-2 only if a fidelity test fails.** Seedream has no segmentation or mask output. It can lift a region you point at (a box from the brush mask), but it redraws the pixels. SAM-2 gives an exact mask so we cut the original pixels. Whether the redraw is close enough for logos and brand graphics is the one open question, and it needs a paid test.
- **`mask-only`** needs no model at all: it stores the brush mask.

The decision is Paul's on two points: about US$20 of test spend, and whether client creative may be sent to a ByteDance company with processing in Malaysia.

## 1. What Seedream is now, and what "layers" means

Models on ModelArk today ([model list](https://docs.byteplus.com/docs/en/modelark/model-list.md)):

| Model | ID | Layer decomposition | RGBA generation |
|---|---|---|---|
| Seedream 5.5 | `dola-seedream-5-5-261028` | base + up to 99 layers, rich-text OCR | from text or images |
| Seedream 5.0 pro | `dola-seedream-5-0-pro-260628` | base + up to 16 layers | only from one alpha PNG input |
| Seedream 5.0 flash | `dola-seedream-5-0-flash-260915` | base + up to 16 layers | only from one alpha PNG input |
| Seedream 5.0 lite, 4.5, 4.0 | `seedream-5-0-260128` etc. | no | no |

"Layers" in their docs is real decomposition, not instruction editing. From the [API reference](https://docs.byteplus.com/docs/en/modelark/image-generation-api.md): "Layer decomposition automatically decomposes subjects, backgrounds, text, and other content in a single image into one base image and multiple independently editable layers. Each layer is a PNG image with an alpha channel."

What comes back ([5.0 pro tutorial](https://docs.byteplus.com/docs/en/modelark/seedream-5-0-pro.md), "About the returned response"):

- `data[0]`: the base image (`z_index: 0`), with the removed areas filled in.
- `data[1..n]`: one cropped RGBA PNG per layer, each with `z_index`, `bounding_box.absolute` (pixels), `bounding_box.normalized` (0 to 999), `name` and `description`.
- Seedream 5.5 can also return text content, position and approximate style for regular text layers ([5.5 tutorial](https://docs.byteplus.com/docs/en/modelark/seedream-5-5.md)).

You can steer it three ways: no prompt (automatic), a prompt naming the elements, or `<bbox>x1 y1 x2 y2</bbox>` tags in normalised coordinates.

I downloaded three of BytePlus's published sample layers and checked the files: all are 8-bit RGBA PNGs (for example 1659x336 and 2173x1930), and the sample base is a 2048x2048 JPEG. That confirms the output format; it says nothing about quality on our images.

## 2. Can it do Lift?

Partly.

- There is **no segmentation endpoint and no mask output**. `object-segmentation` (mask out) cannot be served by Seedream.
- Lift can be done as a directed decomposition: turn the brush mask into a bounding box, prompt "decompose only the element at `<bbox>…</bbox>`", cap the output at two images. You get the lifted RGBA layer and a healed base plate in one call. A mask can be derived from the layer's alpha.
- The catch: the layer is generated, not cut. Its size is "close to" the requested resolution, and its pixels are the model's rendering of the object. For a client logo or product shot that may or may not be acceptable. SAM-2 (mask) plus cutting the original pixels is exact by construction.
- A box is coarser than a brush stroke. The docs say you can also mark the element with doodles on the input image, but that is less precise than SAM-2's point and box prompts.

## 3. API facts

| Item | Value | Source |
|---|---|---|
| Endpoint | `POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations` | [API reference](https://docs.byteplus.com/docs/en/modelark/image-generation-api.md) |
| Auth | `Authorization: Bearer <ModelArk API key>`; keys are per region | [API key](https://docs.byteplus.com/docs/en/modelark/api-key.md), [regions](https://docs.byteplus.com/docs/en/modelark/region-availability.md) |
| Switches | `layer_decomposition: true`, `layer_decomposition_options.max_images` (2 to 100, default 30, 5.5 only), `text_recognition` | API reference |
| Input | exactly one image, URL or `data:image/png;base64,…`; jpeg, png, webp, bmp, tiff, gif, heic; up to 30 MB; 512x512 to 6000x6000 total pixels; aspect 1:16 to 16:1 | API reference |
| Output | `response_format`: `url` (kept 24 hours) or `b64_json`; layers always PNG; base PNG or JPEG | 5.0 pro tutorial |
| Output size | `size`: `1K`, `1.5K`, `2K` or `auto`; output never exceeds 2K | API reference |
| Failure mode | if any layer fails, the whole request fails | API reference |
| Watermark | `watermark` defaults to `true`; we must send `false` | API reference |
| Rate limit | 500 images per minute per model; a decomposition request pre-deducts `max_images` | model list |
| Latency | not documented by BytePlus; **unmeasured** | none |
| Region | Johor, Malaysia (`ap-southeast-1`) only for these models. No Australian region. Requests "may spill over to EU" | regions |
| Data handling | processed in Malaysia, Indonesia and/or EU/EEA; not used for training without authorisation; filter-flagged input and output kept 180 days in Malaysia | [data processing](https://docs.byteplus.com/docs/en/modelark/BytePlus_ModelArk_Data_Processing.md) |
| Availability | Australia is on the supported-country list | [availability](https://docs.byteplus.com/docs/en/modelark/availability.md) |
| Signup | BytePlus account, activate each model on the Model activation page, create an API key | [quick start](https://docs.byteplus.com/docs/en/modelark/quick-start.md) |

Not confirmed from the docs: whether the new-user free quota covers image models (the [free quota page](https://docs.byteplus.com/docs/en/modelark/free-inference-quota.md) only talks about tokens), and what payment method or identity check signup asks for. Paul will see both when he signs up.

### Pricing (USD, per image, [pricing page](https://docs.byteplus.com/docs/en/modelark/model-pricing.md))

| Model | Input image | Each output image (base and every layer) |
|---|---|---|
| Seedream 5.5 | $0.008 | $0.020 up to about 1.5K; $0.035 above that, up to 2K |
| Seedream 5.0 pro (decomposition) | first free | $0.0225 up to 1.5K; $0.045 above |
| Seedream 5.0 flash | free | $0.018 |

Cost scales with the number of layers, and each layer is billed at its own size tier.

| Job on Seedream 5.5 | Cost at up to 1.5K | Cost at 2K |
|---|---|---|
| Lift (base + 1 layer) | $0.048 | $0.078 |
| Separate layers, 8 layers | $0.188 | $0.323 |
| Separate layers, default cap (base + 29) | $0.608 | $1.058 |
| Worst case, 100 images | $2.008 | $3.508 |

We should always send our own `max_images` (say 12) so a job cannot cost more than about $0.25.

## 4. Comparison

| | Seedream 5.5 | Qwen Image Layered | SAM-2 |
|---|---|---|---|
| What it does | base + up to 99 RGBA layers, with boxes, order, names, OCR | N full-canvas RGBA layers, no metadata | masks only, no pixels |
| Steering | prompt, boxes, automatic | layer count and prompt | points, boxes, automatic |
| Cost | $0.05 to $0.25 typical (above) | Replicate: $0.03 per run + $0.01 per layer (fast) or $0.07 + $0.01 (regular), so 4 layers is $0.07 to $0.11. fal: $0.05 per image | Replicate: about $0.027 per run |
| Latency | undocumented, unmeasured | unmeasured here; our existing HF Space path allows 120 s | Replicate says typically within 28 s on an L40S, varies a lot |
| Max output | 2K | roughly 1K class (not verified) | same as input |
| Data location | Malaysia, possible EU spill | US | US |
| Worker integration | one synchronous `fetch`, bearer key, base64 or URL in, base64 or URL out | create prediction, then poll or webhook | create prediction, poll, then cut pixels ourselves in the Worker |
| Tested by us | no | yes, in Banner Studio via the public HF Space | no |

Sources: [Replicate qwen-image-layered](https://replicate.com/qwen/qwen-image-layered) (billing config embedded in the page), [Replicate meta/sam-2](https://replicate.com/meta/sam-2), [fal qwen-image-layered](https://fal.ai/models/fal-ai/qwen-image-layered/llms.txt).

Honest reading:

- **Quality is unproven on our content.** The claim that Seedream decomposes better rests on BytePlus's docs and samples and on its richer output contract, not on a side-by-side test. Qwen's weakness for us is known from Banner Studio use: fixed layer count, no positions or names, soft edges.
- **Cost is similar** for small jobs and higher for Seedream on busy images, unless we cap `max_images`.
- **Integration is easier with Seedream**: one request, no polling, and the response already has what the `layer-package` derivative needs. The asset-intelligence Worker is a queue consumer, so a slow synchronous call is fine.
- **Neither option keeps data in Australia.**

Two repo facts that matter:

- `server/utils/qwenLayerDecomposer.ts` already runs Qwen Image Layered for Banner Studio through the public Hugging Face Space (free, shared queue, 120 s timeout). So Qwen is not new to us, and that path is a working baseline for a comparison.
- The registry's `provider` union in `server/utils/video-asset-intelligence/registry.ts` has no BytePlus entry; adding one is part of the build. The `replicate/qwen-image-layered` and `replicate/sam-2` rows are labels with no runtime, and many tests reference those IDs.

## 5. What Paul needs to do

1. **Decide on data location.** Client images would go to BytePlus (ByteDance) and be processed in Malaysia, with possible EU spill-over and 180-day retention of anything the content filter flags. If that is not acceptable for client work, stop here and use Qwen + SAM-2 on Replicate (US) instead.
2. **Create a BytePlus account** at console.byteplus.com, open ModelArk in region `ap-southeast-1`, and on the Model activation page activate **Dola Seedream 5.5** (and 5.0 flash if we want a cheaper tier).
3. **Create a ModelArk API key** in that region and add it himself as a secret on the **asset-intelligence Worker** (not on Pages, which is at its binding cap):
   `cd workers/asset-intelligence && wrangler secret put BYTEPLUS_ARK_API_KEY`
   The key should not be pasted into chat or committed.
4. **Approve about US$20** of test spend. That covers roughly 100 decompositions and 100 lifts at 1.5K.
5. **Set a spend alert or cap** in the BytePlus billing console if one is offered.

## What is left

- A paid bake-off on about 10 real agency images (ad with text and logo, product on a background, a busy scene): Seedream 5.5 vs 5.0 flash vs the existing Qwen path for layers, and Seedream bbox lift vs a plain cut for Lift. Measure latency, edge quality, and how faithful the lifted pixels are.
- If lifted pixels are not faithful enough, add SAM-2 for Lift and `object-segmentation`. That means a Replicate account and a `REPLICATE_API_TOKEN` secret on the same Worker.
- Confirm at signup whether a free trial quota applies to image models and what payment method is required.
