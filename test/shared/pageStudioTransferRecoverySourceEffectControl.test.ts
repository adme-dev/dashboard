import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoverySourceEffectControlInputSchema,
  verifyRecoverySourceEffectResult
} from '~~/shared/pageStudio/transferRecoverySourceEffectControl'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'

const admission = JSON.parse(readFileSync('test/fixtures/transfer-recovery-admission-applied.json', 'utf8'))
const enabled = JSON.parse(readFileSync('test/fixtures/transfer-recovery-phase-enabled.json', 'utf8'))
async function fixture(verb: 'claim' | 'dispatch' | 'settle' = 'claim') {
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
    resourceDigest: await collectionDigest({
      kind: 'dispatch-worker',
      accountId: request.successor.accountId,
      namespace: request.successor.namespace,
      scriptName: request.successor.scriptName
    })
  }
  const claim = {
    effectKey: await collectionDigest({
      operationId: request.operationId,
      phase: identity.phase,
      action: identity.action,
      resourceDigest: identity.resourceDigest
    }),
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
async function completed(action: 'upload' | 'install') {
  const wire = await fixture('dispatch')
  wire.command.action = action
  wire.command.claim!.identity.action = action
  if (action === 'install')
    wire.command.resourceDigest = await collectionDigest({
      kind: 'source-transfer-schema',
      accountId: wire.request.sourceTarget.accountId,
      databaseId: wire.request.sourceTarget.databaseId,
      scopeKey: contentScopeKey(wire.request.sourceScope),
      operationId: `transfer_${wire.request.operationId}`
    })
  const identity = { ...wire.command.claim!.identity, resourceDigest: wire.command.resourceDigest }
  const claim = {
    ...wire.command.claim!,
    identity,
    effectKey: await collectionDigest({
      operationId: wire.request.operationId,
      phase: identity.phase,
      action,
      resourceDigest: identity.resourceDigest
    }),
    proofDigest: await collectionDigest({ purpose: 'claim', head: wire.recovery, identity })
  }
  const claimDigest = await collectionDigest(claim)
  const body = {
    formatVersion: 1,
    nativeIntentDigest: wire.request.intentDigest,
    operationId: `transfer_${wire.request.operationId}`,
    predecessor: wire.request.formReceipt,
    associationDigest: await collectionDigest({
      accountId: wire.request.formReceipt.accountId,
      claimDigest,
      databaseId: wire.request.formReceipt.databaseId,
      descriptorDigest: wire.descriptorDigest,
      head: wire.recovery,
      layoutDigest: wire.descriptor.layoutDigest,
      requestDigest: wire.requestDigest,
      scope: wire.request.sourceScope
    }),
    claimDigest,
    descriptorDigest: wire.descriptorDigest,
    kind: 'managed-transfer-recovery-source-v1',
    schemaDigest: wire.descriptor.layoutDigest
  }
  const result =
    action === 'upload'
      ? { action, receipt: { etag: 'actual-test-etag' } }
      : { action, receipt: { ...body, digest: await collectionDigest(body) } }
  wire.command.verb = 'claim'
  delete wire.command.claim
  const resultDigest = await collectionDigest(result)
  return {
    wire,
    response: {
      purpose: 'source-execution-effect',
      envelopeDigest: await collectionDigest(wire),
      result,
      claim: {
        ...claim,
        state: 'completed',
        resultDigest,
        settlementDigest: await collectionDigest({
          purpose: 'settle',
          claim,
          resultDigest,
          state: 'completed'
        })
      }
    }
  }
}
describe('private source effect coordinator result', () => {
  it.each(['upload', 'install'] as const)(
    'verifies exact %s receipt and both storage digests',
    async (action) => {
      const f = await completed(action)
      expect(await verifyRecoverySourceEffectResult(f.wire, f.response)).toEqual(f.response)
    }
  )
  it.each(['envelope', 'claim', 'settlement', 'result', 'inner', 'association', 'action'] as const)(
    'rejects changed %s binding',
    async (kind) => {
      const f = await completed('install')
      if (kind === 'envelope') f.response.envelopeDigest = 'a'.repeat(64)
      if (kind === 'claim') f.response.claim.proofDigest = 'a'.repeat(64)
      if (kind === 'settlement') f.response.claim.settlementDigest = 'a'.repeat(64)
      if (kind === 'result') f.response.claim.resultDigest = 'a'.repeat(64)
      if (kind === 'inner')
        Object.assign(f.response.result.receipt, { digest: f.response.claim.resultDigest })
      if (kind === 'association')
        Object.assign(f.response.result.receipt, { associationDigest: 'a'.repeat(64) })
      if (kind === 'action') f.response.result.action = 'upload'
      await expect(verifyRecoverySourceEffectResult(f.wire, f.response)).rejects.toThrow()
    }
  )
  it('rejects caller-supplied claims, grants and effect selectors in the private control input', () => {
    const value = {
      siteId: '00000000-0000-4000-8000-000000000001',
      requestId: '00000000-0000-4000-8000-000000000002',
      expectedRevision: 5,
      operator: { actorId: '00000000-0000-4000-8000-000000000003', loginSessionHash: 'a'.repeat(64) },
      body: {
        admissionId: '00000000-0000-4000-8000-000000000004',
        invocationId: '00000000-0000-4000-8000-000000000005',
        action: 'upload'
      }
    }
    expect(TransferRecoverySourceEffectControlInputSchema.parse(value)).toEqual(value)
    for (const body of [
      { ...value.body, claim: {} },
      { ...value.body, descriptor: {} },
      { ...value.body, action: 'freeze' },
      { ...value.body, request: {} }
    ])
      expect(TransferRecoverySourceEffectControlInputSchema.safeParse({ ...value, body }).success).toBe(false)
  })
  it('does not accept an uncertain claim or dispatch input as completed evidence', async () => {
    const f = await completed('upload')
    await expect(
      verifyRecoverySourceEffectResult(f.wire, {
        ...f.response,
        claim: { ...f.response.claim, state: 'dispatching' }
      })
    ).rejects.toThrow()
    await expect(
      verifyRecoverySourceEffectResult(
        { ...f.wire, command: { ...f.wire.command, verb: 'dispatch', claim: f.response.claim } },
        f.response
      )
    ).rejects.toThrow()
  })
})
