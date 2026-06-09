# AI Video Gen — Slice 2B (part 1): functional i2v source images

**Date:** 2026-06-09
**Branch:** `feat/ai-video-gen-2b-i2v-source` (from `d8fc5514`)
**Builds on:** Slice 2A (CF AI Gateway transport, on main) + the i2v-only surface gate (`d8fc5514`).

## Summary

Make image-to-video actually generate by giving it a real, approvable source image.
**Upload the still in the Generate panel → store to R2 → persist a `video_gen_source_assets`
row (`status='approved'` default) → at enqueue, resolve the source-asset id to a presigned
R2 URL → thread the URL to the worker → `env.AI.run` gets a fetchable image.** The approval
column is the governance rail (auto-approved in dev; reviewable later). Sidesteps the broken
timeline-still/`asset_id` path. Pre-flight budget is a separate later slice.

## Decisions

1. **Source = upload-in-slideover** (not timeline stills, not a full asset library). Dedicated
   `video_gen_source_assets` table — off the existing `video_assets` (video) library to avoid
   blast radius.
2. **Approval rail, permissive in dev:** rows default `status='approved'`. jobs.post rejects any
   source that isn't `approved` AND owned by the tenant (cross-tenant rejection). This satisfies
   the governance shape now; a stricter default + review UI is a follow-up.
3. **Resolution at enqueue (Pages), passed via the queue message.** jobs.post presigns the
   source r2_key (1h) and enqueues `sourceAssetUrls` on the message; the worker threads them into
   the provider request (`sourceAssetUrls`), falling back to `job.sourceAssetIds` when absent
   (back-compat). Presigning lives in Pages (storage utils); the worker can't presign.

## Data model (migration)

`server/database/migrations/<next>_video_gen_source_assets.sql` (additive, `IF NOT EXISTS`):
```sql
CREATE TABLE IF NOT EXISTS video_gen_source_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NULL,                       -- tenant; null = agency
  created_by   UUID NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'approved', -- approved | pending | rejected
  subject_type TEXT NOT NULL DEFAULT 'unknown',  -- vehicle | non_vehicle | unknown
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vgsa_client ON video_gen_source_assets (client_id, created_at DESC);
```

## Components

**Create**
- migration (above) — run it against `.env` DATABASE_URL.
- `server/utils/video-generation/sourceAssetStore.ts` — `createSourceAsset(...)` insert; `loadSourceAssetsByIds(ids)` select; pure `assertResolvableSources(rows, ids, tenantId)` (validates: all ids found, status==='approved', client_id matches tenant-or-agency; throws otherwise) → returns rows in id order.
- `server/utils/video-generation/resolveSourceUrls.ts` — `resolveSourceAssetUrls(ids, tenantId, deps)` → load + assert + presign each r2_key → string[] (injected load+presign for tests).
- `server/api/agency/video/generation/source-assets.post.ts` — gated multipart image upload → R2 → insert row → `{ id, status }`.
- Tests: `test/video-generation/{sourceAssetStore,resolveSourceUrls}.test.ts`.

**Modify**
- `server/utils/video-generation/enqueue.ts` — `VideoGenerationMessage` gains `sourceAssetUrls?: string[]`.
- `server/api/agency/video/generation/jobs.post.ts` — for i2v jobs, `resolveSourceAssetUrls(body.sourceAssetIds, tenantId)` (reject on failure → 400/403); enqueue with `sourceAssetUrls`. (Keep the existing compliance/cost path; this replaces the reliance on the hardcoded `loadVideoGenerationSourceAssets` for URL resolution — that stays for the compliance subject-type check or is superseded; see plan.)
- `workers/video-generation/src/worker.ts` — `processVideoGenerationJob(message, deps)` uses `message.sourceAssetUrls ?? job.sourceAssetIds` when building the provider request's `sourceAssetUrls`.
- `app/components/media/MediaGeneratePicker.vue` — for i2v, replace the (empty) timeline-still dropdown with an image upload control that POSTs to `source-assets.post`, stores the returned id as `sourceAssetId`, and shows a thumbnail/filename.

## Testing
- `assertResolvableSources`: all-approved-owned passes; missing id / pending / rejected / cross-tenant each throw. (Pure, unit-tested.)
- `resolveSourceAssetUrls`: maps ids → presigned urls in order (injected load+presign).
- `sourceAssetStore.createSourceAsset`: row insert shape (injected query).
- Keep slice-2A tests green; worker test: message `sourceAssetUrls` used over `job.sourceAssetIds`.
- Endpoint + slideover: manual (H3/Vue not unit-tested here).

## Out of scope (later)
- Pre-flight per-tenant budget reserve (separate slice).
- Stricter approval default + review UI.
- Timeline-still-as-source.

## Verify-live / activation (unchanged + new)
- Run the migration on prod DB (additive).
- The 2A verify-live items still apply (worker tsconfig `paths`; one real `env.AI.run` i2v call — now with a real presigned R2 image URL).
</content>
