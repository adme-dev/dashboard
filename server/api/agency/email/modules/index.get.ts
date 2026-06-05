// server/api/agency/email/modules/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listCustomModules } from '~~/server/utils/email-marketing/customModules'
import { resolveEmailClientScope } from '~~/server/utils/email-marketing/access'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const clientIds = await resolveEmailClientScope(event, user)
  const items = await listCustomModules(clientIds)
  return { items }
})
