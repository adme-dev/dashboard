import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteTemplate, getTemplate } from '~~/server/utils/email-marketing/templates'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { rethrowLegacyDesignConflict } from '~~/server/utils/email-marketing/designConflict'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const existing = await getTemplate(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  try {
    const deleted = await deleteTemplate(id, existing.client_id)
    if (deleted === false) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    return { ok: true }
  } catch (error) {
    rethrowLegacyDesignConflict(error)
  }
})
