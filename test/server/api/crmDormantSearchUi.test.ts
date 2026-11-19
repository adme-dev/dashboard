// CRM UI while CRM search is dormant (follow-up to #938).
//
// Production has never applied migrations 350–352, so every staff/portal CRM
// context lookup of crm_search_organisation_scopes raised 42P01 and the whole
// CRM UI 500'd. These tests drive the REAL context resolver (only the DB and
// session primitives are faked) through representative endpoints and prove:
//   - non-search reads succeed with byte-identical authorization predicates;
//   - search endpoints answer an explicit "CRM search is not enabled";
//   - every denial and every non-dormancy failure still fails closed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOneFresh: vi.fn(),
  queryRowsFresh: vi.fn(),
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  queryCount: vi.fn(),
  verifyJwt: vi.fn(),
  requireAuth: vi.fn(),
  digestPortalSessionToken: vi.fn(),
  requireClientCrmAccess: vi.fn(),
  cookies: {} as Record<string, string | undefined>
}))

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => mocks.queryOneFresh(...args),
  queryRowsFresh: (...args: unknown[]) => mocks.queryRowsFresh(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryCount: (...args: unknown[]) => mocks.queryCount(...args),
  execute: vi.fn(),
  transaction: vi.fn(),
  transactionWithoutRetry: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({
  verifyJwt: (...args: unknown[]) => mocks.verifyJwt(...args),
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args)
}))
vi.mock('~~/server/utils/portalSession', () => ({
  digestPortalSessionToken: (...args: unknown[]) => mocks.digestPortalSessionToken(...args)
}))
vi.mock('~~/server/utils/godMode/internalExecutionDelegation', () => ({
  getTrustedTask5DelegatedExecution: async () => null
}))
vi.mock('~~/server/utils/crm/clientCrmAccess', () => ({
  requireClientCrmAccess: (...args: unknown[]) => mocks.requireClientCrmAccess(...args)
}))

const g = globalThis as Record<string, unknown>
g.defineEventHandler = (fn: unknown) => fn
g.getQuery = (event: { query?: unknown }) => event.query ?? {}
g.readBody = async (event: { body?: unknown }) => event.body ?? {}
g.getCookie = (_event: unknown, name: string) => mocks.cookies[name]
g.getHeader = () => undefined

const { resetCrmSearchDormancyLogForTests } = await import('~~/server/utils/crm/searchDormancy')

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const PORTAL_USER_ID = '33333333-3333-4333-8333-333333333333'
const SCOPE_ID = '55555555-5555-4555-8555-555555555555'

const missingSchema = () => Object.assign(
  new Error('relation "crm_search_organisation_scopes" does not exist'),
  { code: '42P01' }
)

interface World {
  role: string
  recordVisibility: 'team' | 'owner'
  clientActive: boolean
  scope: 'missing' | 'present' | 'other_error' | 'unrelated_missing' | 'search_permission_denied'
  portal: { mode: string, canView: boolean, entitled: boolean } | null
}
let world: World

function installDb() {
  mocks.queryRowsFresh.mockImplementation(async (sql: string) => {
    if (sql.includes('crm_search_organisation_scopes')) {
      if (world.scope === 'missing') throw missingSchema()
      if (world.scope === 'other_error') throw Object.assign(new Error('connection terminated'), { code: '08006' })
      if (world.scope === 'search_permission_denied') {
        throw Object.assign(new Error('permission denied for table crm_search_organisation_scopes'), { code: '42501' })
      }
      if (world.scope === 'unrelated_missing') {
        throw Object.assign(new Error('relation "crm_settings" does not exist'), { code: '42P01' })
      }
      return [{ id: SCOPE_ID }]
    }
    return []
  })
  mocks.queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM team_members')) {
      return params[0] === ACTOR_ID
        ? { id: ACTOR_ID, role: world.role, custom_role_id: null, sessions_invalidated_at: null }
        : null
    }
    if (sql.includes('FROM agency_clients client') && sql.includes('crm_settings')) {
      return world.clientActive && params[0] === CLIENT_ID
        ? { id: CLIENT_ID, name: 'Acme', record_visibility: world.recordVisibility }
        : null
    }
    if (sql.includes('FROM client_sessions')) {
      return world.portal
        ? {
            id: PORTAL_USER_ID, client_id: CLIENT_ID, client_name: 'Acme',
            lead_capture_mode: world.portal.mode, is_primary_contact: false,
            can_view_crm: world.portal.canView, can_edit_crm: false, can_admin_crm: false,
            record_visibility: 'team'
          }
        : null
    }
    if (sql.includes('feature_key = \'crm.core\'')) {
      return world.portal?.entitled ? { status: 'active' } : null
    }
    return null
  })
  mocks.queryRows.mockResolvedValue([])
  mocks.queryCount.mockResolvedValue(0)
}

const staffEvent = (query: Record<string, unknown> = { client_id: CLIENT_ID }, body?: unknown) =>
  ({ context: {}, query, body }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('CRM_SEARCH_PROVIDER_APIS_ENABLED', 'false')
  resetCrmSearchDormancyLogForTests()
  world = { role: 'account_manager', recordVisibility: 'team', clientActive: true, scope: 'missing', portal: null }
  mocks.cookies = { auth_token: 'signed-staff-token' }
  mocks.verifyJwt.mockResolvedValue({ userId: ACTOR_ID, iat: Date.parse('2026-11-19T00:00:00Z') })
  mocks.requireAuth.mockResolvedValue({ id: ACTOR_ID })
  mocks.digestPortalSessionToken.mockResolvedValue('digest')
  mocks.requireClientCrmAccess.mockResolvedValue({ clientId: CLIENT_ID })
  installDb()
})
afterEach(() => vi.unstubAllEnvs())

async function peopleList(event = staffEvent()) {
  const handler = (await import('~~/server/api/crm/people/index.get')).default as (e: never) => Promise<unknown>
  return await handler(event)
}
async function pipeline(event = staffEvent()) {
  const handler = (await import('~~/server/api/crm/pipeline.get')).default as (e: never) => Promise<unknown>
  return await handler(event)
}
async function agencySearch(event = staffEvent({}, { clientId: CLIENT_ID, query: 'Acme' })) {
  const handler = (await import('~~/server/api/crm/search.post')).default as (e: never) => Promise<unknown>
  return await handler(event)
}
async function portalSearch() {
  const handler = (await import('~~/server/api/client-portal/crm/search.post')).default as (e: never) => Promise<unknown>
  return await handler({ context: {}, body: { query: 'Acme' } } as never)
}

/** SQL + params of every record query, for byte-for-byte authorization comparison. */
function recordQueries() {
  return [
    ...mocks.queryRows.mock.calls.map(([sql, params]) => ({ sql, params })),
    ...mocks.queryCount.mock.calls.map(([sql, params]) => ({ sql, params }))
  ]
}

describe('staff CRM screens while CRM search is dormant', () => {
  it('people list succeeds and issues exactly the same scoped SQL as an activated install', async () => {
    await expect(peopleList()).resolves.toMatchObject({ items: [], total: 0 })
    const dormant = recordQueries()
    expect(dormant.length).toBe(2)

    vi.clearAllMocks()
    installDb()
    mocks.verifyJwt.mockResolvedValue({ userId: ACTOR_ID, iat: Date.parse('2026-11-19T00:00:00Z') })
    world.scope = 'present'
    await peopleList()
    expect(dormant).toEqual(recordQueries())
  })

  it('keeps owner-scoped visibility for a non-management actor (same predicate as active)', async () => {
    world.recordVisibility = 'owner'
    await pipeline()
    const dormant = recordQueries()
    expect(dormant[0]!.params).toContain(ACTOR_ID)
    expect(dormant[0]!.params).toContain(CLIENT_ID)

    vi.clearAllMocks()
    installDb()
    mocks.verifyJwt.mockResolvedValue({ userId: ACTOR_ID, iat: Date.parse('2026-11-19T00:00:00Z') })
    world.scope = 'present'
    await pipeline()
    expect(dormant).toEqual(recordQueries())
  })

  it('still denies an actor without CLIENTS, an inactive client, and a missing session before the scope lookup', async () => {
    world.role = 'viewer_without_clients'
    await expect(peopleList()).rejects.toMatchObject({ statusCode: 404 })

    world.role = 'account_manager'
    world.clientActive = false
    await expect(pipeline()).rejects.toMatchObject({ statusCode: 404 })

    world.clientActive = true
    mocks.cookies = {}
    await expect(peopleList()).rejects.toMatchObject({ statusCode: 401 })

    expect(mocks.queryRows).not.toHaveBeenCalled()
    expect(mocks.queryRowsFresh.mock.calls.some(([sql]) => String(sql).includes('crm_search_organisation_scopes'))).toBe(false)
  })

  it('fails closed when activation is declared but the schema is missing', async () => {
    vi.stubEnv('CRM_SEARCH_PROVIDER_APIS_ENABLED', 'true')
    await expect(peopleList()).rejects.toMatchObject({ code: '42P01' })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('fails closed on any other DB error, including a non-search missing relation', async () => {
    world.scope = 'other_error'
    await expect(peopleList()).rejects.toMatchObject({ code: '08006' })
    world.scope = 'unrelated_missing'
    await expect(pipeline()).rejects.toMatchObject({ code: '42P01' })
    world.scope = 'search_permission_denied'
    await expect(pipeline()).rejects.toMatchObject({ code: '42501' })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })
})

describe('CRM search endpoints while dormant', () => {
  it('agency search answers an explicit not-enabled error and runs no search query', async () => {
    await expect(agencySearch()).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM search is not enabled',
      data: { code: 'crm_search_not_enabled' }
    })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('agency search still authorizes first: unauthorized callers get 404, not the dormancy signal', async () => {
    world.role = 'viewer_without_clients'
    await expect(agencySearch()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('portal search answers not-enabled for an authorized portal user', async () => {
    mocks.cookies = { client_session_token: 'portal-token' }
    world.portal = { mode: 'full_crm', canView: true, entitled: true }
    await expect(portalSearch()).rejects.toMatchObject({
      statusCode: 503,
      data: { code: 'crm_search_not_enabled' }
    })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('portal tenant checks still run before dormancy: no view flag, no entitlement, wrong mode → 404', async () => {
    mocks.cookies = { client_session_token: 'portal-token' }
    for (const portal of [
      { mode: 'full_crm', canView: false, entitled: true },
      { mode: 'full_crm', canView: true, entitled: false },
      { mode: 'external_crm', canView: true, entitled: true }
    ]) {
      world.portal = portal
      await expect(portalSearch()).rejects.toMatchObject({ statusCode: 404 })
    }
  })

  it('search keeps working (not blocked) when the schema exists', async () => {
    world.scope = 'present'
    mocks.cookies = { client_session_token: 'portal-token' }
    world.portal = { mode: 'full_crm', canView: true, entitled: true }
    await expect(portalSearch()).resolves.toEqual({ results: [] })
    expect(mocks.queryRows).toHaveBeenCalledTimes(1)
  })
})

describe('resolver contract', () => {
  it('marks staff and portal contexts dormant with the sentinel scope, active otherwise', async () => {
    const { resolveAgencyCrmSearchContext, resolvePortalCrmSearchContext } = await import('~~/server/utils/crm/searchContext')
    const { CRM_SEARCH_DORMANT_SCOPE_ID } = await import('~~/server/utils/crm/searchDormancy')
    await expect(resolveAgencyCrmSearchContext(staffEvent(), { clientId: CLIENT_ID, surface: 'agency_global' }))
      .resolves.toMatchObject({ organisationScopeId: CRM_SEARCH_DORMANT_SCOPE_ID, searchScope: 'dormant', actorId: ACTOR_ID })
    mocks.cookies = { client_session_token: 'portal-token' }
    world.portal = { mode: 'lightweight_crm', canView: true, entitled: true }
    await expect(resolvePortalCrmSearchContext(staffEvent(), { surface: 'portal_global' }))
      .resolves.toMatchObject({ organisationScopeId: CRM_SEARCH_DORMANT_SCOPE_ID, searchScope: 'dormant', clientId: CLIENT_ID })
    world.scope = 'present'
    await expect(resolvePortalCrmSearchContext(staffEvent(), { surface: 'portal_global' }))
      .resolves.toMatchObject({ organisationScopeId: SCOPE_ID, searchScope: 'active' })
  })

  it('retrieval and keyword search refuse a dormant context even if an endpoint forgot the guard', async () => {
    const { runCrmKeywordSearch } = await import('~~/server/utils/crm/search')
    const { retrieveCrm } = await import('~~/server/utils/crm/retrieval')
    const { CRM_SEARCH_DORMANT_SCOPE_ID } = await import('~~/server/utils/crm/searchDormancy')
    const dormant = {
      organisationScopeId: CRM_SEARCH_DORMANT_SCOPE_ID, clientId: CLIENT_ID, correlationId: 'c',
      actorType: 'staff', actorId: ACTOR_ID, surface: 'agency_global', permissionSet: ['CLIENTS'],
      visibility: { ownerScoped: false }, searchScope: 'dormant'
    } as const
    const runKeyword = vi.fn()
    await expect(runCrmKeywordSearch(dormant, 'acme', 50, { queryRows: runKeyword } as never))
      .rejects.toMatchObject({ data: { code: 'crm_search_not_enabled' } })
    await expect(retrieveCrm(dormant, { query: 'acme', limit: 5, semanticEligible: true } as never, { runKeyword } as never))
      .rejects.toMatchObject({ data: { code: 'crm_search_not_enabled' } })
    expect(runKeyword).not.toHaveBeenCalled()
  })
})
