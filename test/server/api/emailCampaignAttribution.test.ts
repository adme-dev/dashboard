import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockGetCampaign = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args)
}))

describe('email campaign attribution route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetRouterParam.mockReturnValue('camp-1')
    mockGetCampaign.mockResolvedValue({ id: 'camp-1', client_id: null })
    mockQueryOne
      .mockResolvedValueOnce({
        website_events: 12,
        sessions: 4,
        page_views: 5,
        conversions: 2,
        click_attributed_events: 3
      })
      .mockResolvedValueOnce({ leads: 1 })
    mockQueryRows.mockResolvedValue([
      {
        session_id: 'sess-1',
        anon_id: 'anon-1',
        events: 4,
        conversions: 1,
        email_click_ids: ['click-1']
      }
    ])
  })

  it('joins first-party website/session/conversion tracking by email UTM campaign', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/attribution.get')).default

    const result = await handler({} as never)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('FROM tracking_events')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('utm_source = \'email\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('utm_campaign = $1')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('event_data->>\'email_click_id\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('COALESCE(consent->>\'tracking\', \'denied\') = \'granted\'')
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('FROM leads')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(consent->>\'tracking\', \'denied\') = \'granted\'')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ARRAY_AGG(DISTINCT event_data->>\'email_click_id\')')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('GROUP BY session_id, anon_id')
    expect(result).toEqual({
      summary: {
        website_events: 12,
        sessions: 4,
        page_views: 5,
        conversions: 2,
        click_attributed_events: 3,
        leads: 1
      },
      sessions: [
        {
          session_id: 'sess-1',
          anon_id: 'anon-1',
          events: 4,
          conversions: 1,
          email_click_ids: ['click-1']
        }
      ]
    })
  })
})
