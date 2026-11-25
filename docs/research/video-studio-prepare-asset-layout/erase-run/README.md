# Erase run — what "Erase and heal" actually does (2026-11-24)

Run locally: the repository's own `runAssetIntelligenceProvider` (`workers/asset-intelligence/src/providers.ts`) called against Workers AI through `wrangler dev`, with a synthetic 16:9 test picture and in-memory storage. No database, no R2, no production data.

## Findings

1. **"Erase and heal" cannot succeed today.** The worker sends `{ prompt, image, mask }` to `@cf/black-forest-labs/flux-1-schnell`, which is a text-to-image model that accepts only `prompt`, `steps` and `seed`. Workers AI rejects the call:

   `AiError: 5006: Error: Additional or unevaluated properties '/image, /mask' at '/' not allowed`

   Every erase job therefore ends as failed.
2. **The mask is never read as a picture.** `mask` is passed as the storage key string (`job.brushMaskKey`), not as image data. So the misalignment I flagged in the layout report is real in the client (fixed in the Prepare workspace PR) but had no effect server-side, because the mask was never used.
3. **For a video asset the worker sends the whole video file** as the "image" (`fetchAssetBytes` reads the asset's own object), which an image model cannot use.
4. **The other four tools do not run either.** Lift, Remove background and Separate layers are not in `QUEUE_SUPPORTED_ACTIONS`, so they are saved as "blocked — not production-enabled". "Mask only" copies the painted PNG and nothing else.
5. **Workers AI's true masked-inpainting model is gone.** `@cf/runwayml/stable-diffusion-v1-5-inpainting` returned `5028: deprecated on 2026-11-20`.

## A route that does work (tested, not built)

`@cf/black-forest-labs/flux-2-klein-4b` with the green highlight baked into the picture and the instruction "remove everything covered by the green highlight" removed the sign in about 3 seconds:

| Source | Sent to the model | Result |
|---|---|---|
| ![source](./source-16x9.png) | ![highlighted](./highlighted-16x9.png) | ![result](./flux2-highlight-baked-in.jpg) |

Sending the picture and a separate black-and-white mask did nothing (sign still there): [result](./flux2-separate-mask.jpg).

Limits of that route: the model redraws the whole picture, so areas outside the highlight shift slightly (note the added shadow and sand texture); output is about 1 megapixel JPEG; one test picture only.

## What building it needs

- A same-origin way for the browser to read the picture (thumbnail and stream currently redirect to storage with no CORS, so the browser cannot bake the highlight in), **or** image compositing inside the worker.
- A decision on the redraw drift: accept it, or composite the result back through the mask so only the painted area changes.
- Alternatively an external inpainting provider. The registry already anticipates Replicate and Bria routes.
