// server/api/email/templates/[id].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { getTemplate } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const template = await getTemplate(id)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { template }
})
