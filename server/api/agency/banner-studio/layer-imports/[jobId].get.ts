import { requireWriteAccess } from '~~/server/utils/auth'
import { isUuid, readLayerImport } from '~~/server/utils/banner/layerImport'

/** Progress of an "Import image as layers" job, and its layers once it is done. */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!isUuid(jobId)) throw createError({ statusCode: 400, statusMessage: 'Import id is required' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return await readLayerImport(event, user, jobId)
})
