import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { templateCatalogueHandler } from '~~/server/utils/pageStudio/templateCatalogueHttp'

const mocks = vi.hoisted(() => ({ portal: vi.fn(), agency: vi.fn(), tenant: vi.fn(), agencyTenant: vi.fn(), customer: vi.fn(), setup: vi.fn(), workspace: vi.fn(), query: vi.fn(), digest: vi.fn().mockResolvedValue('a'.repeat(64)) }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/pageStudio/templateCatalogueAuthority', () => ({ resolvePortalTemplateTenant: mocks.tenant, resolveAgencyTemplateTenant: mocks.agencyTenant, queryTemplateCatalogue: mocks.query }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: mocks.customer, readCustomerSetup: mocks.setup }))
vi.mock('~~/server/utils/pageStudio/customerWorkspaces', () => ({ resolveCustomerWorkspaceAccess: mocks.workspace }))
vi.mock('~~/server/utils/pageStudio/customerSignupHttp', () => ({ guardCustomerRequest: vi.fn(), customerSessionToken: () => 'x'.repeat(64) }))
vi.mock('~~/server/utils/portalSession', () => ({ digestPortalSessionToken: mocks.digest }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.query }))
vi.mock('h3', () => ({ getCookie: (e: { cookies: Record<string, string> }, k: string) => e.cookies[k], getQuery: (e: { query: unknown }) => e.query, getHeader: () => undefined, setHeader: vi.fn(), createError: (x: { statusMessage?: string, statusCode: number }) => Object.assign(new Error(x.statusMessage), x) }))
const id = '10000000-0000-4000-8000-000000000001'
const event = (cookies: Record<string, string>, query = {}) => ({ cookies, query, context: {} }) as unknown as H3Event
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue([])
  mocks.portal.mockResolvedValue({ id, clientId: id })
  mocks.tenant.mockResolvedValue('tenant')
  mocks.agencyTenant.mockResolvedValue('tenant')
  mocks.agency.mockResolvedValue({ user: { id }, tenantId: 'tenant' })
  mocks.customer.mockResolvedValue({ identityId: id })
  mocks.setup.mockResolvedValue({ workspaceId: id })
  mocks.workspace.mockResolvedValue({})
})
describe('catalogue HTTP authority boundaries', () => {
  it.each(['portal', 'customer', 'agency'] as const)('lists with %s authority and rechecks the original login', async (kind) => {
    const cookie = kind === 'portal' ? 'client_session_token' : kind === 'customer' ? '__Host-studio_customer_session' : 'auth_token'
    expect(await templateCatalogueHandler(event({ [cookie]: 'session' }), kind)).toEqual({ items: [], nextCursor: null })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect((kind === 'portal' ? mocks.portal : kind === 'customer' ? mocks.customer : mocks.agency)).toHaveBeenCalledTimes(2)
  })
  it('uses only the route audience when other applications have cookies', async () => {
    expect(await templateCatalogueHandler(event({ 'client_session_token': 'x', '__Host-studio_customer_session': 'y' }), 'portal')).toEqual({ items: [], nextCursor: null })
    expect(mocks.portal).toHaveBeenCalledTimes(2)
    expect(mocks.customer).not.toHaveBeenCalled()
    expect(mocks.agency).not.toHaveBeenCalled()
  })
  it('rejects conflicting customer cookies before querying', async () => {
    await expect(templateCatalogueHandler(event({ '__Host-studio_customer_session': 'x', 'studio_customer_session': 'y' }), 'customer')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('rejects caller scope and excessive limit', async () => {
    for (const query of [{ clientId: id }, { limit: 100 }, { cursor: 'bad' }]) await expect(templateCatalogueHandler(event({ client_session_token: 'x' }, query), 'portal')).rejects.toMatchObject({ statusCode: 400 })
  })
  it('does not leak database errors', async () => {
    mocks.query.mockRejectedValue(new Error('secret storage path'))
    await expect(templateCatalogueHandler(event({ client_session_token: 'x' }), 'portal')).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Templates are unavailable. Try again later.' })
  })
  it('rejects customer without an owned workspace', async () => {
    mocks.setup.mockResolvedValue({ workspaceId: null })
    await expect(templateCatalogueHandler(event({ '__Host-studio_customer_session': 'x' }), 'customer')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('rejects a selected tenant cookie not bound to the server organisation', async () => {
    mocks.agency.mockResolvedValue({ user: { id }, tenantId: 'forged-owner' })
    await expect(templateCatalogueHandler(event({ auth_token: 'session', xero_tenant_id: 'forged-owner' }), 'agency')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
