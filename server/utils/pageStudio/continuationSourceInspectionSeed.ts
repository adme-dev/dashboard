import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferSourceDraftsRequestSchema } from '~~/shared/pageStudio/managed-transfer-source-drafts'
import { TransferRecoverySourceDescriptorSchema } from '~~/shared/pageStudio/transferRecoverySourceEffect'
import { TransferRecoverySourceFreezeAssociationSchema, TransferRecoverySourceFreezeDescriptorSchema, TransferRecoverySourceReadyRequestSchema, verifyRecoverySourceReady, recoverySourceFreezeAssociation, recoverySourceFreezeResourceDigest, verifyRecoverySourceFreezeLinkage } from '~~/shared/pageStudio/transferRecoverySourceFreeze'
import { retainedManagedTransferExecution } from './managedTransferExecution'
import { retainedManagedTransferDestinationCatalogue } from './managedTransferDestinationCatalogue'
import { retainedRecoveryAdmission, retainedRecoveryApplication, recoveryAdmissionHeads } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame as same } from './customerTransferRecoveryCurrentAuthority'
import type { recoveryContinuationCurrentContext } from './customerTransferRecoveryContinuationAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

type Context = Awaited<ReturnType<typeof recoveryContinuationCurrentContext>>
/** Historical request reconstruction only. Caller holds current continuation
 * authority/site locks and must perform the final authority fence. Neither this
 * seed nor its historical inspection session authorizes native reads/effects.
 * Actual source bootstrap is absent from PG; obtain it via the new read-only
 * native inspection before constructing a full freeze envelope. */
export async function readContinuationSourceInspectionSeed(db: PageStudioQueryClient, context: Context) {
  const intent = context.intent, operationId = intent.operationId, intentDigest = await digest(intent)
  if (intentDigest !== context.evidence.authority.intentDigest || intent.sourceDigest !== await digest({ authority: intent.authority, source: intent.source })) throw reviewDenied()
  const row = (await db.query<{
    operation_id: string
    intent_digest: string
    recovery_id: string
    epoch: number
    admission_id: string
    applied_digest: string
    request_digest: string
    invocation_id: string
    association: unknown
    association_json: string
    association_digest: string
    descriptor: unknown
    descriptor_digest: string
  }>(`SELECT operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,invocation_id,
    association,association_json,association_digest,descriptor,descriptor_digest
    FROM page_studio_transfer_recovery_source_freezes WHERE operation_id=$1 FOR SHARE NOWAIT`, [operationId])).rows[0]
  if (!row) throw reviewDenied()
  const association = TransferRecoverySourceFreezeAssociationSchema.parse(row.association)
  const descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(row.descriptor)
  const pending = await retainedRecoveryAdmission(db, row.admission_id), application = await retainedRecoveryApplication(db, row.admission_id)
  const heads = await recoveryAdmissionHeads(pending.pending, application.applied)
  const historical = pending.request
  for (const request of [historical, application.request]) {
    if (!same({ siteId: request.siteId, requestId: request.requestId, expectedRevision: request.expectedRevision }, context.route)
      || request.operator.actorId !== intent.authority.operatorId || !same(request.operator, historical.operator)) throw reviewDenied()
  }
  const saved = await retainedManagedTransferExecution(db, intent)
  const sourceRow = (await db.query<{
    operation_id: string
    intent_digest: string
    recovery_id: string
    epoch: number
    admission_id: string
    applied_digest: string
    request_digest: string
    recovery_descriptor: unknown
    descriptor_digest: string
  }>(`SELECT operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,recovery_descriptor,descriptor_digest
    FROM page_studio_transfer_recovery_source_executions WHERE operation_id=$1 FOR SHARE NOWAIT`, [operationId])).rows[0]
  if (!saved || !sourceRow) throw reviewDenied()
  const sourceDescriptor = TransferRecoverySourceDescriptorSchema.parse(sourceRow.recovery_descriptor)
  const sourceRequestDigest = await digest(saved), sourceDescriptorDigest = await digest(sourceDescriptor)
  const common = { operation_id: operationId, intent_digest: intentDigest, recovery_id: context.evidence.authority.recoveryId,
    epoch: 1, admission_id: row.admission_id, applied_digest: application.applied.digest }
  if (!same(sourceRow, { ...common, request_digest: sourceRequestDigest, recovery_descriptor: sourceDescriptor, descriptor_digest: sourceDescriptorDigest })
    || sourceDescriptor.execution.accountId !== saved.sourceTarget.accountId || sourceDescriptor.execution.from.digest !== saved.sourceTarget.runtimeDigest
    || !same(saved.policy, { version: sourceDescriptor.execution.version, kind: sourceDescriptor.execution.kind,
      from: sourceDescriptor.execution.from, to: sourceDescriptor.execution.to, formReceiptDigest: await digest(saved.formReceipt) })) throw reviewDenied()
  const draftRow = (await db.query<{ request: unknown, request_digest: string, intent_digest: string }>(
    'SELECT request,request_digest,intent_digest FROM page_studio_managed_transfer_source_drafts WHERE operation_id=$1 FOR SHARE NOWAIT', [operationId])).rows[0]
  if (!draftRow) throw reviewDenied()
  const request = ManagedTransferSourceDraftsRequestSchema.parse(draftRow.request), requestDigest = await digest(request)
  const descriptorDigest = await digest(descriptor), associationDigest = await digest(association)
  if (draftRow.intent_digest !== intentDigest || draftRow.request_digest !== requestDigest
    || request.operationId !== operationId || request.intentDigest !== intentDigest || request.executionIdentity !== association.sourceSelectionIdentity
    || !same(request.fenceIntent, { formatVersion: 1, nativeIntentDigest: intentDigest, transferId: operationId, scope: saved.sourceScope, target: saved.sourceTarget })
    || !same(association, { formatVersion: 1, kind: 'managed-transfer-recovery-source-freeze-v1', operationId, intentDigest,
      recoveryId: common.recovery_id, epoch: 1, admissionId: row.admission_id, appliedDigest: application.applied.digest,
      enabledHeadDigest: await digest(heads.enabled), requestDigest, invocationId: row.invocation_id,
      sourceRequestDigest, sourceDescriptorDigest, descriptorDigest, sourceReceiptDigest: association.sourceReceiptDigest,
      sourceInstallClaimDigest: association.sourceInstallClaimDigest, sourceSelectionIdentity: association.sourceSelectionIdentity })
    || association.enabledHeadDigest !== context.evidence.authority.originalRecoveryHeadDigest
    || !same(row, { ...common, request_digest: requestDigest, invocation_id: association.invocationId,
      association, association_json: canonical(association), association_digest: associationDigest, descriptor, descriptor_digest: descriptorDigest })) throw reviewDenied()
  // This reader validates both native resource rows and their original identities.
  const catalogue = await retainedManagedTransferDestinationCatalogue(db, intent)
  if (!catalogue.saved) throw reviewDenied()
  const binding = (await db.query<{ binding_digest: string }>(
    'SELECT binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1 FOR SHARE NOWAIT', [operationId])).rows[0]
  if (!binding) throw reviewDenied()
  const sourceReady = TransferRecoverySourceReadyRequestSchema.parse({
    purpose: 'recovery-source-freeze-ready', pending: pending.pending, applied: application.applied, recovery: heads.enabled,
    inspection: { operatorId: historical.operator.actorId, loginSessionHash: historical.operator.loginSessionHash,
      pg: { requestId: historical.requestId, requestRevision: historical.expectedRevision, recoveryId: common.recovery_id,
        epoch: 1, version: 4, deadline: pending.pending.body.deadline } },
    request: saved, requestDigest: sourceRequestDigest, descriptor: sourceDescriptor, descriptorDigest: sourceDescriptorDigest, freezeDescriptor: descriptor
  })
  return {
    originalContext: { sourceGeneration: intent.source.context.state.active_generation, destinationGeneration: intent.destination.generation,
      destinationBindingDigest: binding.binding_digest, earlyInventoryDigest: pending.pending.body.reconciliationDigest, sourceSnapshotDigest: intent.sourceDigest },
    sourceReady, freezePreparation: { request, association, associationDigest, descriptor }
  }
}

/** Bind actual native readiness to the immutable PG preparation. The caller must
 * separately verify the complete bootstrap response/current fence under its
 * fixed native descriptor; this function only reconstructs the historical
 * claim-mode envelope. It never treats a reconstructed envelope as a receipt. */
export async function bindContinuationSourceBootstrap(seed: Awaited<ReturnType<typeof readContinuationSourceInspectionSeed>>, observed: unknown) {
  const frozen = structuredClone(seed)
  const ready = await verifyRecoverySourceReady(frozen.sourceReady, structuredClone(observed))
  const { pending, applied, recovery, inspection } = frozen.sourceReady
  const { request, association, associationDigest, descriptor } = frozen.freezePreparation
  const source = ready.selection.execution.recovery
  const expected = await recoverySourceFreezeAssociation({
    enabled: { purpose: 'recovery-enabled', pending, applied, recovery, inspection },
    request, source, sourceReceiptDigest: ready.install.receipt.digest,
    sourceSelectionIdentity: ready.selection.execution.identity, descriptor, invocationId: association.invocationId
  })
  if (!same(expected, association) || await digest(association) !== associationDigest) throw reviewDenied()
  return verifyRecoverySourceFreezeLinkage({
    purpose: 'recovery-source-freeze', pending, applied, recovery, inspection,
    request, requestDigest: association.requestDigest, source,
    sourceReceiptDigest: ready.install.receipt.digest, sourceSelectionIdentity: ready.selection.execution.identity,
    descriptor, descriptorDigest: association.descriptorDigest, association, associationDigest,
    command: { phase: 'source-freeze', action: 'freeze', verb: 'claim', invocationId: association.invocationId,
      resourceDigest: await recoverySourceFreezeResourceDigest(request) }
  })
}
