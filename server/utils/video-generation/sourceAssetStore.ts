import { randomUUID } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'

export interface SourceAssetRow {
  id: string
  client_id: string | null
  r2_key: string
  status: string
  content_type?: string
  subject_type?: string
  original_filename?: string | null
  width?: number | null
  height?: number | null
  created_at?: string
}

export async function createSourceAsset(input: {
  clientId: string | null
  createdBy: string
  r2Key: string
  contentType: string
  subjectType: string
  originalFilename?: string | null
  width?: number | null
  height?: number | null
}): Promise<{ id: string; status: string }> {
  const row = await queryOne<{ id: string; status: string }>(
    `INSERT INTO video_gen_source_assets
       (id, client_id, created_by, r2_key, content_type, subject_type, original_filename, width, height)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, status`,
    [
      randomUUID(), input.clientId, input.createdBy, input.r2Key, input.contentType,
      input.subjectType, input.originalFilename ?? null, input.width ?? null, input.height ?? null
    ]
  )
  if (!row) throw new Error('failed to create source asset')
  return { id: row.id, status: row.status }
}

export async function loadSourceAssetsByIds(ids: string[]): Promise<SourceAssetRow[]> {
  if (ids.length === 0) return []
  return queryRows<SourceAssetRow>(
    `SELECT id, client_id, r2_key, status, content_type, subject_type,
            original_filename, width, height, created_at
     FROM video_gen_source_assets WHERE id = ANY($1::uuid[])`,
    [ids]
  )
}

/** Approved sources available to a tenant. Agency-owned rows are shared deliberately. */
export async function listApprovedVideoGenerationSourceAssets(tenantId: string): Promise<SourceAssetRow[]> {
  return queryRows<SourceAssetRow>(
    `SELECT id, client_id, r2_key, status, content_type, subject_type,
            original_filename, width, height, created_at
       FROM video_gen_source_assets
      WHERE status = 'approved'
        AND (client_id = $1::uuid OR client_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantId === 'agency' ? null : tenantId]
  )
}

/** Validate every requested id resolves to an approved, tenant-or-agency-owned source.
 *  Returns the rows in the same order as `ids`. Throws on any violation. */
export function assertResolvableSources(rows: SourceAssetRow[], ids: string[], tenantId: string): SourceAssetRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => {
    const r = byId.get(id)
    if (!r) throw new Error(`source asset ${id} not found`)
    if (r.status !== 'approved') throw new Error(`source asset ${id} is not approved`)
    if (r.client_id !== null && r.client_id !== tenantId) throw new Error(`source asset ${id} is not owned by this tenant`)
    return r
  })
}
