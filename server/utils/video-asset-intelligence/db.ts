import { queryOne, queryRows } from '~~/server/utils/db'
import {
  DEFAULT_VIDEO_BUCKETS,
  mapBucketItemRow,
  mapBucketRow,
  mapDerivativeRow,
  mapIntelligenceJobRow,
  type VideoAssetIntelligenceJob,
  type VideoBucketItem,
  type VideoProjectBucket,
} from './buckets'
import { defaultModelForAction } from './registry'
import type { AssetIntelligenceActionId } from './registry'

export async function ensureDefaultBuckets(projectId: string): Promise<void> {
  for (const bucket of DEFAULT_VIDEO_BUCKETS) {
    await queryOne(
      `INSERT INTO video_project_buckets (project_id, kind, name, sort_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_id, kind)
       DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, updated_at = now()
       RETURNING id`,
      [projectId, bucket.kind, bucket.name, bucket.sortOrder]
    )
  }
}

export async function syncProjectVideoAssetsIntoGeneratedBucket(projectId: string): Promise<void> {
  const bucket = await queryOne(
    `SELECT id FROM video_project_buckets WHERE project_id = $1 AND kind = 'generated'`,
    [projectId]
  )
  if (!bucket?.id) return
  await queryRows(
    `INSERT INTO video_project_bucket_items (bucket_id, asset_id, r2_key, title, role, directive, status)
     SELECT $2, va.id, va.r2_key, COALESCE(va.title, 'Generated video ' || va.id::text), 'generated-video',
            jsonb_build_object('source', 'video_assets', 'format', va.format, 'durationSec', va.duration_sec),
            'ready'
       FROM video_assets va
      WHERE va.source_project_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM video_project_bucket_items existing
           WHERE existing.bucket_id = $2 AND existing.asset_id = va.id
        )`,
    [projectId, bucket.id]
  )
}

export async function listProjectBuckets(projectId: string): Promise<VideoProjectBucket[]> {
  const rows = await queryRows(
    `SELECT * FROM video_project_buckets WHERE project_id = $1 ORDER BY sort_order ASC, name ASC`,
    [projectId]
  )
  return rows.map(mapBucketRow)
}

export async function listBucketItemsForProject(projectId: string): Promise<VideoBucketItem[]> {
  const rows = await queryRows(
    `SELECT i.*
       FROM video_project_bucket_items i
       JOIN video_project_buckets b ON b.id = i.bucket_id
      WHERE b.project_id = $1
      ORDER BY i.created_at DESC`,
    [projectId]
  )
  return rows.map(mapBucketItemRow)
}

export async function createOrUpdateBucketItemDirective(id: string, input: { role?: string | null; directive: Record<string, unknown> }): Promise<VideoBucketItem> {
  const row = await queryOne(
    `UPDATE video_project_bucket_items
        SET role = COALESCE($2, role),
            directive = $3::jsonb,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, input.role ?? null, JSON.stringify(input.directive ?? {})]
  )
  if (!row) throw new Error(`video bucket item ${id} not found`)
  return mapBucketItemRow(row)
}

export async function listAssetDerivatives(sourceAssetId: string) {
  const rows = await queryRows(
    `SELECT * FROM video_asset_derivatives WHERE source_asset_id = $1 ORDER BY created_at DESC`,
    [sourceAssetId]
  )
  return rows.map(mapDerivativeRow)
}

export async function createBlockedExtractionJob(input: {
  projectId: string
  sourceAssetId: string
  bucketItemId?: string | null
  action: AssetIntelligenceActionId
  prompt?: string | null
  brushMaskKey?: string | null
  modelId?: string | null
  createdBy: string
}): Promise<VideoAssetIntelligenceJob> {
  const model = input.modelId ? null : defaultModelForAction(input.action)
  const modelId = input.modelId ?? model?.id ?? 'unconfigured/provider'
  const provider = model?.provider ?? modelId.split('/')[0] ?? 'unconfigured'
  const row = await queryOne(
    `INSERT INTO video_asset_intelligence_jobs
      (project_id, source_asset_id, bucket_item_id, action, model_id, provider, status, prompt, brush_mask_key, output_derivative_ids, error_message, created_by, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,'blocked',$7,$8,'[]'::jsonb,$9,$10,now())
     RETURNING *`,
    [
      input.projectId,
      input.sourceAssetId,
      input.bucketItemId ?? null,
      input.action,
      modelId,
      provider,
      input.prompt ?? null,
      input.brushMaskKey ?? null,
      'Asset intelligence provider execution is not configured yet.',
      input.createdBy,
    ]
  )
  return mapIntelligenceJobRow(row)
}
