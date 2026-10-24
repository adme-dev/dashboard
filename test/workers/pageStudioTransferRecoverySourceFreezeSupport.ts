// Synthetic authority/provider fixture, actual local completed claims and Workerd D1.
// Structural/provenance transport input only; never a hosted authorization receipt.
import { readFileSync } from 'node:fs'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { recoverySourceFreezeAssociation, recoverySourceFreezeResourceDigest, verifyRecoverySourceReady,
  verifyRecoverySourceFreezeLinkage } from '../../shared/pageStudio/transferRecoverySourceFreeze'

export async function sourceFreezeTransportFixture(verb: 'claim' | 'dispatch' | 'inspect' | 'settle' = 'claim') {
  const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-source-ready-native.json', 'utf8'))
  const ready = fixture.request
  const observed = await verifyRecoverySourceReady(ready, fixture.result)
  const { pending, applied, recovery, inspection } = ready
  const source = observed.selection.execution.recovery
  const sourceSelectionIdentity = observed.selection.execution.identity
  const request = { formatVersion: 1, operationId: ready.request.operationId, intentDigest: ready.request.intentDigest,
    executionIdentity: sourceSelectionIdentity, fenceIntent: { formatVersion: 1,
      nativeIntentDigest: ready.request.intentDigest, scope: ready.request.sourceScope,
      target: ready.request.sourceTarget, transferId: ready.request.operationId } }
  const descriptor = ready.freezeDescriptor
  const invocationId = '00000000-0000-4000-8000-000000000902'
  const association = await recoverySourceFreezeAssociation({ enabled: { purpose: 'recovery-enabled', pending, applied, recovery, inspection },
    request, source, sourceReceiptDigest: observed.install.receipt.digest, sourceSelectionIdentity, descriptor, invocationId })
  const resourceDigest = await recoverySourceFreezeResourceDigest(request)
  const requestDigest = await collectionDigest(request)
  const identity = { phase: 'source-freeze', action: 'freeze', invocationId, resourceDigest, requestDigest }
  const claim = { effectKey: await collectionDigest({ operationId: request.operationId, phase: identity.phase, action: identity.action, resourceDigest }),
    head: recovery, identity, proofDigest: await collectionDigest({ purpose: 'claim', head: recovery, identity }),
    state: 'dispatching', resultDigest: null, settlementDigest: null }
  return verifyRecoverySourceFreezeLinkage({ pending, applied, recovery, inspection, purpose: 'recovery-source-freeze',
    request, requestDigest, source, sourceReceiptDigest: observed.install.receipt.digest, sourceSelectionIdentity,
    descriptor, descriptorDigest: await collectionDigest(descriptor), association, associationDigest: await collectionDigest(association),
    command: { phase: 'source-freeze', action: 'freeze', invocationId, resourceDigest, verb,
      ...(verb !== 'claim' ? { claim } : {}), ...(verb === 'settle' ? { state: 'completed', resultDigest: 'e'.repeat(64) } : {}) } })
}
