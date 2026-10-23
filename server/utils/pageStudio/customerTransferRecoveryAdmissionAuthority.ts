import {
  readRecoveryApprovalReview,
  readRecoveryApprovalEvidence,
  readRecoveryApprovedCapture
} from './customerTransferRecoveryApprovalEvidence'
import type { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentAttachmentIdentity } from '~~/shared/pageStudio/content-attachment'
import { planManagedTransferDestinationCatalogue } from '~~/shared/pageStudio/managed-transfer-destination-catalogue-result'

import {
  canonicalRecoveryAdmissionDeadline,
  TransferRecoveryPendingGrantSchema,
  TransferRecoveryAppliedGrantSchema,
  TransferRecoveryClosedHeadSchema,
  TransferRecoveryPrepareStorageSchema,
  TransferRecoveryPreparedHeadSchema,
  TransferRecoveryEnabledHeadSchema,
  TransferRecoveryAdmissionRequestSchema,
  TransferRecoveryAdmissionAcknowledgmentSchema,
  TransferRecoveryPendingInputSchema,
  TransferRecoveryAppliedInputSchema,
  TransferRecoveryPreparedVerificationSchema,
  recoveryAdmissionPhysicalEvidence,
  type TransferRecoveryAdmissionRequest
} from '~~/shared/pageStudio/transferRecoveryAdmission'
import { retainedManagedTransferDestinationCatalogue } from './managedTransferDestinationCatalogue'
import {
  recoveryReviewContext,
  recoveryReviewClock,
  reviewDenied,
  reviewSame,
  type ReviewRoute
} from './customerTransferRecoveryReviewAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Operator = { actorId: string; loginSessionHash: string }
type Stage = 'approved' | 'pending' | 'applied'

export async function recoveryAdmissionHeads(pendingInput: unknown, appliedInput?: unknown) {
  const pending = TransferRecoveryPendingGrantSchema.parse(pendingInput),
    p = pending.body
  if ((await collectionDigest(p)) !== pending.digest) throw reviewDenied()
  const identity = { operationId: p.operationId, intentDigest: p.intentDigest, recoveryId: p.recoveryId, epoch: 1 }
  const closed = TransferRecoveryClosedHeadSchema.parse({
    ...identity,
    mode: 'closed',
    version: 1,
    admissionId: null,
    appliedDigest: null,
    deadline: null,
    pendingDigest: null,
    preparedDigest: null,
    reconciliationDigest: null,
    reviewDigest: null,
    revision: null
  })
  const admission = {
    admissionId: p.admissionId,
    deadline: p.deadline,
    pendingDigest: pending.digest,
    reconciliationDigest: p.reconciliationDigest,
    reviewDigest: p.reviewDigest,
    revision: p.revision
  }
  const prepare = TransferRecoveryPrepareStorageSchema.parse({
    purpose: 'prepare',
    eventId: p.prepareEventId,
    previous: closed,
    admission
  })
  const prepared = TransferRecoveryPreparedHeadSchema.parse({
    ...identity,
    ...admission,
    mode: 'prepared',
    version: 2,
    appliedDigest: null,
    preparedDigest: await collectionDigest(prepare)
  })
  if (appliedInput === undefined) return { closed, prepare, prepared, enabled: null }
  const applied = TransferRecoveryAppliedGrantSchema.parse(appliedInput),
    a = applied.body
  const { pgVersion: _v, pendingDigest: _p, preparedDigest: _d, ...actual } = a
  const { pgVersion: _pv, prepareEventId: _pe, enableEventId: _ee, ...expected } = p
  if (
    (await collectionDigest(a)) !== applied.digest ||
    !reviewSame(actual, expected) ||
    a.pendingDigest !== pending.digest ||
    a.preparedDigest !== prepared.preparedDigest
  )
    throw reviewDenied()
  return {
    closed,
    prepare,
    prepared,
    enabled: TransferRecoveryEnabledHeadSchema.parse({
      ...prepared,
      mode: 'enabled',
      version: 3,
      appliedDigest: applied.digest
    })
  }
}

/** Original admission keeps both full current-source and nine-table-absence fences. */
export async function recoveryAdmissionAuthority(
  db: PageStudioQueryClient,
  route: ReviewRoute,
  operator: Operator,
  reviewId: string,
  stage: Stage
) {
  const loaded = await readRecoveryApprovalReview(db, reviewId)
  const context = await recoveryReviewContext(
    db,
    route,
    { operator },
    loaded.review.renewal.requestId,
    stage === 'approved' ? true : stage
  )
  const proof = await readRecoveryApprovalEvidence(db, route, operator, reviewId, stage, loaded, context)
  await recoveryReviewContext(
    db,
    route,
    { ownerHash: proof.ownerHash },
    loaded.review.renewal.requestId,
    stage === 'approved' ? true : stage
  )
  return readRecoveryApprovedCapture(db, proof)
}
export async function finishRecoveryAdmissionAuthority(
  db: PageStudioQueryClient,
  proof: Awaited<ReturnType<typeof recoveryAdmissionAuthority>>
) {
  const deadline = await recoveryReviewClock(
    db,
    proof.context,
    proof.deadline,
    { operator: proof.operator.loginSessionHash, owner: proof.ownerHash },
    proof.stage
  )
  // A shortened current session must not leave the granted deadline larger.
  if (canonicalRecoveryAdmissionDeadline(deadline) !== proof.deadline) throw reviewDenied()
}

export async function retainedRecoveryAdmission(db: PageStudioQueryClient, id: string) {
  const row = (
    await db.query<{ body: unknown; digest: string; request: unknown }>(
      'SELECT body,digest,request FROM page_studio_transfer_recovery_admissions WHERE admission_id=$1',
      [id]
    )
  ).rows[0]
  if (!row) throw reviewDenied()
  const pending = TransferRecoveryPendingGrantSchema.parse({ body: row.body, digest: row.digest })
  await recoveryAdmissionHeads(pending)
  const request = TransferRecoveryPendingInputSchema.parse(row.request),
    p = pending.body
  if (
    request.body.admissionId !== id ||
    p.admissionId !== id ||
    request.body.prepareEventId !== p.prepareEventId ||
    request.body.enableEventId !== p.enableEventId ||
    !reviewSame(request.body.review, { reviewId: p.reviewId, revision: p.revision, reviewDigest: p.reviewDigest })
  )
    throw reviewDenied()
  return { pending, request }
}
export async function retainedRecoveryApplication(db: PageStudioQueryClient, id: string) {
  const row = (
    await db.query<{ body: unknown; digest: string; request: unknown; prepared: unknown }>(
      'SELECT body,digest,request,prepared FROM page_studio_transfer_recovery_applications WHERE admission_id=$1',
      [id]
    )
  ).rows[0]
  if (!row) throw reviewDenied()
  const request = TransferRecoveryAppliedInputSchema.parse(row.request),
    applied = TransferRecoveryAppliedGrantSchema.parse({ body: row.body, digest: row.digest })
  if (
    request.body.admissionId !== id ||
    applied.body.admissionId !== id ||
    (await collectionDigest(applied.body)) !== applied.digest
  )
    throw reviewDenied()
  return { request, prepared: TransferRecoveryPreparedVerificationSchema.parse(row.prepared), applied }
}

/** Derive every original resource/catalogue/source selector from retained SQL.
 * This never invokes the reconciling-only inventory callback under a new mode. */
export async function recoveryAdmissionEnvelope(
  db: PageStudioQueryClient,
  proof: Awaited<ReturnType<typeof recoveryAdmissionAuthority>>,
  pending: z.infer<typeof TransferRecoveryPendingGrantSchema>,
  applied?: z.infer<typeof TransferRecoveryAppliedGrantSchema>
) {
  const { context, head, review, deadline, operator, route } = proof,
    p = pending.body,
    intent = context.intent
  if (
    p.operationId !== intent.operationId ||
    p.intentDigest !== (await collectionDigest(intent)) ||
    p.recoveryId !== context.head.recovery_id ||
    p.epoch !== 1 ||
    p.reviewId !== review.reviewId ||
    p.revision !== review.revision ||
    p.reviewDigest !== proof.reviewDigest ||
    p.reconciliationDigest !== head.reconciliation_digest ||
    p.deadline !== deadline ||
    head.admission_id !== p.admissionId
  )
    throw reviewDenied()
  const resourceRows = (
    await db.query<{ request: unknown; request_digest: string; identity: string; intent_digest: string }>(
      'SELECT request,request_digest,identity,intent_digest FROM page_studio_managed_transfer_resources WHERE operation_id=$1',
      [p.operationId]
    )
  ).rows
  const resource = resourceRows[0]
  if (
    resourceRows.length !== 1 ||
    !resource ||
    resource.intent_digest !== p.intentDigest ||
    resource.request_digest !== (await collectionDigest(resource.request))
  )
    throw reviewDenied()
  const current = await retainedManagedTransferDestinationCatalogue(db, intent)
  if (!current.saved) throw reviewDenied()
  const plan = await planManagedTransferDestinationCatalogue(current.saved)
  const verified = (
    await db.query<{
      intent_digest: string
      request_digest: string
      plan_digest: string
      receipt: unknown
      receipt_digest: string
    }>(
      'SELECT intent_digest,request_digest,plan_digest,receipt,receipt_digest FROM page_studio_managed_transfer_catalogue_verifications WHERE operation_id=$1',
      [p.operationId]
    )
  ).rows
  const v = verified[0]
  if (
    verified.length !== 1 ||
    !v ||
    v.intent_digest !== p.intentDigest ||
    v.request_digest !== plan.requestDigest ||
    v.plan_digest !== plan.planDigest ||
    v.receipt_digest !== plan.receipt.digest ||
    !reviewSame(v.receipt, plan.receipt)
  )
    throw reviewDenied()
  const request = { operationId: p.operationId, intentDigest: p.intentDigest, resourceRequest: resource.request }
  const heads = await recoveryAdmissionHeads(pending, applied)
  const source = intent.source
  const envelope = TransferRecoveryAdmissionRequestSchema.parse({
    purpose: applied ? 'admission-applied' : 'admission-pending',
    request,
    requestDigest: await collectionDigest(request),
    catalogueRequest: current.saved,
    source: {
      scope: intent.authority.source,
      target: source.context.state.target,
      freezeDigest: source.context.state.freeze_digest,
      checkpoint: {
        checkpointId: source.checkpoint.id,
        objectKey: source.checkpoint.object_key,
        digest: source.checkpoint.digest
      }
    },
    inspection: {
      operatorId: operator.actorId,
      loginSessionHash: operator.loginSessionHash,
      pg: {
        requestId: route.requestId,
        requestRevision: route.expectedRevision,
        recoveryId: p.recoveryId,
        epoch: 1,
        version: applied ? 4 : 3,
        deadline
      }
    },
    recovery: applied ? heads.prepared : heads.closed,
    pending,
    applied: applied ?? null,
    approvedObservation: proof.receipt.invariant.observation
  })
  const observation = envelope.approvedObservation,
    pg = proof.receipt.invariant.pg
  const binding = (
    await db.query<{ binding_digest: string }>(
      'SELECT binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1',
      [p.operationId]
    )
  ).rows[0]
  if (
    !binding ||
    binding.binding_digest !== pg.resourceBindingDigest ||
    !reviewSame(current.saved.resourceRequest, envelope.request) ||
    resource.identity !== (await contentAttachmentIdentity(envelope.request.resourceRequest)) ||
    observation.resources.digest !== (await collectionDigest(current.saved.baseline)) ||
    observation.resources.resourceIdentity !== resource.identity ||
    pg.catalogueRequestDigest !== plan.requestDigest ||
    pg.catalogueReceiptDigest !== plan.receipt.digest ||
    observation.catalogue.requestDigest !== plan.requestDigest ||
    observation.catalogue.planDigest !== plan.planDigest ||
    observation.catalogue.receiptDigest !== plan.receipt.digest ||
    !reviewSame(observation.source.scope, envelope.source.scope) ||
    !reviewSame(observation.source.target, envelope.source.target) ||
    observation.source.freezeDigest !== envelope.source.freezeDigest ||
    observation.source.checkpointDigest !== envelope.source.checkpoint.digest
  )
    throw reviewDenied()
  if (
    applied &&
    (head.d1_prepared_digest !== heads.prepared.preparedDigest || head.applied_grant_digest !== applied.digest)
  )
    throw reviewDenied()
  return envelope
}

export async function authorizeCustomerTransferRecoveryAdmission(
  input: unknown,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}
) {
  const envelope = TransferRecoveryAdmissionRequestSchema.parse(input),
    digest = await collectionDigest(envelope)
  const route = {
    siteId: envelope.source.scope.siteId,
    requestId: envelope.inspection.pg.requestId,
    expectedRevision: envelope.inspection.pg.requestRevision
  }
  const operator = { actorId: envelope.inspection.operatorId, loginSessionHash: envelope.inspection.loginSessionHash }
  return (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const stage = envelope.purpose === 'admission-pending' ? 'pending' : 'applied'
    const check = async () => {
      const saved = await retainedRecoveryAdmission(db, envelope.pending.body.admissionId)
      if (!reviewSame(saved.pending, envelope.pending)) throw reviewDenied()
      const application =
        stage === 'applied' ? await retainedRecoveryApplication(db, envelope.pending.body.admissionId) : undefined
      const applied = application?.applied
      if (!reviewSame(applied ?? null, envelope.applied)) throw reviewDenied()
      const proof = await recoveryAdmissionAuthority(db, route, operator, envelope.pending.body.reviewId, stage)
      const expected = await recoveryAdmissionEnvelope(db, proof, saved.pending, applied)
      const heads = await recoveryAdmissionHeads(saved.pending, applied)
      for (const request of [saved.request, application?.request].filter((v) => v !== undefined))
        if (
          !reviewSame(route, {
            siteId: request!.siteId,
            requestId: request!.requestId,
            expectedRevision: request!.expectedRevision
          }) ||
          !reviewSame(request!.operator, operator)
        )
          throw reviewDenied()
      if (application) await verifyRetainedPreparedAdmission(expected, application.prepared)
      const accepted = stage === 'pending' ? [heads.closed, heads.prepared] : [heads.prepared, heads.enabled]
      if (
        !accepted.some((h) => reviewSame(h, envelope.recovery)) ||
        !reviewSame({ ...expected, recovery: envelope.recovery }, envelope)
      )
        throw reviewDenied()
      return proof
    }
    await check()
    const proof = await check()
    const response = TransferRecoveryAdmissionAcknowledgmentSchema.parse({
      purpose: envelope.purpose,
      envelopeDigest: digest
    })
    await finishRecoveryAdmissionAuthority(db, proof)
    return response
  })
}

/** Validate the original complete prepared proof without rewriting it as a new
 * observation. The PG reference here is the exact prior pending version. */
export async function verifyRetainedPreparedAdmission(envelope: TransferRecoveryAdmissionRequest, input: unknown) {
  const heads = await recoveryAdmissionHeads(envelope.pending)
  const pendingEnvelope = TransferRecoveryAdmissionRequestSchema.parse({
    ...envelope,
    purpose: 'admission-pending',
    applied: null,
    recovery: heads.prepared,
    inspection: { ...envelope.inspection, pg: { ...envelope.inspection.pg, version: 3 } }
  })
  const digest = await collectionDigest(pendingEnvelope),
    value = TransferRecoveryPreparedVerificationSchema.parse(input)
  if (
    value.envelopeDigest !== digest ||
    value.observation.envelopeDigest !== digest ||
    !reviewSame(value.head, heads.prepared) ||
    !reviewSame(value.prepare, heads.prepare) ||
    !reviewSame(value.observation.recovery, {
      operationId: heads.prepared.operationId,
      intentDigest: heads.prepared.intentDigest,
      recoveryId: heads.prepared.recoveryId,
      epoch: 1,
      version: 2,
      mode: 'prepared'
    }) ||
    !reviewSame(
      recoveryAdmissionPhysicalEvidence(value.observation),
      recoveryAdmissionPhysicalEvidence(envelope.approvedObservation)
    )
  )
    throw reviewDenied()
  return value
}
