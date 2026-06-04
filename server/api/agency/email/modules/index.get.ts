// server/api/agency/email/modules/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listCustomModules } from '~~/server/utils/email-marketing/customModules'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const items = await listCustomModules()
  return { items }
})
