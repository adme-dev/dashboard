import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { MergeDefinitionPatchSchema } from '~~/shared/emailRendering/mergeTagDefinitions'
import { updateMergeDefinition } from '~~/server/utils/email-marketing/mergeTagDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const scope = z.object({ id: z.string().uuid(), client: z.string().uuid() }).safeParse({ id: getRouterParam(event, 'id'), client: getQuery(event).client_id })
  const patch = MergeDefinitionPatchSchema.safeParse(await readBody(event))
  if (!scope.success || !patch.success) throw createError({ statusCode: 400, statusMessage: 'invalid_merge_definition' })
  await assertEmailClientAccess(event, user, scope.data.client)
  const item = await updateMergeDefinition(scope.data.id, scope.data.client, patch.data)
  if (!item) throw createError({ statusCode: 404, statusMessage: 'merge_definition_not_found' })
  return { item }
})
