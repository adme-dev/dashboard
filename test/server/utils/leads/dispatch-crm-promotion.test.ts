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

  it('promotes the requested lead and logs identifiers without customer identity data', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await handleQueueMessage({ type: 'crm.promote', payload: { lead_id: 'lead-1' } })

    expect(promote).toHaveBeenCalledWith('lead-1')
    expect(info).toHaveBeenCalledWith({
      event: 'crm_lead_promotion_completed',
      leadId: 'lead-1',
      status: 'promoted',
      personId: 'person-1',
      opportunityId: 'opportunity-1'
    })
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/email|phone|customer/i)
    info.mockRestore()
  })
})
