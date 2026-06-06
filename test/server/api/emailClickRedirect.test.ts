import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signEmailToken } from '~~/server/utils/email-marketing/links'

const mockGetQuery = vi.fn()
const mockSendRedirect = vi.fn()
const mockExecute = vi.fn()
const mockQueryOne = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
  getQuery: typeof mockGetQuery
  sendRedirect: typeof mockSendRedirect
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = mockGetQuery
testGlobal.sendRedirect = mockSendRedirect

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/email-marketing/links', async (original) => {
  const actual = await original<typeof import('~~/server/utils/email-marketing/links')>()
  return {
    ...actual,
    emailLinkSecret: () => 'secret'
  }
})

describe('email click redirect route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendRedirect.mockResolvedValue(undefined)
    mockExecute.mockResolvedValue(1)
    mockQueryOne.mockResolvedValue(null)
  })

  it('records the click and redirects to the destination with UTM attribution', async () => {
    const handler = (await import('~~/server/api/public/email/click.get')).default
    const destination = 'https://dealer.example.com/offers'
    const token = await signEmailToken('secret', 'click', 'camp-1', 'sub-1', destination)
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      u: destination,
      t: token
    })

    await handler({
      node: {
        req: {
          headers: {
            'user-agent': 'Vitest',
            'cf-connecting-ip': '203.0.113.10'
          }
        }
      }
    } as never)

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_events'),
      [
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        'camp-1',
        'sub-1',
        expect.stringMatching(/^https:\/\/dealer\.example\.com\/offers\?utm_source=email&utm_medium=email&utm_campaign=camp-1&email_click_id=[0-9a-f-]{36}$/),
        expect.stringContaining('"source":"first_party_redirect"')
      ]
    )
    const insertedClickId = mockExecute.mock.calls[0]?.[1]?.[0]
    const redirectedUrl = mockSendRedirect.mock.calls[0]?.[1]
    expect(redirectedUrl).toBe(`https://dealer.example.com/offers?utm_source=email&utm_medium=email&utm_campaign=camp-1&email_click_id=${insertedClickId}`)
    expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), redirectedUrl, 302)
  })

  it('serves the generated clean /email/click tracking URL', async () => {
    const handler = (await import('~~/server/routes/email/click.get')).default
    const destination = 'https://dealer.example.com/offers'
    const token = await signEmailToken('secret', 'click', 'camp-1', 'sub-1', destination)
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      u: destination,
      t: token
    })

    await handler({
      node: {
        req: {
          headers: {
            'user-agent': 'Vitest'
          }
        }
      }
    } as never)

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_events'),
      expect.arrayContaining(['camp-1', 'sub-1'])
    )
    expect(mockSendRedirect).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^https:\/\/dealer\.example\.com\/offers\?utm_source=email&utm_medium=email&utm_campaign=camp-1&email_click_id=[0-9a-f-]{36}$/),
      302
    )
  })

  it('rejects an invalid signature before recording a click', async () => {
    const handler = (await import('~~/server/api/public/email/click.get')).default
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      u: 'https://dealer.example.com/offers',
      t: 'bad-token'
    })

    await expect(handler({ node: { req: { headers: {} } } } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'invalid_click_token'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('stores suspected scanner classification in click metadata', async () => {
    const handler = (await import('~~/server/api/public/email/click.get')).default
    const destination = 'https://dealer.example.com/offers'
    const token = await signEmailToken('secret', 'click', 'camp-1', 'sub-1', destination)
    mockGetQuery.mockReturnValue({
      c: 'camp-1',
      s: 'sub-1',
      u: destination,
      t: token
    })

    await handler({
      node: {
        req: {
          headers: {
            'user-agent': 'Proofpoint URL Defense'
          }
        }
      }
    } as never)

    expect(mockExecute.mock.calls[0]?.[1]?.[4]).toContain('"suspectedScanner":true')
    expect(mockExecute.mock.calls[0]?.[1]?.[4]).toContain('scanner_user_agent')
  })

  it('uses recipient send timing to tag impossible scanner clicks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T00:00:02.000Z'))
    try {
      const handler = (await import('~~/server/api/public/email/click.get')).default
      const destination = 'https://dealer.example.com/offers'
      const token = await signEmailToken('secret', 'click', 'camp-1', 'sub-1', destination)
      mockGetQuery.mockReturnValue({
        c: 'camp-1',
        s: 'sub-1',
        u: destination,
        t: token
      })
      mockQueryOne.mockResolvedValueOnce({ sent_at: '2026-06-05T00:00:00.000Z' })

      await handler({
        node: {
          req: {
            headers: {
              'user-agent': 'Mozilla/5.0'
            }
          }
        }
      } as never)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM campaign_recipients'),
        ['camp-1', 'sub-1']
      )
      expect(mockExecute.mock.calls[0]?.[1]?.[4]).toContain('"suspectedScanner":true')
      expect(mockExecute.mock.calls[0]?.[1]?.[4]).toContain('impossible_timing')
    } finally {
      vi.useRealTimers()
    }
  })
})
