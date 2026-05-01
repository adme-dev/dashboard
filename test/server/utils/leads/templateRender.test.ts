import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../../../../server/utils/leads/templateRender'
import type { Lead } from '../../../../app/types'

const lead: Lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: 'Quote Form', ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { email: 'jane@acme.co', first_name: 'Jane', budget: '8000' },
  attribution: { utm_source: 'fb' },
  score: null, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

describe('renderTemplate', () => {
  it('substitutes field paths', () => {
    const r = renderTemplate('Hi {{ field.first_name }}', lead)
    expect(r.text).toBe('Hi Jane')
    expect(r.warnings).toEqual([])
  })
  it('handles top-level lead paths', () => {
    expect(renderTemplate('From {{ source }}', lead).text).toBe('From google')
    expect(renderTemplate('Form: {{ form_name }}', lead).text).toBe('Form: Quote Form')
  })
  it('handles attribution paths', () => {
    expect(renderTemplate('Src {{ attribution.utm_source }}', lead).text).toBe('Src fb')
  })
  it('renders missing fields as empty + warns', () => {
    const r = renderTemplate('Hi {{ field.middle_name }}!', lead)
    expect(r.text).toBe('Hi !')
    expect(r.warnings).toContain('field.middle_name')
  })
  it('escapes HTML in scalar values when html=true', () => {
    const evil: Lead = { ...lead, field_data: { ...lead.field_data, first_name: '<b>x</b>' } }
    const r = renderTemplate('Hi {{ field.first_name }}', evil, { html: true })
    expect(r.text).toBe('Hi &lt;b&gt;x&lt;/b&gt;')
  })
  it('leaves unknown braces alone if not template syntax', () => {
    expect(renderTemplate('1{2}3', lead).text).toBe('1{2}3')
  })
})
