# AI Video Generation (muapi) — Slice 1 Handoff

**Date:** 2026-06-09
**Branch:** `feat/ai-video-generation-muapi`
**Status:** Built, fully reviewed, **dormant behind flags**. NOT deployed, NOT pushed. No migration.

## What shipped

muapi.ai-backed AI video generation onto the existing dormant scaffold, in 12 TDD tasks
(each spec- + quality-reviewed; a final cross-cutting review approved merge-as-dormant).

- **muapi provider adapter** (`server/utils/video-generation/providers/muapiProvider.ts`) — submit/poll, injected fetch.
- **Real model registry entries** — `muapi/i2v-kling`, `muapi/t2v-wan` (+ `muapi.endpoint` type).
- **Pages finalize** (`finalize.ts` + `createAsset.ts`) — download → R2 → `video_assets` → mark succeeded.
- **Worker** — provider map keyed by `job.provider`; async submit-then-ack (poll `running` → leave for webhook/reconcile); mock still finalizes inline.
- **Signed webhook** (`webhook.post.ts` + `webhookAuth.ts` + `webhookPayload.ts`) — HMAC-SHA256, idempotent, classifier handles non-terminal statuses.
- **Jobs-list endpoint** + **reconcile cron** (missed-webhook safety net, hourly via pages-cron).
- **Editor UI** — "Generate (AI)" slideover (`MediaGeneratePicker.vue`), jobs poller, Library "Add to timeline".
- **Flag** `videoGenerationEnabled` (public mirror).

329 tests pass. The only failing suite, `test/audio/renderVariants.test.ts`, is a **pre-existing**
environmental `cloudflare:workers` import error, unrelated to this work.

## ⚠️ KNOWN GAPS — READ BEFORE FLIPPING `VIDEO_GENERATION_ENABLED`

1. **text-to-video is complete; image-to-video is INERT.** Two independent gaps:
   - **No UI can supply a source still.** `timelineStills` in `[id].vue` filters clips with
     `asset_id` set, but `addVideoClip` always sets `asset_id: null` → the i2v source dropdown
     is always empty, and the slideover has no upload-a-still path.
   - **No UUID→URL resolution.** The worker passes `job.sourceAssetIds` (UUIDs) straight through
     to `muapiProvider` as `image_url`. muapi needs a fetchable URL. Nothing presigns the R2 still.
   - **Action:** until both are built, restrict each tenant's `allowedModelIds` to `['muapi/t2v-wan']`.
     i2v follow-up = (a) a source-still path in `MediaGeneratePicker` (plumb `asset_id` or direct
     upload→video_asset), and (b) resolve source-asset UUIDs → presigned R2 URLs before `provider.submit`.

2. **Verify-live against the real muapi API before enabling.** These are placeholders, encapsulated
   in the adapter/registry: endpoint slugs (`generate_kling_i2v`, `generate_wan_t2v`), the
   `predictions/{id}/result` poll path, response field names (`outputs[0]`/`output_url`/`url`,
   `cost`, `request_id`), and the webhook signature scheme/header (`x-muapi-signature`, hex HMAC-SHA256
   over the raw body). If the signature scheme differs, webhooks 401 and only the **hourly** reconcile
   cron completes jobs (slow but functional).

3. **`loadVideoGenerationSourceAssets` hardcodes `subjectType: 'vehicle'` + `approved: found.has(id)`**
   (pre-existing scaffold simplification). Every existing asset is treated as an approved vehicle, so
   the vehicle-i2v compliance gate passes for any real asset id. Fix before trusting compliance for
   car-dealership clients.

4. **Residual duplicate-asset race** (documented in `finalize.ts`): a concurrent webhook+reconcile can
   insert two `video_assets` rows before the idempotent `markSucceeded` wins. Window is tiny (hourly
   cron, >2min threshold); a fully-exclusive claim would need a status-enum migration. Accepted for slice 1.

## Operator activation (unchanged from the plan — DO NOT run without sign-off)

1. `wrangler queues create video-generation` + `wrangler queues create video-generation-dlq`.
2. Pages env: `VIDEO_STUDIO_ENABLED=true`, `VIDEO_GENERATION_ENABLED=true`, `MUAPI_API_KEY`,
   `MUAPI_BASE_URL`, `MUAPI_WEBHOOK_URL` (public `…/api/agency/video/generation/webhook`), `MUAPI_WEBHOOK_SECRET`.
3. Same `MUAPI_*` on the `video-generation` worker; `pnpm --dir workers/video-generation deploy`.
4. Tenant policy: `enabled:true`, `monthlyCapCents`, `allowedModelIds: ['muapi/t2v-wan']` (t2v only until i2v is finished).
5. Verify-live items in gap #2; run one t2v end-to-end; confirm webhook finalize + reconcile fallback.
6. Marketing-site feature sync at go-live.

## Also on this branch

- A standalone **Safari `cloneState` bugfix** (`1cd3ed3c`): `structuredClone` throws `DataCloneError`
  on Vue reactive proxies in Safari, which broke every add-clip edit in the AV editor (the bug the
  user originally hit — "can't add a still"). Fixed by JSON round-trip clone. Independent of the
  generation feature; safe to keep or cherry-pick separately.
</content>
