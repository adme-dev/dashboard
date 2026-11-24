import type { User } from '~~/server/utils/auth'
import { queryOne, queryOneFresh, queryRowsFresh } from '~~/server/utils/db'

export interface VideoAsset {
  id: string; clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null
  durationSec: number | null
  thumbnailKey: string | null; thumbnailUrl: string | null
  captionVttKey: string | null; captionVttUrl: string | null
  transcript: string | null; metadata: Record<string, unknown>
  generationPrompt: string | null; generationModelId: string | null
  createdAt: string; updatedAt: string
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function mapVideoAssetRow(row: any): VideoAsset {
  return {
    id: row.id, clientId: row.client_id ?? null, createdBy: row.created_by, title: row.title ?? null,
    sourceProjectId: row.source_project_id ?? null, sourceJobId: row.source_job_id ?? null,
    r2Key: row.r2_key, format: row.format,
    width: row.width != null ? Number(row.width) : null, height: row.height != null ? Number(row.height) : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    thumbnailKey: row.thumbnail_key ?? null,
    thumbnailUrl: row.thumbnail_key ? `/api/agency/video/assets/${encodeURIComponent(row.id)}/thumbnail` : null,
    captionVttKey: row.caption_vtt_key ?? null,
    captionVttUrl: row.caption_vtt_key ? `/api/agency/video/assets/${encodeURIComponent(row.id)}/captions.vtt` : null,
    transcript: row.transcript ?? null,
    metadata: jsonObject(row.metadata),
    generationPrompt: row.generation_prompt ?? null,
    generationModelId: row.generation_model_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export async function createVideoAsset(input: {
  clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null; durationSec: number | null
  /** Pre-reserved id (God mode ledger); DB default when omitted. */
  id?: string
  /** Saved still of the asset: a video's preview frame, or the picture itself. */
  thumbnailKey?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<VideoAsset> {
  // A retried request reuses its reserved id: return that row instead of failing on the key.
  const row = await queryOne(
    `INSERT INTO video_assets (id, client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec, thumbnail_key, metadata)
     VALUES (COALESCE($11::uuid, gen_random_uuid()),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$12,$13::jsonb)
     ON CONFLICT (id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [input.clientId, input.createdBy, input.title, input.sourceProjectId, input.sourceJobId, input.r2Key, input.format, input.width, input.height, input.durationSec, input.id ?? null, input.thumbnailKey ?? null, JSON.stringify(input.metadata ?? {})]
  )
  return mapVideoAssetRow(row)
}

/** PNG and JPEG are the pictures the Prepare tools can read as they are. */
export function isPreparablePictureKey(r2Key: string | null | undefined): boolean {
  return Boolean(r2Key && /\.(png|jpe?g)$/i.test(r2Key.split('?')[0] ?? ''))
}

/** Saves a still for an asset that has none. An asset that already has one keeps it. */
export async function setVideoAssetThumbnailIfMissing(id: string, thumbnailKey: string): Promise<{ thumbnailKey: string; saved: boolean } | null> {
  const updated = await queryOne(
    `UPDATE video_assets SET thumbnail_key = $2, updated_at = now()
      WHERE id = $1 AND (thumbnail_key IS NULL OR length(trim(thumbnail_key)) = 0)
      RETURNING thumbnail_key`,
    [id, thumbnailKey]
  )
  if (updated?.thumbnail_key) return { thumbnailKey: updated.thumbnail_key, saved: true }
  const existing = await queryOneFresh(`SELECT thumbnail_key FROM video_assets WHERE id = $1`, [id])
  return existing?.thumbnail_key ? { thumbnailKey: existing.thumbnail_key, saved: false } : null
}

// The library list is read fresh: an upload or a finished generation must show at the next
// reload, not when a cached copy of the same query expires up to a minute later.
export async function listVideoAssets(filter: { clientId?: string | null; limit?: number } = {}): Promise<VideoAsset[]> {
  const limit = Math.min(filter.limit ?? 100, 200)
  const select = `
    SELECT va.*, vg.prompt AS generation_prompt, vg.model_id AS generation_model_id
    FROM video_assets va
    LEFT JOIN video_generation_jobs vg
      ON vg.output_asset_id = va.id OR vg.id = va.source_job_id
  `
  if (filter.clientId) {
    return (await queryRowsFresh(`${select} WHERE va.client_id = $1 ORDER BY va.created_at DESC LIMIT $2`, [filter.clientId, limit])).map(mapVideoAssetRow)
  }
  return (await queryRowsFresh(`${select} ORDER BY va.created_at DESC LIMIT $1`, [limit])).map(mapVideoAssetRow)
}

function canAccessAllVideoAssets(user: User): boolean {
  return user.role === 'admin' || user.role === 'owner'
}

function videoAssetSelect(includeProject = false): string {
  return `
    SELECT va.*, vg.prompt AS generation_prompt, vg.model_id AS generation_model_id
    FROM video_assets va
    LEFT JOIN video_generation_jobs vg
      ON vg.output_asset_id = va.id OR vg.id = va.source_job_id
    ${includeProject ? 'LEFT JOIN media_projects mp ON mp.id = va.source_project_id' : ''}
  `
}

export async function getAccessibleVideoAsset(id: string, user: User): Promise<VideoAsset | null> {
  if (canAccessAllVideoAssets(user)) {
    const row = await queryOne(`${videoAssetSelect()} WHERE va.id = $1`, [id])
    return row ? mapVideoAssetRow(row) : null
  }

  const row = await queryOne(
    `${videoAssetSelect(true)}
     WHERE va.id = $1
       AND (va.created_by = $2 OR mp.created_by = $2)`,
    [id, user.id]
  )
  return row ? mapVideoAssetRow(row) : null
}

export async function listVideoAssetsForUser(
  user: User,
  filter: { clientId?: string | null; limit?: number } = {}
): Promise<VideoAsset[]> {
  if (canAccessAllVideoAssets(user)) return listVideoAssets(filter)

  const limit = Math.min(filter.limit ?? 100, 200)
  const params: unknown[] = [user.id]
  let where = `WHERE (va.created_by = $1 OR mp.created_by = $1)`
  if (filter.clientId) {
    params.push(filter.clientId)
    where += ` AND va.client_id = $${params.length}`
  }
  params.push(limit)

  const rows = await queryRowsFresh(
    `${videoAssetSelect(true)} ${where} ORDER BY va.created_at DESC LIMIT $${params.length}`,
    params
  )
  return rows.map(mapVideoAssetRow)
}
