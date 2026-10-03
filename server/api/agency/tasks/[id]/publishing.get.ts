import { z } from 'zod'
import { requireAuth, requireBoardAccess } from '~~/server/utils/auth'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { getTaskPublishing } from '~~/server/utils/taskPublishing'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const taskId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!taskId.success) throw createError({ statusCode: 400, statusMessage: 'Valid task ID required' })
  const id = taskId.data
  return getTaskPublishing(id, async (clientId, boardId) => {
    await requireBoardAccess(event, boardId)
    await requireSocialClientAccess(event, clientId)
  })
})
