// server/api/agency/email/modules/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { getCustomModule, deleteCustomModule } from '~~/server/utils/email-marketing/customModules'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { assertFreshLegacyModulePublisher } from '~~/server/utils/email-marketing/designModulePublisher'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  const existing = await getCustomModule(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  await assertFreshLegacyModulePublisher(event, user.id, existing.client_id)
  if (existing.design_document_id) throw createError({ statusCode: 409, statusMessage: 'immutable_module_revision_required' })

  await deleteCustomModule(id)
  return { ok: true }
})
