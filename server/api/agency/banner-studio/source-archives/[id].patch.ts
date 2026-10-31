import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  isSourceArchiveId,
  parseSourceArchiveStatus,
  parseSourceHoldReason,
  requireSourceArchiveClientAccess,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

/**
 * Links a retained archive to a Banner Studio project, records its conversion
 * status, or assigns an unassigned archive to a client. The archive bytes and
 * R2 key never change; the key keeps the client segment it was uploaded with.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!isSourceArchiveId(id)) throw createError({ statusCode: 404, statusMessage: 'Source archive not found' })
  const body = (await readBody(event)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Invalid body' })

  const archive = await queryOneFresh<SourceArchiveRow>(
    `SELECT ${SOURCE_ARCHIVE_COLUMNS} FROM banner_source_archives WHERE id = $1`,
    [id]
  )
  if (!archive) throw createError({ statusCode: 404, statusMessage: 'Source archive not found' })
  await requireSourceArchiveClientAccess(event, user, archive.clientId)

  let clientId = archive.clientId
  if (body.clientId !== undefined) {
    const requested = typeof body.clientId === 'string' ? body.clientId.toLowerCase() : null
    if (!requested || !isSourceArchiveId(requested)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
    if (archive.clientId && archive.clientId !== requested) {
      throw createError({ statusCode: 409, statusMessage: 'Archive is already assigned to a client' })
    }
    await requireSourceArchiveClientAccess(event, user, requested)
    clientId = requested
  }

  let projectId = archive.projectId
  if (body.projectId !== undefined) {
    if (body.projectId === null) projectId = null
    else if (isSourceArchiveId(body.projectId)) projectId = body.projectId.toLowerCase()
    else throw createError({ statusCode: 400, statusMessage: 'Invalid projectId' })
  }
  if (projectId && (projectId !== archive.projectId || clientId !== archive.clientId)) {
    const project = await queryOneFresh<{ clientId: string | null }>(
      'SELECT client_id AS "clientId" FROM banner_projects WHERE id = $1',
      [projectId]
    )
    if (!project) throw createError({ statusCode: 400, statusMessage: 'Project not found' })
    if ((project.clientId?.toLowerCase() ?? null) !== clientId) {
      throw createError({ statusCode: 400, statusMessage: 'Project belongs to a different client' })
    }
  }

  const status = body.status === undefined ? archive.status : parseSourceArchiveStatus(body.status)
  if (status === 'imported' && !projectId) {
    throw createError({ statusCode: 400, statusMessage: 'An imported archive must name its projectId' })
  }
  const holdReason = body.holdReason === undefined ? archive.holdReason : parseSourceHoldReason(body.holdReason)

  const updated = await queryOneFresh<SourceArchiveRow>(`
    UPDATE banner_source_archives
       SET client_id = $2, project_id = $3, conversion_status = $4, hold_reason = $5, updated_at = NOW()
     WHERE id = $1 AND client_id IS NOT DISTINCT FROM $6::uuid
     RETURNING ${SOURCE_ARCHIVE_COLUMNS}
  `, [id, clientId, projectId, status, holdReason, archive.clientId])
  if (!updated) throw createError({ statusCode: 409, statusMessage: 'Archive changed concurrently; reload and retry' })
  return { archive: updated }
})
