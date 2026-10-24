// Structural transport fixture only. Real PG authority and native claim tests prove semantic provenance.
import { readFileSync } from 'node:fs'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
const admission = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission-applied.json', 'utf8'))
const enabled = JSON.parse(readFileSync('test/fixtures/transfer-recovery-phase-enabled.json', 'utf8'))
export async function sourceEffectTransportFixture(verb: 'claim' | 'dispatch' | 'settle' = 'claim') {
  const scope = admission.source.scope,
    target = admission.source.target
  const predecessor = {
    accountId: target.accountId,
    databaseId: target.databaseId,
    scope,
    namespace: 'xeroflow-page-studio-dispatch-staging',
    scriptName: `ps-content-${'5'.repeat(32)}`,
    ownerTag: `ps-owner-${'6'.repeat(32)}`,
    runtimeDigest: target.runtimeDigest,
    compatibilityDate: '2026-08-18',
    setupDigest: '7'.repeat(64)
  }
  const formReceipt = {
    operationId: 'forms_a',
    collectionOperationId: 'collection_a',
    workflowOperationId: 'workflow_a',
    stagingOperationId: 'staging_a',
    scope,
    accountId: target.accountId,
    databaseId: target.databaseId,
    name: target.name,
    sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e',
    targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2'
  }
  const policy = {
    version: 1,
    kind: 'managed-draft-transfer',
    formReceiptDigest: await collectionDigest(formReceipt),
    from: { compatibilityDate: predecessor.compatibilityDate, digest: target.runtimeDigest },
    to: { compatibilityDate: predecessor.compatibilityDate, digest: 'c'.repeat(64) }
  }
  const request = {
    formatVersion: 1,
    operationId: enabled.recovery.operationId,
    intentDigest: enabled.recovery.intentDigest,
    sourceScope: scope,
    sourceTarget: target,
    formReceipt,
    policy,
    predecessor,
    successor: {
      ...predecessor,
      scriptName: `ps-content-${'8'.repeat(32)}`,
      ownerTag: `ps-owner-${'9'.repeat(32)}`,
      runtimeDigest: policy.to.digest
    },
    freeze: {
      createdAt: '2026-10-23T00:00:00.000Z',
      state: 'frozen',
      digest: 'a'.repeat(64),
      request: {
        actor: admission.request.resourceRequest.actor,
        adoptionId: 'adoption_a',
        formatVersion: 1,
        scope,
        target
      }
    }
  }
  const descriptor = {
    formatVersion: 1,
    kind: 'managed-transfer-recovery-source-v1',
    layoutDigest: 'e'.repeat(64),
    execution: {
      version: 1,
      kind: policy.kind,
      accountId: target.accountId,
      namespace: predecessor.namespace,
      from: policy.from,
      to: policy.to
    }
  }
  const identity = {
    phase: 'source-execution',
    action: 'upload',
    invocationId: '00000000-0000-4000-8000-000000000901',
    requestDigest: await collectionDigest(request),
    resourceDigest: 'b'.repeat(64)
  }
  const claim = {
    effectKey: 'd'.repeat(64),
    head: enabled.recovery,
    identity,
    proofDigest: await collectionDigest({ purpose: 'claim', head: enabled.recovery, identity }),
    state: 'dispatching',
    resultDigest: null,
    settlementDigest: null
  }
  return {
    ...enabled,
    purpose: 'recovery-source-effect',
    request,
    requestDigest: identity.requestDigest,
    descriptor,
    descriptorDigest: await collectionDigest(descriptor),
    command: {
      phase: identity.phase,
      action: identity.action,
      invocationId: identity.invocationId,
      resourceDigest: identity.resourceDigest,
      verb,
      ...(verb !== 'claim' ? { claim } : {}),
      ...(verb === 'settle' ? { resultDigest: 'f'.repeat(64), state: 'completed' } : {})
    }
  }
}
