import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../server/utils/leads/db', () => ({
  loadLead: vi.fn(),
  loadRuleForForm: vi.fn(),
  insertDelivery: vi.fn().mockResolvedValue('D1'),
  insertCancelledPlaceholder: vi.fn(),
}))

import * as db from '../../../../server/utils/leads/db'
import { evaluateLead } from '../../../../server/utils/leads/rulesEngine'

const lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: null, ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { country: 'AU', budget: '8000' }, attribution: null,
  score: null, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

beforeEach(() => vi.clearAllMocks())

describe('evaluateLead', () => {
  it('writes a cancelled placeholder when no rule', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce(null)
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'no_rule_configured')
  })
  it('cancelled when rule disabled', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce({
      rule: { id: 'R1', enabled: false }, destinations: [],
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'rule_disabled')
  })
  it('inserts a delivery per matching destination', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce({
      rule: { id: 'R1', enabled: true },
      destinations: [
        { id: 'D-A', destination_type: 'slack', filter: null, delay_minutes: 0 },
        { id: 'D-B', destination_type: 'sms', filter: { field: 'field_data.country', op: 'eq', value: 'NZ' }, delay_minutes: 0 },
        { id: 'D-C', destination_type: 'webhook', filter: { field: 'field_data.budget', op: 'gt', value: 5000 }, delay_minutes: 5 },
      ],
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries.map(d => d.destination_id)).toEqual(['D-A', 'D-C'])
    expect(db.insertDelivery).toHaveBeenCalledTimes(2)
  })
})
