import { createError, eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requirePermission, type User } from '~~/server/utils/auth'
import { listEvaluations } from '~~/server/utils/ai/governance/evaluationOrchestrator'
import type { EvaluationRunRecord } from '~~/server/utils/ai/governance/evaluationRunPersistence'

interface EvaluationIndexGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  setResponseHeader(event: H3Event, name: string, value: string): void
  listEvaluations(): Promise<EvaluationRunRecord[]>
}

const defaultDependencies: EvaluationIndexGetDependencies = {
  requirePermission,
  setResponseHeader,
  listEvaluations
}

export function createEvaluationIndexGetHandler(
  dependencies: EvaluationIndexGetDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return { items: await dependencies.listEvaluations() }
    } catch {
      throw createError({
        statusCode: 500,
        statusMessage: 'AI evaluations are unavailable',
        data: { code: 'evaluation_list_failed' }
      })
    }
  }
}

export default eventHandler(createEvaluationIndexGetHandler())
