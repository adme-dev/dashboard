import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoverySourceEffectRequestSchema,
  TransferRecoverySourceEffectAcknowledgmentSchema
} from '~~/shared/pageStudio/transferRecoverySourceEffect'
import { TransferRecoveryPhaseRequestSchema } from '~~/shared/pageStudio/transferRecoveryPhase'

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
describe('strict private source effect PG proof contract', () => {
  it.each(['claim', 'dispatch', 'settle'] as const)(
    'parses %s separately from read-only authority',
    async (verb) => {
      const value = await fixture(verb)
      expect(TransferRecoverySourceEffectRequestSchema.parse(value)).toEqual(value)
      expect(TransferRecoveryPhaseRequestSchema.safeParse(value).success).toBe(false)
    }
  )
  it.each([
    ['unknown verb', ['command', 'verb'], 'retry'],
    ['later phase', ['command', 'phase'], 'destination-execution'],
    ['unknown action', ['command', 'action'], 'freeze'],
    ['caller permission', ['command', 'allowed'], true],
    ['future descriptor', ['descriptor', 'formatVersion'], 2],
    ['unknown descriptor field', ['descriptor', 'override'], true],
    ['terminal claim', ['command', 'claim', 'state'], 'completed'],
    ['completed result in dispatch claim', ['command', 'claim', 'resultDigest'], 'f'.repeat(64)],
    ['claim settlement', ['command', 'claim', 'settlementDigest'], 'f'.repeat(64)],
    ['foreign claim phase', ['command', 'claim', 'identity', 'phase'], 'destination-execution'],
    ['prepared current head', ['recovery', 'mode'], 'prepared'],
    ['old PG version', ['inspection', 'pg', 'version'], 3]
  ])('rejects %s', async (_name, path, replacement) => {
    const value = await fixture('dispatch')
    let object: Record<string, unknown> = value
    const keys = path as string[]
    for (const key of keys.slice(0, -1)) object = object[key] as Record<string, unknown>
    object[keys.at(-1)!] = replacement
    expect(TransferRecoverySourceEffectRequestSchema.safeParse(value).success).toBe(false)
  })
  it('requires the complete descriptor, request and claim rather than an opaque digest', async () => {
    for (const key of ['request', 'descriptor', 'descriptorDigest']) {
      const value = Object.fromEntries(
        Object.entries(await fixture('dispatch')).filter(([name]) => name !== key)
      )
      expect(TransferRecoverySourceEffectRequestSchema.safeParse(value).success).toBe(false)
    }
    const value = await fixture('dispatch')
    delete value.command.claim
    expect(TransferRecoverySourceEffectRequestSchema.safeParse(value).success).toBe(false)
  })
  it('keeps the acknowledgment purpose-bound without an effect or acquisition claim', () => {
    const value = { purpose: 'recovery-source-effect', envelopeDigest: 'a'.repeat(64) }
    expect(TransferRecoverySourceEffectAcknowledgmentSchema.parse(value)).toEqual(value)
    expect(
      TransferRecoverySourceEffectAcknowledgmentSchema.safeParse({ ...value, acquired: true }).success
    ).toBe(false)
    expect(
      TransferRecoverySourceEffectAcknowledgmentSchema.safeParse({ ...value, purpose: 'recovery-phase' })
        .success
    ).toBe(false)
  })
})
