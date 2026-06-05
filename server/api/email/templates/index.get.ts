// server/api/email/templates/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listTemplates } from '~~/server/utils/email-marketing/templates'
import { resolveEmailClientScope } from '~~/server/utils/email-marketing/access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const clientIds = await resolveEmailClientScope(event, user)
  const items = await listTemplates(clientIds)
  return { items }
})
