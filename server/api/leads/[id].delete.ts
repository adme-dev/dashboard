import { requireAuth } from '~~/server/utils/auth'
import { softDeleteLead } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const n = await softDeleteLead(id)
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
