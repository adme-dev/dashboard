# Seedance 2.5 generation

New video generation defaults to `aigateway/seedance-25-i2v` or
`aigateway/seedance-25-t2v`. Both use Cloudflare's
`bytedance/seedance-2.5` model and enable native audio. Historical Seedance
2.0 IDs retain their existing provider mappings so saved jobs remain accurate.

The [published input schema](https://developers.cloudflare.com/ai/models/bytedance/seedance-2.5/schema-input.json)
was checked on 8 October 2026: 4–30 seconds, 480p or 720p, and prompts up to
2,000 characters. Both the HTTP endpoint and MCP proposal path validate the
prompt limit before reserving budget or persisting a confirmable proposal.
The budget estimate is conservatively rounded to 24 US cents per second
from the published 720p non-video-input price of $0.2312 per second.

Image-to-video still requires approved source assets. Vehicle text-to-video
remains blocked. The model's reference-video, extension, and end-frame features
are not exposed by this upgrade.

Release the Pages app and the separate `workers/video-generation` queue
consumer from the same current-main source: the worker bundles the registry
and input mapper. Run `pnpm deploy:check` before the Pages deploy and use the
repository's `pnpm deploy:*` scripts. Verify the model picker, a completed
five-second job, established navigation, and QR Codes before production release.

A direct API smoke test on 8 October 2026 used the same provider adapter and
returned a completed 1280×720 H.264 clip with AAC audio (5.056 seconds).
Transcription verified the complete requested sentence. The first attempt
was rejected by the provider with a copyright flag; a distinctive original
cube-shaped robot succeeded. The output was delivered as a local MP4, rather
than inserted into an AV project or counted as an application job.
