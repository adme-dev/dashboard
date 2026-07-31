import { beforeEach, describe, expect, it } from 'vitest'
import {
  chooseIntentCandidate,
  fingerprintLeadIdentity,
  scoreIntentCandidate
} from '../../../../server/utils/leads/submissionIntent'

beforeEach(() => {
  process.env.LEAD_IDENTITY_HMAC_KEY = 'test-only-identity-key'
})

describe('lead submission intent reconciliation', () => {
  it('uses an explicit request-scoped fingerprint secret when process env is unavailable', () => {
    delete process.env.LEAD_IDENTITY_HMAC_KEY
    delete process.env.CRON_SECRET

    const fingerprint = fingerprintLeadIdentity(
      { email: 'person@example.com' },
      'request-scoped-identity-key'
    )

    expect(fingerprint.emailFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('normalizes equivalent email and Australian phone representations', () => {
    const first = fingerprintLeadIdentity({
      email: ' PERSON@Example.com ',
      phone: '0400 123 456'
    })
    const second = fingerprintLeadIdentity({
      email: 'person@example.com',
      phone: '+61 400 123 456'
    })

    expect(first).toEqual(second)
    expect(first.emailFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(first.phoneFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('scores identity, form, vehicle, and time without using raw PII', () => {
    const score = scoreIntentCandidate({
      candidate: {
        email_fingerprint: 'email-hash',
        phone_fingerprint: 'phone-hash',
        form_id: 'vehicle-enquiry',
        vehicle_reference: 'S1234',
        occurred_at: '2026-07-24T01:00:00Z'
      },
      emailFingerprint: 'email-hash',
      phoneFingerprint: 'phone-hash',
      formId: 'vehicle-enquiry',
      vehicleReference: 's1234',
      submittedAt: '2026-07-24T01:02:00Z'
    })

    expect(score).toBe(135)
  })

  it('refuses ambiguous repeated submissions rather than guessing', () => {
    const base = {
      browser_event_id: 'event-1',
      email_fingerprint: 'same-email',
      phone_fingerprint: null,
      form_id: 'enquiry',
      vehicle_reference: null,
      attribution: {},
      occurred_at: '2026-07-24T01:00:00Z'
    }
    const selected = chooseIntentCandidate([
      { ...base, id: 'intent-1' },
      { ...base, id: 'intent-2', browser_event_id: 'event-2' }
    ], {
      emailFingerprint: 'same-email',
      phoneFingerprint: null,
      formId: 'enquiry',
      vehicleReference: null,
      submittedAt: '2026-07-24T01:01:00Z'
    })

    expect(selected).toBeNull()
  })
})
