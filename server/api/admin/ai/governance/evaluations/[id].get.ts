import {
  createError,
  eventHandler,
  getRouterParam,
  setResponseHeader,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  getEvaluation,
  type EvaluationRunDetail
} from '~~/server/utils/ai/governance/evaluationOrchestrator'

interface EvaluationGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  getRouterParam(event: H3Event, name: string): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  getEvaluation(evaluationRunId: string): Promise<EvaluationRunDetail | null>
}

const defaultDependencies: EvaluationGetDependencies = {
  requirePermission,
  getRouterParam,
  setResponseHeader,
  getEvaluation
}

export function createEvaluationGetHandler(dependencies: EvaluationGetDependencies = defaultDependencies) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    const parsedId = z.uuid().safeParse(dependencies.getRouterParam(event, 'id'))
    if (!parsedId.success) {
      throw createError({ statusCode: 422, statusMessage: 'Invalid evaluation run ID', data: { code: 'invalid_request' } })
    }
    try {
      const result = await dependencies.getEvaluation(parsedId.data)
      if (!result) {
        throw createError({ statusCode: 404, statusMessage: 'Evaluation run not found', data: { code: 'evaluation_run_not_found' } })
      }
      return result
    } catch (error) {
      if ((error as any)?.statusCode === 404) throw error
      throw createError({
        statusCode: 500,
        statusMessage: 'AI evaluation is unavailable',
        data: { code: 'evaluation_read_failed' }
      })
    }
  }
}

export default eventHandler(createEvaluationGetHandler())
