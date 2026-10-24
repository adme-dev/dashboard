import { z } from 'zod'
import { collectionCanonical, collectionDigest } from './collectionApi'
import { ManagedTransferSourceDraftsFenceReceiptSchema } from './managed-transfer-source-drafts'
import { TransferRecoveryFreezeDispatchingClaimSchema, TransferRecoverySourceFreezeAssociationSchema,
  verifyRecoverySourceFreezeLinkage } from './transferRecoverySourceFreeze'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Completed = TransferRecoveryFreezeDispatchingClaimSchema.extend({
  state: z.literal('completed'), resultDigest: Digest, settlementDigest: Digest
}).strict()
export const TransferRecoverySourceFreezePhysicalProofSchema = z.object({
  association: TransferRecoverySourceFreezeAssociationSchema,
  associationDigest: Digest,
  claim: TransferRecoveryFreezeDispatchingClaimSchema,
  claimDigest: Digest,
  descriptorDigest: Digest,
  fence: ManagedTransferSourceDraftsFenceReceiptSchema,
  formatVersion: z.literal(1),
  kind: z.literal('managed-transfer-recovery-source-freeze-v1'),
  schemaDigest: Digest,
  sourceReceiptDigest: Digest,
  digest: Digest
}).strict()
export const TransferRecoverySourceFreezeEffectResultSchema = z.object({
  purpose: z.literal('source-freeze-effect'), envelopeDigest: Digest, claim: Completed,
  result: z.object({ action: z.literal('freeze'), receipt: TransferRecoverySourceFreezePhysicalProofSchema }).strict()
}).strict()

/** Pure receipt linkage, not proof of current authority or physical execution.
 * The fixed native executor must independently acquire and verify the effect.
 * Only an initial claim request can receive this completed execution result;
 * dispatch/inspect/settle callbacks return their distinct authority acknowledgment.
 */
export async function verifyRecoverySourceFreezeResult(input: unknown, observed: unknown) {
  const wire = await verifyRecoverySourceFreezeLinkage(input)
  const result = TransferRecoverySourceFreezeEffectResultSchema.parse(structuredClone(observed))
  const denied = () => new Error('Recovery source freeze result identity changed')
  if (wire.command.verb !== 'claim') throw denied()
  const identity = { phase: 'source-freeze', action: 'freeze', invocationId: wire.command.invocationId,
    requestDigest: wire.requestDigest, resourceDigest: wire.command.resourceDigest }
  const claim = {
    effectKey: await collectionDigest({ operationId: wire.request.operationId, phase: identity.phase,
      action: identity.action, resourceDigest: identity.resourceDigest }),
    head: wire.recovery, identity,
    proofDigest: await collectionDigest({ purpose: 'claim', head: wire.recovery, identity }),
    resultDigest: null, settlementDigest: null, state: 'dispatching'
  }
  const fenceBody = { identityDigest: await collectionDigest(wire.request.fenceIntent),
    request: wire.request.fenceIntent, state: 'frozen' }
  const body = {
    association: wire.association, associationDigest: wire.associationDigest,
    claim, claimDigest: await collectionDigest(claim), descriptorDigest: wire.descriptorDigest,
    fence: { ...fenceBody, digest: await collectionDigest(fenceBody) },
    formatVersion: 1, kind: 'managed-transfer-recovery-source-freeze-v1',
    schemaDigest: wire.descriptor.layoutDigest, sourceReceiptDigest: wire.sourceReceiptDigest
  }
  const expectedResult = { action: 'freeze', receipt: { ...body, digest: await collectionDigest(body) } }
  const resultDigest = await collectionDigest(expectedResult)
  const expected = {
    purpose: 'source-freeze-effect', envelopeDigest: await collectionDigest(wire), result: expectedResult,
    claim: { ...claim, state: 'completed', resultDigest,
      settlementDigest: await collectionDigest({ purpose: 'settle', claim, resultDigest, state: 'completed' }) }
  }
  if (collectionCanonical(result) !== collectionCanonical(expected)) throw denied()
  return result
}
