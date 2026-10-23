import { z } from 'zod'
import { collectionCanonical, collectionDigest } from './collectionApi'
import { contentScopeKey, CmsFreezeReceiptSchema } from './cmsManaged'
import {
  CustomerAdoptionStorageProofSchema,
  verifyCustomerAdoptionStorageProof
} from './customerAdoptionGrant'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'
import {
  DispatchWorkerIntentSchema,
  ManagedTransferExecutionRequestSchema
} from './managed-transfer-execution'
import { ManagedTransferSourceDraftsRequestSchema } from './managed-transfer-source-drafts'
import { TransferRecoveryEnabledRequestSchema } from './transferRecoveryPhase'
import {
  TransferRecoverySourceDescriptorSchema,
  TransferRecoverySourceDispatchingClaimSchema
} from './transferRecoverySourceEffect'
import {
  TransferRecoverySourceEffectResultSchema,
  verifyRecoverySourceEffectResult
} from './transferRecoverySourceEffectControl'

const Digest = z.string().regex(/^[a-f0-9]{64}$/),
  Id = z.uuid()
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const denied = () => new Error('Recovery source freeze provenance mismatch')
const Route = CustomerAdoptionStorageProofSchema.shape.selection
const InstallClaim = TransferRecoverySourceDispatchingClaimSchema.extend({
  identity: TransferRecoverySourceDispatchingClaimSchema.shape.identity
    .extend({ action: z.literal('install') })
    .strict()
}).strict()
export const TransferRecoverySourceBootstrapSchema = z
  .object({
    claim: InstallClaim,
    descriptor: TransferRecoverySourceDescriptorSchema,
    predecessors: Route.shape.receipts.extend({ forms: FormDraftsUpgradeReceiptSchema }).strict(),
    request: ManagedTransferExecutionRequestSchema
  })
  .strict()
const SchemaReceipt = TransferRecoverySourceEffectResultSchema.shape.result.options[1].shape.receipt
export const TransferRecoverySourceSelectionSchema = z
  .object({
    kind: z.literal('managed-recovery-execution'),
    route: Route,
    execution: z
      .object({
        formatVersion: z.literal(1),
        freeze: CmsFreezeReceiptSchema,
        identity: Digest,
        originalRouteDigest: Digest,
        owner: DispatchWorkerIntentSchema,
        predecessor: DispatchWorkerIntentSchema,
        policy: ManagedTransferExecutionRequestSchema.shape.policy,
        schemaReceipt: SchemaReceipt,
        workerReceipt: z.object({ etag: z.string().min(1).max(200) }).strict(),
        recovery: TransferRecoverySourceBootstrapSchema
      })
      .strict()
  })
  .strict()
export const TransferRecoverySourceFreezeDescriptorSchema = z
  .object({
    formatVersion: z.literal(1),
    kind: z.literal('managed-transfer-recovery-source-freeze-v1'),
    layoutDigest: Digest
  })
  .strict()
export const TransferRecoverySourceFreezeAssociationSchema = z
  .object({
    formatVersion: z.literal(1),
    kind: z.literal('managed-transfer-recovery-source-freeze-v1'),
    operationId: Id,
    intentDigest: Digest,
    recoveryId: Id,
    epoch: z.literal(1),
    admissionId: Id,
    appliedDigest: Digest,
    enabledHeadDigest: Digest,
    requestDigest: Digest,
    invocationId: Id,
    sourceRequestDigest: Digest,
    sourceDescriptorDigest: Digest,
    sourceReceiptDigest: Digest,
    sourceInstallClaimDigest: Digest,
    sourceSelectionIdentity: Digest,
    descriptorDigest: Digest
  })
  .strict()
const Common = TransferRecoveryEnabledRequestSchema.omit({ purpose: true })
export const TransferRecoverySourceReadyRequestSchema = Common.extend({
  purpose: z.literal('recovery-source-freeze-ready'),
  request: ManagedTransferExecutionRequestSchema,
  requestDigest: Digest,
  descriptor: TransferRecoverySourceDescriptorSchema,
  descriptorDigest: Digest,
  freezeDescriptor: TransferRecoverySourceFreezeDescriptorSchema
}).strict()
export const TransferRecoverySourceReadyAcknowledgmentSchema = z
  .object({ purpose: z.literal('recovery-source-freeze-ready'), envelopeDigest: Digest })
  .strict()
const Completed = TransferRecoverySourceEffectResultSchema.shape.claim
export const TransferRecoverySourceReadyResultSchema = z
  .object({
    purpose: z.literal('recovery-source-freeze-ready'),
    envelopeDigest: Digest,
    selection: TransferRecoverySourceSelectionSchema,
    upload: z
      .object({
        claim: Completed,
        receipt: TransferRecoverySourceSelectionSchema.shape.execution.shape.workerReceipt
      })
      .strict(),
    install: z.object({ claim: Completed, receipt: SchemaReceipt }).strict()
  })
  .strict()
const Identity = z
  .object({
    phase: z.literal('source-freeze'),
    action: z.literal('freeze'),
    invocationId: Id,
    requestDigest: Digest,
    resourceDigest: Digest
  })
  .strict()
export const TransferRecoveryFreezeDispatchingClaimSchema =
  TransferRecoverySourceDispatchingClaimSchema.extend({ identity: Identity }).strict()
const CompletedFreeze = TransferRecoveryFreezeDispatchingClaimSchema.extend({
  state: z.literal('completed'),
  resultDigest: Digest,
  settlementDigest: Digest
}).strict()
const Command = Identity.omit({ requestDigest: true })
export const TransferRecoverySourceFreezeRequestSchema = Common.extend({
  purpose: z.literal('recovery-source-freeze'),
  request: ManagedTransferSourceDraftsRequestSchema,
  requestDigest: Digest,
  source: TransferRecoverySourceBootstrapSchema,
  sourceReceiptDigest: Digest,
  sourceSelectionIdentity: Digest,
  descriptor: TransferRecoverySourceFreezeDescriptorSchema,
  descriptorDigest: Digest,
  association: TransferRecoverySourceFreezeAssociationSchema,
  associationDigest: Digest,
  command: z.discriminatedUnion('verb', [
    Command.extend({ verb: z.literal('claim') }).strict(),
    Command.extend({
      verb: z.literal('dispatch'),
      claim: TransferRecoveryFreezeDispatchingClaimSchema
    }).strict(),
    Command.extend({
      verb: z.literal('inspect'),
      claim: z.union([TransferRecoveryFreezeDispatchingClaimSchema, CompletedFreeze])
    }).strict(),
    Command.extend({
      verb: z.literal('settle'),
      claim: TransferRecoveryFreezeDispatchingClaimSchema,
      state: z.literal('completed'),
      resultDigest: Digest
    }).strict()
  ])
}).strict()
export const TransferRecoverySourceFreezeAcknowledgmentSchema = z
  .object({ purpose: z.literal('recovery-source-freeze'), envelopeDigest: Digest })
  .strict()

/** Pure linkage validation, never authentication of local claims or physical state.
 * The required trusted reader independently reads those actual states. */
export async function verifyRecoverySourceReady(input: unknown, observed: unknown) {
  const wire = TransferRecoverySourceReadyRequestSchema.parse(structuredClone(input)),
    result = TransferRecoverySourceReadyResultSchema.parse(structuredClone(observed))
  const { selection } = result,
    { execution, route } = selection,
    source = execution.recovery
  if (
    result.envelopeDigest !== (await collectionDigest(wire)) ||
    wire.requestDigest !== (await collectionDigest(wire.request)) ||
    wire.descriptorDigest !== (await collectionDigest(wire.descriptor)) ||
    !same(source.request, wire.request) ||
    !same(source.descriptor, wire.descriptor) ||
    !same(source.claim.head, wire.recovery) ||
    !same(source.predecessors, { ...route.receipts, forms: route.formDrafts.receipt }) ||
    !same(wire.request.formReceipt, route.formDrafts.receipt) ||
    wire.request.policy.formReceiptDigest !== route.formDrafts.digest ||
    !same(route.scope, wire.request.sourceScope) ||
    !same(route.target, wire.request.sourceTarget) ||
    !same(execution.owner, wire.request.successor) ||
    !same(execution.predecessor, wire.request.predecessor) ||
    !same(execution.policy, wire.request.policy) ||
    !same(execution.freeze, wire.request.freeze) ||
    !same(result.upload.receipt, execution.workerReceipt) ||
    !same(result.install.receipt, execution.schemaReceipt)
  )
    throw denied()
  await verifyCustomerAdoptionStorageProof({
    kind: 'existing-native-adoption-source',
    version: 1,
    selection: route,
    selectionDigest: await collectionDigest(route)
  })
  if (
    route.namespace !== wire.request.predecessor.namespace ||
    route.scriptName !== wire.request.predecessor.scriptName
  )
    throw denied()
  const { identity, ...body } = execution,
    { digest: freezeDigest, ...freezeBody } = execution.freeze
  if (
    identity !== (await collectionDigest(body)) ||
    freezeDigest !== (await collectionDigest(freezeBody)) ||
    execution.originalRouteDigest !==
      (await collectionDigest({
        ...route,
        formDrafts: { digest: route.formDrafts.digest, receipt: route.formDrafts.receipt }
      }))
  )
    throw denied()
  for (const action of ['upload', 'install'] as const) {
    const proof = result[action],
      claim = proof.claim
    const initial = {
      purpose: 'recovery-source-effect',
      pending: wire.pending,
      applied: wire.applied,
      recovery: wire.recovery,
      inspection: wire.inspection,
      request: wire.request,
      requestDigest: wire.requestDigest,
      descriptor: wire.descriptor,
      descriptorDigest: wire.descriptorDigest,
      command: {
        phase: 'source-execution',
        action,
        verb: 'claim',
        invocationId: claim.identity.invocationId,
        resourceDigest: claim.identity.resourceDigest
      }
    }
    // Comparison-only wrapper reuses the existing complete claim/result verifier.
    // It is never returned or recorded as an observed effect response.
    await verifyRecoverySourceEffectResult(initial, {
      purpose: 'source-execution-effect',
      envelopeDigest: await collectionDigest(initial),
      claim,
      result: { action, receipt: proof.receipt }
    })
    if (
      action === 'install' &&
      !same(source.claim, { ...claim, state: 'dispatching', resultDigest: null, settlementDigest: null })
    )
      throw denied()
  }
  return result
}
export async function recoverySourceFreezeResourceDigest(input: unknown) {
  const request = ManagedTransferSourceDraftsRequestSchema.parse(input)
  return collectionDigest({
    kind: 'source-forms-freeze',
    accountId: request.fenceIntent.target.accountId,
    databaseId: request.fenceIntent.target.databaseId,
    scopeKey: contentScopeKey(request.fenceIntent.scope),
    transferId: request.operationId
  })
}

/** Recomputes immutable wire linkage only; the PG and actual native readers
 * independently supply their current authorities. No claim acquisition here. */
export async function verifyRecoverySourceFreezeLinkage(input: unknown) {
  const wire = TransferRecoverySourceFreezeRequestSchema.parse(structuredClone(input)),
    source = wire.source,
    request = source.request,
    descriptor = source.descriptor,
    claim = source.claim,
    requestDigest = await collectionDigest(request),
    descriptorDigest = await collectionDigest(descriptor),
    claimDigest = await collectionDigest(claim)
  const route = {
    activationId: request.sourceTarget.routeId,
    scope: request.sourceScope,
    target: request.sourceTarget,
    namespace: request.predecessor.namespace,
    scriptName: request.predecessor.scriptName,
    receipts: {
      collection: source.predecessors.collection,
      workflow: source.predecessors.workflow,
      staging: source.predecessors.staging
    },
    formDrafts: {
      receipt: source.predecessors.forms,
      digest: await collectionDigest(source.predecessors.forms)
    }
  }
  await verifyCustomerAdoptionStorageProof({
    kind: 'existing-native-adoption-source',
    version: 1,
    selection: route,
    selectionDigest: await collectionDigest(route)
  })
  if (
    !same(source.predecessors.forms, request.formReceipt) ||
    !same(claim.head, wire.recovery) ||
    request.operationId !== wire.request.operationId ||
    request.intentDigest !== wire.request.intentDigest ||
    !same(wire.request.fenceIntent, {
      formatVersion: 1,
      nativeIntentDigest: request.intentDigest,
      transferId: request.operationId,
      scope: request.sourceScope,
      target: request.sourceTarget
    }) ||
    wire.request.executionIdentity !== wire.sourceSelectionIdentity
  )
    throw denied()
  const receiptBody = {
    formatVersion: 1,
    nativeIntentDigest: request.intentDigest,
    operationId: `transfer_${request.operationId}`,
    predecessor: request.formReceipt,
    associationDigest: await collectionDigest({
      accountId: request.formReceipt.accountId,
      claimDigest,
      databaseId: request.formReceipt.databaseId,
      descriptorDigest,
      head: wire.recovery,
      layoutDigest: descriptor.layoutDigest,
      requestDigest,
      scope: request.sourceScope
    }),
    claimDigest,
    descriptorDigest,
    kind: 'managed-transfer-recovery-source-v1',
    schemaDigest: descriptor.layoutDigest
  }
  const receipt = { ...receiptBody, digest: await collectionDigest(receiptBody) },
    result = { action: 'install', receipt },
    resultDigest = await collectionDigest(result)
  const { requestDigest: _requestDigest, ...command } = claim.identity
  const initial = {
    purpose: 'recovery-source-effect',
    pending: wire.pending,
    applied: wire.applied,
    recovery: wire.recovery,
    inspection: wire.inspection,
    request,
    requestDigest,
    descriptor,
    descriptorDigest,
    command: { ...command, verb: 'claim' }
  }
  // Comparison-only reconstructed wrapper checks metadata equations against the
  // retained bootstrap. It is not an observed completion or provider receipt.
  await verifyRecoverySourceEffectResult(initial, {
    purpose: 'source-execution-effect',
    envelopeDigest: await collectionDigest(initial),
    claim: {
      ...claim,
      state: 'completed',
      resultDigest,
      settlementDigest: await collectionDigest({ purpose: 'settle', claim, resultDigest, state: 'completed' })
    },
    result
  })
  if (
    wire.sourceReceiptDigest !== receipt.digest ||
    wire.requestDigest !== (await collectionDigest(wire.request)) ||
    wire.descriptorDigest !== (await collectionDigest(wire.descriptor)) ||
    wire.associationDigest !== (await collectionDigest(wire.association)) ||
    !same(
      wire.association,
      await recoverySourceFreezeAssociation({
        enabled: {
          purpose: 'recovery-enabled',
          pending: wire.pending,
          applied: wire.applied,
          recovery: wire.recovery,
          inspection: wire.inspection
        },
        request: wire.request,
        source,
        sourceReceiptDigest: receipt.digest,
        sourceSelectionIdentity: wire.sourceSelectionIdentity,
        descriptor: wire.descriptor,
        invocationId: wire.command.invocationId
      })
    )
  )
    throw denied()
  const resourceDigest = await recoverySourceFreezeResourceDigest(wire.request)
  if (wire.command.resourceDigest !== resourceDigest) throw denied()
  if (wire.command.verb !== 'claim') {
    const identity = {
        phase: 'source-freeze',
        action: 'freeze',
        invocationId: wire.command.invocationId,
        requestDigest: wire.requestDigest,
        resourceDigest
      },
      original = {
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
      }
    const actual = wire.command.claim
    const expected =
      actual.state === 'completed'
        ? {
            ...original,
            state: 'completed',
            resultDigest: actual.resultDigest,
            settlementDigest: await collectionDigest({
              purpose: 'settle',
              claim: original,
              resultDigest: actual.resultDigest,
              state: 'completed'
            })
          }
        : original
    if (!same(actual, expected)) throw denied()
  }
  return wire
}
export async function recoverySourceFreezeAssociation(input: {
  enabled: z.infer<typeof TransferRecoveryEnabledRequestSchema>
  request: z.infer<typeof ManagedTransferSourceDraftsRequestSchema>
  source: z.infer<typeof TransferRecoverySourceBootstrapSchema>
  sourceReceiptDigest: string
  sourceSelectionIdentity: string
  descriptor: z.infer<typeof TransferRecoverySourceFreezeDescriptorSchema>
  invocationId: string
}) {
  const { enabled, request, source, descriptor } = input
  return TransferRecoverySourceFreezeAssociationSchema.parse({
    formatVersion: 1,
    kind: 'managed-transfer-recovery-source-freeze-v1',
    operationId: request.operationId,
    intentDigest: request.intentDigest,
    recoveryId: enabled.recovery.recoveryId,
    epoch: 1,
    admissionId: enabled.applied.body.admissionId,
    appliedDigest: enabled.applied.digest,
    enabledHeadDigest: await collectionDigest(enabled.recovery),
    requestDigest: await collectionDigest(request),
    invocationId: input.invocationId,
    sourceRequestDigest: await collectionDigest(source.request),
    sourceDescriptorDigest: await collectionDigest(source.descriptor),
    sourceReceiptDigest: input.sourceReceiptDigest,
    sourceInstallClaimDigest: await collectionDigest(source.claim),
    sourceSelectionIdentity: input.sourceSelectionIdentity,
    descriptorDigest: await collectionDigest(descriptor)
  })
}
