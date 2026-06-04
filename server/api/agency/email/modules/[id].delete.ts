// server/api/agency/email/modules/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { getCustomModule, deleteCustomModule } from '~~/server/utils/email-marketing/customModules'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  const existing = await getCustomModule(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  await deleteCustomModule(id)
  return { ok: true }
})
