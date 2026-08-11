import { eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { listCrmSearchPolicies } from '~~/server/utils/crm/search/operations/health'

export function createCrmSearchPoliciesHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  setResponseHeader(event: H3Event, name: string, value: string): void
  listPolicies(organisationScopeId: string): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    setResponseHeader,
    listPolicies: listCrmSearchPolicies,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return await dependencies.listPolicies(authority.orgId)
  }
}

export default eventHandler(createCrmSearchPoliciesHandler())
