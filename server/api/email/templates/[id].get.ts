// server/api/email/templates/[id].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { getTemplate } from '~~/server/utils/email-marketing/templates'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const template = await getTemplate(id)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, template.client_id)
  return { template }
})
