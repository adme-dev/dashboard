// server/utils/video/reviews.ts — CRUD for portal video reviews. mapRow is pure (tested);
// the DB fns use queryOne/queryRows.
import { queryOne, queryRows } from '~~/server/utils/db'

export interface VideoReview {
  id: string; clientId: string; mediaProjectId: string; jobId: string; format: string
  r2Key: string; title: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested'
  responseNotes: string | null; respondedBy: string | null; respondedAt: string | null
  createdBy: string; createdAt: string; updatedAt: string
}

export function mapReviewRow(row: any): VideoReview {
  return {
    id: row.id, clientId: row.client_id, mediaProjectId: row.media_project_id, jobId: row.job_id,
    format: row.format, r2Key: row.r2_key, title: row.title ?? null, status: row.status,
    responseNotes: row.response_notes ?? null, respondedBy: row.responded_by ?? null,
    respondedAt: row.responded_at ?? null, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export async function createVideoReview(input: {
  clientId: string; mediaProjectId: string; jobId: string; format: string; r2Key: string; title: string | null; createdBy: string
}): Promise<VideoReview> {
  const row = await queryOne(
    `INSERT INTO video_reviews (client_id, media_project_id, job_id, format, r2_key, title, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [input.clientId, input.mediaProjectId, input.jobId, input.format, input.r2Key, input.title, input.createdBy]
  )
  return mapReviewRow(row)
}

export async function listVideoReviewsForClient(clientId: string): Promise<VideoReview[]> {
  const rows = await queryRows(`SELECT * FROM video_reviews WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [clientId])
  return rows.map(mapReviewRow)
}

export async function getVideoReviewForClient(id: string, clientId: string): Promise<VideoReview | null> {
  const row = await queryOne(`SELECT * FROM video_reviews WHERE id = $1 AND client_id = $2`, [id, clientId])
  return row ? mapReviewRow(row) : null
}

export async function respondVideoReview(id: string, clientId: string, action: 'approve' | 'reject' | 'revision_requested', notes: string | null, respondedBy: string): Promise<VideoReview | null> {
  const statusMap = { approve: 'approved', reject: 'rejected', revision_requested: 'revision_requested' } as const
  const row = await queryOne(
    `UPDATE video_reviews SET status=$1, response_notes=$2, responded_by=$3, responded_at=now(), updated_at=now()
     WHERE id=$4 AND client_id=$5 RETURNING *`,
    [statusMap[action], notes, respondedBy, id, clientId]
  )
  return row ? mapReviewRow(row) : null
}
