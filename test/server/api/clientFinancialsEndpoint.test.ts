import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError as createH3Error } from 'h3'
import { ClientFinancialRepositoryError } from '~~/server/utils/clientFinancialRepository'
import { PERMISSIONS } from '~~/server/utils/permissions'

type TestEvent = {
  params?: Record<string, string | undefined>
  query?: Record<string, unknown>
}

const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockRoleHasPermission = vi.fn()
const mockIsReadOnlyRole = vi.fn()
const mockGetClientFinancials = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/permissions')>()
  return {
    ...actual,
    roleHasPermission: (...args: unknown[]) => mockRoleHasPermission(...args),
    isReadOnlyRole: (...args: unknown[]) => mockIsReadOnlyRole(...args),
  }
})

vi.mock('~~/server/utils/clientFinancials', () => ({
  getClientFinancials: (...args: unknown[]) => mockGetClientFinancials(...args),
}))

const event: TestEvent = {
  params: { id: 'client-1' },
  query: { from: '2026-08-01', to: '2026-08-22' },
}

describe('GET /api/agency/clients/:id/financials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({
      id: 'user-1',
      role: 'account_manager',
      permissionGroups: ['CLIENTS'],
      isCustomReadOnly: false,
    })
    mockGetSelectedTenant.mockResolvedValue('tenant-selected')
    mockRoleHasPermission.mockReturnValue(false)
    mockIsReadOnlyRole.mockReturnValue(false)
    mockGetClientFinancials.mockResolvedValue({ summary: { xeroRevenue: 2500 } })
  })

  it('requires CLIENTS permission and returns summaries without detailed sources to account managers', async () => {
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).resolves.toEqual({ summary: { xeroRevenue: 2500 } })

    expect(mockRequireRole).toHaveBeenCalledWith(event, PERMISSIONS.CLIENTS)
    expect(mockGetSelectedTenant).toHaveBeenCalledWith(event)
    expect(mockGetClientFinancials).toHaveBeenCalledWith({
      tenantId: 'tenant-selected',
      clientId: 'client-1',
      from: '2026-08-01',
      to: '2026-08-22',
      includeSources: false,
      canAllocate: false,
    })
  })

  it('allows a custom role with CLIENTS and FINANCE permission groups to receive source details', async () => {
    mockRequireRole.mockResolvedValue({
      id: 'user-2',
      role: 'custom-finance',
      permissionGroups: ['CLIENTS', 'FINANCE'],
      isCustomReadOnly: false,
    })
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await handler(event as never)

    expect(mockGetClientFinancials).toHaveBeenCalledWith(expect.objectContaining({
      includeSources: true,
      canAllocate: true,
    }))
  })

  it('does not allow a custom read-only finance user to allocate sources', async () => {
    mockRequireRole.mockResolvedValue({
      id: 'user-3',
      role: 'custom-finance',
      permissionGroups: ['CLIENTS', 'FINANCE'],
      isCustomReadOnly: true,
    })
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await handler(event as never)

    expect(mockGetClientFinancials).toHaveBeenCalledWith(expect.objectContaining({
      includeSources: true,
      canAllocate: false,
    }))
  })

  it.each([
    [{ from: '2026-08-35' }],
    [{ from: '2026-08-22', to: '2026-08-01' }],
    [{ from: '2025-08-21', to: '2026-08-22' }],
    [{ from: ['2026-08-01'], to: '2026-08-22' }],
  ])('rejects malformed, reversed, excessive, and array date ranges with 400', async (query) => {
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler({ ...event, query } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetClientFinancials).not.toHaveBeenCalled()
  })

  it('rejects a missing client id with 400', async () => {
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler({ params: {}, query: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetClientFinancials).not.toHaveBeenCalled()
  })

  it('maps the typed client_not_found error to 404', async () => {
    mockGetClientFinancials.mockRejectedValue(new ClientFinancialRepositoryError('client_not_found'))
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Client not found',
    })
  })

  it('returns a generic 500 when selected tenant resolution fails', async () => {
    mockGetSelectedTenant.mockRejectedValue(new Error('KV session lookup failed: tenant-secret'))
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to load client financials',
    })
    expect(mockGetClientFinancials).not.toHaveBeenCalled()
  })

  it('preserves trusted H3 400 errors from the financial service', async () => {
    mockGetClientFinancials.mockRejectedValue(createH3Error({
      statusCode: 400,
      statusMessage: 'Known financial input error',
    }))
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Known financial input error',
    })
  })

  it('does not trust a status-shaped repository failure with a sensitive message', async () => {
    mockGetClientFinancials.mockRejectedValue({
      statusCode: 404,
      statusMessage: 'SELECT tenant_token FROM secret_xero_connections',
    })
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to load client financials',
    })
  })

  it('returns a generic 500 without leaking unexpected repository details', async () => {
    mockGetClientFinancials.mockRejectedValue(new Error('SELECT * FROM secrets WHERE token = confidential'))
    const { default: handler } = await import('~~/server/api/agency/clients/[id]/financials.get')

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 500 })
    await expect(handler(event as never)).rejects.not.toThrow(/SELECT|secrets|confidential/)
  })
})
