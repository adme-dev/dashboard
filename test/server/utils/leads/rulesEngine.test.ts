import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead, LeadFormRule, LeadRuleDestination } from '../../../../app/types'
import * as db from '../../../../server/utils/leads/db'
import { evaluateLead } from '../../../../server/utils/leads/rulesEngine'

vi.mock('../../../../server/utils/leads/db', () => ({
  loadLead: vi.fn(),
  loadRuleForForm: vi.fn(),
  insertDelivery: vi.fn().mockResolvedValue('D1'),
  insertCancelledPlaceholder: vi.fn()
}))

const loadLead = vi.mocked(db.loadLead)
const loadRuleForForm = vi.mocked(db.loadRuleForForm)

const lead: Lead = {
  id: 'L1',
  client_id: 'C1',
  source: 'google',
  source_lead_id: 's1',
  form_id: 'F1',
  form_name: null,
  ad_id: null,
  ad_name: null,
  campaign_id: null,
  campaign_name: null,
  page_id: null,
  submitted_at: '2026-04-30T10:00:00Z',
  ingested_at: '2026-04-30T10:00:01Z',
  field_data: { country: 'AU', budget: '8000' },
  attribution: null,
  score: null,
  score_reasons: null,
  status: 'new',
  spam_reasons: null,
  assigned_to: null,
  contacted_at: null,
  contacted_by: null,
  notes: null,
  created_by: null,
  deleted_at: null,
  created_at: '2026-04-30T10:00:01Z'
}

function rule(enabled: boolean): LeadFormRule {
  return {
    id: 'R1',
    client_id: 'C1',
    source: 'google',
    form_id: 'F1',
    form_name: null,
    enabled,
    created_by: null,
    created_at: '2026-04-30T10:00:01Z',
    updated_at: '2026-04-30T10:00:01Z'
  }
}

function destination(
  overrides: Partial<LeadRuleDestination> & Pick<LeadRuleDestination, 'id' | 'destination_type'>
): LeadRuleDestination {
  return {
    rule_id: 'R1',
    config: {},
    filter: null,
    delay_minutes: 0,
    enabled: true,
    sort_order: 0,
    created_at: '2026-04-30T10:00:01Z',
    updated_at: '2026-04-30T10:00:01Z',
    ...overrides
  }
}

beforeEach(() => vi.clearAllMocks())

describe('evaluateLead', () => {
  it('skips manual leads without looking up rules', async () => {
    loadLead.mockResolvedValueOnce({ ...lead, source: 'manual' })
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.loadRuleForForm).not.toHaveBeenCalled()
    expect(db.insertCancelledPlaceholder).not.toHaveBeenCalled()
  })

  it('loads webhook rules so generic form tools can replace Zapier catch hooks', async () => {
    loadLead.mockResolvedValueOnce({ ...lead, source: 'webhook', form_id: 'website-test-drive' })
    loadRuleForForm.mockResolvedValueOnce({
      rule: { ...rule(true), source: 'webhook', form_id: 'website-test-drive' },
      destinations: [
        destination({ id: 'D-A', destination_type: 'slack' })
      ]
    })
    const out = await evaluateLead('L1')
    expect(db.loadRuleForForm).toHaveBeenCalledWith('webhook', 'website-test-drive')
    expect(out.deliveries.map(d => d.destination_id)).toEqual(['D-A'])
  })

  it('loads CSV rules so imported exports can run the same destinations', async () => {
    loadLead.mockResolvedValueOnce({ ...lead, source: 'csv', form_id: 'meta-lead-center-export' })
    loadRuleForForm.mockResolvedValueOnce({
      rule: { ...rule(true), source: 'csv', form_id: 'meta-lead-center-export' },
      destinations: [
        destination({ id: 'D-A', destination_type: 'email' })
      ]
    })
    const out = await evaluateLead('L1')
    expect(db.loadRuleForForm).toHaveBeenCalledWith('csv', 'meta-lead-center-export')
    expect(out.deliveries.map(d => d.destination_id)).toEqual(['D-A'])
  })

  it('writes a cancelled placeholder when no rule', async () => {
    loadLead.mockResolvedValueOnce(lead)
    loadRuleForForm.mockResolvedValueOnce(null)
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'no_rule_configured')
  })

  it('cancelled when rule disabled', async () => {
    loadLead.mockResolvedValueOnce(lead)
    loadRuleForForm.mockResolvedValueOnce({
      rule: rule(false),
      destinations: []
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'rule_disabled')
  })

  it('inserts a delivery per matching destination', async () => {
    loadLead.mockResolvedValueOnce(lead)
    loadRuleForForm.mockResolvedValueOnce({
      rule: rule(true),
      destinations: [
        destination({ id: 'D-A', destination_type: 'slack' }),
        destination({
          id: 'D-B',
          destination_type: 'sms',
          filter: { field: 'field_data.country', op: 'eq', value: 'NZ' }
        }),
        destination({
          id: 'D-C',
          destination_type: 'webhook',
          filter: { field: 'field_data.budget', op: 'gt', value: 5000 },
          delay_minutes: 5
        })
      ]
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries.map(d => d.destination_id)).toEqual(['D-A', 'D-C'])
    expect(db.insertDelivery).toHaveBeenCalledTimes(2)
  })
})
