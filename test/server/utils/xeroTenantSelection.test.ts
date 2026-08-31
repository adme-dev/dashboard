import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchXeroTenants: vi.fn(),
  getActiveOrgToken: vi.fn(),
  getCookie: vi.fn(),
  getOrgTenant: vi.fn(),
  setCookie: vi.fn(),
  setOrgTenant: vi.fn(),
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveOrgToken: (...args: unknown[]) => mocks.getActiveOrgToken(...args),
  getOrgTenant: (...args: unknown[]) => mocks.getOrgTenant(...args),
  setOrgTenant: (...args: unknown[]) => mocks.setOrgTenant(...args),
}))

vi.mock('~~/server/utils/xeroClient', () => ({
  fetchXeroTenants: (...args: unknown[]) => mocks.fetchXeroTenants(...args),
}))

;(globalThis as any).getCookie = (...args: unknown[]) => mocks.getCookie(...args)
;(globalThis as any).setCookie = (...args: unknown[]) => mocks.setCookie(...args)
;(globalThis as any).deleteCookie = vi.fn()

describe('Xero tenant selection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getCookie.mockReturnValue(undefined)
    mocks.getOrgTenant.mockResolvedValue(undefined)
    mocks.getActiveOrgToken.mockResolvedValue({ access_token: 'xero-access-token' })
    mocks.fetchXeroTenants.mockResolvedValue([])
    mocks.setOrgTenant.mockResolvedValue(undefined)
  })

  it('selects and persists the sole connected Xero organisation', async () => {
    mocks.fetchXeroTenants.mockResolvedValue([
      {
        id: 'connection-1',
        authEventId: 'auth-event-1',
        tenantId: 'tenant-1',
        tenantType: 'ORGANISATION',
        tenantName: 'Canonical Company',
        createdDateUtc: '2026-08-31T00:00:00.000Z',
        updatedDateUtc: '2026-08-31T00:00:00.000Z',
      },
    ])
    const event = { context: {} } as any
    const { getSelectedTenant } = await import('~~/server/utils/session')

    await expect(getSelectedTenant(event)).resolves.toBe('tenant-1')
    expect(mocks.setCookie).toHaveBeenCalledWith(event, 'xero_tenant_id', 'tenant-1', expect.objectContaining({
      httpOnly: true,
      path: '/',
    }))
    expect(mocks.setOrgTenant).toHaveBeenCalledWith(event, 'tenant-1', 'Canonical Company')
  })

  it('does not choose between multiple connected Xero organisations', async () => {
    mocks.fetchXeroTenants.mockResolvedValue([
      { tenantId: 'tenant-1', tenantName: 'Company One' },
      { tenantId: 'tenant-2', tenantName: 'Company Two' },
    ])
    const { getSelectedTenant } = await import('~~/server/utils/session')

    await expect(getSelectedTenant({ context: {} } as any)).resolves.toBeUndefined()
    expect(mocks.setCookie).not.toHaveBeenCalled()
    expect(mocks.setOrgTenant).not.toHaveBeenCalled()
  })

  it('keeps an existing organisation without calling Xero again', async () => {
    mocks.getOrgTenant.mockResolvedValue({ tenantId: 'tenant-existing', tenantName: 'Existing Company' })
    const { getSelectedTenant } = await import('~~/server/utils/session')

    await expect(getSelectedTenant({ context: {} } as any)).resolves.toBe('tenant-existing')
    expect(mocks.getActiveOrgToken).not.toHaveBeenCalled()
    expect(mocks.fetchXeroTenants).not.toHaveBeenCalled()
  })
})
