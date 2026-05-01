import { describe, it, expect } from 'vitest'
import { normalizeGooglePayload, normalizeManualPayload } from '../../../../server/utils/leads/normalizer'

describe('normalizeGooglePayload', () => {
  const payload = {
    lead_id: 'gads-123',
    api_version: '1.0',
    form_id: 'form-9',
    campaign_id: '888',
    gcl_id: 'gxyz',
    user_column_data: [
      { column_name: 'EMAIL', string_value: 'jane@acme.co' },
      { column_name: 'FULL_NAME', string_value: 'Jane Doe' },
      { column_name: 'PHONE_NUMBER', string_value: '+61400000001' },
    ],
  }
  it('produces canonical InsertLeadInput shape', () => {
    const out = normalizeGooglePayload(payload, 'client-1')
    expect(out.source).toBe('google')
    expect(out.source_lead_id).toBe('gads-123')
    expect(out.client_id).toBe('client-1')
    expect(out.form_id).toBe('form-9')
    expect(out.field_data.email).toBe('jane@acme.co')
    expect(out.field_data.full_name).toBe('Jane Doe')
    expect(out.field_data.phone_number).toBe('+61400000001')
    expect(out.attribution?.gclid).toBe('gxyz')
    expect(typeof out.submitted_at).toBe('string')
  })
  it('lower-cases column names and skips empty values', () => {
    const out = normalizeGooglePayload({
      ...payload,
      user_column_data: [
        { column_name: 'WEIRD CASE', string_value: 'x' },
        { column_name: 'EMPTY', string_value: '' },
      ],
    }, 'client-1')
    expect(out.field_data.weird_case).toBe('x')
    expect(out.field_data.empty).toBeUndefined()
  })
})

describe('normalizeManualPayload', () => {
  it('generates deterministic-shape output with source=manual', () => {
    const out = normalizeManualPayload({
      client_id: 'C1',
      field_data: { email: 'a@b.co', notes: 'walk-in' },
      form_name: 'Phone-In',
      created_by: 'U1',
    })
    expect(out.source).toBe('manual')
    expect(out.client_id).toBe('C1')
    expect(out.form_id).toBeNull()
    expect(out.field_data.email).toBe('a@b.co')
    expect(out.created_by).toBe('U1')
    expect(out.source_lead_id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
