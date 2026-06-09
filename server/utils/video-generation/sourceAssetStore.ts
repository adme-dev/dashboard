import { randomUUID } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'

export interface SourceAssetRow {
  id: string
  client_id: string | null
  r2_key: string
  status: string
  content_type?: string
  subject_type?: string
}

export async function createSourceAsset(input: {
  clientId: string | null
  createdBy: string
  r2Key: string
  contentType: string
  subjectType: string
}): Promise<{ id: string; status: string }> {
  const row = await queryOne<{ id: string; status: string }>(
    `INSERT INTO video_gen_source_assets (id, client_id, created_by, r2_key, content_type, subject_type)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status`,
    [randomUUID(), input.clientId, input.createdBy, input.r2Key, input.contentType, input.subjectType]
  )
  if (!row) throw new Error('failed to create source asset')
  return { id: row.id, status: row.status }
}

export async function loadSourceAssetsByIds(ids: string[]): Promise<SourceAssetRow[]> {
  if (ids.length === 0) return []
  return queryRows<SourceAssetRow>(
    `SELECT id, client_id, r2_key, status, content_type, subject_type
     FROM video_gen_source_assets WHERE id = ANY($1::uuid[])`,
    [ids]
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
