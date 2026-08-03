import {
  createError,
  eventHandler,
  getRouterParam,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import {
  approveEvaluationCost,
  type EvaluationOrchestrationError
} from '~~/server/utils/ai/governance/evaluationOrchestrator'
import type { StoredEvaluationCostApproval } from '~~/server/utils/ai/governance/evaluationApprovalStore'

const BodySchema = z.strictObject({
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  maxSpendUsdMicros: z.number().int().nonnegative().max(10_000_000_000),
  expiresAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(10).max(1_000)
})

interface EvaluationApprovePostDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  getRouterParam(event: H3Event, name: string): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  setResponseStatus(event: H3Event, statusCode: number): void
  approveEvaluationCost(input: {
    evaluationRunId: string
    planDigest: string
    maxSpendUsdMicros: number
    expiresAt: string
    reason: string
  }, actorId: string): Promise<StoredEvaluationCostApproval>
}

const defaultDependencies: EvaluationApprovePostDependencies = {
  requirePermission,
  requireWriteAccess,
  readBody,
  getRouterParam,
  setResponseHeader,
  setResponseStatus,
  approveEvaluationCost
}

function sanitizedApprovalError(error: unknown): never {
  const candidate = error as EvaluationOrchestrationError & { code?: string, statusCode?: number }
  const isKnownConflict = candidate.name === 'EvaluationApprovalStoreError'
  const statusCode = isKnownConflict
    ? 409
    : typeof candidate.statusCode === 'number' && [404, 409, 422].includes(candidate.statusCode)
      ? candidate.statusCode
      : 500
  throw createError({
    statusCode,
    statusMessage: statusCode === 500 ? 'Evaluation approval failed' : 'Evaluation approval was not admitted',
    data: { code: statusCode === 500 ? 'evaluation_approval_failed' : candidate.code ?? 'evaluation_approval_conflict' }
  })
}

export function createEvaluationApprovePostHandler(
  dependencies: EvaluationApprovePostDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writableActor = await dependencies.requireWriteAccess(event)
    if (actor.id !== writableActor.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    }
    const runId = z.uuid().safeParse(dependencies.getRouterParam(event, 'id'))
    const body = BodySchema.safeParse(await dependencies.readBody(event))
    if (!runId.success || !body.success) {
      throw createError({ statusCode: 422, statusMessage: 'Invalid evaluation approval request', data: { code: 'invalid_request' } })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const result = await dependencies.approveEvaluationCost({ evaluationRunId: runId.data, ...body.data }, actor.id)
      dependencies.setResponseStatus(event, 201)
      return result
    } catch (error) {
      sanitizedApprovalError(error)
    }
  }
}

export default eventHandler(createEvaluationApprovePostHandler())
