import { describe, expect, it } from 'vitest'
import {
  TransferRecoverySourceFreezeAssociationSchema,
  TransferRecoverySourceFreezeDescriptorSchema,
  TransferRecoverySourceFreezeAcknowledgmentSchema
} from '~~/shared/pageStudio/transferRecoverySourceFreeze'
const id = '00000000-0000-4000-8000-000000000001',
  digest = 'a'.repeat(64)
const association = {
  formatVersion: 1,
  kind: 'managed-transfer-recovery-source-freeze-v1',
  operationId: id,
  intentDigest: digest,
  recoveryId: id,
  epoch: 1,
  admissionId: id,
  appliedDigest: digest,
  enabledHeadDigest: digest,
  requestDigest: digest,
  invocationId: id,
  sourceRequestDigest: digest,
  sourceDescriptorDigest: digest,
  sourceReceiptDigest: digest,
  sourceInstallClaimDigest: digest,
  sourceSelectionIdentity: digest,
  descriptorDigest: digest
}
describe('private source freeze association contract', () => {
  it('requires all exact immutable linkage fields', () => {
    expect(TransferRecoverySourceFreezeAssociationSchema.parse(association)).toEqual(association)
  })
  it.each(Object.keys(association))('rejects missing %s', (field) => {
    const v = Object.fromEntries(Object.entries(association).filter(([key]) => key !== field))
    expect(TransferRecoverySourceFreezeAssociationSchema.safeParse(v).success).toBe(false)
  })
  it.each([
    { ...association, epoch: 2 },
    { ...association, kind: 'managed-transfer-recovery-source-v1' },
    { ...association, invocationId: 'retry' },
    { ...association, unknown: true },
    { ...association, sourceReceiptDigest: null }
  ])('rejects drift/unknown identity %#', (v) => {
    expect(TransferRecoverySourceFreezeAssociationSchema.safeParse(v).success).toBe(false)
  })
  it('keeps descriptor and acknowledgment purpose-specific', () => {
    expect(
      TransferRecoverySourceFreezeDescriptorSchema.parse({
        formatVersion: 1,
        kind: association.kind,
        layoutDigest: digest
      })
    ).toBeDefined()
    expect(
      TransferRecoverySourceFreezeDescriptorSchema.safeParse({
        formatVersion: 1,
        kind: 'managed-transfer-recovery-source-v1',
        layoutDigest: digest
      }).success
    ).toBe(false)
    expect(
      TransferRecoverySourceFreezeAcknowledgmentSchema.parse({
        purpose: 'recovery-source-freeze',
        envelopeDigest: digest
      })
    ).toBeDefined()
    expect(
      TransferRecoverySourceFreezeAcknowledgmentSchema.safeParse({
        purpose: 'recovery-source-effect',
        envelopeDigest: digest
      }).success
    ).toBe(false)
  })
})
