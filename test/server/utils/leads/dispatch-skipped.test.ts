import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claimDelivery: vi.fn(),
  loadLead: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn(),
  markDelivered: vi.fn(),
  getAdapter: vi.fn(),
  queryOne: vi.fn(),
  enqueueLeadJob: vi.fn()
}))

vi.mock('~~/server/utils/leads/db', () => ({
  claimDelivery: mocks.claimDelivery,
  loadLead: mocks.loadLead,
  loadRuleForForm: vi.fn(),
  releaseClaim: vi.fn(),
  markDelivered: mocks.markDelivered,
  markFailed: mocks.markFailed,
  markSkipped: mocks.markSkipped
}))
vi.mock('~~/server/utils/leads/rulesEngine', () => ({ evaluateLead: vi.fn() }))
vi.mock('~~/server/utils/leads/destinations', () => ({ getAdapter: mocks.getAdapter }))
vi.mock('~~/server/utils/leads/crmPromotion', () => ({ crmLeadPromotionService: { promote: vi.fn() } }))
vi.mock('~~/server/utils/leads/crmPromotionState', () => ({
  markCrmPromotionFailure: vi.fn(),
  markCrmPromotionResult: vi.fn(),
  markCrmPromotionStarted: vi.fn()
}))
vi.mock('~~/server/utils/leads/queue', () => ({ enqueueLeadJob: mocks.enqueueLeadJob }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))

const { handleQueueMessage } = await import('../../../../server/utils/leads/dispatch')

describe('lead delivery policy skips', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claimDelivery.mockResolvedValue({
      id: 'delivery-1', lead_id: 'lead-1', rule_destination_id: 'destination-1',
      destination_type: 'autoresponder_email', scheduled_at: '2026-08-17T00:00:00.000Z', retry_count: 0
    })
    mocks.loadLead.mockResolvedValue({ id: 'lead-1', status: 'new', source: 'meta', form_id: null, deleted_at: null })
    mocks.queryOne.mockResolvedValue({ id: 'destination-1', enabled: true, config: {} })
  })

  it('records an adapter skip as skipped, not failed, and never retries it', async () => {
    mocks.getAdapter.mockReturnValue({
      dispatch: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'ack_recipient_window' })
    })
    await handleQueueMessage({ type: 'delivery.dispatch', payload: { delivery_id: 'delivery-1' } })
    expect(mocks.markSkipped).toHaveBeenCalledWith('delivery-1', 'ack_recipient_window')
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(mocks.markDelivered).not.toHaveBeenCalled()
    expect(mocks.enqueueLeadJob).not.toHaveBeenCalled()
  })
})
