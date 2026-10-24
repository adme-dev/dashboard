import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoveryEnabledRequestSchema,
  TransferRecoverySourceDiscoveryRequestSchema,
  TransferRecoveryPhaseAcknowledgmentSchema,
  TransferRecoverySourceDiscoveryResultSchema
} from '~~/shared/pageStudio/transferRecoveryPhase'

const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission-applied.json', 'utf8'))
const enabled = {
  purpose: 'recovery-enabled',
  pending: fixture.pending,
  applied: fixture.applied,
  recovery: {
    ...fixture.recovery,
    mode: 'enabled',
    version: 3,
    appliedDigest: fixture.applied.digest
  },
  inspection: fixture.inspection
}
async function discovery() {
  const request = {
    formatVersion: 1,
    operationId: enabled.recovery.operationId,
    intentDigest: enabled.recovery.intentDigest,
    sourceScope: fixture.source.scope,
    sourceTarget: fixture.source.target,
    freezeDigest: fixture.source.freezeDigest
  }
  return {
    ...enabled,
    purpose: 'recovery-phase',
    command: {
      phase: 'source-execution',
      verb: 'read',
      action: 'discover',
      invocationId: '00000000-0000-4000-8000-000000000901',
      request,
      requestDigest: await collectionDigest(request)
    }
  }
}
type Mutable = {
  claim?: unknown
  recovery: Record<string, unknown>
  inspection: { [key: string]: unknown; pg: Record<string, unknown> }
  command: { [key: string]: unknown; request: { sourceScope: Record<string, unknown> } }
}
describe('private current-applied source discovery contract', () => {
  it('admits exact enabled identity and a distinct read-only source discovery', async () => {
    expect(TransferRecoveryEnabledRequestSchema.parse(enabled)).toEqual(enabled)
    const value = await discovery()
    expect(TransferRecoverySourceDiscoveryRequestSchema.parse(value)).toEqual(value)
  })
  it.each([
    [
      'prepared head',
      (v: Mutable) => {
        v.recovery.mode = 'prepared'
        v.recovery.version = 2
      }
    ],
    [
      'old PG version',
      (v: Mutable) => {
        v.inspection.pg.version = 3
      }
    ],
    [
      'future epoch',
      (v: Mutable) => {
        v.inspection.pg.epoch = 2
      }
    ],
    [
      'claim injection',
      (v: Mutable) => {
        v.claim = {}
      }
    ],
    [
      'unknown authority',
      (v: Mutable) => {
        v.inspection.allow = true
      }
    ],
    [
      'noncanonical deadline',
      (v: Mutable) => {
        v.inspection.pg.deadline = '2026-10-23T01:00:00.123456Z'
      }
    ]
  ])('denies %s', (_name, mutate) => {
    const value = structuredClone(enabled)
    mutate(value as unknown as Mutable)
    expect(TransferRecoveryEnabledRequestSchema.safeParse(value).success).toBe(false)
  })
  it.each([
    [
      'dispatch',
      (v: Mutable) => {
        v.command.verb = 'dispatch'
      }
    ],
    [
      'upload',
      (v: Mutable) => {
        v.command.action = 'upload'
      }
    ],
    [
      'destination',
      (v: Mutable) => {
        v.command.phase = 'destination-execution'
      }
    ],
    [
      'claim',
      (v: Mutable) => {
        v.command.claim = {}
      }
    ],
    [
      'production source',
      (v: Mutable) => {
        v.command.request.sourceScope.environment = 'production'
      }
    ]
  ])('does not expose %s through discovery', async (_name, mutate) => {
    const value = await discovery()
    mutate(value as unknown as Mutable)
    expect(TransferRecoverySourceDiscoveryRequestSchema.safeParse(value).success).toBe(false)
  })
  it('keeps admission and discovery result purposes separate from fresh PG acknowledgment', () => {
    expect(
      TransferRecoveryPhaseAcknowledgmentSchema.safeParse({
        purpose: 'admission-applied',
        envelopeDigest: 'a'.repeat(64)
      }).success
    ).toBe(false)
    expect(
      TransferRecoveryPhaseAcknowledgmentSchema.safeParse({
        purpose: 'recovery-enabled',
        envelopeDigest: 'a'.repeat(64),
        allowed: true
      }).success
    ).toBe(false)
    expect(
      TransferRecoverySourceDiscoveryResultSchema.safeParse({
        purpose: 'recovery-phase',
        envelopeDigest: 'a'.repeat(64)
      }).success
    ).toBe(false)
  })
  it.each([
    ['enabled', '81777865cc75b5be5dd3a7ecf42c2e25cd7f5211ed4a02af318443a0a7bde6cf'],
    ['discovery', '8755dcd5cc9f44e324192925a04c862815afe336799c0e9acd20ffedde09e3ea']
  ])('matches the exact Studio %s canonical fixture', async (kind, digest) => {
    const value = JSON.parse(readFileSync(`test/fixtures/transfer-recovery-phase-${kind}.json`, 'utf8'))
    const schema =
      kind === 'enabled' ? TransferRecoveryEnabledRequestSchema : TransferRecoverySourceDiscoveryRequestSchema
    expect(schema.parse(value)).toEqual(value)
    expect(await collectionDigest(value)).toBe(digest)
  })
})
