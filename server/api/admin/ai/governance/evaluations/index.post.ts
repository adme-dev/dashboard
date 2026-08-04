import {
  createError,
  eventHandler,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import { EvaluationRunnerBudgetSchema } from '~~/server/utils/ai/governance/deterministicEvaluationRunner'
import {
  preflightEvaluation,
  type EvaluationPreflightRequest,
  type EvaluationPreflightResult
} from '~~/server/utils/ai/governance/evaluationOrchestrator'

const BodySchema = z.strictObject({
  packVersionId: z.uuid(),
  modelProvider: z.enum(['groq', 'anthropic', 'workers_ai']),
  modelId: z.string().trim().min(1).max(240),
  budget: EvaluationRunnerBudgetSchema
})

interface EvaluationIndexPostDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  setResponseStatus(event: H3Event, statusCode: number): void
  preflightEvaluation(input: EvaluationPreflightRequest, actorId: string): Promise<EvaluationPreflightResult>
}

const defaultDependencies: EvaluationIndexPostDependencies = {
  requirePermission,
  requireWriteAccess,
  readBody,
  setResponseHeader,
  setResponseStatus,
  preflightEvaluation
}

function sanitizedServiceError(error: unknown): never {
  const candidate = error as { code?: unknown, statusCode?: unknown, name?: unknown }
  const allowedStatus = typeof candidate.statusCode === 'number' && [404, 409, 422].includes(candidate.statusCode)
    ? candidate.statusCode
    : 500
  throw createError({
    statusCode: allowedStatus,
    statusMessage: allowedStatus === 500 ? 'Evaluation preflight failed' : 'Evaluation preflight was not admitted',
    data: {
      code: allowedStatus === 500 || typeof candidate.code !== 'string'
        ? 'evaluation_preflight_failed'
        : candidate.code
    }
  })
}

export function createEvaluationIndexPostHandler(
  dependencies: EvaluationIndexPostDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writableActor = await dependencies.requireWriteAccess(event)
    if (actor.id !== writableActor.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    }
    const parsed = BodySchema.safeParse(await dependencies.readBody(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid evaluation preflight request',
        data: { code: 'invalid_request' }
      })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const result = await dependencies.preflightEvaluation(parsed.data, actor.id)
      dependencies.setResponseStatus(event, 201)
      return result
    } catch (error) {
      sanitizedServiceError(error)
    }
  }
}

export default eventHandler(createEvaluationIndexPostHandler())
