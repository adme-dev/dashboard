## Superseding CI checkpoint — 27 October 2026, 15:12 UTC

Corrected full CI `40519026264` succeeded on `7eb52a6736989aacb3c4bd62ac086baf8a1bf0f4`, including production build, all six exact-artifact startup/codec checks, 20,631 passing tests / 3,809 optional skips, and remaining mandatory checks. Production app source remains `fb065b7d2fabc4c94c2aff490b1f35114a6aab7f` at this checkpoint. The next reviewed PNG source-integrity increment is candidate-qualified locally in [INGEST-SOURCE-INTEGRITY.md](INGEST-SOURCE-INTEGRITY.md); its release remains separate. Native canary admission remains disabled and the specific one-run approval unanswered. Production OpenAI key presence is false; no live provider request occurred.

# Banner release verification — 28 October 2026

The editor/export release is deployed and passes the bounded synthetic checks below. The full editable-artwork PRD is incomplete. Native execution and live AI-provider acceptance require the specific approvals described below.

## Deployed editor and downloads

- Pages project: `agency-dashboard`, production/main; source `fb065b7d2fabc4c94c2aff490b1f35114a6aab7f`, including main `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`.
- Deployment: `7aed0def-b310-4d4b-85e9-8ed8a3ef73cb`. Cloudflare readback confirms success.
- Final guarded build: raw 25,394,066 / 25,468,928 bytes; gzip 7,441,981 / 9,750,000 bytes. All six actual-artifact startup/codec checks pass. Limits were unchanged.
- Private renderer: source `8326ba1c6`, version `4f21784e-a014-48be-8b8c-9f14f1bb42ee`, with workers.dev and preview URLs disabled.
- Actual editor downloads pass: PNG 640×360, JPG 2× 1280×720, GIF 640×360 with 50 frames at 100ms and seven distinct decoded frames. The saved private downloads match captured hashes; unauthenticated GET/HEAD return 401. Signed-upload rendering passes.
- The first history read after new PNG export `448ccd1b-6fd8-422a-95ff-cfe273baba47` contains that new row. Its 35,124 bytes match SHA-256 `25e801dee9da48cc0b96d84c7b4b9819d202fb291e0d79ca7096e183311f557c`. This accepts the `queryRowsFresh` history repair.
- Synthetic save/reopen, exact undo/redo, animation persistence, HTML export and Banner/QR navigation passed. Existing customer project revision and canvas hash remain unchanged.

The actual downloaded files and sanitized JSON receipts are in `output/banner-release-acceptance-20261027/index.html` in the original workspace. [Hosted raster acceptance](HOSTED-RASTER-ACCEPTANCE.md) retains the chronological hashes and earlier checkpoints; this report supersedes its pending-history-release status.

## CI fixture correction

Run `40508897634` passed the database gates, production build and artifact-isolation checks, then failed exactly two browser fixtures: 20,629 tests passed, two failed. It is not a green release run.

Both fixtures used default body margins inside a 4×3 viewport. Forced classic scrollbars reproduce both failures on macOS: the screenshot area becomes zero-width before decoding. The font was loaded and the GIF forbidden-API check had passed. The correction changes test layout only, retains classic-scrollbar coverage and adds independently decoded glyph/GIF pixel evidence. Production source, timeouts, security checks, generated HTML and workerd proof are unchanged. All 67 focused tests, including 15 real browser tests with no skips, and scoped lint pass. See [the reproduction and repair](RENDERER-CI-BROWSER-REPAIR.md). The corrected source still requires its full CI rerun; PR 720 remains draft pending that result and final review.

## Native registry publication and private deployment

The retained image is now published. Fresh registry GETs by tag and immutable digest return the exact original manifest bytes; the remote config matches exactly, and every required blob has a matching descriptor readback.

- Manifest: `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`.
- Config: `sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805`.
- Repository: `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/banner-engine-native-canary`; tag `qualified-20261027-12158e33`.
- All 24 original compressed layers, config and Docker schema2 manifest were preserved. No rebuild, image-store change, recompression or image execution occurred.
- Publication used official regctl v0.11.7, binary SHA-256 `8ac077a1eeb834d3053714e86ccbd838d0da46567df8cd7c2695d1a19135bf60`, with serial commands and bounded internal retries. Eight offline harness checks passed. Earlier Docker EOFs and the first serial pass's local timeout remain failed historical receipts; a size-based continuation verified and reused existing blobs before completing publication in 858.58 seconds.
- Final sanitized receipt: `/private/tmp/banner-serial-upload-20261027/publication-sized-receipt.json`. All temporary registry credential files were removed.

The dedicated Worker `banner-engine-native-canary` was deployed with admission disabled from the same current source as Pages. Bundle SHA-256: `d3a47e5a509e0bd5e108fa053eb8bb1b94216daf420970c0cc6ad3bf9e86d1d9`; disabled config SHA-256: `46425991a92d803aedc160fedc414b7f62afd4af0e5c4d2788b3ec9a304970dd`.

- Worker version: `90f29fcc-73b6-461a-922d-5181b2ca061b`; deployment: `4dca3f63-ea82-429c-aeb2-c9b74feb01ec`.
- Container application: `a036a963-5c0c-475a-8f3f-46e515e51cc1`, maximum one standard-3 instance.
- Cloudflare readback confirms workers.dev and preview URLs disabled and `BANNER_NATIVE_CANARY_ENABLED=false`.
- Private status RPC at `2026-10-27T14:05:58.959Z` returned `record:null`: the durable native invocation is unconsumed. The loopback invoker was stopped and its nonce file removed.

## Explicit approval boundaries

Automatic approval review rejected the attempted canary-enable command before execution. Its stated reason was that enabling/deploying the native canary would authorize external compute with potential cost and irreversible one-time consumption, which broad autonomy instructions did not specifically authorize. The safer alternative was to leave admission disabled. Readback confirms it remains disabled; no enabled config or invocation marker was created. No workaround or native run occurred.

The concrete remaining native action is one synthetic qualification using this exact published image, one container, two sequential fixed engine fixtures, a permanent consumption record and a five-minute destruction deadline, followed by verified destruction and admission disable. It does not activate production engine jobs or use customer artwork.

An earlier automatic approval review also rejected live AI-provider verification because of external transmission/provider spend. That request remains unexecuted. Separate approval is needed for a synthetic lettering test using only test wording/style data. No new login is required by either prepared action, but existing account capability must still be valid when approved.

Registry publication and private deployment do not prove native rendering, provider quality, full creative reconstruction, cross-role acceptance or duplex/CMYK/print readiness. Those broader requirements remain open in the completion audit.
