import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import {
  replayEmailIngestion,
  resolveEmailRecoveryRuntime
} from '~~/server/utils/leads/emailRecovery'

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const actor = await requireRole(event, PERMISSIONS.ADMIN)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const result = await replayEmailIngestion(
    event,
    id,
    actor.id,
    resolveEmailRecoveryRuntime(event)
  )
  return { ok: true, status: result.status }
})
