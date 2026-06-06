import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetCampaign = vi.fn()
const mockGetCampaignListClientIds = vi.fn()
const mockUpdateCampaign = vi.fn()
const mockScheduleCampaign = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockGetAppUrl = vi.fn()
const mockResolveCampaignSenderDomains = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  getCampaignListClientIds: (...args: unknown[]) => mockGetCampaignListClientIds(...args),
  updateCampaign: (...args: unknown[]) => mockUpdateCampaign(...args),
  scheduleCampaign: (...args: unknown[]) => mockScheduleCampaign(...args)
}))

vi.mock('~~/server/utils/email-marketing/segment', () => ({
  isValidSegment: vi.fn(() => true)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args)
}))

vi.mock('~~/server/utils/email-marketing/senderIdentity', () => ({
  resolveCampaignSenderDomains: (...args: unknown[]) => mockResolveCampaignSenderDomains(...args)
}))

vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: (...args: unknown[]) => mockGetAppUrl(...args)
}))

describe('campaign patch scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetRouterParam.mockReturnValue('camp-1')
    mockIsEmailConfigured.mockReturnValue(true)
    mockGetAppUrl.mockReturnValue('https://app.example.com')
    mockResolveCampaignSenderDomains.mockReturnValue(['adme.net.au'])
    mockGetCampaign.mockResolvedValue({ id: 'camp-1', client_id: null })
    mockGetCampaignListClientIds.mockResolvedValue([])
    mockUpdateCampaign.mockResolvedValue({ id: 'camp-1', name: 'June offers' })
    mockScheduleCampaign.mockResolvedValue({ id: 'camp-1', status: 'scheduled' })
  })

  it('saves draft edits before scheduling with preflight readiness inputs', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id].patch')).default
    mockReadBody.mockResolvedValue({
      name: 'June offers',
      scheduled_at: '2026-06-06T00:00:00.000Z'
    })

    const result = await handler({} as never)

    expect(mockUpdateCampaign).toHaveBeenCalledWith('camp-1', { name: 'June offers' })
    expect(mockScheduleCampaign).toHaveBeenCalledWith('camp-1', '2026-06-06T00:00:00.000Z', {
      sendingConfigured: true,
      senderDomainAuthenticated: true,
      allowedSenderDomains: ['adme.net.au'],
      appUrl: 'https://app.example.com',
      userId: 'user-1'
    })
    expect(result).toEqual({ campaign: { id: 'camp-1', status: 'scheduled' } })
  })
})
