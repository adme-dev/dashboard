import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { leadCaptureTestService } from '~~/server/utils/leads/captureTestService'

const Query = z.strictObject({ clientId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Test run ID required' })
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Client ID required' })
  return { run: await leadCaptureTestService.get(id, parsed.data.clientId) }
})
