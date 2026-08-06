import { beforeEach, describe, expect, it, vi } from 'vitest'
import { digestPortalSessionToken } from '../../../../server/utils/portalSession'

interface TestEvent {
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  getHeaders: (event: TestEvent) => Record<string, string>
  setCookie: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.getHeaders = event => event.headers ?? {}
testGlobal.setCookie = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireRole = vi.fn()
const mockTransaction = vi.fn()
const mockDbQuery = vi.fn()
let clientAccessible = true

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args),
  transactionWithoutRetry: (...args: unknown[]) => mockTransaction(...args)
}))

const { default: accessHandler } = await import(
  '../../../../server/api/agency/client-portal/access.post'
)

describe('agency client portal access API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({
      id: 'agency-user-1',
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'owner'
    })
    mockTransaction.mockImplementation(async (callback) => {
      const db = {
        query: mockDbQuery.mockImplementation(async (sql: string) => {
          if (sql.includes('FROM agency_clients c')) {
            return clientAccessible
              ? { rows: [{ id: 'client-1', name: 'Client One', logoUrl: 'https://example.com/logo.png' }] }
              : { rows: [] }
          }
          if (sql.includes('INSERT INTO client_users')) {
            return {
              rows: [{ id: 'client-user-1' }]
            }
          }
          if (sql.includes('INSERT INTO client_sessions')) {
            return { rows: [{ id: 'session-1' }] }
          }
          return { rows: [] }
        })
      }

      return callback(db)
    })
    clientAccessible = true
  })

  it('creates an internal portal session for an allowed agency user', async () => {
    const result = await accessHandler({
      body: { clientId: 'client-1' },
      headers: { 'user-agent': 'vitest', 'x-real-ip': '127.0.0.1' }
    })

    expect(mockRequireRole).toHaveBeenCalledOnce()
    expect(mockRequireRole.mock.calls[0]?.[1]).toContain('super_admin')
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM agency_clients c'),
      ['client-1', 'agency-user-1', true]
    )
    const cookieToken = String(vi.mocked(testGlobal.setCookie).mock.calls[0]?.[2])
    const sessionInsert = mockDbQuery.mock.calls.find(call =>
      String(call[0]).includes('INSERT INTO client_sessions')
    )
    expect(sessionInsert?.[1]?.[1]).toBe(await digestPortalSessionToken(cookieToken))
    expect(testGlobal.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      'client_session_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: expect.any(Number), path: '/' })
    )
    expect(result).toMatchObject({
      ok: true,
      portalUrl: '/portal',
      client: { id: 'client-1', name: 'Client One' },
      user: { id: 'client-user-1', agencyAccess: true }
    })
  })

  it('requires a client id', async () => {
    await expect(accessHandler({ body: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('preserves ordinary authorized staff access without God mode coordination', async () => {
    mockRequireRole.mockResolvedValue({
      id: 'agency-user-1',
      email: 'account.manager@example.com',
      name: 'Account Manager',
      role: 'account_manager'
    })

    await expect(accessHandler({
      body: { clientId: 'client-1' },
      headers: { 'user-agent': 'vitest' }
    })).resolves.toMatchObject({ ok: true, client: { id: 'client-1' } })

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('client_team_assignments'),
      ['client-1', 'agency-user-1', false]
    )
  })

  it('does not enter the portal transaction for an unauthorized ordinary user', async () => {
    mockRequireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), {
      statusCode: 403,
      statusMessage: 'Forbidden - Insufficient permissions'
    }))

    await expect(accessHandler({ body: { clientId: 'client-1' } })).rejects.toMatchObject({
      statusCode: 403
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('does not open an unassigned client for scoped ordinary staff', async () => {
    mockRequireRole.mockResolvedValue({
      id: 'agency-user-1',
      email: 'account.manager@example.com',
      name: 'Account Manager',
      role: 'account_manager'
    })
    clientAccessible = false

    await expect(accessHandler({
      body: { clientId: 'client-2' },
      headers: { 'user-agent': 'vitest' }
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('client_team_assignments'),
      ['client-2', 'agency-user-1', false]
    )
    expect(mockDbQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_sessions'),
      expect.anything()
    )
  })
})
