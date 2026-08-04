import {
  createError,
  eventHandler,
  getRouterParam,
  readBody,
  setResponseHeader,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import { createEvaluationOrchestrator } from '~~/server/utils/ai/governance/evaluationOrchestrator'
import type { EvaluationRunRecord } from '~~/server/utils/ai/governance/evaluationRunPersistence'

const BodySchema = z.strictObject({
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  rateCardId: z.uuid(),
  approvalId: z.uuid()
})

interface EvaluationRunPostDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  getRouterParam(event: H3Event, name: string): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  executeApprovedEvaluation(input: {
    evaluationRunId: string
    planDigest: string
    rateCardId: string
    approvalId: string
  }, actorId: string, event: H3Event): Promise<EvaluationRunRecord>
}

const defaultDependencies: EvaluationRunPostDependencies = {
  requirePermission,
  requireWriteAccess,
  readBody,
  getRouterParam,
  setResponseHeader,
  executeApprovedEvaluation(input, actorId, event) {
    return createEvaluationOrchestrator({
      aiBinding: (event.context as any).cloudflare?.env?.AI
    }).executeApprovedEvaluation(input, actorId)
  }
}

function sanitizedExecutionError(error: unknown): never {
  const candidate = error as { code?: unknown, statusCode?: unknown, name?: unknown }
  const statusCode = typeof candidate.statusCode === 'number' && [404, 409, 422].includes(candidate.statusCode)
    ? candidate.statusCode
    : candidate.name === 'EvaluationPersistenceError'
      ? 409
      : 500
  throw createError({
    statusCode,
    statusMessage: statusCode === 500 ? 'Evaluation execution failed' : 'Evaluation execution was not admitted',
    data: {
      code: statusCode === 500 || typeof candidate.code !== 'string'
        ? 'evaluation_execution_failed'
        : candidate.code
    }
  })
}

export function createEvaluationRunPostHandler(
  dependencies: EvaluationRunPostDependencies = defaultDependencies
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
      throw createError({ statusCode: 422, statusMessage: 'Invalid evaluation execution request', data: { code: 'invalid_request' } })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.executeApprovedEvaluation({ evaluationRunId: runId.data, ...body.data }, actor.id, event)
    } catch (error) {
      sanitizedExecutionError(error)
    }
  }
}

export default eventHandler(createEvaluationRunPostHandler())
