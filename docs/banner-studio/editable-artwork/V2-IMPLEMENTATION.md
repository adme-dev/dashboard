# PRD v2 implementation checkpoint

Managed platform QR continuation: [MANAGED-QR.md](MANAGED-QR.md). Earlier generation/lettering evidence remains separately labelled.
26 October 2026. G1 creation/styles and G2 selected lettering are implemented locally in the existing Banner Studio UI and API. Their real Nuxt browser proof uses explicit provider/auth/storage fixtures. It is not live OpenAI generation, hosted database persistence or complete PRD acceptance. No commit, merge, deployment or client publication occurred in this increment. The earlier curated Stage 0/1 lifestyle-letter proof remains valid and separate.

## Implemented application paths

- **Create campaign artwork:** existing editor → creation slideover → campaign brief, exact approved copy, owned PNG/JPEG references and reusable style guidance → generated flattened concept preview → deliberate review → contain-fit import, retained concept metadata and optional style recipe → save/reopen. The starter is Bold Retail Lifestyle: blue/yellow dimensional retail typography and leafy local family lifestyle, explicitly excluding beach/coastal imagery. Selecting a saved style does not copy its campaign facts or source references automatically. A reviewed example can be added explicitly and is checked again by the server.
- **Edit with AI:** existing layer context menu and accessible inspector action. Native text can receive a validated native typography proposal. A manually transcribed, explicitly reviewed isolated raster-lettering cutout can receive a native typography proposal or a transparent AI redraw. The panel retains exact wording, instruction, original reference and provider proposal metadata. Preview uses the actual composition. Apply updates the selected layer and recipe in one undo action; discard, failure, changed selection/document and stale responses preserve the artwork.
- **Save protection:** editor PATCH sends `expectedRevision`; the server checks project/client access and uses an atomic revision predicate. Save returns `updatedAt`, and proposal requests bind that saved revision. An older tab cannot silently replace a newer canvas. This is revision checking, not collaborative conflict resolution.

Styles and applied concepts live in versioned optional `artworkCreation` canvas metadata; lettering recipes live on their layer. Native typography controls remain authoritative after manual edits. Only applied concepts retain their generation recipe in the document; discarded outputs remain owned assets without a durable saved proposal recipe. There is no separate style/proposal database migration or new CRM/catalogue. Realtime `layer_add` broadcasts the flattened layer but not the accompanying `artworkCreation` metadata: collaborators receive saved provenance/styles after refresh. CAS prevents a stale save; it does not make those metadata changes an atomic shared realtime transaction.

## API, provider and ownership boundaries

`POST /api/agency/banner-studio/ai/generate` requires a saved project/artboard/revision, brief, at least one nonblank approved-copy entry and at least one owned reference. `POST /api/agency/banner-studio/ai/lettering` also binds layer ID, mode, exact wording and instructions. First-use raster lettering requires source wording and an explicit isolation acknowledgement; this is human transcription, not OCR verification.

Both routes require write access and derive owner/client scope from the saved project. A selected raster reference must resolve to the registered asset matching its saved `src`. Bytes come from owned storage, never a user/provider-supplied arbitrary URL. New outputs use the existing signed asset delivery and retain client/owner scope. Original assets remain available. Unsupported assignments, unavailable credentials/storage, stale revisions and malformed responses fail explicitly; there is no synthetic output or hidden provider fallback.

Existing administrative model assignments now include:

| Feature key | Default provider/model | Result |
|---|---|---|
| `banner_artwork_generate` | `openai`, `openai/gpt-image-1.5` | One complete raster concept |
| `banner_lettering_native` | `openai`, `openai/gpt-4.1-mini` | Exact wording plus allowlisted native typography |
| `banner_lettering_raster` | `openai`, `openai/gpt-image-1.5` | One transparent raster lettering image |

The real adapter uses the pinned `openai@6.46.0` SDK. It supports image generation and reference-image editing, and vision-based native typography proposals. Credentials use request Cloudflare `OPENAI_API_KEY`, with a local `process.env` fallback. No credentials were available for live OpenAI inference in this worktree. Native font choices are a limited supported set; native reconstruction does not generate arbitrary effect CSS or promise exact texture/perspective recovery.

Generation references remain original PNG/JPEG bytes with header/dimension checks, avoiding a full server decode of the supplied 2480×3508 A4 reference. Limits: eight references, 8 MiB each, 16 MiB combined, 4096px edge/16 megapixels each and 32 megapixels combined. Storage metadata and running budgets are checked incrementally. Selected lettering is fully decoded for visible pixels, transparency and clear edges, with a 4-megapixel inspection limit. Cropped, masked, locked or non-Normal blend sources require manual review and are rejected before inference.

Image dispatch requests exactly one medium-quality PNG, choosing 1024×1536, 1536×1024 or 1024×1024 from saved/source orientation. Output is bounded to 8 MiB and 1,572,864 pixels before decode. Unsupported aspect ratios receive a contain-fit warning; images are not stretched to claim a match. The SDK has zero retries and a 120-second timeout. A shared fail-closed limit permits 12 artwork requests per user per hour. This is a request/size boundary, **not enforcement of the proposed USD 1/page or USD 0.05/text ceiling**. Actual cost remains null/unknown. Invocation telemetry records identifiers and measurements, not customer copy.

## Current evidence

- Bounded banner/catalogue/access suites: **457 passed, 5 skipped; 59 files passed, 4 skipped**. Skipped cases remain opt-in and are not counted as browser acceptance.
- Local review index: `output/editable-artwork-v2/review.html` links the saved evidence. Public feature pages were updated to describe delivered capabilities; no new navigation category was introduced.
- Actual Nuxt browser fixture: `output/editable-artwork-v2/ui-evidence.json`. Native lettering preview/apply/undo/redo/reload; first-use raster right-click preview/apply/undo/reload; original raster reference retention; generated-concept review/import/save; custom-style reopening all passed. Four saves, one generation call and two lettering calls were recorded. Provider is explicitly fixtures; persistence is a file-backed API fixture. The uncaught page-error array is empty. Expected unimplemented fixture SSE/WebSocket connection errors remain recorded; realtime collaboration was not verified.
- Native renderer browser rerun: one passed. An earlier combined four-case browser run passed its cases but encountered a cleanup timeout; this is not reported as an entirely clean combined process.
- Backend/catalogue/benchmark-runner focused run: 30 tests passed across six files. Targeted lint and whitespace checks passed. The current global app `vue-tsc` run was stopped after about nine minutes at roughly 7.3 GB RSS, with no diagnostics emitted, as free disk fell to about 259 MB. It is incomplete, not passing. The older 952-diagnostic run is historical evidence, not this run. No clean global typecheck or production-build claim is made.

## Real Qwen attempt and G3

The repeatable runner is `scripts/banner-studio/benchmark-qwen.ts`. It defaults to dry-run; only `--run` uploads the explicitly selected local source to the existing public Qwen Space. It records source/upload hashes, parameters, runtime, errors and, on success, layer hashes/dimensions plus a returned-order PNG composite. It never claims native text recovery. Outputs are ignored under `output/banner-provider-benchmarks/`.

A real `--run` was attempted at 07:10:28 UTC on 26 October. Evidence: `output/banner-provider-benchmarks/2026-10-26T07-10-28-456Z-b496bdc49cb9/evidence.json`. Source: bold retail lifestyle A4 JPEG, 2480×3508, SHA-256 `b496bdc49cb9207bb6dd8a997e2d56b86df8e6f7f483eb14d9814fbee03cf256`. Parameters: four layers, 50 steps, guidance 4; the existing adapter randomises seed. The attempt failed after about 10.1 seconds with a Space error/no valid complete layer result. **No layers or composite were returned.** Request ID and cost are unknown. The runner's earlier default dry-run and unit tests are distinct from this failed live attempt.

Seedream has no configured account/runtime; LayerD inference runtime/weights are not installed. Neither ran. Quiver still has no application adapter or live quality benchmark. G3 quality comparison remains open; configuration availability, synthetic tests and a failed request are not fidelity evidence.

## Remaining gates and resume

The PRD is not finished. Automatic whole-poster clean-background repair is absent; opaque/baked-in lettering is blocked rather than overlaid over duplicate words. Native-text-to-raster redraw currently rejects without an owned separated raster reference. Native typography matching is approximate, and human review must check actual rendered words, clipping, fonts and protected facts. Recipe wording alone does not verify pixels.

Durable asynchronous jobs/progress/retry/cancellation and idempotent import (R12), the other three reference sides, a 20-creative evaluation, live OpenAI/OEM/copy fidelity, dollar-cost validation, Seedream/LayerD comparison, Quiver/vector import, and print/ICC/bleed/duplex/preflight gates remain outstanding. Cancellation currently invalidates/discards the local proposal; it does not establish provider-side cancellation of a billable request. No press-ready PDF/CMYK claim is justified.

Final source reconciliation: local HEAD `4111fb9b42b1463b42411a2ba5e4a1acaaf8a197` includes freshly fetched origin/main `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`. `git rebase --autostash origin/main` preserved the local implementation and prior edits. The final upstream additions were a Pages binding-budget test and marketing/measurement instructions; no Banner Studio runtime changed. Implementation remains uncommitted. Refresh main again before any future integration and follow the existing deployment guard; nothing here authorises deployment. The dirty parent checkout and Stage 0/1 artifacts were preserved.

Final review: no new blocking findings in independent backend/UI review. Scoped ESLint and both edited marketing-page Vue compilations passed; the final revision/access tests passed 15 cases. The current PostToolUse configuration also passed all four commands with minimal PATH; see `output/editable-artwork-v2/hook-diagnosis.md`. No hook changes were needed.

## Reproduce the local walkthrough

Start `pnpm dev --host 127.0.0.1 --port 3137`, then run `node scripts/banner-studio/prove-artwork-v2.mjs`. The script drives the actual editor with intercepted local API fixtures and writes screenshots, assertions and the saved project to `output/editable-artwork-v2/`. Keep it local; do not use its fake identity against a hosted application. Open `output/editable-artwork-v2/review.html` for the labelled evidence. The owned development server was stopped after verification to release resources.

The final upstream Pages binding-budget check also passed seven cases after reconciliation. The new marketing/measurement platform guard was read; this work changes no dealer tracking, conversion configuration or header/body scripts.
