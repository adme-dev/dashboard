import { describe, expect, it } from 'vitest'
import {
  AppendLeadCaptureTestEvidenceSchema,
  CreateLeadCaptureTestSchema
} from '../../../../server/utils/leads/captureTestContracts'

describe('lead capture browser evidence contract', () => {
  const token = 'a'.repeat(32)

  it('accepts browser-observable evidence', () => {
    expect(AppendLeadCaptureTestEvidenceSchema.safeParse({
      token,
      stage: 'tracker_loaded',
      outcome: 'passed',
      evidenceKey: 'track-js'
    }).success).toBe(true)
  })

  it('rejects attempts to forge server-owned canonical evidence', () => {
    expect(AppendLeadCaptureTestEvidenceSchema.safeParse({
      token,
      stage: 'canonical_test_lead_stored',
      outcome: 'passed',
      evidenceKey: 'forged'
    }).success).toBe(false)
  })

  it('does not allow an operator to declare a partial test successful', () => {
    expect(CreateLeadCaptureTestSchema.safeParse({
      clientId: '11111111-1111-4111-8111-111111111111',
      connectorId: '22222222-2222-4222-8222-222222222222',
      expectedOrigin: 'https://www.example.com.au',
      reason: 'Verify website capture',
      expectedStages: ['tracker_loaded']
    }).success).toBe(false)
  })
})
