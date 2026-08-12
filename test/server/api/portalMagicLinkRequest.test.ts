import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

interface TestEvent {
  body?: unknown
  headers?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: TestEvent) => Promise<unknown>
  getHeaders: (event: TestEvent) => Record<string, string>
  setHeader: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => event.body
testGlobal.getHeaders = event => event.headers ?? {}
testGlobal.setHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockClientQuery = vi.fn()
const mockCheckAndConsume = vi.fn()
const mockSendEmail = vi.fn()
const mockRunAfterResponse = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  checkAndConsume: (...args: unknown[]) => mockCheckAndConsume(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.xeroflow.io/'
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: () => true,
  sendClientPortalMagicLinkEmail: (...args: unknown[]) => mockSendEmail(...args)
}))

vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: (...args: unknown[]) => mockRunAfterResponse(...args)
}))

const { default: requestHandler } = await import(
  '../../../../server/api/portal/auth/magic-link/request.post'
)

const genericResponse = {
  success: true,
  message: 'If an eligible portal account exists, a sign-in link has been sent.'
}

describe('client portal magic-link request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRows.mockReset()
    mockTransaction.mockReset()
    mockClientQuery.mockReset()
    mockCheckAndConsume.mockReset()
    mockSendEmail.mockReset()
    mockRunAfterResponse.mockReset()
    mockCheckAndConsume.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date('2026-08-12T03:15:00.000Z')
    })
    mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  })

  it('returns identical success for missing and inactive accounts', async () => {
    mockQueryRows.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const missing = await requestHandler({
      body: { email: 'missing@example.com' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })
    const inactive = await requestHandler({
      body: { email: 'suspended@example.com' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })

    expect(missing).toEqual(genericResponse)
    expect(inactive).toEqual(genericResponse)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('issues a hashed 15-minute credential and labelled email for every eligible tenant account', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { id: 'user-1', email: 'client@example.com', name: 'Casey', status: 'active', client_name: 'North Motors' },
      { id: 'user-2', email: 'client@example.com', name: 'Casey', status: 'pending', client_name: 'South Motors' }
    ])
    mockClientQuery.mockResolvedValue({ rows: [] })

    const result = await requestHandler({
      body: { email: ' Client@Example.com ', redirect: '/portal/invoices?view=current' },
      headers: { 'x-forwarded-for': '203.0.113.10', 'user-agent': 'Portal test' }
    })

    expect(result).toEqual(genericResponse)
    expect(mockCheckAndConsume).toHaveBeenCalledTimes(2)
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client@example.com'])
    expect(mockClientQuery).toHaveBeenCalledTimes(4)

    const inserts = mockClientQuery.mock.calls.filter(call =>
      String(call[0]).includes('INSERT INTO client_magic_link_tokens')
    )
    expect(inserts).toHaveLength(2)
    for (const insert of inserts) {
      expect(insert[1][1]).toMatch(/^[a-f0-9]{64}$/)
      expect(new Date(insert[1][2]).getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000)
      expect(new Date(insert[1][2]).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)
    }

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockRunAfterResponse).toHaveBeenCalledOnce()
    expect(mockSendEmail.mock.calls.map(call => call[0].clientName)).toEqual([
      'North Motors',
      'South Motors'
    ])
    for (const [email] of mockSendEmail.mock.calls) {
      expect(email.magicLinkUrl).toMatch(
        /^https:\/\/app\.xeroflow\.io\/portal\/magic-link\?redirect=.*#token=[A-Za-z0-9_-]{64}$/
      )
      const rawToken = email.magicLinkUrl.split('#token=')[1]
      expect(JSON.stringify(mockClientQuery.mock.calls)).not.toContain(rawToken)
    }
  })

  it('rejects invalid input before rate limits and database work', async () => {
    await expect(requestHandler({ body: { email: 'not-an-email' } })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid magic-link request'
    })
    expect(mockCheckAndConsume).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('returns Retry-After when the request limit is exhausted', async () => {
    mockCheckAndConsume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000)
    })

    await expect(requestHandler({
      body: { email: 'client@example.com' },
      headers: { 'x-forwarded-for': '203.0.113.10' }
    })).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Too many sign-in links requested. Try again later.'
    })
    expect(testGlobal.setHeader).toHaveBeenCalledWith(expect.anything(), 'Retry-After', expect.any(Number))
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('does not reactivate pending accounts whose invitation is expired or cancelled', () => {
    const source = readFileSync('server/api/portal/auth/magic-link/request.post.ts', 'utf8')
    expect(source).toContain('EXISTS (')
    expect(source).toContain('invitation.status = \'pending\'')
    expect(source).toContain('invitation.expires_at > NOW()')
  })
})
