import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadLead: vi.fn(),
  loadRuleForForm: vi.fn(),
  claimDelivery: vi.fn(),
  releaseClaim: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn(),
  queryOne: vi.fn(),
  adapterDispatch: vi.fn(),
  getAdapter: vi.fn()
}))

vi.mock('~~/server/utils/leads/db', () => ({
  loadLead: mocks.loadLead,
  loadRuleForForm: mocks.loadRuleForForm,
  claimDelivery: mocks.claimDelivery,
  releaseClaim: mocks.releaseClaim,
  markDelivered: mocks.markDelivered,
  markFailed: mocks.markFailed,
  markSkipped: mocks.markSkipped
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
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))

const { handleQueueMessage } = await import('../../../../server/utils/leads/dispatch')

describe('lead delivery tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claimDelivery.mockResolvedValue({
      id: 'delivery-1',
      lead_id: 'lead-a',
      rule_destination_id: 'destination-b',
      destination_type: 'webhook',
      status: 'claimed',
      scheduled_at: '2026-07-29T00:00:00.000Z',
      claimed_at: '2026-07-29T00:00:00.000Z',
      claimed_by: 'worker',
      attempted_at: null,
      last_error: null,
      retry_count: 0,
      response_meta: null,
      idempotency_key: 'delivery-1',
      created_at: '2026-07-29T00:00:00.000Z',
      updated_at: '2026-07-29T00:00:00.000Z'
    })
    mocks.loadLead.mockResolvedValue({
      id: 'lead-a',
      client_id: 'client-a',
      source: 'email',
      form_id: 'email_endpoint:endpoint-a',
      status: 'new',
      deleted_at: null
    })
    mocks.queryOne.mockResolvedValue({
      id: 'destination-b',
      rule_id: 'rule-b',
      destination_type: 'webhook',
      config: {},
      filter: null,
      delay_minutes: 0,
      enabled: true
    })
    mocks.loadRuleForForm.mockResolvedValue({
      rule: {
        id: 'rule-a',
        client_id: 'client-a',
        source: 'email',
        form_id: 'email_endpoint:endpoint-a',
        form_name: 'Client A email',
        enabled: true,
        created_at: '2026-07-29T00:00:00.000Z',
        updated_at: '2026-07-29T00:00:00.000Z'
      },
      destinations: []
    })
    mocks.getAdapter.mockReturnValue({ dispatch: mocks.adapterDispatch })
    mocks.adapterDispatch.mockResolvedValue({ status: 'delivered' })
  })

  it('skips a queued destination belonging to a different rule before invoking its adapter', async () => {
    await handleQueueMessage({
      type: 'delivery.dispatch',
      payload: { delivery_id: 'delivery-1' }
    })

    expect(mocks.loadRuleForForm).toHaveBeenCalledWith(
      'email',
      'email_endpoint:endpoint-a',
      'client-a'
    )
    expect(mocks.markSkipped).toHaveBeenCalledWith('delivery-1', 'rule_not_authorized')
    expect(mocks.adapterDispatch).not.toHaveBeenCalled()
    expect(mocks.markDelivered).not.toHaveBeenCalled()
  })
})
