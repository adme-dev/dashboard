import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  loadMondayCutoverPlan,
  MondayCutoverIdentifiersSchema
} from '~~/server/utils/mondayCutoverPlanLoader'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const parsed = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: getQuery(event).targetBoardId
  })
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover plan request'
    })
  }

  try {
    return await loadMondayCutoverPlan(parsed.data)
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-cutover-plan] read failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover plan unavailable'
    })
  }
})
