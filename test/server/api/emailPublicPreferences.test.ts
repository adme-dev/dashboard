import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signEmailToken } from '~~/server/utils/email-marketing/links'

const mockGetQuery = vi.fn()
const mockReadBody = vi.fn()
const mockSetResponseHeader = vi.fn()
const mockGlobalUnsubscribe = vi.fn()
const mockSetListSubscription = vi.fn()

const LIST_ID = '11111111-1111-4111-8111-111111111111'

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getQuery: typeof mockGetQuery
  readBody: typeof mockReadBody
  setResponseHeader: typeof mockSetResponseHeader
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = mockGetQuery
testGlobal.readBody = mockReadBody
testGlobal.setResponseHeader = mockSetResponseHeader

vi.mock('~~/server/utils/email-marketing/links', async (original) => {
  const actual = await original<typeof import('~~/server/utils/email-marketing/links')>()
  return {
    ...actual,
    emailLinkSecret: () => 'secret'
  }
})

vi.mock('~~/server/utils/email-marketing/subscriptions', () => ({
  globalUnsubscribe: (...args: unknown[]) => mockGlobalUnsubscribe(...args),
  setListSubscription: (...args: unknown[]) => mockSetListSubscription(...args)
}))

async function unsubToken(campaignId = 'camp-1', subscriberId = 'sub-1') {
  return signEmailToken('secret', 'unsub', campaignId, subscriberId)
}

describe('public email unsubscribe and preference routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({})
    mockGetQuery.mockReturnValue({})
    mockGlobalUnsubscribe.mockResolvedValue({ email: 'person@example.com' })
    mockSetListSubscription.mockResolvedValue(true)
  })

  it('handles RFC one-click unsubscribe posts with the signed List-Unsubscribe token', async () => {
    const handler = (await import('~~/server/routes/email/unsubscribe.post')).default
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      t: await unsubToken()
    })

    const result = await handler({} as never)

    expect(mockGlobalUnsubscribe).toHaveBeenCalledWith({
      subscriberId: 'sub-1',
      campaignId: 'camp-1'
    })
    expect(mockSetResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'content-type',
      'text/plain; charset=utf-8'
    )
    expect(result).toBe('You have been unsubscribed.')
  })

  it('rejects invalid one-click unsubscribe tokens before changing subscriptions', async () => {
    const handler = (await import('~~/server/routes/email/unsubscribe.post')).default
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      t: 'bad-token'
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'invalid_token'
    })
    expect(mockGlobalUnsubscribe).not.toHaveBeenCalled()
  })

  it('returns the unsubscribed email from the public unsubscribe API', async () => {
    const handler = (await import('~~/server/api/public/email/unsubscribe.post')).default
    mockReadBody.mockResolvedValue({
      c: 'camp-1',
      s: 'sub-1',
      t: await unsubToken()
    })

    await expect(handler({} as never)).resolves.toEqual({
      ok: true,
      email: 'person@example.com'
    })
    expect(mockGlobalUnsubscribe).toHaveBeenCalledWith({
      subscriberId: 'sub-1',
      campaignId: 'camp-1'
    })
  })

  it('applies signed preference-center list toggles', async () => {
    const handler = (await import('~~/server/api/public/email/preferences.post')).default
    mockReadBody.mockResolvedValue({
      c: 'camp-1',
      s: 'sub-1',
      t: await unsubToken(),
      listId: LIST_ID,
      subscribe: false
    })

    await expect(handler({} as never)).resolves.toEqual({ ok: true, changed: true })
    expect(mockSetListSubscription).toHaveBeenCalledWith({
      subscriberId: 'sub-1',
      listId: LIST_ID,
      subscribe: false
    })
  })
})
