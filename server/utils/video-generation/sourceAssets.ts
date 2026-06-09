import { queryRows } from '~~/server/utils/db'
import type { VideoGenerationSourceAsset } from '~~/server/utils/video-generation/types'

export async function loadVideoGenerationSourceAssets(ids: string[]): Promise<VideoGenerationSourceAsset[]> {
  if (ids.length === 0) return []
  const rows = await queryRows<{ id: string }>(
    `SELECT id FROM video_assets WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  const found = new Set(rows.map((row) => row.id))
  return ids.map((id) => ({
    id,
    approved: found.has(id),
    subjectType: 'vehicle',
  }))
}
