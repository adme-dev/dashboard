import { readFileSync } from 'node:fs'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { recoveryAdmissionHeads } from '~~/server/utils/pageStudio/customerTransferRecoveryAdmissionAuthority'
import { describe, expect, it } from 'vitest'
import {
  TransferRecoveryPendingGrantBodySchema,
  TransferRecoveryAppliedGrantBodySchema,
  TransferRecoveryAdmissionAcknowledgmentSchema,
  canonicalRecoveryAdmissionDeadline,
  TransferRecoveryAdmissionRequestSchema,
  recoveryAdmissionPhysicalEvidence
} from '~~/shared/pageStudio/transferRecoveryAdmission'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pending = {
  formatVersion: 1,
  operationId: id(1),
  intentDigest: 'a'.repeat(64),
  recoveryId: id(2),
  epoch: 1,
  admissionId: id(3),
  reviewId: id(4),
  revision: 2,
  reviewDigest: 'b'.repeat(64),
  reconciliationDigest: 'c'.repeat(64),
  pgVersion: 3,
  deadline: '2026-10-23T12:00:00.123Z',
  prepareEventId: id(5),
  enableEventId: id(6)
}
describe('exact recovery admission contracts', () => {
  it('keeps pending PG version distinct from review revision and D1 versions', () => {
    expect(TransferRecoveryPendingGrantBodySchema.parse(pending)).toEqual(pending)
    for (const pgVersion of [1, 2, 4])
      expect(TransferRecoveryPendingGrantBodySchema.safeParse({ ...pending, pgVersion }).success).toBe(false)
  })
  it.each(Object.keys(pending))('requires pending field %s', (field) => {
    const value = { ...pending }
    Reflect.deleteProperty(value, field)
    expect(TransferRecoveryPendingGrantBodySchema.safeParse(value).success).toBe(false)
  })
  it('rejects ambiguous event identities and unsupported epochs', () => {
    for (const value of [
      { ...pending, enableEventId: pending.prepareEventId },
      { ...pending, prepareEventId: pending.recoveryId },
      { ...pending, epoch: 2 }
    ])
      expect(TransferRecoveryPendingGrantBodySchema.safeParse(value).success).toBe(false)
  })
  it('requires independently bound pending and prepared digests on applied grants', () => {
    const { prepareEventId: _prepare, enableEventId: _enable, ...identity } = pending
    const applied = { ...identity, pgVersion: 4, pendingDigest: 'd'.repeat(64), preparedDigest: 'e'.repeat(64) }
    expect(TransferRecoveryAppliedGrantBodySchema.parse(applied)).toEqual(applied)
    expect(TransferRecoveryAppliedGrantBodySchema.safeParse({ ...applied, pgVersion: 3 }).success).toBe(false)
    expect(TransferRecoveryAppliedGrantBodySchema.safeParse({ ...applied, preparedDigest: undefined }).success).toBe(
      false
    )
    expect(TransferRecoveryAppliedGrantBodySchema.safeParse({ ...applied, canExecute: true }).success).toBe(false)
  })
  it('accepts only purpose-bound admission acknowledgments', () => {
    for (const purpose of ['admission-pending', 'admission-applied'])
      expect(
        TransferRecoveryAdmissionAcknowledgmentSchema.safeParse({ purpose, envelopeDigest: 'a'.repeat(64) }).success
      ).toBe(true)
    for (const purpose of ['observe', 'inventory', 'prepare', 'enable'])
      expect(
        TransferRecoveryAdmissionAcknowledgmentSchema.safeParse({ purpose, envelopeDigest: 'a'.repeat(64) }).success
      ).toBe(false)
  })
  it('converts only exactly millisecond PG instants without silently truncating', () => {
    expect(canonicalRecoveryAdmissionDeadline('2026-10-23T12:00:00.123000Z')).toBe(pending.deadline)
    for (const text of [
      '2026-10-23T12:00:00.123001Z',
      '2026-10-23T12:00:00.123999Z',
      '2026-10-23T12:00:00Z',
      '2026-10-23T12:00:00.123000+00:00'
    ])
      expect(() => canonicalRecoveryAdmissionDeadline(text)).toThrow()
    expect(
      TransferRecoveryPendingGrantBodySchema.safeParse({ ...pending, deadline: '2026-10-23T12:00:00.123001Z' }).success
    ).toBe(false)
  })
  it('matches exact Studio pending/applied canonical wire and deterministic head/event digests', async () => {
    const pendingWire = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission.json', 'utf8'))
    const appliedWire = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission-applied.json', 'utf8'))
    expect(TransferRecoveryAdmissionRequestSchema.parse(pendingWire)).toEqual(pendingWire)
    expect(TransferRecoveryAdmissionRequestSchema.parse(appliedWire)).toEqual(appliedWire)
    expect(await collectionDigest(pendingWire)).toBe('cb9a09c701a39778be1213265bb6f1ffc829587235dc08fb4286fd9fa899c760')
    expect(await collectionDigest(appliedWire)).toBe('0324f5eafed4411168164aae4274c2e4ea0f20fa6118574723757ea3492d6c21')
    const derived = await recoveryAdmissionHeads(pendingWire.pending, appliedWire.applied)
    expect(derived.closed).toEqual(pendingWire.recovery)
    expect(derived.prepared).toEqual(appliedWire.recovery)
    expect(derived.prepared.preparedDigest).toBe(await collectionDigest(derived.prepare))
    expect(derived.enabled?.appliedDigest).toBe(appliedWire.applied.digest)
  })
  it('projects only named physical fields and recovery identity, never relabeling actual observations', () => {
    const wire = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission.json', 'utf8'))
    const original = structuredClone(wire.approvedObservation),
      changed = structuredClone(original)
    changed.envelopeDigest = 'b'.repeat(64)
    changed.recovery.mode = 'prepared'
    changed.recovery.version = 2
    expect(recoveryAdmissionPhysicalEvidence(changed)).toEqual(recoveryAdmissionPhysicalEvidence(original))
    expect(original).toEqual(wire.approvedObservation)
    changed.recovery.recoveryId = id(99)
    expect(recoveryAdmissionPhysicalEvidence(changed)).not.toEqual(recoveryAdmissionPhysicalEvidence(original))
    changed.recovery = original.recovery
    changed.source.historyDigest = 'b'.repeat(64)
    expect(recoveryAdmissionPhysicalEvidence(changed)).not.toEqual(recoveryAdmissionPhysicalEvidence(original))
    expect(() => recoveryAdmissionPhysicalEvidence({ ...original, later: undefined })).toThrow()
    expect(() => recoveryAdmissionPhysicalEvidence({ ...original, unreviewed: true })).toThrow()
  })
})
