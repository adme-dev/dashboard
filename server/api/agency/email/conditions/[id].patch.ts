import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { ConditionDefinitionPatchSchema } from '~~/shared/emailRendering/conditions'
import { updateConditionDefinition } from '~~/server/utils/email-marketing/conditionDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const scope = z.object({ id: z.string().uuid(), client: z.string().uuid() }).safeParse({ id: getRouterParam(event, 'id'), client: getQuery(event).client_id })
  const patch = ConditionDefinitionPatchSchema.safeParse(await readBody(event))
  if (!scope.success || !patch.success) throw createError({ statusCode: 400, statusMessage: 'invalid_condition_definition' })
  await assertEmailClientAccess(event, user, scope.data.client)
  const item = await updateConditionDefinition(scope.data.id, scope.data.client, patch.data).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      throw createError({ statusCode: 409, statusMessage: 'condition_name_already_exists' })
    throw error
  })
  if (!item) throw createError({ statusCode: 404, statusMessage: 'condition_definition_not_found' })
  return { item }
})
