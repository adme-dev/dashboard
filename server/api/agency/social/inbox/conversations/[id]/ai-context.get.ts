import { requireSocialInboxConversation } from '~~/server/utils/socialInbox/departmentScope'
import { loadSocialInboxAiContext } from '~~/server/utils/socialInbox/aiContext'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireSocialInboxConversation(event, id)
  const context = await loadSocialInboxAiContext(id)
  if (!context) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  return { context }
})
