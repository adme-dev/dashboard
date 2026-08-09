import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasClientCrmPermission,
  requireClientCrmAccess,
  resolveClientCrmAccessLevel
} from '../../../../server/utils/crm/clientCrmAccess'

const {
  requireClientAuth,
  requireClientEntitlement,
  execute,
  queryOne,
  queryRows,
  transaction,
  transactionQuery,
  requireAuth,
  requireRole,
  revokeCrmLeadInboxRoute
} = vi.hoisted(() => ({
  requireClientAuth: vi.fn(),
  requireClientEntitlement: vi.fn(),
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn(),
  transactionQuery: vi.fn(),
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  revokeCrmLeadInboxRoute: vi.fn()
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args)
}))
vi.mock('~~/server/utils/billing/entitlements', () => ({
  requireClientEntitlement: (...args: unknown[]) => requireClientEntitlement(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => execute(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
  queryRows: (...args: unknown[]) => queryRows(...args),
  transaction: (...args: unknown[]) => transaction(...args)
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  requireRole: (...args: unknown[]) => requireRole(...args)
}))
vi.mock('~~/server/utils/crm/emailRouteManagement', () => ({
  revokeCrmLeadInboxRoute: (...args: unknown[]) => revokeCrmLeadInboxRoute(...args)
}))
vi.mock('h3', async (importOriginal) => {
  const h3 = await importOriginal<typeof import('h3')>()
  return {
    ...h3,
    getRequestURL: (event: { path: string }) => new URL(event.path, 'https://portal.example.test')
  }
})

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRequestURL: (event: { path: string }) => URL
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => string | undefined
  getQuery: (event: { query?: Record<string, string> }) => Record<string, string>
  readBody: (event: { body?: unknown }) => Promise<unknown>
  setResponseHeader: ReturnType<typeof vi.fn>
}
globals.defineEventHandler = handler => handler
globals.getRequestURL = event => new URL(event.path, 'https://portal.example.test')
globals.getRouterParam = (event, key) => event.params?.[key]
globals.getQuery = event => event.query ?? {}
globals.readBody = async event => event.body
globals.setResponseHeader = vi.fn()

const subject = (
  permissions: Partial<{
    canViewCrm: boolean
    canEditCrm: boolean
    canAdminCrm: boolean
    canInviteUsers: boolean
  }>,
  isPrimaryContact = false
) => ({
  isPrimaryContact,
  permissions: {
    canViewCrm: false,
    canEditCrm: false,
    canAdminCrm: false,
    ...permissions
  }
}) as unknown as Parameters<typeof hasClientCrmPermission>[0]

describe('client CRM access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireClientAuth.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      clientId: '11111111-1111-4111-8111-111111111111',
      leadCaptureMode: 'full_crm',
      isPrimaryContact: true,
      permissions: {
        canViewCrm: false,
        canEditCrm: false,
        canAdminCrm: false
      }
    })
    requireClientEntitlement.mockResolvedValue(undefined)
    execute.mockResolvedValue(undefined)
    requireAuth.mockResolvedValue({ id: 'staff-1' })
    requireRole.mockResolvedValue(undefined)
    transaction.mockImplementation(async (callback: (db: { query: typeof transactionQuery }) => unknown) =>
      await callback({ query: transactionQuery })
    )
    transactionQuery.mockResolvedValue({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }] })
    revokeCrmLeadInboxRoute.mockResolvedValue({ route: { id: '22222222-2222-4222-8222-222222222222' } })
  })

  it('uses hierarchical CRM permissions', () => {
    expect(hasClientCrmPermission(subject({ canViewCrm: true }), 'view')).toBe(true)
    expect(hasClientCrmPermission(subject({ canViewCrm: true }), 'edit')).toBe(false)
    expect(hasClientCrmPermission(subject({ canEditCrm: true }), 'view')).toBe(true)
    expect(hasClientCrmPermission(subject({ canEditCrm: true }), 'edit')).toBe(true)
    expect(hasClientCrmPermission(subject({ canAdminCrm: true }), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({}, true), 'admin')).toBe(true)
  })

  it('requires admin for destructive and high-risk operations', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people/123', 'DELETE')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people/import', 'POST')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/export', 'GET')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/audit', 'GET')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/email-routes', 'POST')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/email-routes/123/rotate', 'POST')).toBe('admin')
  })

  it('allows CRM administrators and primary contacts, but not invitation-only users, to manage inbox routes', () => {
    expect(hasClientCrmPermission(subject({ canAdminCrm: true }), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({}, true), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({ canInviteUsers: true }), 'admin')).toBe(false)
  })

  it('uses view for reads and edit for ordinary mutations', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people', 'GET')).toBe('view')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people', 'POST')).toBe('edit')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/tasks/123', 'PATCH')).toBe('edit')
  })

  it('caches an exact successful access level for middleware and an explicit mutation handler', async () => {
    const middleware = (await import('../../../../server/middleware/04-client-crm-access')).default
    const handler = (await import('../../../../server/api/client-portal/crm/email-routes/[id].delete')).default
    const event = {
      path: '/api/client-portal/crm/email-routes/22222222-2222-4222-8222-222222222222',
      method: 'DELETE',
      context: {},
      params: { id: '22222222-2222-4222-8222-222222222222' }
    }

    await middleware(event as never)
    await handler(event as never)

    expect(requireClientAuth).toHaveBeenCalledOnce()
    expect(requireClientEntitlement).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_security_audit_log'),
      expect.arrayContaining(['admin', 'DELETE', 'allowed'])
    )
  })

  it('does not let a cached view decision satisfy an admin request', async () => {
    const event = {
      path: '/api/client-portal/crm/email-routes',
      method: 'POST',
      context: {}
    }

    await requireClientCrmAccess(event as never, 'view')
    await requireClientCrmAccess(event as never, 'admin')

    expect(requireClientAuth).toHaveBeenCalledTimes(2)
    expect(requireClientEntitlement).toHaveBeenCalledTimes(2)
  })

  it('rejects non-boolean client deactivation values before opening a transaction', async () => {
    const handler = (await import('../../../../server/api/agency/clients/[id].put')).default

    for (const isActive of ['false', null]) {
      await expect(handler({
        context: {},
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: { isActive }
      } as never)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'isActive must be a boolean' })
    }

    expect(transaction).not.toHaveBeenCalled()
  })

  it('revokes portal sessions in the same transaction when an accepted update results in deactivation', async () => {
    const handler = (await import('../../../../server/api/agency/clients/[id].put')).default
    transactionQuery.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', is_active: false }] })

    await handler({
      context: {},
      params: { id: '11111111-1111-4111-8111-111111111111' },
      body: { isActive: false }
    } as never)

    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionQuery).toHaveBeenCalledTimes(2)
    expect(transactionQuery.mock.calls[0]?.[1]).toEqual([false, '11111111-1111-4111-8111-111111111111'])
    expect(String(transactionQuery.mock.calls[1]?.[0])).toContain('DELETE FROM client_sessions')
  })

  it('revokes portal sessions in the same transaction when delete performs a soft deactivation', async () => {
    queryOne.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', name: 'Acme', is_active: true })
    queryRows.mockResolvedValue([])
    const handler = (await import('../../../../server/api/agency/clients/[id].delete')).default

    await handler({
      context: {},
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {}
    } as never)

    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionQuery).toHaveBeenCalledTimes(2)
    expect(String(transactionQuery.mock.calls[1]?.[0])).toContain('DELETE FROM client_sessions')
  })
})
