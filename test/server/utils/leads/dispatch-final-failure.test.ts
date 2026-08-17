import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claimDelivery: vi.fn(),
  loadLead: vi.fn(),
  markFailed: vi.fn(),
  getAdapter: vi.fn(),
  queryOne: vi.fn(),
  enqueueLeadJob: vi.fn()
}))

vi.mock('~~/server/utils/leads/db', () => ({
  claimDelivery: mocks.claimDelivery,
  loadLead: mocks.loadLead,
  loadRuleForForm: vi.fn(),
  releaseClaim: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: mocks.markFailed,
  markSkipped: vi.fn()
}))
vi.mock('~~/server/utils/leads/rulesEngine', () => ({ evaluateLead: vi.fn() }))
vi.mock('~~/server/utils/leads/destinations', () => ({ getAdapter: mocks.getAdapter }))
vi.mock('~~/server/utils/leads/crmPromotion', () => ({
  crmLeadPromotionService: { promote: vi.fn() }
}))
vi.mock('~~/server/utils/leads/crmPromotionState', () => ({
  markCrmPromotionFailure: vi.fn(),
  markCrmPromotionResult: vi.fn(),
  markCrmPromotionStarted: vi.fn()
}))
vi.mock('~~/server/utils/leads/queue', () => ({ enqueueLeadJob: mocks.enqueueLeadJob }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))

const { handleQueueMessage } = await import('../../../../server/utils/leads/dispatch')

describe('lead delivery final failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claimDelivery.mockResolvedValue({
      id: 'delivery-1',
      lead_id: 'lead-1',
      rule_destination_id: 'destination-1',
      destination_type: 'autogate',
      scheduled_at: '2026-08-17T00:00:00.000Z',
      retry_count: 0
    })
    mocks.loadLead.mockResolvedValue({
      id: 'lead-1',
      status: 'new',
      source: 'meta',
      form_id: null,
      deleted_at: null
    })
    mocks.queryOne.mockResolvedValue({
      id: 'destination-1',
      enabled: true,
      config: {}
    })
  })

  it('does not retry a permanent adapter failure', async () => {
    mocks.getAdapter.mockReturnValue({
      dispatch: vi.fn().mockResolvedValue({
        status: 'failed',
        error: 'autogate_http_400: invalid seller',
        final: true
      })
    })

    await handleQueueMessage({
      type: 'delivery.dispatch',
      payload: { delivery_id: 'delivery-1' }
    })

    expect(mocks.markFailed).toHaveBeenCalledWith(
      'delivery-1',
      'autogate_http_400: invalid seller',
      1,
      true
    )
    expect(mocks.enqueueLeadJob).not.toHaveBeenCalled()
  })
})
