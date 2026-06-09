import { queryOne } from '~~/server/utils/db'

// NOTE: mirror of workers/video-generation/src/db.ts::dbCreateVideoAsset (Pages runtime
// uses the shared queryOne; the Worker has its own pg client). Keep the two in sync.
export async function createVideoAsset(input: {
  clientId: string | null
  createdBy: string
  title: string | null
  sourceProjectId: string | null
  sourceJobId: string | null
  r2Key: string
  format: string
  durationSec: number | null
}): Promise<{ id: string; r2Key: string }> {
  const row = await queryOne<{ id: string; r2_key: string }>(
    `INSERT INTO video_assets
       (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,$8)
     RETURNING id, r2_key`,
    [input.clientId, input.createdBy, input.title, input.sourceProjectId, input.sourceJobId, input.r2Key, input.format, input.durationSec]
  )
  if (!row) throw new Error('failed to create video asset')
  return { id: row.id, r2Key: row.r2_key }
}
