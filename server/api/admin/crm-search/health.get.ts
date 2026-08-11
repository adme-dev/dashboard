import { eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requireFreshCrmSearchAdmin, type FreshCrmSearchAdminDependencies } from '~~/server/utils/crm/search/operations/audit'
import { loadCrmSearchHealth } from '~~/server/utils/crm/search/operations/health'

export interface CrmSearchHealthHandlerDependencies {
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  setResponseHeader(event: H3Event, name: string, value: string): void
  loadHealth(organisationScopeId: string): Promise<unknown>
}

const defaults: CrmSearchHealthHandlerDependencies = {
  requireFreshAdmin: event => requireFreshCrmSearchAdmin(event),
  setResponseHeader,
  loadHealth: loadCrmSearchHealth
}

export function createCrmSearchHealthHandler(overrides: Partial<CrmSearchHealthHandlerDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return await dependencies.loadHealth(authority.orgId)
  }
}

export type { FreshCrmSearchAdminDependencies }
export default eventHandler(createCrmSearchHealthHandler())
