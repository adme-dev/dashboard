import { queryOne, queryRows } from '~~/server/utils/db'
import {
  DEFAULT_VIDEO_BUCKETS,
  mapBucketItemRow,
  mapBucketRow,
  mapDerivativeRow,
  mapIntelligenceJobRow,
  type VideoAssetIntelligenceJob,
  type VideoAssetDerivative,
  type VideoBucketItem,
  type VideoBucketKind,
  type VideoProjectBucket,
} from './buckets'
import { defaultModelForAction } from './registry'
import type { AssetDerivativeKind, AssetIntelligenceActionId } from './registry'

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

export async function getAssetDerivative(id: string): Promise<VideoAssetDerivative | null> {
  const row = await queryOne(
    `SELECT * FROM video_asset_derivatives WHERE id = $1`,
    [id]
  )
  return row ? mapDerivativeRow(row) : null
}

export async function createAssetDerivative(input: {
  id?: string | null
  sourceAssetId: string
  projectId?: string | null
  kind: AssetDerivativeKind
  r2Key: string
  width?: number | null
  height?: number | null
  metadata?: Record<string, unknown> | null
}): Promise<VideoAssetDerivative> {
  const row = await queryOne(
    `INSERT INTO video_asset_derivatives
      (id, source_asset_id, project_id, kind, r2_key, width, height, metadata)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      input.id ?? null,
      input.sourceAssetId,
      input.projectId ?? null,
      input.kind,
      input.r2Key,
      input.width ?? null,
      input.height ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  )
  return mapDerivativeRow(row)
}

function derivativeTitle(derivative: VideoAssetDerivative): string {
  const metadataTitle = derivative.metadata.title
  if (typeof metadataTitle === 'string' && metadataTitle.trim()) return metadataTitle.trim()
  return `${derivative.kind.replace(/-/g, ' ')} derivative`
}

function derivativeBucketDirective(derivative: VideoAssetDerivative, directive?: Record<string, unknown> | null): Record<string, unknown> {
  const canonical: Record<string, unknown> = {
    source: 'video_asset_derivatives',
    derivativeId: derivative.id,
    sourceAssetId: derivative.sourceAssetId,
    kind: derivative.kind,
  }
  if (derivative.width != null) canonical.width = derivative.width
  if (derivative.height != null) canonical.height = derivative.height
  if (typeof derivative.metadata.contentType === 'string') canonical.contentType = derivative.metadata.contentType
  if (typeof derivative.metadata.size === 'number') canonical.size = derivative.metadata.size
  return {
    ...(directive ?? {}),
    ...canonical,
  }
}

export async function addDerivativeToProjectBucket(input: {
  derivative: VideoAssetDerivative
  bucketKind?: VideoBucketKind
  role?: string | null
  title?: string | null
  directive?: Record<string, unknown> | null
}): Promise<VideoBucketItem> {
  if (!input.derivative.projectId) throw new Error(`asset derivative ${input.derivative.id} is not attached to a project`)

  const bucketKind = input.bucketKind ?? 'generated'
  await ensureDefaultBuckets(input.derivative.projectId)
  const bucket = await queryOne(
    `SELECT id FROM video_project_buckets WHERE project_id = $1 AND kind = $2`,
    [input.derivative.projectId, bucketKind]
  )
  if (!bucket?.id) throw new Error(`video project bucket ${bucketKind} not found for project ${input.derivative.projectId}`)

  const title = input.title ?? derivativeTitle(input.derivative)
  const role = input.role ?? `derivative-${input.derivative.kind}`
  const directive = derivativeBucketDirective(input.derivative, input.directive)
  const row = await queryOne(
    `INSERT INTO video_project_bucket_items
      (bucket_id, asset_id, r2_key, title, role, directive, status)
     VALUES ($1, null, $2, $3, $4, $5::jsonb, 'ready')
     ON CONFLICT (bucket_id, (directive->>'derivativeId'))
       WHERE directive->>'source' = 'video_asset_derivatives'
         AND directive ? 'derivativeId'
     DO UPDATE SET
       r2_key = EXCLUDED.r2_key,
       title = EXCLUDED.title,
       role = EXCLUDED.role,
       directive = EXCLUDED.directive,
       status = 'ready',
       updated_at = now()
     RETURNING *`,
    [
      bucket.id,
      input.derivative.r2Key,
      title,
      role,
      JSON.stringify(directive),
    ]
  )
  return mapBucketItemRow(row)
}

export async function listProjectIntelligenceJobs(projectId: string, limit = 50): Promise<VideoAssetIntelligenceJob[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit || 50), 1), 100)
  const rows = await queryRows(
    `SELECT * FROM video_asset_intelligence_jobs
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [projectId, safeLimit]
  )
  return rows.map(mapIntelligenceJobRow)
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

export async function createQueuedExtractionJob(input: {
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
      (project_id, source_asset_id, bucket_item_id, action, model_id, provider, status, prompt, brush_mask_key, output_derivative_ids, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,'[]'::jsonb,$9)
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
      input.createdBy,
    ]
  )
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobRunning(id: string): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = $1 AND status = 'queued'
      RETURNING *`,
    [id]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
    if (!existing) throw new Error(`asset intelligence job ${id} not found`)
    return mapIntelligenceJobRow(existing)
  }
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobSucceeded(input: {
  id: string
  outputDerivativeIds: string[]
}): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'succeeded',
            output_derivative_ids = $2::jsonb,
            error_message = null,
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND status IN ('queued','running')
      RETURNING *`,
    [input.id, JSON.stringify(input.outputDerivativeIds)]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [input.id])
    if (!existing) throw new Error(`asset intelligence job ${input.id} not found`)
    return mapIntelligenceJobRow(existing)
  }
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobFailed(id: string, errorMessage: string): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('queued','running')
      RETURNING *`,
    [id, errorMessage]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
    if (!existing) throw new Error(`asset intelligence job ${id} not found`)
    return mapIntelligenceJobRow(existing)
  }
  return mapIntelligenceJobRow(row)
}
