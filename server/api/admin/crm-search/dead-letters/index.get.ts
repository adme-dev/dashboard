import { eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { listCrmSearchDeadLetters } from '~~/server/utils/crm/search/operations/health'

export function createCrmSearchDeadLettersHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  setResponseHeader(event: H3Event, name: string, value: string): void
  listDeadLetters(organisationScopeId: string): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    setResponseHeader,
    listDeadLetters: listCrmSearchDeadLetters,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return await dependencies.listDeadLetters(authority.orgId)
  }
}

export default eventHandler(createCrmSearchDeadLettersHandler())
