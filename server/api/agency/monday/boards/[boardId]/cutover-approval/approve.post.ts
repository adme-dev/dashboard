import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  MondayCutoverApprovalCommandSchema,
  MondayCutoverApprovalConflictError,
  approveMondayCutoverArtifact,
  fingerprintMondayCutoverPlan,
  getMondayCutoverApprovalArtifact
} from '~~/server/utils/mondayCutoverApproval'
import {
  loadMondayCutoverPlan,
  MondayCutoverIdentifiersSchema
} from '~~/server/utils/mondayCutoverPlanLoader'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const body = MondayCutoverApprovalCommandSchema.safeParse(await readBody(event))
  const identifiers = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: body.success ? body.data.targetBoardId : undefined
  })
  if (!body.success || !identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover approval command'
    })
  }

  try {
    const artifact = await getMondayCutoverApprovalArtifact(
      identifiers.data.boardId,
      identifiers.data.targetBoardId
    )
    if (!artifact) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Monday cutover approval draft not found'
      })
    }
    if (artifact.revision !== body.data.expectedRevision || artifact.state !== 'draft') {
      throw new MondayCutoverApprovalConflictError()
    }

    const plan = await loadMondayCutoverPlan({
      ...identifiers.data,
      resolutions: artifact.resolutions
    })
    const currentPlanFingerprint = fingerprintMondayCutoverPlan(plan)
    if (currentPlanFingerprint !== artifact.planFingerprint) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover plan changed; save a new draft'
      })
    }
    if (!plan.summary.isReadyForImport) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover plan still has blocking exceptions'
      })
    }

    const approved = await approveMondayCutoverArtifact({
      sourceBoardId: identifiers.data.boardId,
      targetBoardId: identifiers.data.targetBoardId,
      expectedRevision: body.data.expectedRevision,
      planFingerprint: currentPlanFingerprint,
      actorId: user.id,
      reason: body.data.reason
    })

    return {
      artifact: approved,
      plan,
      evidence: {
        currentPlanFingerprint,
        isCurrent: true,
        canApprove: false
      }
    }
  } catch (error: unknown) {
    if (error instanceof MondayCutoverApprovalConflictError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover approval revision conflict'
      })
    }
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[monday-cutover-approval] approval failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover approval unavailable'
    })
  }
})
