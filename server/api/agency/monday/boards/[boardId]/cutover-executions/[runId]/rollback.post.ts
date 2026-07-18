import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import {
  MondayCutoverRollbackCommandSchema,
  hasValidMondayCutoverRollbackConfirmation
} from '~~/server/utils/mondayCutoverExecution'
import {
  MondayCutoverExecutionConflictError,
  rollbackMondayCutoverRun
} from '~~/server/utils/mondayCutoverExecutionStore'

const RollbackIdentifiersSchema = z.strictObject({
  sourceBoardId: z.string().trim().regex(/^\d+$/).max(30),
  targetBoardId: z.string().uuid(),
  runId: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const command = MondayCutoverRollbackCommandSchema.safeParse(await readBody(event))
  const identifiers = RollbackIdentifiersSchema.safeParse({
    sourceBoardId: getRouterParam(event, 'boardId'),
    targetBoardId: command.success ? command.data.targetBoardId : undefined,
    runId: getRouterParam(event, 'runId')
  })
  if (!command.success || !identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover rollback command'
    })
  }
  if (!hasValidMondayCutoverRollbackConfirmation(identifiers.data.runId, command.data)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover rollback confirmation'
    })
  }

  try {
    const run = await rollbackMondayCutoverRun({
      runId: identifiers.data.runId,
      sourceBoardId: identifiers.data.sourceBoardId,
      targetBoardId: identifiers.data.targetBoardId,
      expectedPlanFingerprint: command.data.expectedPlanFingerprint,
      actorId: user.id,
      reason: command.data.reason
    })
    return {
      run,
      evidence: {
        planFingerprint: command.data.expectedPlanFingerprint,
        deletedTasks: run.createdTasks
      }
    }
  } catch (error: unknown) {
    if (error instanceof MondayCutoverExecutionConflictError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover rollback evidence conflict'
      })
    }
    console.error('[monday-cutover-rollback] rollback failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover rollback unavailable'
    })
  }
})
