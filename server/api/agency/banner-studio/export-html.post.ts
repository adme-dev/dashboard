import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { prepareScopedExport, recheckScopedExport, type ScopedProject } from '~~/server/utils/banner/scopedExport'
import { RASTER_EXPORT_UUID } from '~~/server/utils/banner/exportRendering'

export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'private, no-store')
  const user = await requireWriteAccess(event)
  const body = await readBody(event)
  if (!body || typeof body.projectId !== 'string' || !RASTER_EXPORT_UUID.test(body.projectId)
    || Object.keys(body).some(key => !['projectId', 'sourceRevision', 'formats'].includes(key))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid HTML export request' })
  }
  const project = await queryOneFresh<ScopedProject>('SELECT canvas_data, updated_at FROM banner_projects WHERE id = $1', [body.projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const prepared = await prepareScopedExport(event, user.id, body, project, 'html')
  if (!prepared) throw createError({ statusCode: 409, statusMessage: 'Protected saved artwork is required for this export path' })
  await recheckScopedExport(user.id, prepared.provenance, true)
  return { formats: prepared.body.formats }
})
