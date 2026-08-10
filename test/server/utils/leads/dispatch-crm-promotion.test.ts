import { beforeEach, describe, expect, it, vi } from 'vitest'

const { promote } = vi.hoisted(() => ({
  promote: vi.fn()
}))

vi.mock('~~/server/utils/leads/crmPromotion', () => ({
  crmLeadPromotionService: { promote }
}))
vi.mock('~~/server/utils/leads/db', () => ({
  loadLead: vi.fn(),
  loadRuleForForm: vi.fn(),
  claimDelivery: vi.fn(),
  releaseClaim: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn()
}))
vi.mock('~~/server/utils/leads/rulesEngine', () => ({ evaluateLead: vi.fn() }))
vi.mock('~~/server/utils/leads/destinations', () => ({ getAdapter: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn() }))

const { handleQueueMessage } = await import('../../../../server/utils/leads/dispatch')

describe('CRM promotion queue dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    promote.mockResolvedValue({
      status: 'promoted',
      personId: 'person-1',
      opportunityId: 'opportunity-1',
      linkId: 'link-1',
      personCreated: true
    })
  })

  it('promotes the requested lead and logs status without record or customer identifiers', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await handleQueueMessage({ type: 'crm.promote', payload: { lead_id: 'lead-1' } })

    expect(promote).toHaveBeenCalledWith('lead-1')
    expect(info).toHaveBeenCalledWith({
      event: 'crm_lead_promotion_completed',
      status: 'promoted'
    })
    expect(JSON.stringify(info.mock.calls)).not.toMatch(
      /lead-1|person-1|opportunity-1|email|phone|customer/i
    )
    info.mockRestore()
  })
})
