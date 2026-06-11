import type { User } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

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
}): Promise<VideoAsset> {
  const row = await queryOne(
    `INSERT INTO video_assets (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [input.clientId, input.createdBy, input.title, input.sourceProjectId, input.sourceJobId, input.r2Key, input.format, input.width, input.height, input.durationSec]
  )
  return mapVideoAssetRow(row)
}

export async function listVideoAssets(filter: { clientId?: string | null; limit?: number } = {}): Promise<VideoAsset[]> {
  const limit = Math.min(filter.limit ?? 100, 200)
  const select = `
    SELECT va.*, vg.prompt AS generation_prompt, vg.model_id AS generation_model_id
    FROM video_assets va
    LEFT JOIN video_generation_jobs vg
      ON vg.output_asset_id = va.id OR vg.id = va.source_job_id
  `
  if (filter.clientId) {
    return (await queryRows(`${select} WHERE va.client_id = $1 ORDER BY va.created_at DESC LIMIT $2`, [filter.clientId, limit])).map(mapVideoAssetRow)
  }
  return (await queryRows(`${select} ORDER BY va.created_at DESC LIMIT $1`, [limit])).map(mapVideoAssetRow)
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

  const rows = await queryRows(
    `${videoAssetSelect(true)} ${where} ORDER BY va.created_at DESC LIMIT $${params.length}`,
    params
  )
  return rows.map(mapVideoAssetRow)
}
