import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { deleteMergeDefinition } from '~~/server/utils/email-marketing/mergeTagDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const scope = z.object({ id: z.string().uuid(), client: z.string().uuid() }).safeParse({ id: getRouterParam(event, 'id'), client: getQuery(event).client_id })
  if (!scope.success) throw createError({ statusCode: 400, statusMessage: 'invalid_merge_definition' })
  await assertEmailClientAccess(event, user, scope.data.client)
  const item = await deleteMergeDefinition(scope.data.id, scope.data.client)
  if (!item) throw createError({ statusCode: 404, statusMessage: 'merge_definition_not_found' })
  return { ok: true }
})
