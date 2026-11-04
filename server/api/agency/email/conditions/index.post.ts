import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { ConditionDefinitionInputSchema } from '~~/shared/emailRendering/conditions'
import { createConditionDefinition } from '~~/server/utils/email-marketing/conditionDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = ConditionDefinitionInputSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_condition_definition' })
  await assertEmailClientAccess(event, user, parsed.data.client_id)
  const item = await createConditionDefinition(parsed.data)
  if (!item) throw createError({ statusCode: 409, statusMessage: 'condition_name_already_exists' })
  return { item }
})
