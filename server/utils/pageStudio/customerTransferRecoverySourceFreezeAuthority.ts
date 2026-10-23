import type { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferExecutionContextSchema } from '~~/shared/pageStudio/managed-transfer-execution'
import {
  TransferRecoveryEnabledRequestSchema,
  TransferRecoverySourceInputSchema
} from '~~/shared/pageStudio/transferRecoveryPhase'
import { recoveryCurrentContext, reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import { laterTables } from './customerTransferRecoveryReviewAuthority'
import {
  readRecoveryApprovalReview,
  readRecoveryApprovalEvidence,
  readRecoveryApprovedCapture
} from './customerTransferRecoveryApprovalEvidence'
import {
  recoveryAdmissionHeads,
  recoveryAdmissionEnvelope,
  retainedRecoveryAdmission,
  retainedRecoveryApplication,
  verifyRetainedPreparedAdmission,
  finishRecoveryAdmissionAuthority
} from './customerTransferRecoveryAdmissionAuthority'
import { assertManagedTransferSource } from './managedTransferIntent'
import { retainedManagedTransferExecution } from './managedTransferExecution'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

import { recoverySourceConfiguration } from './customerTransferRecoveryPhaseAuthority'
import { ManagedTransferSourceDraftsRequestSchema } from '~~/shared/pageStudio/managed-transfer-source-drafts'
import {
  TransferRecoverySourceFreezeAssociationSchema,
  TransferRecoverySourceFreezeDescriptorSchema,
  TransferRecoverySourceFreezeAcknowledgmentSchema,
  TransferRecoverySourceReadyRequestSchema,
  TransferRecoverySourceReadyAcknowledgmentSchema,
  verifyRecoverySourceFreezeLinkage
} from '~~/shared/pageStudio/transferRecoverySourceFreeze'

type SourceInput = z.infer<typeof TransferRecoverySourceInputSchema>
/** Freeze-specific predicate. Only exact recovery-associated source execution and
 * the separately validated freeze pair may exist. Legacy source/absence guards
 * remain unchanged and cannot use this function. */
async function freezeProgress(
  db: PageStudioQueryClient,
  context: Awaited<ReturnType<typeof recoveryCurrentContext>>,
  applied: Awaited<ReturnType<typeof retainedRecoveryApplication>>['applied'],
  config: ReturnType<typeof recoverySourceConfiguration>
) {
  const intent = context.intent
  await assertManagedTransferSource(db, intent)
  for (const table of laterTables) {
    if (table === 'executions' || table === 'source_drafts') continue
    if (
      (
        await db.query(`SELECT 1 FROM page_studio_managed_transfer_${table} WHERE operation_id=$1`, [
          intent.operationId
        ])
      ).rows.length
    )
      throw reviewDenied()
  }
  const saved = await retainedManagedTransferExecution(db, intent)
  const rows = (
    await db.query<{
      operation_id: string
      intent_digest: string
      recovery_id: string
      epoch: number
      admission_id: string
      applied_digest: string
      request_digest: string
      recovery_descriptor: unknown
      descriptor_digest: string
    }>(
      `SELECT operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,recovery_descriptor,descriptor_digest
    FROM page_studio_transfer_recovery_source_executions WHERE operation_id=$1`,
      [intent.operationId]
    )
  ).rows
  if (!saved) {
    if (rows.length) throw reviewDenied()
    return null
  }
  const expected = {
    operation_id: intent.operationId,
    intent_digest: applied.body.intentDigest,
    recovery_id: applied.body.recoveryId,
    epoch: 1,
    admission_id: applied.body.admissionId,
    applied_digest: applied.digest,
    request_digest: await collectionDigest(saved),
    recovery_descriptor: config.descriptor,
    descriptor_digest: await collectionDigest(config.descriptor)
  }
  if (rows.length !== 1 || !reviewSame(rows[0], expected)) throw reviewDenied()
  const stored = (
    await db.query<{
      account_id: string
      namespace: string
      script_name: string
    }>(
      'SELECT account_id,namespace,script_name FROM page_studio_managed_transfer_executions WHERE operation_id=$1',
      [intent.operationId]
    )
  ).rows
  if (
    stored.length !== 1 ||
    !reviewSame(stored[0], {
      account_id: saved.successor.accountId,
      namespace: saved.successor.namespace,
      script_name: saved.successor.scriptName
    })
  )
    throw reviewDenied()
  return saved
}

/** Current PG freeze-phase proof only. Does not certify actual D1 enabled/event
 * state, physical observations or provider permission. */
export async function recoverySourceFreezeContext(
  db: PageStudioQueryClient,
  input: Omit<SourceInput, 'body'> & { body: Pick<SourceInput['body'], 'admissionId'> },
  env: Record<string, unknown>,
  freezeDescriptor: z.infer<typeof TransferRecoverySourceFreezeDescriptorSchema>
) {
  const config = recoverySourceConfiguration(env)
  const pending = await retainedRecoveryAdmission(db, input.body.admissionId)
  const application = await retainedRecoveryApplication(db, input.body.admissionId)
  const route = {
    siteId: input.siteId,
    requestId: input.requestId,
    expectedRevision: input.expectedRevision
  }
  for (const request of [pending.request, application.request]) {
    if (
      !reviewSame(route, {
        siteId: request.siteId,
        requestId: request.requestId,
        expectedRevision: request.expectedRevision
      }) ||
      !reviewSame(request.operator, input.operator)
    )
      throw reviewDenied()
  }
  const loaded = await readRecoveryApprovalReview(db, pending.pending.body.reviewId)
  const context = await recoveryCurrentContext(
    db,
    route,
    { operator: input.operator },
    loaded.review.renewal.requestId,
    'applied'
  )
  const saved = await freezeProgress(db, context, application.applied, config)
  const evidence = await readRecoveryApprovalEvidence(
    db,
    route,
    input.operator,
    pending.pending.body.reviewId,
    'applied',
    loaded,
    context
  )
  const owner = await recoveryCurrentContext(
    db,
    route,
    { ownerHash: evidence.ownerHash },
    loaded.review.renewal.requestId,
    'applied'
  )
  if (!reviewSame(await freezeProgress(db, owner, application.applied, config), saved)) throw reviewDenied()
  const proof = await readRecoveryApprovedCapture(db, evidence)
  // This builder validates retained resources/catalogue and the historical approved
  // capture. It is not a live early-phase callback or relabeled observation.
  const historical = await recoveryAdmissionEnvelope(db, proof, pending.pending, application.applied)
  await verifyRetainedPreparedAdmission(historical, application.prepared)
  const heads = await recoveryAdmissionHeads(pending.pending, application.applied)
  const enabled = TransferRecoveryEnabledRequestSchema.parse({
    purpose: 'recovery-enabled',
    pending: pending.pending,
    applied: application.applied,
    recovery: heads.enabled,
    inspection: historical.inspection
  })
  const request = ManagedTransferExecutionContextSchema.parse({
    formatVersion: 1,
    operationId: context.intent.operationId,
    intentDigest: application.applied.body.intentDigest,
    sourceScope: context.intent.authority.source,
    sourceTarget: context.intent.source.context.state.target,
    freezeDigest: context.intent.source.context.state.freeze_digest
  })
  if (
    config.descriptor.execution.accountId !== request.sourceTarget.accountId ||
    config.descriptor.execution.from.digest !== request.sourceTarget.runtimeDigest ||
    (saved &&
      !reviewSame(saved.policy, {
        version: config.descriptor.execution.version,
        kind: config.descriptor.execution.kind,
        from: config.descriptor.execution.from,
        to: config.descriptor.execution.to,
        formReceiptDigest: await collectionDigest(saved.formReceipt)
      })) ||
    !reviewSame(recoverySourceConfiguration(env), config)
  )
    throw reviewDenied()
  if (!saved) throw reviewDenied()
  const draftRows = (
    await db.query<{ request: unknown; request_digest: string }>(
      'SELECT request,request_digest FROM page_studio_managed_transfer_source_drafts WHERE operation_id=$1',
      [request.operationId]
    )
  ).rows
  const associations = (
    await db.query<{
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
    }>(
      'SELECT operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,invocation_id,association,association_json,association_digest,descriptor,descriptor_digest FROM page_studio_transfer_recovery_source_freezes WHERE operation_id=$1',
      [request.operationId]
    )
  ).rows
  if (draftRows.length !== associations.length || draftRows.length > 1) throw reviewDenied()
  let freeze: null | {
    request: z.infer<typeof ManagedTransferSourceDraftsRequestSchema>
    association: z.infer<typeof TransferRecoverySourceFreezeAssociationSchema>
    associationDigest: string
    descriptor: z.infer<typeof TransferRecoverySourceFreezeDescriptorSchema>
  } = null
  if (draftRows.length) {
    const draft = ManagedTransferSourceDraftsRequestSchema.parse(draftRows[0]!.request),
      row = associations[0]!,
      association = TransferRecoverySourceFreezeAssociationSchema.parse(row.association),
      descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(row.descriptor),
      requestDigest = await collectionDigest(draft),
      descriptorDigest = await collectionDigest(descriptor),
      associationDigest = await collectionDigest(association)
    if (
      !reviewSame(descriptor, freezeDescriptor) ||
      row.association_json !== collectionCanonical(association) ||
      row.association_digest !== associationDigest ||
      draftRows[0]!.request_digest !== requestDigest ||
      !reviewSame(draft.fenceIntent, {
        formatVersion: 1,
        nativeIntentDigest: request.intentDigest,
        transferId: request.operationId,
        scope: saved.sourceScope,
        target: saved.sourceTarget
      }) ||
      draft.operationId !== request.operationId ||
      draft.intentDigest !== request.intentDigest ||
      draft.executionIdentity !== association.sourceSelectionIdentity ||
      !reviewSame(association, {
        formatVersion: 1,
        kind: 'managed-transfer-recovery-source-freeze-v1',
        operationId: request.operationId,
        intentDigest: request.intentDigest,
        recoveryId: enabled.recovery.recoveryId,
        epoch: 1,
        admissionId: enabled.applied.body.admissionId,
        appliedDigest: enabled.applied.digest,
        enabledHeadDigest: await collectionDigest(enabled.recovery),
        requestDigest,
        invocationId: row.invocation_id,
        sourceRequestDigest: await collectionDigest(saved),
        sourceDescriptorDigest: await collectionDigest(config.descriptor),
        descriptorDigest,
        sourceReceiptDigest: association.sourceReceiptDigest,
        sourceInstallClaimDigest: association.sourceInstallClaimDigest,
        sourceSelectionIdentity: association.sourceSelectionIdentity
      }) ||
      !reviewSame(row, {
        operation_id: request.operationId,
        intent_digest: request.intentDigest,
        recovery_id: enabled.recovery.recoveryId,
        epoch: 1,
        admission_id: enabled.applied.body.admissionId,
        applied_digest: enabled.applied.digest,
        request_digest: requestDigest,
        invocation_id: association.invocationId,
        association,
        association_json: collectionCanonical(association),
        association_digest: associationDigest,
        descriptor,
        descriptor_digest: descriptorDigest
      })
    )
      throw reviewDenied()
    freeze = { request: draft, association, associationDigest, descriptor }
  }
  return { proof, enabled, request, saved, config, freeze }
}

/** Fresh PG authority only. Actual enabled/event/claim/physical state is proved
 * by the native executor; this callback cannot acquire or dispatch an effect. */
export async function authorizeCustomerTransferRecoverySourceFreeze(
  input: unknown,
  d: { env: Record<string, unknown>; freezeDescriptor: unknown; runTransaction?: RunPageStudioTransaction }
) {
  const env = d.env,
    runner = d.runTransaction,
    run = runner ?? transactionWithoutRetry,
    config = recoverySourceConfiguration(env),
    descriptorIdentity = d.freezeDescriptor,
    descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(structuredClone(descriptorIdentity))
  const current = () => {
    if (
      d.env !== env ||
      d.runTransaction !== runner ||
      d.freezeDescriptor !== descriptorIdentity ||
      !reviewSame(TransferRecoverySourceFreezeDescriptorSchema.parse(d.freezeDescriptor), descriptor) ||
      !reviewSame(recoverySourceConfiguration(env), config)
    )
      throw reviewDenied()
  }
  current()
  const wire = await verifyRecoverySourceFreezeLinkage(input),
    envelopeDigest = await collectionDigest(wire)
  current()
  const result = await run(async (db) => {
    current()
    const retained = await retainedRecoveryAdmission(db, wire.applied.body.admissionId)
    const value = TransferRecoverySourceInputSchema.parse({
      siteId: retained.request.siteId,
      requestId: wire.inspection.pg.requestId,
      expectedRevision: wire.inspection.pg.requestRevision,
      operator: { actorId: wire.inspection.operatorId, loginSessionHash: wire.inspection.loginSessionHash },
      body: { admissionId: wire.applied.body.admissionId, invocationId: wire.command.invocationId }
    })
    const check = async () => {
      const proof = await recoverySourceFreezeContext(db, value, env, descriptor)
      current()
      if (
        !proof.freeze ||
        !reviewSame(proof.enabled, {
          purpose: 'recovery-enabled',
          pending: wire.pending,
          applied: wire.applied,
          recovery: wire.recovery,
          inspection: wire.inspection
        }) ||
        !reviewSame(proof.saved, wire.source.request) ||
        !reviewSame(proof.config.descriptor, wire.source.descriptor) ||
        !reviewSame(proof.freeze, {
          request: wire.request,
          association: wire.association,
          associationDigest: wire.associationDigest,
          descriptor: wire.descriptor
        })
      )
        throw reviewDenied()
      return proof
    }
    await check()
    const proof = await check(),
      ack = TransferRecoverySourceFreezeAcknowledgmentSchema.parse({ purpose: wire.purpose, envelopeDigest })
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return ack
  })
  current()
  return result
}

/** Read-only PG proof for actual source readiness inspection. No effect, claim,
 * settlement or physical completion is authorized by this acknowledgment. */
export async function authorizeCustomerTransferRecoverySourceReady(
  input: unknown,
  d: { env: Record<string, unknown>; freezeDescriptor: unknown; runTransaction?: RunPageStudioTransaction }
) {
  const wire = TransferRecoverySourceReadyRequestSchema.parse(structuredClone(input)),
    env = d.env,
    runner = d.runTransaction,
    run = runner ?? transactionWithoutRetry,
    config = recoverySourceConfiguration(env),
    descriptorIdentity = d.freezeDescriptor,
    descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(structuredClone(descriptorIdentity))
  const current = () => {
    if (
      d.env !== env ||
      d.runTransaction !== runner ||
      d.freezeDescriptor !== descriptorIdentity ||
      !reviewSame(TransferRecoverySourceFreezeDescriptorSchema.parse(d.freezeDescriptor), descriptor) ||
      !reviewSame(recoverySourceConfiguration(env), config)
    )
      throw reviewDenied()
  }
  current()
  const envelopeDigest = await collectionDigest(wire)
  if (
    wire.requestDigest !== (await collectionDigest(wire.request)) ||
    wire.descriptorDigest !== (await collectionDigest(wire.descriptor))
  )
    throw reviewDenied()
  current()
  const result = await run(async (db) => {
    current()
    const retained = await retainedRecoveryAdmission(db, wire.applied.body.admissionId)
    const value = {
      siteId: retained.request.siteId,
      requestId: wire.inspection.pg.requestId,
      expectedRevision: wire.inspection.pg.requestRevision,
      operator: { actorId: wire.inspection.operatorId, loginSessionHash: wire.inspection.loginSessionHash },
      body: { admissionId: wire.applied.body.admissionId }
    }
    const check = async () => {
      const proof = await recoverySourceFreezeContext(db, value, env, descriptor)
      current()
      if (
        !reviewSame(proof.enabled, {
          purpose: 'recovery-enabled',
          pending: wire.pending,
          applied: wire.applied,
          recovery: wire.recovery,
          inspection: wire.inspection
        }) ||
        !reviewSame(proof.saved, wire.request) ||
        !reviewSame(proof.config.descriptor, wire.descriptor) ||
        !reviewSame(descriptor, wire.freezeDescriptor)
      )
        throw reviewDenied()
      return proof
    }
    await check()
    const proof = await check()
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return TransferRecoverySourceReadyAcknowledgmentSchema.parse({ purpose: wire.purpose, envelopeDigest })
  })
  current()
  return result
}
