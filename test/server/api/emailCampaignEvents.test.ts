import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockGetCampaign = vi.fn()
const CLIENT_1 = '11111111-1111-4111-8111-111111111111'

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

describe('email campaign events route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetRouterParam.mockReturnValue('camp-1')
    mockGetCampaign.mockResolvedValue({ id: 'camp-1', client_id: null })
    mockQueryOne.mockResolvedValue({
      sent: 10,
      delivered: 9,
      opened: 6,
      clicked: 4,
      human_clicked: 3,
      delivery_delayed: 2,
      bounced: 1,
      complained: 1,
      unsubscribed: 2
    })
    mockQueryRows.mockResolvedValue([
      {
        id: 'evt-1',
        event_type: 'clicked',
        subscriber_email: 'person@example.com',
        suspected_scanner: false
      }
    ])
  })

  it('returns lifecycle metrics with human-click filtering and directional open labelling', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/events.get')).default

    const result = await handler({} as never)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('human_clicked')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('raw->>\'source\' = \'first_party_redirect\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('raw #>> \'{clickClassification,suspectedScanner}\'')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('delivery_delayed')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('email_events ee')
    expect(result).toEqual({
      summary: {
        sent: 10,
        delivered: 9,
        opened: 6,
        opened_label: 'directional',
        clicked: 4,
        human_clicked: 3,
        delivery_delayed: 2,
        bounced: 1,
        complained: 1,
        unsubscribed: 2
      },
      events: [
        {
          id: 'evt-1',
          event_type: 'clicked',
          subscriber_email: 'person@example.com',
          suspected_scanner: false
        }
      ]
    })
  })

  it('scopes subscriber identity joins to the campaign client', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/events.get')).default
    mockGetCampaign.mockResolvedValueOnce({ id: 'camp-1', client_id: CLIENT_1 })

    await handler({} as never)

    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('s.client_id = $2::uuid')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['camp-1', CLIENT_1])
  })
})
