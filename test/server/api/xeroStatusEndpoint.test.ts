import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActiveOrgToken: vi.fn(),
  getOrgTenant: vi.fn(),
  getOrgToken: vi.fn(),
  getSelectedTenant: vi.fn(),
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveOrgToken: (...args: unknown[]) => mocks.getActiveOrgToken(...args),
  getOrgTenant: (...args: unknown[]) => mocks.getOrgTenant(...args),
  getOrgToken: (...args: unknown[]) => mocks.getOrgToken(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mocks.getSelectedTenant(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn

describe('GET /api/xero/status', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getOrgToken.mockResolvedValue({ access_token: 'xero-access-token' })
    mocks.getActiveOrgToken.mockResolvedValue({ access_token: 'xero-access-token' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-1')
    mocks.getOrgTenant.mockResolvedValue(undefined)
  })

  it('reports the resolved tenant immediately when org storage has not reflected its name yet', async () => {
    const handler = (await import('~~/server/api/xero/status.get')).default

    await expect(handler({ context: {} } as any)).resolves.toEqual({
      connected: true,
      selectedTenantId: 'tenant-1',
      selectedTenantName: null,
    })
  })

  it('does not resolve a tenant when the Xero token is disconnected', async () => {
    mocks.getOrgToken.mockResolvedValue(undefined)
    const handler = (await import('~~/server/api/xero/status.get')).default

    await expect(handler({ context: {} } as any)).resolves.toEqual({
      connected: false,
      selectedTenantId: null,
      selectedTenantName: null,
    })
    expect(mocks.getSelectedTenant).not.toHaveBeenCalled()
  })
})
