import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { verifyRecoverySourceFreezeLinkage } from '~~/shared/pageStudio/transferRecoverySourceFreeze'

/** Synthetic native boundary for PG orchestration tests, never execution proof. */
export async function plannedFreezeResult(input: unknown) {
  const wire = await verifyRecoverySourceFreezeLinkage(input)
  const identity = { phase: 'source-freeze', action: 'freeze', invocationId: wire.command.invocationId,
    requestDigest: wire.requestDigest, resourceDigest: wire.command.resourceDigest }
  const claim = {
    head: wire.recovery, identity,
    effectKey: await collectionDigest({ operationId: wire.request.operationId, phase: identity.phase,
      action: identity.action, resourceDigest: identity.resourceDigest }),
    proofDigest: await collectionDigest({ purpose: 'claim', head: wire.recovery, identity }),
    resultDigest: null, settlementDigest: null, state: 'dispatching'
  }
  const fence = { identityDigest: await collectionDigest(wire.request.fenceIntent),
    request: wire.request.fenceIntent, state: 'frozen' }
  const receipt = {
    association: wire.association, associationDigest: wire.associationDigest,
    claim, claimDigest: await collectionDigest(claim), descriptorDigest: wire.descriptorDigest,
    fence: { ...fence, digest: await collectionDigest(fence) }, formatVersion: 1,
    kind: 'managed-transfer-recovery-source-freeze-v1', schemaDigest: wire.descriptor.layoutDigest,
    sourceReceiptDigest: wire.sourceReceiptDigest
  }
  const result = { action: 'freeze', receipt: { ...receipt, digest: await collectionDigest(receipt) } }
  const resultDigest = await collectionDigest(result)
  return {
    purpose: 'source-freeze-effect', envelopeDigest: await collectionDigest(wire), result,
    claim: { ...claim, state: 'completed', resultDigest,
      settlementDigest: await collectionDigest({ purpose: 'settle', claim, resultDigest, state: 'completed' }) }
  }
}
