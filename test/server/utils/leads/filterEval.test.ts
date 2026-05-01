import { describe, it, expect } from 'vitest'
import { evaluateFilter, resolveField } from '../../../../server/utils/leads/filterEval'
import type { Lead } from '../../../../app/types'

const baseLead: Lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: 'Quote', ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { email: 'a@b.co', budget: '8000', country: 'AU' },
  attribution: { utm_source: 'fb', gclid: 'g1' },
  score: 72, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

describe('resolveField', () => {
  it('reads top-level scalars', () => {
    expect(resolveField(baseLead, 'score')).toBe(72)
    expect(resolveField(baseLead, 'status')).toBe('new')
  })
  it('reads nested field_data and attribution', () => {
    expect(resolveField(baseLead, 'field_data.email')).toBe('a@b.co')
    expect(resolveField(baseLead, 'attribution.utm_source')).toBe('fb')
  })
  it('returns undefined for missing paths', () => {
    expect(resolveField(baseLead, 'field_data.missing')).toBeUndefined()
    expect(resolveField(baseLead, 'attribution.utm_medium')).toBeUndefined()
  })
})

describe('evaluateFilter', () => {
  it('null filter passes', () => {
    expect(evaluateFilter(baseLead, null)).toBe(true)
  })
  it('eq / neq', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'eq', value: 'AU' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'neq', value: 'AU' })).toBe(false)
  })
  it('numeric gt/lt/gte/lte coerce strings', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'gt', value: 5000 })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'lte', value: 8000 })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'lt', value: 5000 })).toBe(false)
  })
  it('contains / starts_with / ends_with', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'contains', value: '@b.' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'starts_with', value: 'a@' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'ends_with', value: '.co' })).toBe(true)
  })
  it('is_empty / is_not_empty', () => {
    expect(evaluateFilter(baseLead, { field: 'attribution.utm_medium', op: 'is_empty' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'is_not_empty' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'attribution.utm_source', op: 'is_empty' })).toBe(false)
  })
  it('in / not_in', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'in', value: ['AU', 'NZ'] })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'not_in', value: ['US', 'UK'] })).toBe(true)
  })
  it('returns false on missing field for non-empty ops', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.missing', op: 'eq', value: 'x' })).toBe(false)
    expect(evaluateFilter(baseLead, { field: 'field_data.missing', op: 'gt', value: 0 })).toBe(false)
  })
  it('unknown operator returns false (defensive)', () => {
    expect(evaluateFilter(baseLead, { field: 'score', op: 'bogus' as any, value: 0 })).toBe(false)
  })
})
