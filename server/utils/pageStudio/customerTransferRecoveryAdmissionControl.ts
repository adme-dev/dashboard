import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoveryAdmissionControlInputSchema,
  TransferRecoveryAdmissionControlViewSchema,
  type TransferRecoveryAdmissionControlInput
} from '~~/shared/pageStudio/transferRecoveryAdmissionControl'
import {
  TransferRecoveryEnabledHeadSchema,
  TransferRecoveryEnableStorageSchema,
  TransferRecoveryAdmissionObservationSchema,
  recoveryAdmissionPhysicalEvidence
} from '~~/shared/pageStudio/transferRecoveryAdmission'
import {
  beginCustomerTransferRecoveryAdmission,
  applyCustomerTransferRecoveryAdmission
} from './customerTransferRecoveryAdmission'
import {
  recoveryAdmissionAuthority,
  recoveryAdmissionEnvelope,
  recoveryAdmissionHeads,
  retainedRecoveryAdmission,
  retainedRecoveryApplication,
  finishRecoveryAdmissionAuthority,
  verifyRetainedPreparedAdmission
} from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryReviewAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const EnabledReceipt = z
  .object({
    purpose: z.literal('enabled-admission'),
    envelopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    head: TransferRecoveryEnabledHeadSchema,
    enable: TransferRecoveryEnableStorageSchema,
    observation: TransferRecoveryAdmissionObservationSchema
  })
  .strict()
type Dependencies = { env: Record<string, unknown>; runTransaction?: RunPageStudioTransaction }
const routeOf = (v: TransferRecoveryAdmissionControlInput) => ({
  siteId: v.siteId,
  requestId: v.requestId,
  expectedRevision: v.expectedRevision
})
function capture(d: Dependencies, action: TransferRecoveryAdmissionControlInput['request']['action']) {
  const env = d.env,
    run = d.runTransaction
  const release = env.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    provisioning = env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT
  const service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const name =
    action === 'prepare'
      ? 'prepareManagedTransferRecoveryAdmission'
      : action === 'enable'
        ? 'enableManagedTransferRecoveryAdmission'
        : action === 'apply'
          ? 'verifyPreparedManagedTransferRecoveryAdmission'
          : null
  const method = name ? service?.[name] : null
  const current = () => {
    if (
      d.env !== env ||
      d.runTransaction !== run ||
      release !== 'production' ||
      provisioning !== 'production' ||
      env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== release ||
      env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== provisioning ||
      env.PAGE_STUDIO_PROVISIONER !== service ||
      (name && (!service || typeof method !== 'function' || service[name] !== method))
    )
      throw reviewDenied()
  }
  current()
  const transaction: RunPageStudioTransaction = (work) =>
    (run ?? transactionWithoutRetry)(async (db) => {
      current()
      const result = await work(db)
      current() // Inside the actual transaction, after its last awaited authority query.
      return result
    })
  return {
    current,
    transaction,
    call: async (input: unknown) => {
      current()
      if (typeof method !== 'function' || !service) throw reviewDenied()
      const result = structuredClone(await method.call(service, structuredClone(input)))
      current()
      return result
    }
  }
}
function sameCaller(
  saved: { siteId: string; requestId: string; expectedRevision: number; operator: unknown },
  v: TransferRecoveryAdmissionControlInput
) {
  if (
    !reviewSame(routeOf(v), {
      siteId: saved.siteId,
      requestId: saved.requestId,
      expectedRevision: saved.expectedRevision
    }) ||
    !reviewSame(saved.operator, v.operator)
  )
    throw reviewDenied()
}
async function retainedState(
  db: PageStudioQueryClient,
  v: TransferRecoveryAdmissionControlInput,
  stage: 'pending' | 'applied',
  id: string
) {
  const pending = await retainedRecoveryAdmission(db, id)
  sameCaller(pending.request, v)
  const application = stage === 'applied' ? await retainedRecoveryApplication(db, id) : undefined
  if (application) sameCaller(application.request, v)
  const proof = await recoveryAdmissionAuthority(
    db,
    routeOf(v),
    v.operator,
    pending.pending.body.reviewId,
    stage
  )
  const envelope = await recoveryAdmissionEnvelope(db, proof, pending.pending, application?.applied)
  if (application) await verifyRetainedPreparedAdmission(envelope, application.prepared)
  const heads = await recoveryAdmissionHeads(pending.pending, application?.applied)
  const enable = application
    ? TransferRecoveryEnableStorageSchema.parse({
        purpose: 'enable',
        eventId: pending.pending.body.enableEventId,
        previous: heads.prepared,
        appliedDigest: application.applied.digest
      })
    : null
  return { proof, envelope, heads, enable }
}
function view(
  v: TransferRecoveryAdmissionControlInput,
  proof: Awaited<ReturnType<typeof recoveryAdmissionAuthority>>,
  id: string | null,
  pgState: 'approved' | 'pending' | 'applied',
  d1State: 'unverified' | 'prepared' | 'enabled'
) {
  return TransferRecoveryAdmissionControlViewSchema.parse({
    ...routeOf(v),
    action: v.request.action,
    admissionId: id,
    review: {
      reviewId: proof.review.reviewId,
      revision: proof.review.revision,
      reviewDigest: proof.reviewDigest
    },
    deadline: proof.deadline,
    pgState,
    d1State
  })
}
/** Explicit single steps only. Current PG status never implies a D1 transition.
 * No caller-supplied grants, physical proofs, automatic retries or phase dispatch. */
export async function controlCustomerTransferRecoveryAdmission(input: unknown, d: Dependencies) {
  const v = TransferRecoveryAdmissionControlInputSchema.parse(input),
    c = capture(d, v.request.action)
  if (v.request.action === 'read') {
    const result = await c.transaction(async (db) => {
      const rows = (
        await db.query<{
          mode: 'approved' | 'pending' | 'applied'
          admission_id: string | null
          review_id: string
        }>(
          `SELECT h.mode,h.admission_id,r.review_id FROM page_studio_transfer_requests request
         JOIN page_studio_transfer_recovery_heads h ON h.operation_id=request.operation_id AND h.intent_digest=request.intent_digest
         JOIN page_studio_transfer_recovery_reviews r ON r.operation_id=h.operation_id AND r.recovery_id=h.recovery_id
           AND r.revision=h.review_revision AND r.review_digest=h.review_digest
         WHERE request.site_id=$1 AND request.request_id=$2 AND request.revision=$3 AND request.state='reserved'
           AND h.mode IN ('approved','pending','applied')`,
          [v.siteId, v.requestId, v.expectedRevision]
        )
      ).rows
      if (rows.length !== 1) throw reviewDenied()
      const row = rows[0]!
      const proof =
        row.mode === 'approved'
          ? await recoveryAdmissionAuthority(db, routeOf(v), v.operator, row.review_id, 'approved')
          : (await retainedState(db, v, row.mode, row.admission_id!)).proof
      const result = view(v, proof, row.admission_id, row.mode, 'unverified')
      await finishRecoveryAdmissionAuthority(db, proof)
      return result
    })
    c.current()
    return result
  }
  if (v.request.action === 'begin' || v.request.action === 'apply') {
    const { action, ...body } = v.request
    const value = { ...routeOf(v), operator: v.operator, body }
    const result =
      action === 'begin'
        ? await beginCustomerTransferRecoveryAdmission(value, { env: d.env, runTransaction: c.transaction })
        : await applyCustomerTransferRecoveryAdmission(value, { env: d.env, runTransaction: c.transaction })
    c.current()
    // Existing A3 replay may use retained prepared evidence. Never label it as a
    // fresh D1 observation; the explicit enable action obtains that proof.
    const response = TransferRecoveryAdmissionControlViewSchema.parse({
      ...routeOf(v),
      action,
      admissionId: body.admissionId,
      review: {
        reviewId: result.pending.body.reviewId,
        revision: result.pending.body.revision,
        reviewDigest: result.pending.body.reviewDigest
      },
      deadline: result.pending.body.deadline,
      pgState: action === 'begin' ? 'pending' : 'applied',
      d1State: 'unverified'
    })
    c.current()
    return response
  }
  const action = v.request.action,
    stage = action === 'prepare' ? 'pending' : 'applied',
    id = v.request.admissionId
  const before = await c.transaction(async (db) => {
    const state = await retainedState(db, v, stage, id)
    await finishRecoveryAdmissionAuthority(db, state.proof)
    return state
  })
  c.current()
  const observed = await c.call(before.envelope) // No PostgreSQL transaction across this remote operation.
  if (action === 'prepare') await verifyRetainedPreparedAdmission(before.envelope, observed)
  else {
    const receipt = EnabledReceipt.parse(observed),
      head = before.heads.enabled
    if (!head || !before.enable) throw reviewDenied()
    const digest = await collectionDigest({ ...before.envelope, recovery: head })
    if (
      receipt.envelopeDigest !== digest ||
      receipt.observation.envelopeDigest !== digest ||
      !reviewSame(receipt.head, head) ||
      !reviewSame(receipt.enable, before.enable) ||
      !reviewSame(receipt.observation.recovery, {
        operationId: head.operationId,
        intentDigest: head.intentDigest,
        recoveryId: head.recoveryId,
        epoch: 1,
        version: 3,
        mode: 'enabled'
      }) ||
      !reviewSame(
        recoveryAdmissionPhysicalEvidence(receipt.observation),
        recoveryAdmissionPhysicalEvidence(before.envelope.approvedObservation)
      )
    )
      throw reviewDenied()
  }
  c.current()
  const result = await c.transaction(async (db) => {
    const after = await retainedState(db, v, stage, id)
    if (
      !reviewSame(after.envelope, before.envelope) ||
      !reviewSame(after.heads, before.heads) ||
      !reviewSame(after.enable, before.enable)
    )
      throw reviewDenied()
    const result = view(v, after.proof, id, stage, action === 'prepare' ? 'prepared' : 'enabled')
    await finishRecoveryAdmissionAuthority(db, after.proof)
    return result
  })
  c.current()
  return result
}
