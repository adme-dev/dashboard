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
testGlobal.getRequestURL = event => new URL(event.url || 'https://app.xeroflow.io/api/portal/auth/accept-invite')
testGlobal.setCookie = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockTransaction = vi.fn()
const mockClientQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const { default: acceptHandler } = await import(
  '../../../../server/api/portal/auth/accept-invite.post'
)

const rawInviteToken = 'I'.repeat(64)

describe('passwordless client invitation activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockReset()
    mockClientQuery.mockReset()
    mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  })

  it('accepts a token without a password and issues the normal client session', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM client_invitations')) {
        return {
          rows: [{
            id: 'invite-1',
            client_id: 'client-1',
            email: 'casey@example.com',
            name: 'Casey',
            permissions: {},
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            client_name: 'North Motors'
          }]
        }
      }
      if (sql.includes('SELECT id') && sql.includes('FROM client_users')) {
        return { rows: [{ id: 'user-1' }] }
      }
      if (sql.includes('UPDATE client_users')) return { rows: [{ id: 'user-1', email: 'casey@example.com' }] }
      return { rows: [] }
    })

    const result = await acceptHandler({
      body: { token: rawInviteToken },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })

    const lookup = mockClientQuery.mock.calls.find(call =>
      String(call[0]).includes('FROM client_invitations')
    )
    expect(lookup?.[1]).toEqual([
      await digestPortalSessionToken(rawInviteToken),
      rawInviteToken
    ])
    const sessionInsert = mockClientQuery.mock.calls.find(call =>
      String(call[0]).includes('INSERT INTO client_sessions')
    )
    const cookieToken = String(vi.mocked(testGlobal.setCookie).mock.calls[0]?.[2])
    expect(sessionInsert?.[1]?.[1]).toBe(await digestPortalSessionToken(cookieToken))
    expect(result).toEqual({ success: true, redirect: '/portal' })
  })

  it('rejects a missing token without starting a transaction', async () => {
    await expect(acceptHandler({ body: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invitation token is required'
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('contains no password or bcrypt authentication contract', () => {
    const source = readFileSync('server/api/portal/auth/accept-invite.post.ts', 'utf8')
    expect(source).not.toContain('bcrypt')
    expect(source).not.toContain('password_hash')
    expect(source).not.toMatch(/\bpassword\b/i)
  })
})
