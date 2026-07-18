import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  MondayCutoverApprovalConflictError,
  MondayCutoverApprovalDraftSchema,
  fingerprintMondayCutoverPlan,
  saveMondayCutoverApprovalDraft
} from '~~/server/utils/mondayCutoverApproval'
import {
  loadMondayCutoverPlan,
  MondayCutoverIdentifiersSchema
} from '~~/server/utils/mondayCutoverPlanLoader'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const body = MondayCutoverApprovalDraftSchema.safeParse(await readBody(event))
  const identifiers = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: body.success ? body.data.targetBoardId : undefined
  })
  if (!body.success || !identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover approval draft'
    })
  }

  try {
    const plan = await loadMondayCutoverPlan({
      ...identifiers.data,
      resolutions: body.data.resolutions
    })
    const currentPlanFingerprint = fingerprintMondayCutoverPlan(plan)
    const artifact = await saveMondayCutoverApprovalDraft({
      sourceBoardId: identifiers.data.boardId,
      targetBoardId: identifiers.data.targetBoardId,
      expectedRevision: body.data.expectedRevision,
      resolutions: body.data.resolutions,
      planFingerprint: currentPlanFingerprint,
      actorId: user.id
    })

    return {
      artifact,
      plan,
      evidence: {
        currentPlanFingerprint,
        isCurrent: true,
        canApprove: plan.summary.isReadyForImport
      }
    }
  } catch (error: unknown) {
    if (error instanceof MondayCutoverApprovalConflictError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monday cutover approval revision conflict'
      })
    }
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-cutover-approval] save failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover approval save unavailable'
    })
  }
})
