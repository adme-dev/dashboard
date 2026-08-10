import {
  createError,
  eventHandler,
  getRouterParam,
  setResponseHeader,
  type H3Event
} from 'h3'
import { getCrmSearchEvaluationRun } from '~~/server/utils/crm/search/evaluation/repository'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu

export interface CrmSearchEvaluationGetDependencies {
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  getRouterParam(event: H3Event, name: 'id'): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  getEvaluation(id: string, organisationScopeId: string): Promise<unknown>
}

const defaults: CrmSearchEvaluationGetDependencies = {
  requireFreshAdmin: event => requireFreshCrmSearchAdmin(event),
  getRouterParam,
  setResponseHeader,
  getEvaluation: getCrmSearchEvaluationRun
}

export function createCrmSearchEvaluationGetHandler(
  overrides: Partial<CrmSearchEvaluationGetDependencies> = {}
) {
  const dependencies = { ...defaults, ...overrides }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const id = dependencies.getRouterParam(event, 'id')
    if (!id || !uuidPattern.test(id)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'CRM search evaluation not found',
        data: { code: 'crm_search_evaluation_not_found' }
      })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.getEvaluation(id, authority.orgId)
    } catch (error) {
      const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
      if (code === 'crm_search_evaluation_not_found') {
        throw createError({
          statusCode: 404,
          statusMessage: 'CRM search evaluation not found',
          data: { code }
        })
      }
      throw createError({
        statusCode: 500,
        statusMessage: 'CRM search evaluation read failed',
        data: { code: 'crm_search_evaluation_read_failed' }
      })
    }
  }
}

export default eventHandler(createCrmSearchEvaluationGetHandler())
