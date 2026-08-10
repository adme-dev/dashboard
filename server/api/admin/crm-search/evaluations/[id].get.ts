import {
  createError,
  eventHandler,
  getRouterParam,
  setResponseHeader,
  type H3Event
} from 'h3'
import { requirePermission, type User } from '~~/server/utils/auth'
import { getCrmSearchEvaluationRun } from '~~/server/utils/crm/search/evaluation/repository'
import { resolveCrmSearchEvaluationOrganisationScopeId } from '~~/server/utils/crm/search/evaluation/runner'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu

export interface CrmSearchEvaluationGetDependencies {
  requireRole(event: H3Event, roles: readonly ['ADMIN']): Promise<User>
  getRouterParam(event: H3Event, name: 'id'): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  resolveOrganisationScopeId(event: H3Event): string
  getEvaluation(id: string, organisationScopeId: string): Promise<unknown>
}

const defaults: CrmSearchEvaluationGetDependencies = {
  requireRole: event => requirePermission(event, 'ADMIN'),
  getRouterParam,
  setResponseHeader,
  resolveOrganisationScopeId: resolveCrmSearchEvaluationOrganisationScopeId,
  getEvaluation: getCrmSearchEvaluationRun
}

export function createCrmSearchEvaluationGetHandler(
  overrides: Partial<CrmSearchEvaluationGetDependencies> = {}
) {
  const dependencies = { ...defaults, ...overrides }
  return async (event: H3Event) => {
    await dependencies.requireRole(event, ['ADMIN'])
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
      const organisationScopeId = dependencies.resolveOrganisationScopeId(event)
      return await dependencies.getEvaluation(id, organisationScopeId)
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
