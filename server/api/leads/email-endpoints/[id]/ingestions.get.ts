import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { listEmailEndpointIngestions } from '~~/server/utils/leads/emailEndpoint'

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor_created_at: z.string().datetime({ offset: true }).optional(),
  cursor_id: z.string().uuid().optional()
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.cursor_created_at) !== Boolean(value.cursor_id)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cursor_created_at and cursor_id must be supplied together' })
  }
})

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const query = Query.parse(getQuery(event))
  return await listEmailEndpointIngestions(id, actor.id, {
    limit: query.limit,
    cursor: query.cursor_created_at && query.cursor_id
      ? { createdAt: query.cursor_created_at, id: query.cursor_id }
      : null
  })
})
