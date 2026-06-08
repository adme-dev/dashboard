import { queryOne, queryRows } from '~~/server/utils/db'

export interface VideoAsset {
  id: string; clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null
  durationSec: number | null; createdAt: string; updatedAt: string
}

export function mapVideoAssetRow(row: any): VideoAsset {
  return {
    id: row.id, clientId: row.client_id ?? null, createdBy: row.created_by, title: row.title ?? null,
    sourceProjectId: row.source_project_id ?? null, sourceJobId: row.source_job_id ?? null,
    r2Key: row.r2_key, format: row.format,
    width: row.width != null ? Number(row.width) : null, height: row.height != null ? Number(row.height) : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
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
  if (filter.clientId) {
    return (await queryRows(`SELECT * FROM video_assets WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2`, [filter.clientId, limit])).map(mapVideoAssetRow)
  }
  return (await queryRows(`SELECT * FROM video_assets ORDER BY created_at DESC LIMIT $1`, [limit])).map(mapVideoAssetRow)
}
