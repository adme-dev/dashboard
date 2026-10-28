import { requireSocialInboxConversation } from '~~/server/utils/socialInbox/departmentScope'
import { queryOne, queryRows } from '~~/server/utils/db'
import { buildSocialInboxCaseTimelineQuery } from '~~/server/utils/socialInbox/caseTimeline'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireSocialInboxConversation(event, id)
  const query = getQuery(event)

  const conversation = await queryOne<{ id: string }>(
    'SELECT id FROM social_conversations WHERE id = $1',
    [id]
  )
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const timelineQuery = buildSocialInboxCaseTimelineQuery(id, query.limit)
  const timeline = await queryRows(timelineQuery.sql, timelineQuery.params)
  return { timeline }
})
