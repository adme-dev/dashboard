import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  fingerprintMondayCutoverPlan,
  getMondayCutoverApprovalArtifact
} from '~~/server/utils/mondayCutoverApproval'
import {
  MondayCutoverExecutionCommandSchema,
  MondayCutoverExecutionValidationError,
  hasValidMondayCutoverExecutionConfirmation
} from '~~/server/utils/mondayCutoverExecution'
import {
  MondayCutoverExecutionConflictError,
  executeMondayCutoverRun,
  failMondayCutoverExecutionRun,
  prepareMondayCutoverExecutionRun
} from '~~/server/utils/mondayCutoverExecutionStore'
import {
  MondayCutoverIdentifiersSchema,
  loadMondayCutoverExecutionSnapshot
} from '~~/server/utils/mondayCutoverPlanLoader'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const command = MondayCutoverExecutionCommandSchema.safeParse(await readBody(event))
  const identifiers = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: command.success ? command.data.targetBoardId : undefined
  })
  if (!command.success || !identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover execution command'
    })
  }
  if (!hasValidMondayCutoverExecutionConfirmation(identifiers.data.boardId, command.data)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover execution confirmation'
    })
  }

  let preparedRunId: string | null = null
  try {
    const artifact = await getMondayCutoverApprovalArtifact(
      identifiers.data.boardId,
      identifiers.data.targetBoardId
    )
    if (!artifact) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Monday cutover approval artifact not found'
      })
    }
    if (
      artifact.state !== 'approved'
      || artifact.revision !== command.data.expectedArtifactRevision
      || artifact.planFingerprint !== command.data.expectedPlanFingerprint
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover evidence is not approved and current'
      })
    }

    const snapshot = await loadMondayCutoverExecutionSnapshot({
      ...identifiers.data,
      resolutions: artifact.resolutions
    })
    const currentPlanFingerprint = fingerprintMondayCutoverPlan(snapshot.plan)
    if (
      currentPlanFingerprint !== artifact.planFingerprint
      || currentPlanFingerprint !== command.data.expectedPlanFingerprint
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover plan changed after approval'
      })
    }
    if (!snapshot.plan.summary.isReadyForImport) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover plan still has blocking exceptions'
      })
    }

    const prepared = await prepareMondayCutoverExecutionRun({
      artifactId: artifact.id,
      sourceBoardId: identifiers.data.boardId,
      targetBoardId: identifiers.data.targetBoardId,
      artifactRevision: artifact.revision,
      planFingerprint: currentPlanFingerprint,
      idempotencyKey: command.data.idempotencyKey,
      actorId: user.id,
      reason: command.data.reason
    })
    preparedRunId = prepared.run.id

    if (prepared.isReplay) {
      if (prepared.run.status !== 'completed') {
        throw new MondayCutoverExecutionConflictError(
          `Idempotent execution replay is ${prepared.run.status}`
        )
      }
      return {
        run: prepared.run,
        evidence: {
          sourceRecords: snapshot.plan.summary.sourceRecords,
          planFingerprint: currentPlanFingerprint,
          isReplay: true
        }
      }
    }

    try {
      const run = await executeMondayCutoverRun({
        runId: prepared.run.id,
        artifactId: artifact.id,
        sourceBoardId: identifiers.data.boardId,
        targetBoardId: identifiers.data.targetBoardId,
        artifactRevision: artifact.revision,
        planFingerprint: currentPlanFingerprint,
        actorId: user.id,
        reason: command.data.reason,
        plan: snapshot.plan,
        sourceRecords: snapshot.sourceRecords
      })
      return {
        run,
        evidence: {
          sourceRecords: snapshot.plan.summary.sourceRecords,
          planFingerprint: currentPlanFingerprint,
          isReplay: false
        }
      }
    } catch (error: unknown) {
      const errorCode = error instanceof MondayCutoverExecutionValidationError
        ? 'VALIDATION_FAILED' as const
        : error instanceof MondayCutoverExecutionConflictError
          ? 'EVIDENCE_CONFLICT' as const
          : 'EXECUTION_FAILED' as const
      await failMondayCutoverExecutionRun({
        runId: prepared.run.id,
        actorId: user.id,
        reason: command.data.reason,
        planFingerprint: currentPlanFingerprint,
        errorCode
      }).catch(() => null)
      throw error
    }
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    if (
      error instanceof MondayCutoverExecutionConflictError
      || error instanceof MondayCutoverExecutionValidationError
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover execution evidence conflict'
      })
    }
    console.error('[monday-cutover-execution] execution failed', {
      runPrepared: Boolean(preparedRunId),
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover execution unavailable'
    })
  }
})
