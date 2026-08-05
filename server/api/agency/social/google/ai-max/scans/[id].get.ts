import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { getGoogleAiMaxScanRun } from '~~/server/utils/googleAiMaxRepository'

const RunIdSchema = z.string().uuid()

export default eventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  }

  const parsedId = RunIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedId.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AI Max scan id' })
  }

  const run = await getGoogleAiMaxScanRun(tenantId, parsedId.data)
  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'AI Max scan not found' })
  }
  return run
})
