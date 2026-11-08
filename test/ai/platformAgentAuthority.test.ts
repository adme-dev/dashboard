import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resolveUserPlatformAgentAuthority, resolveServicePlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), rows: vi.fn(), freshRows: vi.fn(), one: vi.fn(), finance: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: mocks.tenant }))
vi.mock('~~/server/utils/db', () => ({ queryRows: mocks.rows, queryRowsFresh: mocks.freshRows, queryOne: mocks.one }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance }))
const event = { context: {} } as H3Event
let grants: string[]
let active: boolean
let readOnly: boolean
let role: string
const allClients = Array.from({ length: 95 }, (_, index) => ({ id: `client-${index}` }))
const assigned = allClients.slice(0, 93)
beforeEach(() => {
  vi.clearAllMocks()
  grants = ['MEDIA_BUYING']
  active = true
  readOnly = false
  role = 'media_buyer'
  mocks.auth.mockResolvedValue({ id: 'staff', role: 'owner', permissionGroups: ['ADMIN', 'MANAGEMENT', 'FINANCE', 'MEDIA_BUYING'] })
  mocks.freshRows.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM team_members')) return active ? [{ role, role_id: 'custom-role', custom_role_id: 'custom-role', is_read_only: readOnly, permission_groups: grants }] : []
    return sql.includes('client_team_assignments') ? assigned : allClients
  })
  mocks.rows.mockResolvedValue([{ id: 'service-client' }])
  mocks.one.mockResolvedValue({ tenant_id: 'tenant-a' })
  mocks.tenant.mockResolvedValue('tenant-a')
  mocks.finance.mockResolvedValue(undefined)
})
describe('fresh user platform-agent authority', () => {
  it('marketing management covers all 95 active clients including the two unassigned clients', async () => {
    grants = ['MARKETING_MANAGEMENT']
    const authority = await resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MARKETING_MANAGEMENT'], tenant: 'none' })
    expect(authority.allowedClientIds).toEqual(allClients.map(client => client.id))
    expect(authority.allowedClientIds).toContain('client-94')
    expect(mocks.rows).not.toHaveBeenCalled()
    expect(mocks.freshRows.mock.calls[1][0]).not.toContain('client_team_assignments')
  })
  it('an assigned-only specialist gets 93 current active assignments through fresh reads', async () => {
    const authority = await resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })
    expect(authority.allowedClientIds).toEqual(assigned.map(client => client.id))
    expect(authority.allowedClientIds).not.toContain('client-94')
    expect(mocks.freshRows.mock.calls[1][0]).toContain('client_team_assignments')
    expect(mocks.freshRows.mock.calls[1][0]).toContain('ac.is_active = true')
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('custom role grants replace cached owner defaults, and revocation/deactivation denies the next request', async () => {
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).resolves.toBeDefined()
    grants = []
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 403 })
    grants = ['MEDIA_BUYING']
    active = false
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('read-only actors can read but cannot prepare mutating runs', async () => {
    readOnly = true
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).resolves.toBeDefined()
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none', write: true })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('Finance-global access requires the explicit Finance path and fresh Finance assertion', async () => {
    grants = ['MEDIA_BUYING', 'FINANCE']
    const marketing = await resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none', clientAccess: 'all' })
    expect(marketing.allowedClientIds).toHaveLength(93)
    expect(mocks.finance).not.toHaveBeenCalled()
    const finance = await resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required', clientAccess: 'all' })
    expect(finance.allowedClientIds).toHaveLength(95)
    expect(mocks.finance).toHaveBeenCalledWith(event, 'staff', false)
    await resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required', clientAccess: 'all', write: true })
    expect(mocks.finance).toHaveBeenLastCalledWith(event, 'staff', true)
  })
  it('stale cached Finance and revoked fresh Finance fail before tenant or client queries', async () => {
    grants = []
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required' })).rejects.toMatchObject({ statusCode: 403 })
    grants = ['FINANCE']
    mocks.finance.mockRejectedValueOnce({ statusCode: 403 })
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required' })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.tenant).not.toHaveBeenCalled()
    expect(mocks.freshRows.mock.calls.every(([sql]) => String(sql).includes('FROM team_members'))).toBe(true)
  })
  it('fails closed on fresh authority storage errors', async () => {
    mocks.freshRows.mockRejectedValueOnce(new Error('DB unavailable'))
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('preserves required selected-tenant and connected-organization validation', async () => {
    grants = ['FINANCE']
    mocks.tenant.mockResolvedValueOnce(null)
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required' })).rejects.toMatchObject({ statusCode: 400 })
    mocks.one.mockResolvedValueOnce(null)
    await expect(resolveUserPlatformAgentAuthority(event, { permissionGroups: ['FINANCE'], tenant: 'required' })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.one).toHaveBeenCalledWith(expect.stringContaining('FROM xero_org_connection'), ['tenant-a'])
  })
})
describe('independent service authority remains unchanged', () => {
  it('uses the connected service tenant and active service clients without any invented user grant', async () => {
    const authority = await resolveServicePlatformAgentAuthority({ serviceId: 'service', tenantId: 'tenant-a', tenant: 'required' })
    expect(authority).toMatchObject({ actor: { type: 'service', id: 'service' }, tenantId: 'tenant-a', allowedClientIds: ['service-client'], permissions: ['PLATFORM_AGENTS_SERVICE'] })
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.freshRows).not.toHaveBeenCalled()
    expect(mocks.finance).not.toHaveBeenCalled()
  })
  it('rejects an unconnected service tenant', async () => {
    mocks.one.mockResolvedValueOnce(null)
    await expect(resolveServicePlatformAgentAuthority({ serviceId: 'service', tenantId: 'tenant-other', tenant: 'required' })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
})
