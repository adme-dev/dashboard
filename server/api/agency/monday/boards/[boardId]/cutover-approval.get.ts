import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  fingerprintMondayCutoverPlan,
  getMondayCutoverApprovalArtifact
} from '~~/server/utils/mondayCutoverApproval'
import {
  loadMondayCutoverPlan,
  MondayCutoverIdentifiersSchema
} from '~~/server/utils/mondayCutoverPlanLoader'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const identifiers = MondayCutoverIdentifiersSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: getQuery(event).targetBoardId
  })
  if (!identifiers.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover approval request'
    })
  }

  try {
    const artifact = await getMondayCutoverApprovalArtifact(
      identifiers.data.boardId,
      identifiers.data.targetBoardId
    )
    const plan = await loadMondayCutoverPlan({
      ...identifiers.data,
      resolutions: artifact?.resolutions ?? { clients: [], columns: [] }
    })
    const currentPlanFingerprint = fingerprintMondayCutoverPlan(plan)
    const isCurrent = artifact?.planFingerprint === currentPlanFingerprint

    return {
      artifact,
      plan,
      evidence: {
        currentPlanFingerprint,
        isCurrent,
        canApprove: Boolean(
          artifact?.state === 'draft'
          && isCurrent
          && plan.summary.isReadyForImport
        )
      }
    }
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-cutover-approval] read failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover approval unavailable'
    })
  }
})
