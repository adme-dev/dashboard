import { describe, expect, it } from 'vitest'
import {
  collectGooglePmaxDecisionEvidence,
  GOOGLE_PMAX_EVIDENCE_SOURCES
} from '~~/server/utils/googlePmaxDecisionEvidence'
import { buildGooglePmaxDecisionEvidence } from '../../../workers/google-pmax-provider/src/decisionEvidencePolicy'

const identity = {
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  configVersion: 3,
  configHash: 'a'.repeat(64)
}

const observedAt = '2026-08-07T10:00:00.000Z'
const freshUntil = '2026-08-07T11:00:00.000Z'

function section(
  source: string,
  authority: 'approved' | 'operational' | 'draft' | 'external_readback' = 'operational',
  overrides: Record<string, unknown> = {}
) {
  return {
    source,
    tenantId: identity.tenantId,
    clientId: identity.clientId,
    authority,
    status: 'available',
    observedAt,
    freshUntil,
    references: [{ kind: `${source}_record`, id: `${source}-1` }],
    facts: { count: 1 },
    ...overrides
  }
}

const criticalSections = [
  section('brief', 'approved'),
  section('feed', 'operational'),
  section('merchant', 'external_readback'),
  section('measurement', 'external_readback'),
  section('onboarding', 'external_readback')
]

describe('Google PMax whole-platform decision evidence', () => {
  it('binds critical and advisory platform evidence to one config hash', () => {
    const result = buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt: '2026-08-07T10:05:00.000Z',
      sections: [
        ...criticalSections,
        section('audiences'),
        section('personas'),
        section('knowledge', 'approved'),
        section('boards', 'draft'),
        section('monday', 'operational'),
        section('performance'),
        section('anomalies'),
        section('tasks')
      ]
    })

    expect(result).toMatchObject({
      schemaVersion: 1,
      identity,
      readyForDeterministicPreflight: true,
      blockerCount: 0,
      evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(result.sections.find(item => item.source === 'boards')).toMatchObject({
      authority: 'draft',
      decisionEligible: false
    })
    expect(result.sections.find(item => item.source === 'knowledge')).toMatchObject({
      authority: 'approved',
      decisionEligible: true
    })
  })

  it('fails closed on cross-tenant or cross-client evidence', () => {
    expect(() => buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt: '2026-08-07T10:05:00.000Z',
      sections: [
        ...criticalSections,
        section('boards', 'draft', { tenantId: '00000000-0000-4000-8000-000000000000' })
      ]
    })).toThrow(/scope/i)
  })

  it('blocks stale or unavailable launch-critical evidence but keeps advisory gaps visible', () => {
    const result = buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt: '2026-08-07T12:00:00.000Z',
      sections: [
        section('brief', 'approved', { freshUntil: '2026-08-08T00:00:00.000Z' }),
        section('feed', 'operational', { status: 'unavailable' }),
        section('merchant', 'external_readback'),
        section('measurement', 'external_readback'),
        section('onboarding', 'external_readback'),
        section('knowledge', 'approved', { status: 'unavailable' })
      ]
    })

    expect(result.readyForDeterministicPreflight).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PMAX_EVIDENCE_FEED_UNAVAILABLE', severity: 'blocker' }),
      expect.objectContaining({ code: 'PMAX_EVIDENCE_MERCHANT_STALE', severity: 'blocker' }),
      expect.objectContaining({ code: 'PMAX_EVIDENCE_KNOWLEDGE_UNAVAILABLE', severity: 'advisory' })
    ]))
  })

  it('produces the same evidence hash for equivalent source and reference order', () => {
    const sections = [
      ...criticalSections,
      section('boards', 'approved', {
        references: [
          { kind: 'board_item', id: '2' },
          { kind: 'board_item', id: '1' }
        ]
      })
    ]
    const first = buildGooglePmaxDecisionEvidence({ identity, collectedAt: observedAt, sections })
    const second = buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt: observedAt,
      sections: [...sections].reverse().map(item => ({
        ...item,
        references: [...item.references].reverse()
      }))
    })

    expect(first.evidenceHash).toBe(second.evidenceHash)
  })

  it('rejects secrets before evidence can be persisted or sent through AI Gateway', () => {
    expect(() => buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt: observedAt,
      sections: [
        ...criticalSections,
        section('knowledge', 'approved', { facts: { apiToken: 'do-not-store' } })
      ]
    })).toThrow(/sensitive/i)
  })

  it('calls every platform collector and normalizes one source failure without leaking its error', async () => {
    const calls: string[] = []
    const collectors = Object.fromEntries(GOOGLE_PMAX_EVIDENCE_SOURCES.map(source => [
      source,
      async () => {
        calls.push(source)
        if (source === 'monday') throw new Error('Bearer private-monday-token')
        return {
          authority: source === 'brief' || source === 'knowledge' ? 'approved' as const : 'operational' as const,
          status: 'available' as const,
          observedAt,
          freshUntil,
          references: [{ kind: `${source}_record`, id: `${source}-1` }],
          facts: { count: 1 }
        }
      }
    ]))

    const result = await collectGooglePmaxDecisionEvidence({
      identity,
      collectors,
      build: async input => buildGooglePmaxDecisionEvidence(input),
      now: () => new Date('2026-08-07T10:05:00.000Z')
    })

    expect(calls.sort()).toEqual([...GOOGLE_PMAX_EVIDENCE_SOURCES].sort())
    expect(result.sections.find(item => item.source === 'monday')).toMatchObject({
      status: 'unavailable',
      facts: { errorCode: 'SOURCE_READ_FAILED' }
    })
    expect(JSON.stringify(result)).not.toContain('private-monday-token')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'PMAX_EVIDENCE_MONDAY_UNAVAILABLE',
      severity: 'advisory'
    }))
  })
})
