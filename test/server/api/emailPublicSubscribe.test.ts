import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockSubscribePublic = vi.fn()
const mockSendDoubleOptInEmail = vi.fn()
const mockSignEmailToken = vi.fn()

const LIST_ID = '11111111-1111-4111-8111-111111111111'

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.example.com/'
}))

vi.mock('~~/server/utils/email', () => ({
  sendDoubleOptInEmail: (...args: unknown[]) => mockSendDoubleOptInEmail(...args)
}))

vi.mock('~~/server/utils/email-marketing/links', () => ({
  emailLinkSecret: () => 'secret',
  signEmailToken: (...args: unknown[]) => mockSignEmailToken(...args)
}))

vi.mock('~~/server/utils/email-marketing/subscriptions', () => ({
  subscribePublic: (...args: unknown[]) => mockSubscribePublic(...args)
}))

vi.mock('~~/server/utils/turnstile', () => ({
  isTurnstileEnabled: () => false,
  verifyTurnstile: vi.fn()
}))

describe('public email subscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({
      email: 'Person@Example.COM',
      name: 'Person',
      listId: LIST_ID
    })
    mockSubscribePublic.mockResolvedValue({
      subscriberId: 'sub-1',
      listId: LIST_ID,
      listName: 'Retail News',
      status: 'unconfirmed',
      needsConfirm: true
    })
    mockSignEmailToken.mockResolvedValue('confirm-token')
  })

  it('normalizes public signup emails before subscribing and sending confirmation', async () => {
    const handler = (await import('~~/server/api/public/email/subscribe.post')).default

    const result = await handler({} as never)

    expect(mockSubscribePublic).toHaveBeenCalledWith({
      email: 'person@example.com',
      name: 'Person',
      listId: LIST_ID,
      source: 'form'
    })
    expect(mockSignEmailToken).toHaveBeenCalledWith('secret', 'confirm', 'sub-1', LIST_ID)
    expect(mockSendDoubleOptInEmail).toHaveBeenCalledWith({
      to: 'person@example.com',
      listName: 'Retail News',
      confirmUrl: `https://app.example.com/email/confirm?s=sub-1&l=${LIST_ID}&t=confirm-token`
    })
    expect(result).toEqual({
      ok: true,
      needsConfirm: true,
      status: 'unconfirmed',
      listName: 'Retail News'
    })
  })
})
