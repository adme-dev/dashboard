import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { digestPortalSessionToken } from '../../../../server/utils/portalSession'

interface TestEvent {
  body?: unknown
  headers?: Record<string, string>
  url?: string
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: TestEvent) => Promise<unknown>
  getHeaders: (event: TestEvent) => Record<string, string>
  getRequestURL: (event: TestEvent) => URL
  setCookie: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => event.body
testGlobal.getHeaders = event => event.headers ?? {}
testGlobal.getRequestURL = event => new URL(event.url || 'https://app.xeroflow.io/api/portal/auth/magic-link/verify')
testGlobal.setCookie = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockTransaction = vi.fn()
const mockClientQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const { default: verifyHandler } = await import(
  '../../../../server/api/portal/auth/magic-link/verify.post'
)

const token = 'A'.repeat(64)

function eligibleUser(status: 'active' | 'pending' = 'active') {
  return {
    id: 'user-1',
    client_id: 'client-1',
    email: 'casey@example.com',
    status
  }
}

describe('client portal magic-link verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockReset()
    mockClientQuery.mockReset()
    mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  })

  it('atomically consumes the digest and stores an indexed 30-day session', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE client_magic_link_tokens')) return { rows: [eligibleUser()] }
      return { rows: [] }
    })

    const result = await verifyHandler({
      body: { token, redirect: '/portal/invoices?view=current' },
      headers: { 'x-forwarded-for': '203.0.113.10', 'user-agent': 'Portal test' }
    })

    const consume = mockClientQuery.mock.calls.find(call =>
      String(call[0]).includes('UPDATE client_magic_link_tokens')
    )
    expect(consume?.[1]).toEqual([await digestPortalSessionToken(token)])

    const sessionInsert = mockClientQuery.mock.calls.find(call =>
      String(call[0]).includes('INSERT INTO client_sessions')
    )
    const cookieToken = String(vi.mocked(testGlobal.setCookie).mock.calls[0]?.[2])
    expect(sessionInsert?.[1]?.[1]).toBe(await digestPortalSessionToken(cookieToken))
    expect(new Date(sessionInsert?.[1]?.[4]).getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
    expect(result).toEqual({ success: true, redirect: '/portal/invoices?view=current' })
    expect(testGlobal.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      'client_session_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
    )
  })

  it('activates a pending invited account and accepts its pending invitation', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE client_magic_link_tokens')) return { rows: [eligibleUser('pending')] }
      return { rows: [] }
    })

    await verifyHandler({ body: { token } })

    expect(mockClientQuery.mock.calls.some(call =>
      String(call[0]).includes('UPDATE client_users')
      && String(call[0]).includes('status = \'active\'')
    )).toBe(true)
    expect(mockClientQuery.mock.calls.some(call =>
      String(call[0]).includes('UPDATE client_invitations')
      && String(call[0]).includes('status = \'accepted\'')
    )).toBe(true)
  })

  it('rejects an expired, reused, missing, suspended, or deactivated credential generically', async () => {
    mockClientQuery.mockResolvedValue({ rows: [] })

    await expect(verifyHandler({ body: { token } })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'This sign-in link is invalid or has expired.'
    })
    expect(testGlobal.setCookie).not.toHaveBeenCalled()
    expect(mockClientQuery).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed credentials before database work', async () => {
    await expect(verifyHandler({ body: { token: 'short' } })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid magic-link verification request'
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('falls back to /portal for external redirects', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE client_magic_link_tokens')) return { rows: [eligibleUser()] }
      return { rows: [] }
    })

    const result = await verifyHandler({
      body: { token, redirect: 'https://evil.example/collect' }
    })

    expect(result.redirect).toBe('/portal')
  })

  it('rechecks pending invitation eligibility at token consumption time', () => {
    const source = readFileSync('server/api/portal/auth/magic-link/verify.post.ts', 'utf8')
    expect(source).toContain('EXISTS (')
    expect(source).toContain('invitation.status = \'pending\'')
    expect(source).toContain('invitation.expires_at > NOW()')
  })
})
