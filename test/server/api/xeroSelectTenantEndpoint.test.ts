import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequirePermission = vi.fn()
const mockGetActiveOrgToken = vi.fn()
const mockFetchXeroTenants = vi.fn()
const mockSetSelectedTenant = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveOrgToken: (...args: unknown[]) => mockGetActiveOrgToken(...args),
}))

vi.mock('~~/server/utils/xeroClient', () => ({
  fetchXeroTenants: (...args: unknown[]) => mockFetchXeroTenants(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  setSelectedTenant: (...args: unknown[]) => mockSetSelectedTenant(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage), input)

describe('POST /api/xero/select-tenant', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequirePermission.mockReset()
    mockGetActiveOrgToken.mockReset()
    mockFetchXeroTenants.mockReset()
    mockSetSelectedTenant.mockReset()
    mockRequirePermission.mockResolvedValue({ id: 'user-1' })
    mockGetActiveOrgToken.mockResolvedValue({ access_token: 'xero-token' })
    mockFetchXeroTenants.mockResolvedValue([
      { tenantId: 'tenant-a', tenantName: 'Canonical Company', tenantType: 'ORGANISATION' },
    ])
    mockSetSelectedTenant.mockResolvedValue(undefined)
  })

  it('requires finance permission and stores only a tenant returned by Xero', async () => {
    const handler = (await import('~~/server/api/xero/select-tenant.post')).default
    const event = { body: { tenantId: 'tenant-a', tenantName: 'Spoofed Name' } } as any

    await expect(handler(event)).resolves.toEqual({ ok: true })
    expect(mockRequirePermission).toHaveBeenCalledWith(event, 'FINANCE')
    expect(mockFetchXeroTenants).toHaveBeenCalledWith('xero-token')
    expect(mockSetSelectedTenant).toHaveBeenCalledWith(event, 'tenant-a', 'Canonical Company')
  })

  it('rejects a tenant outside the authenticated Xero connection list', async () => {
    const handler = (await import('~~/server/api/xero/select-tenant.post')).default

    await expect(handler({ body: { tenantId: 'tenant-b' } } as any))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockSetSelectedTenant).not.toHaveBeenCalled()
  })

  it('does not fetch or store a tenant when finance permission is denied', async () => {
    mockRequirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    const handler = (await import('~~/server/api/xero/select-tenant.post')).default

    await expect(handler({ body: { tenantId: 'tenant-a' } } as any))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockGetActiveOrgToken).not.toHaveBeenCalled()
    expect(mockSetSelectedTenant).not.toHaveBeenCalled()
  })
})
