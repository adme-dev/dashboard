import type { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoveryPendingInputSchema,
  TransferRecoveryAppliedInputSchema,
  TransferRecoveryPendingGrantSchema,
  TransferRecoveryAppliedGrantSchema,
  TransferRecoveryPreparedVerificationSchema,
  recoveryAdmissionPhysicalEvidence
} from '~~/shared/pageStudio/transferRecoveryAdmission'
import {
  recoveryAdmissionAuthority,
  finishRecoveryAdmissionAuthority,
  recoveryAdmissionHeads,
  recoveryAdmissionEnvelope,
  retainedRecoveryAdmission,
  retainedRecoveryApplication,
  verifyRetainedPreparedAdmission
} from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryReviewAuthority'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
interface Dependencies {
  runTransaction?: RunPageStudioTransaction
  env?: Record<string, unknown>
  /** Trusted server/test seam. No request field accepts a prepared proof. */
  verifyPrepared?: (input: unknown) => Promise<unknown>
}
const routeOf = (v: { siteId: string; requestId: string; expectedRevision: number }) => ({
  siteId: v.siteId,
  requestId: v.requestId,
  expectedRevision: v.expectedRevision
})

/** A1 only: immutable pending grant and exact approved->pending CAS. No D1 call. */
export async function beginCustomerTransferRecoveryAdmission(input: unknown, d: Dependencies = {}) {
  const value = TransferRecoveryPendingInputSchema.parse(input),
    route = routeOf(value),
    id = value.body.admissionId
  return (d.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const old =
      (await db.query('SELECT 1 FROM page_studio_transfer_recovery_admissions WHERE admission_id=$1', [id])).rows
        .length !== 0
    const proof = await recoveryAdmissionAuthority(
      db,
      route,
      value.operator,
      value.body.review.reviewId,
      old ? 'pending' : 'approved'
    )
    if (
      !reviewSame(value.body.review, {
        reviewId: proof.review.reviewId,
        revision: proof.review.revision,
        reviewDigest: proof.reviewDigest
      })
    )
      throw reviewDenied()
    let pending: z.infer<typeof TransferRecoveryPendingGrantSchema>
    if (old) {
      const saved = await retainedRecoveryAdmission(db, id)
      if (!reviewSame(saved.request, value)) throw reviewDenied()
      pending = saved.pending
    } else {
      const body = {
        formatVersion: 1,
        operationId: proof.context.intent.operationId,
        intentDigest: await collectionDigest(proof.context.intent),
        recoveryId: proof.context.head.recovery_id,
        epoch: 1,
        admissionId: id,
        reviewId: proof.review.reviewId,
        revision: proof.review.revision,
        reviewDigest: proof.reviewDigest,
        reconciliationDigest: proof.head.reconciliation_digest,
        pgVersion: 3,
        deadline: proof.deadline,
        prepareEventId: value.body.prepareEventId,
        enableEventId: value.body.enableEventId
      }
      pending = TransferRecoveryPendingGrantSchema.parse({ body, digest: await collectionDigest(body) })
      await finishRecoveryAdmissionAuthority(db, proof)
      await db.query(
        `INSERT INTO page_studio_transfer_recovery_admissions(admission_id,operation_id,recovery_id,review_id,revision,review_digest,body,digest,request)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          body.operationId,
          body.recoveryId,
          body.reviewId,
          body.revision,
          body.reviewDigest,
          body,
          pending.digest,
          value
        ]
      )
      if (
        (
          await db.query(
            `UPDATE page_studio_transfer_recovery_heads SET mode='pending',cas_version=3,admission_id=$1
        WHERE operation_id=$2 AND recovery_id=$3 AND epoch=1 AND mode='approved' AND cas_version=2
          AND review_revision=$4 AND review_digest=$5 AND reconciliation_digest=$6 AND deadline=$7::timestamptz RETURNING operation_id`,
            [
              id,
              body.operationId,
              body.recoveryId,
              body.revision,
              body.reviewDigest,
              body.reconciliationDigest,
              body.deadline
            ]
          )
        ).rows.length !== 1
      )
        throw reviewDenied()
    }
    const after = await recoveryAdmissionAuthority(db, route, value.operator, value.body.review.reviewId, 'pending')
    const envelope = await recoveryAdmissionEnvelope(db, after, pending)
    const result = { historical: old, pending, envelope }
    await finishRecoveryAdmissionAuthority(db, after)
    return result
  })
}
function preparedReader(d: Dependencies) {
  const adapter = d.verifyPrepared,
    env = d.env,
    service = env?.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const method = service?.verifyPreparedManagedTransferRecoveryAdmission
  const invoke = capturePageStudioRpcMethod(service, 'verifyPreparedManagedTransferRecoveryAdmission')
  const current = () => {
    if (d.verifyPrepared !== adapter || d.env !== env) throw reviewDenied()
    if (
      !adapter &&
      (!env ||
        env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production' ||
        env.PAGE_STUDIO_PROVISIONER !== service ||
        service?.verifyPreparedManagedTransferRecoveryAdmission !== method ||
        !invoke)
    )
      throw reviewDenied()
  }
  current()
  return {
    current,
    read: async (input: unknown) => {
      current()
      const result = await (adapter ?? invoke!)(structuredClone(input))
      current()
      return result
    }
  }
}
/** A3: fresh trusted D1 prepared/event/physical verification outside PG locks,
 * followed by exact pending->applied CAS. It never enables D1 or dispatches work. */
export async function applyCustomerTransferRecoveryAdmission(input: unknown, d: Dependencies = {}) {
  const value = TransferRecoveryAppliedInputSchema.parse(input),
    route = routeOf(value),
    id = value.body.admissionId
  const run = d.runTransaction ?? transactionWithoutRetry
  const verify = preparedReader(d)
  const before = await run(async (db) => {
    const saved = await retainedRecoveryAdmission(db, id)
    const old =
      (await db.query('SELECT 1 FROM page_studio_transfer_recovery_applications WHERE admission_id=$1', [id])).rows
        .length !== 0
    const proof = await recoveryAdmissionAuthority(
      db,
      route,
      value.operator,
      saved.pending.body.reviewId,
      old ? 'applied' : 'pending'
    )
    if (old) {
      const stored = await retainedRecoveryApplication(db, id)
      if (!reviewSame(stored.request, value)) throw reviewDenied()
      const envelope = await recoveryAdmissionEnvelope(db, proof, saved.pending, stored.applied)
      await verifyRetainedPreparedAdmission(envelope, stored.prepared)
      const replay = { historical: true, pending: saved.pending, applied: stored.applied, envelope }
      verify.current()
      await finishRecoveryAdmissionAuthority(db, proof)
      verify.current()
      return { replay }
    }
    const envelope = await recoveryAdmissionEnvelope(db, proof, saved.pending)
    const heads = await recoveryAdmissionHeads(saved.pending)
    const preparedEnvelope = { ...envelope, recovery: heads.prepared }
    const envelopeDigest = await collectionDigest(preparedEnvelope)
    await finishRecoveryAdmissionAuthority(db, proof)
    return { envelope: preparedEnvelope, envelopeDigest, pending: saved.pending, heads }
  })
  if (before.replay) return before.replay
  const observed = TransferRecoveryPreparedVerificationSchema.parse(await verify.read(before.envelope))
  if (
    observed.envelopeDigest !== before.envelopeDigest ||
    !reviewSame(observed.head, before.heads!.prepared) ||
    !reviewSame(observed.prepare, before.heads!.prepare) ||
    observed.observation.envelopeDigest !== before.envelopeDigest ||
    !reviewSame(observed.observation.recovery, {
      operationId: observed.head.operationId,
      intentDigest: observed.head.intentDigest,
      recoveryId: observed.head.recoveryId,
      epoch: 1,
      version: 2,
      mode: 'prepared'
    }) ||
    !reviewSame(
      recoveryAdmissionPhysicalEvidence(observed.observation),
      recoveryAdmissionPhysicalEvidence(before.envelope!.approvedObservation)
    )
  )
    throw reviewDenied()
  return run(async (db) => {
    const saved = await retainedRecoveryAdmission(db, id)
    if (!reviewSame(saved.pending, before.pending)) throw reviewDenied()
    const proof = await recoveryAdmissionAuthority(db, route, value.operator, saved.pending.body.reviewId, 'pending')
    const fresh = await recoveryAdmissionEnvelope(db, proof, saved.pending)
    if (!reviewSame({ ...fresh, recovery: before.heads!.prepared }, before.envelope)) throw reviewDenied()
    const { pgVersion: _v, prepareEventId: _p, enableEventId: _e, ...identity } = saved.pending.body
    const body = {
      ...identity,
      pgVersion: 4,
      pendingDigest: saved.pending.digest,
      preparedDigest: observed.head.preparedDigest
    }
    const applied = TransferRecoveryAppliedGrantSchema.parse({ body, digest: await collectionDigest(body) })
    await finishRecoveryAdmissionAuthority(db, proof)
    await db.query(
      `INSERT INTO page_studio_transfer_recovery_applications(admission_id,operation_id,body,digest,request,prepared)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [id, body.operationId, body, applied.digest, value, observed]
    )
    if (
      (
        await db.query(
          `UPDATE page_studio_transfer_recovery_heads SET mode='applied',cas_version=4,d1_prepared_digest=$1,applied_grant_digest=$2
      WHERE operation_id=$3 AND recovery_id=$4 AND epoch=1 AND mode='pending' AND cas_version=3 AND admission_id=$5
        AND review_digest=$6 AND reconciliation_digest=$7 AND deadline=$8::timestamptz RETURNING operation_id`,
          [
            body.preparedDigest,
            applied.digest,
            body.operationId,
            body.recoveryId,
            id,
            body.reviewDigest,
            body.reconciliationDigest,
            body.deadline
          ]
        )
      ).rows.length !== 1
    )
      throw reviewDenied()
    const after = await recoveryAdmissionAuthority(db, route, value.operator, body.reviewId, 'applied')
    const envelope = await recoveryAdmissionEnvelope(db, after, saved.pending, applied)
    const result = { historical: false, pending: saved.pending, applied, envelope }
    verify.current()
    await finishRecoveryAdmissionAuthority(db, after)
    verify.current()
    return result
  })
}
