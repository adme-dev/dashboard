import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../server/utils/persona/feature', () => ({
  isPersonaIdentityEnabled: vi.fn()
}))
vi.mock('../../../../server/utils/leads/submissionIntent', () => ({
  fingerprintLeadIdentityKey: vi.fn((kind: string, value: string) => `${kind}:${value}`)
}))

import { isPersonaIdentityEnabled } from '../../../../server/utils/persona/feature'
import { recordLeadPersonaEvidence } from '../../../../server/utils/persona/identity'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const PROFILE_ID = '33333333-3333-4333-8333-333333333333'

function input() {
  return {
    clientId: CLIENT_ID,
    leadId: LEAD_ID,
    source: 'webhook',
    providerLeadId: 'dealer-studio:lead-123',
    fieldData: {
      lead_provider: 'dealer_studio',
      page_url: 'https://example.com/vehicles/rav4'
    },
    attribution: {
      browserEventId: 'browser-event-123',
      utm_source: 'google',
      utm_campaign: 'rav4-search',
      gclid: 'click-123'
    },
    consentDecision: 'granted',
    occurredAt: '2026-07-25T01:00:00.000Z'
  }
}

describe('Persona identity evidence', () => {
  beforeEach(() => {
    vi.mocked(isPersonaIdentityEnabled).mockReset()
  })

  it('does nothing outside the client entitlement boundary', async () => {
    vi.mocked(isPersonaIdentityEnabled).mockResolvedValue(false)
    const db = { query: vi.fn() }

    await expect(recordLeadPersonaEvidence(db, input())).resolves.toEqual({ status: 'disabled' })
    expect(db.query).not.toHaveBeenCalled()
  })

  it('adds browser and provider evidence to the existing tenant profile', async () => {
    vi.mocked(isPersonaIdentityEnabled).mockResolvedValue(true)
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/FROM crm_lead_identity_links/.test(sql)) return { rows: [{ profile_id: PROFILE_ID }] }
        if (/FROM crm_identity_keys/.test(sql)) return { rows: [{ profile_id: PROFILE_ID }] }
        return { rows: [] }
      })
    }

    await expect(recordLeadPersonaEvidence(db, input())).resolves.toEqual({
      status: 'linked',
      profileId: PROFILE_ID
    })
    expect(statements.filter(sql => /INSERT INTO crm_identity_keys/.test(sql))).toHaveLength(2)
    expect(statements.some(sql => /INSERT INTO crm_identity_subject_links/.test(sql))).toBe(true)
    expect(statements.filter(sql => /INSERT INTO crm_identity_evidence/.test(sql))).toHaveLength(4)
  })

  it('refuses to merge deterministic keys that resolve to different profiles', async () => {
    vi.mocked(isPersonaIdentityEnabled).mockResolvedValue(true)
    const otherProfile = '44444444-4444-4444-8444-444444444444'
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_lead_identity_links/.test(sql)) return { rows: [{ profile_id: PROFILE_ID }] }
        if (/FROM crm_identity_keys/.test(sql)) return { rows: [{ profile_id: otherProfile }] }
        return { rows: [] }
      })
    }

    await expect(recordLeadPersonaEvidence(db, input())).resolves.toEqual({
      status: 'identity_conflict',
      profileIds: [PROFILE_ID, otherProfile]
    })
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO crm_identity_keys/),
      expect.anything()
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO crm_identity_evidence/),
      expect.arrayContaining(['identity_conflict'])
    )
  })
})
