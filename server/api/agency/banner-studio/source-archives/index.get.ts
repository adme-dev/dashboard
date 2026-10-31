import { requireAuth } from '~~/server/utils/auth'
import { queryFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  SOURCE_ARCHIVE_UNASSIGNED,
  isSourceArchiveId,
  isSourceArchiveSha256,
  isSourceDesignHash,
  parseSourceArchiveStatus,
  requireSourceArchiveClientAccess,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

/**
 * Lists retained source archives. `clientId` is a client UUID or `unassigned`;
 * omitting it lists every client and needs all-client access.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const filters: string[] = []
  const params: unknown[] = []
  const add = (sql: string, value: unknown) => {
    params.push(value)
    filters.push(sql.replace('?', `$${params.length}`))
  }
  const one = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

  const clientId = one(query.clientId)?.toLowerCase()
  if (clientId === SOURCE_ARCHIVE_UNASSIGNED) {
    await requireSourceArchiveClientAccess(event, user, null)
    filters.push('client_id IS NULL')
  } else if (clientId) {
    if (!isSourceArchiveId(clientId)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
    await requireSourceArchiveClientAccess(event, user, clientId)
    add('client_id = ?', clientId)
  } else {
    await requireSourceArchiveClientAccess(event, user, null)
  }

  const designHash = one(query.designHash)
  if (designHash) {
    if (!isSourceDesignHash(designHash)) throw createError({ statusCode: 400, statusMessage: 'Invalid designHash' })
    add('source_design_hash = ?', designHash)
  }
  const sha256 = one(query.sha256)?.toLowerCase()
  if (sha256) {
    if (!isSourceArchiveSha256(sha256)) throw createError({ statusCode: 400, statusMessage: 'Invalid sha256' })
    add('sha256 = ?', sha256)
  }
  const projectId = one(query.projectId)
  if (projectId) {
    if (!isSourceArchiveId(projectId)) throw createError({ statusCode: 400, statusMessage: 'Invalid projectId' })
    add('project_id = ?', projectId)
  }
  const status = one(query.status)
  if (status) add('conversion_status = ?', parseSourceArchiveStatus(status))

  const limitText = one(query.limit)
  const limit = limitText && /^\d+$/.test(limitText) ? Math.min(Math.max(Number(limitText), 1), 500) : 200
  params.push(limit)

  const archives = await queryFresh<SourceArchiveRow>(`
    SELECT ${SOURCE_ARCHIVE_COLUMNS}
      FROM banner_source_archives
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY source_design_hash, size_label NULLS LAST, created_at
     LIMIT $${params.length}
  `, params)
  return { archives }
})
