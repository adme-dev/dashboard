import { z } from 'zod'
import { collectionDigest, collectionCanonical } from './collectionApi'
import { contentScopeKey } from './cmsManaged'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'
import { TransferRecoverySourceInputSchema } from './transferRecoveryPhase'
import {
  TransferRecoverySourceEffectRequestSchema,
  TransferRecoverySourceDispatchingClaimSchema
} from './transferRecoverySourceEffect'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Action = z.enum(['upload', 'install'])
export const TransferRecoverySourceEffectControlInputSchema = TransferRecoverySourceInputSchema.extend({
  body: TransferRecoverySourceInputSchema.shape.body.extend({ action: Action }).strict()
}).strict()
export const TransferRecoverySourceEffectClaimRequestSchema =
  TransferRecoverySourceEffectRequestSchema.extend({
    command: TransferRecoverySourceDispatchingClaimSchema.shape.identity
      .omit({ requestDigest: true })
      .extend({ verb: z.literal('claim') })
      .strict()
  }).strict()
const SchemaReceipt = z
  .object({
    formatVersion: z.literal(1),
    nativeIntentDigest: Digest,
    operationId: z.string().regex(/^transfer_[a-f0-9-]{36}$/),
    predecessor: FormDraftsUpgradeReceiptSchema,
    associationDigest: Digest,
    claimDigest: Digest,
    descriptorDigest: Digest,
    kind: z.literal('managed-transfer-recovery-source-v1'),
    schemaDigest: Digest,
    digest: Digest
  })
  .strict()
export const TransferRecoverySourceEffectResultSchema = z
  .object({
    purpose: z.literal('source-execution-effect'),
    envelopeDigest: Digest,
    claim: TransferRecoverySourceDispatchingClaimSchema.extend({
      state: z.literal('completed'),
      resultDigest: Digest,
      settlementDigest: Digest
    }).strict(),
    result: z.discriminatedUnion('action', [
      z
        .object({
          action: z.literal('upload'),
          receipt: z.object({ etag: z.string().min(1).max(200) }).strict()
        })
        .strict(),
      z.object({ action: z.literal('install'), receipt: SchemaReceipt }).strict()
    ])
  })
  .strict()
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const denied = () => new Error('Recovery source effect result identity changed')
/** Fixed resource identity only. Does not establish current authority. */
export async function recoverySourceEffectResourceDigest(input: unknown, action: 'upload' | 'install') {
  const request = TransferRecoverySourceEffectRequestSchema.shape.request.parse(input)
  return collectionDigest(
    action === 'upload'
      ? {
          kind: 'dispatch-worker',
          accountId: request.successor.accountId,
          namespace: request.successor.namespace,
          scriptName: request.successor.scriptName
        }
      : {
          kind: 'source-transfer-schema',
          accountId: request.sourceTarget.accountId,
          databaseId: request.sourceTarget.databaseId,
          scopeKey: contentScopeKey(request.sourceScope),
          operationId: `transfer_${request.operationId}`
        }
  )
}
/** Receipt linkage only. Actual acquisition/provider/physical proof must be made
 * by the fixed native adapter; an etag is not independent provider verification. */
export async function verifyRecoverySourceEffectResult(input: unknown, resultInput: unknown) {
  const wire = TransferRecoverySourceEffectClaimRequestSchema.parse(input),
    result = TransferRecoverySourceEffectResultSchema.parse(resultInput)
  const requestDigest = await collectionDigest(wire.request),
    descriptorDigest = await collectionDigest(wire.descriptor),
    resourceDigest = await recoverySourceEffectResourceDigest(wire.request, wire.command.action)
  const { accountId, namespace, ...policy } = wire.descriptor.execution
  if (
    wire.requestDigest !== requestDigest ||
    wire.descriptorDigest !== descriptorDigest ||
    wire.command.resourceDigest !== resourceDigest ||
    wire.request.operationId !== wire.recovery.operationId ||
    wire.request.intentDigest !== wire.recovery.intentDigest ||
    accountId !== wire.request.successor.accountId ||
    namespace !== wire.request.successor.namespace ||
    !same(
      { ...policy, formReceiptDigest: await collectionDigest(wire.request.formReceipt) },
      wire.request.policy
    ) ||
    result.result.action !== wire.command.action ||
    result.envelopeDigest !== (await collectionDigest(wire))
  )
    throw denied()
  const identity = {
      phase: 'source-execution',
      action: wire.command.action,
      invocationId: wire.command.invocationId,
      requestDigest,
      resourceDigest
    },
    claim = {
      effectKey: await collectionDigest({
        operationId: wire.request.operationId,
        phase: identity.phase,
        action: identity.action,
        resourceDigest
      }),
      head: wire.recovery,
      identity,
      proofDigest: await collectionDigest({ purpose: 'claim', head: wire.recovery, identity }),
      resultDigest: null,
      settlementDigest: null,
      state: 'dispatching'
    },
    resultDigest = await collectionDigest(result.result),
    settlementDigest = await collectionDigest({ purpose: 'settle', claim, resultDigest, state: 'completed' })
  if (!same(result.claim, { ...claim, state: 'completed', resultDigest, settlementDigest })) throw denied()
  if (result.result.action === 'install') {
    const claimDigest = await collectionDigest(claim),
      association = {
        accountId,
        claimDigest,
        databaseId: wire.request.formReceipt.databaseId,
        descriptorDigest,
        head: wire.recovery,
        layoutDigest: wire.descriptor.layoutDigest,
        requestDigest,
        scope: wire.request.sourceScope
      },
      body = {
        formatVersion: 1,
        nativeIntentDigest: wire.request.intentDigest,
        operationId: `transfer_${wire.request.operationId}`,
        predecessor: wire.request.formReceipt,
        associationDigest: await collectionDigest(association),
        claimDigest,
        descriptorDigest,
        kind: 'managed-transfer-recovery-source-v1',
        schemaDigest: wire.descriptor.layoutDigest
      }
    if (!same(result.result.receipt, { ...body, digest: await collectionDigest(body) })) throw denied()
  }
  return result
}
