// server/api/email/templates/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listTemplates } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const items = await listTemplates()
  return { items }
})
