import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { MergeDefinitionInputSchema } from '~~/shared/emailRendering/mergeTagDefinitions'
import { createMergeDefinition } from '~~/server/utils/email-marketing/mergeTagDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = MergeDefinitionInputSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_merge_definition' })
  await assertEmailClientAccess(event, user, parsed.data.client_id)
  const item = await createMergeDefinition(parsed.data)
  if (!item) throw createError({ statusCode: 409, statusMessage: 'merge_token_already_exists' })
  return { item }
})
