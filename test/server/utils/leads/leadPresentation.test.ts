import { describe, expect, it } from 'vitest'
import {
  redactLeadFieldSample,
  safeEmailLeadPresentationSelect
} from '../../../../server/utils/leads/leadPresentation'

describe('email lead presentation', () => {
  it('recursively redacts PII-keyed samples while preserving safe field structure', () => {
    const sample = {
      vehicle: { make: 'Toyota', model: 'RAV4' },
      contact: {
        email: 'sensitive',
        phone: 'sensitive',
        customerEmail: 'sensitive',
        profile: {
          name: 'sensitive',
          address: { postcode: 'sensitive' }
        }
      }
    }

    expect(redactLeadFieldSample(sample)).toEqual({
      vehicle: { make: 'Toyota', model: 'RAV4' },
      contact: {
        email: '[redacted]',
        phone: '[redacted]',
        customerEmail: '[redacted]',
        profile: {
          name: '[redacted]',
          address: { postcode: '[redacted]' }
        }
      }
    })
  })

  it('projects only presentation-safe email metadata and rechecks duplicate client ownership', () => {
    const sql = safeEmailLeadPresentationSelect('l')
    expect(sql).toContain('email_provider')
    expect(sql).toContain('email_endpoint_label')
    expect(sql).toContain('possible_duplicate_lead_id')
    expect(sql).toMatch(/duplicate_lead\.client_id = l\.client_id/)
    expect(sql).not.toMatch(/recipient_token|address_token|sender_domain|r2_|identity_hash|message_id_hash|safe_evidence/)
  })
})
