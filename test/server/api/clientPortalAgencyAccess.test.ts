import { beforeEach, describe, expect, it, vi } from 'vitest'

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
const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()
const mockBcryptHash = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: (...args: unknown[]) => mockBcryptHash(...args)
  }
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
    mockQueryOne.mockResolvedValue({
      id: 'client-1',
      name: 'Client One',
      logo_url: 'https://example.com/logo.png'
    })
    mockBcryptHash.mockResolvedValue('hashed-token')
    mockTransaction.mockImplementation(async (callback) => {
      const db = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('RETURNING id, email, name, status')) {
            return {
              rows: [{
                id: 'client-user-1',
                email: 'agency-agency-user-1-client-1@portal-access.local',
                name: 'Owner User (Agency)',
                status: 'active'
              }]
            }
          }
          return { rows: [] }
        })
      }

      return callback(db)
    })
  })

  it('creates an internal portal session for an allowed agency user', async () => {
    const result = await accessHandler({
      body: { clientId: 'client-1' },
      headers: { 'user-agent': 'vitest', 'x-real-ip': '127.0.0.1' }
    })

    expect(mockRequireRole).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('FROM agency_clients'), ['client-1'])
    expect(mockBcryptHash).toHaveBeenCalledWith(expect.any(String), 10)
    expect(testGlobal.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      'client_session_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 8 * 60 * 60, path: '/' })
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
})
