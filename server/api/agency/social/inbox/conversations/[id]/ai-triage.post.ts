import { requireAuth } from '~~/server/utils/auth'
import { loadSocialInboxAiContext } from '~~/server/utils/socialInbox/aiContext'
import { generateSocialInboxAiTriage } from '~~/server/utils/socialInbox/aiTriage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const context = await loadSocialInboxAiContext(id)
  if (!context) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  const triage = await generateSocialInboxAiTriage(context)
  return { context, triage }
})
