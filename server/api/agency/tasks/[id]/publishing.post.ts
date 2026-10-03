import { z } from 'zod'
import { requireWriteAccess, requireBoardAccess, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { handoffTaskPublishing, taskPublishingInput } from '~~/server/utils/taskPublishing'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  await requireRole(event, PERMISSIONS.CREATIVE)
  const taskId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!taskId.success) throw createError({ statusCode: 400, statusMessage: 'Valid task ID required' })
  const id = taskId.data
  const parsed = taskPublishingInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a valid publishing draft' })
  return handoffTaskPublishing(id, user.id, parsed.data, async (clientId, boardId) => {
    await requireBoardAccess(event, boardId)
    await requireSocialClientAccess(event, clientId)
  })
})
