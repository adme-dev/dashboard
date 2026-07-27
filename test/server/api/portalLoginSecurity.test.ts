import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { digestPortalSessionToken } from '../../../../server/utils/portalSession'

interface TestEvent {
  body?: unknown
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<unknown>
  getHeaders: (event: TestEvent) => Record<string, string>
  setCookie: (...args: unknown[]) => void
  setHeader: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body
testGlobal.getHeaders = event => event.headers ?? {}
testGlobal.setCookie = vi.fn()
testGlobal.setHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockCheckAndConsume = vi.fn()
const mockClientQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => mockQueryOne(...args),
  queryRowsFresh: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  checkAndConsume: (...args: unknown[]) => mockCheckAndConsume(...args)
}))

const { default: loginHandler } = await import('../../../../server/api/portal/auth/login.post')

function activeUser(passwordHash: string) {
  return {
    id: 'client-user-1',
    email: 'jane@example.com',
    name: 'Jane',
    password_hash: passwordHash,
    status: 'active',
    role: 'client_admin',
    avatar_url: null,
    is_primary_contact: true,
    client_id: 'client-1',
    client_name: 'Client Co',
    client_logo: null,
    lead_capture_mode: 'capture_only',
    can_view_projects: true,
    can_view_invoices: true,
    can_approve_work: true,
    can_view_time_entries: true,
    can_view_budgets: true,
    can_add_comments: true,
    can_upload_files: true,
    can_invite_users: true,
    can_view_analytics: true,
    can_submit_requests: true,
    notification_preferences: {},
    timezone: 'Australia/Melbourne'
  }
}

describe('portal login security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockTransaction.mockReset()
    mockCheckAndConsume.mockReset()
    mockClientQuery.mockReset()
    mockCheckAndConsume.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date('2026-07-27T08:15:00.000Z')
    })
    mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  })

  it('stores a SHA-256 digest for a new session instead of a bcrypt hash', async () => {
    const passwordHash = await bcrypt.hash('correct horse', 4)
    mockQueryRows.mockResolvedValueOnce([activeUser(passwordHash)])
    mockQueryOne.mockResolvedValueOnce({
        pending_approvals: '2',
        unread_notifications: '3',
        active_projects: '4',
        open_requests: '5'
      })

    const result = await loginHandler({
      body: { email: ' Jane@Example.com ', password: 'correct horse' },
      headers: { 'x-forwarded-for': '203.0.113.10', 'user-agent': 'Portal test' }
    })

    const cookieToken = String(vi.mocked(testGlobal.setCookie).mock.calls[0]?.[2])
    const insertCall = mockClientQuery.mock.calls.find(call =>
      String(call[0]).includes('INSERT INTO client_sessions')
    )
    expect(insertCall?.[1]?.[1]).toBe(await digestPortalSessionToken(cookieToken))
    expect(String(insertCall?.[1]?.[1])).toMatch(/^[a-f0-9]{64}$/)
    expect(mockCheckAndConsume).toHaveBeenCalledTimes(2)
    expect(mockQueryRows).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledOnce()
    expect(result.stats).toEqual({
      pendingApprovals: 2,
      unreadNotifications: 3,
      activeProjects: 4,
      openRequests: 5
    })
  })

  it('returns the same generic credential error for missing and inactive accounts', async () => {
    mockQueryRows.mockResolvedValueOnce([])
    await expect(loginHandler({
      body: { email: 'missing@example.com', password: 'wrong password' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid email or password'
    })

    const passwordHash = await bcrypt.hash('correct horse', 4)
    mockQueryRows.mockResolvedValueOnce([{ ...activeUser(passwordHash), status: 'suspended' }])
    await expect(loginHandler({
      body: { email: 'jane@example.com', password: 'correct horse' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid email or password'
    })
  })

  it('rejects oversized login input before rate limiting or database work', async () => {
    await expect(loginHandler({
      body: { email: 'jane@example.com', password: 'x'.repeat(257) }
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid login request'
    })
    expect(mockCheckAndConsume).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After before password work when either limit is exhausted', async () => {
    mockCheckAndConsume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-07-27T08:15:00.000Z')
    })

    await expect(loginHandler({
      body: { email: 'jane@example.com', password: 'wrong password' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Too many sign-in attempts. Try again later.'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(testGlobal.setHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Retry-After',
      expect.any(Number)
    )
  })

  it('rejects credentials that match more than one tenant account', async () => {
    const passwordHash = await bcrypt.hash('shared password', 4)
    mockQueryRows.mockResolvedValueOnce([
      activeUser(passwordHash),
      { ...activeUser(passwordHash), id: 'client-user-2', client_id: 'client-2' }
    ])

    await expect(loginHandler({
      body: { email: 'jane@example.com', password: 'shared password' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid email or password'
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('selects the only matching tenant account when duplicate emails use different passwords', async () => {
    const firstHash = await bcrypt.hash('wrong tenant password', 4)
    const secondHash = await bcrypt.hash('correct tenant password', 4)
    mockQueryRows.mockResolvedValueOnce([
      activeUser(firstHash),
      { ...activeUser(secondHash), id: 'client-user-2', client_id: 'client-2' }
    ])
    mockQueryOne.mockResolvedValueOnce({})

    const result = await loginHandler({
      body: { email: 'jane@example.com', password: 'correct tenant password' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })

    expect(result.user.id).toBe('client-user-2')
    expect(result.user.clientId).toBe('client-2')
  })
})
