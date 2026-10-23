import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  ManagedTransferExecutionContextSchema,
  ManagedTransferExecutionPolicySchema
} from '~~/shared/pageStudio/managed-transfer-execution'
import {
  TransferRecoveryPhaseRequestSchema,
  TransferRecoveryPhaseAcknowledgmentSchema,
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

const Configuration = ManagedTransferExecutionPolicySchema.omit({
  formReceiptDigest: true
})
  .extend({
    accountId: z.string().regex(/^[a-f0-9]{32}$/),
    namespace: z.literal('xeroflow-page-studio-dispatch-staging')
  })
  .strict()
const RecoveryDescriptor = z
  .object({
    formatVersion: z.literal(1),
    kind: z.literal('managed-transfer-recovery-source-v1'),
    layoutDigest: z.string().regex(/^[a-f0-9]{64}$/),
    execution: Configuration
  })
  .strict()
/** Configuration is explicit provenance, not evidence that a runtime implements
 * the layout. The future effect adapter must verify its compiled layout/artifact. */
export function recoverySourceConfiguration(env: Record<string, unknown>) {
  if (
    env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' ||
    env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production'
  )
    throw reviewDenied()
  const ordinary = Configuration.parse(JSON.parse(String(env.MANAGED_TRANSFER_EXECUTION_POLICY)))
  const descriptor = RecoveryDescriptor.parse(
    JSON.parse(String(env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY))
  )
  const execution = descriptor.execution
  if (
    execution.accountId !== ordinary.accountId ||
    execution.namespace !== ordinary.namespace ||
    !reviewSame(execution.from, ordinary.from) ||
    execution.to.digest === ordinary.to.digest ||
    execution.to.digest === execution.from.digest
  )
    throw reviewDenied()
  return { ordinary, descriptor }
}
type SourceInput = z.infer<typeof TransferRecoverySourceInputSchema>
/** This first phase permits only absent or exactly recovery-associated source
 * execution. Every other later phase remains denied. Never reused by admission. */
async function sourceProgress(
  db: PageStudioQueryClient,
  context: Awaited<ReturnType<typeof recoveryCurrentContext>>,
  applied: Awaited<ReturnType<typeof retainedRecoveryApplication>>['applied'],
  config: ReturnType<typeof recoverySourceConfiguration>
) {
  const intent = context.intent
  await assertManagedTransferSource(db, intent)
  for (const table of laterTables) {
    if (table === 'executions') continue
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
/** Current PG source-phase proof only. Does not certify actual D1 enabled/event
 * state, physical observations or provider permission. */
export async function recoverySourcePhaseAuthority(
  db: PageStudioQueryClient,
  input: SourceInput,
  env: Record<string, unknown>
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
  const saved = await sourceProgress(db, context, application.applied, config)
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
  if (!reviewSame(await sourceProgress(db, owner, application.applied, config), saved)) throw reviewDenied()
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
  return { proof, enabled, request, saved, config }
}
export async function authorizeCustomerTransferRecoveryPhase(
  input: unknown,
  d: {
    env: Record<string, unknown>
    runTransaction?: RunPageStudioTransaction
  }
) {
  const wire = TransferRecoveryPhaseRequestSchema.parse(input),
    digest = await collectionDigest(wire)
  return (d.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const retained = await retainedRecoveryAdmission(db, wire.applied.body.admissionId)
    const value = TransferRecoverySourceInputSchema.parse({
      siteId: retained.request.siteId,
      requestId: wire.inspection.pg.requestId,
      expectedRevision: wire.inspection.pg.requestRevision,
      operator: {
        actorId: wire.inspection.operatorId,
        loginSessionHash: wire.inspection.loginSessionHash
      },
      body: {
        admissionId: wire.applied.body.admissionId,
        invocationId:
          wire.purpose === 'recovery-phase' ? wire.command.invocationId : wire.applied.body.admissionId
      }
    })
    const check = async () => {
      const current = await recoverySourcePhaseAuthority(db, value, d.env)
      const { purpose: _purpose, ...common } = current.enabled
      const actual =
        wire.purpose === 'recovery-enabled'
          ? wire
          : {
              purpose: 'recovery-enabled',
              ...common,
              pending: wire.pending,
              applied: wire.applied,
              recovery: wire.recovery,
              inspection: wire.inspection
            }
      if (!reviewSame(actual, current.enabled)) throw reviewDenied()
      if (
        wire.purpose === 'recovery-phase' &&
        (!reviewSame(wire.command.request, current.request) ||
          wire.command.requestDigest !== (await collectionDigest(current.request)))
      )
        throw reviewDenied()
      return current
    }
    await check()
    const current = await check()
    const result = TransferRecoveryPhaseAcknowledgmentSchema.parse({
      purpose: wire.purpose,
      envelopeDigest: digest
    })
    await finishRecoveryAdmissionAuthority(db, current.proof)
    if (!reviewSame(recoverySourceConfiguration(d.env), current.config)) throw reviewDenied()
    return result
  })
}
