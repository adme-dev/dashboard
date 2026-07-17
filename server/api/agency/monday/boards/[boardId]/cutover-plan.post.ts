import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { MondayCutoverResolutionsSchema } from '~~/server/utils/mondayCutoverPlan'
import {
  loadMondayCutoverPlan,
  MondayCutoverIdentifiersSchema
} from '~~/server/utils/mondayCutoverPlanLoader'

const BodySchema = z.strictObject({
  targetBoardId: z.string().uuid(),
  resolutions: MondayCutoverResolutionsSchema
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const body = BodySchema.safeParse(await readBody(event))
  const identifiers = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: body.success ? body.data.targetBoardId : undefined
  })
  if (!body.success || !identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover resolution request'
    })
  }

  try {
    return await loadMondayCutoverPlan({
      ...identifiers.data,
      resolutions: body.data.resolutions
    })
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-cutover-plan] resolution read failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover resolution unavailable'
    })
  }
})
