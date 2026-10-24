import { createError } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoveryInspectInputSchema, TransferRecoveryInitialClosureResultSchema,
  TransferRecoveryInspectionViewSchema } from '~~/shared/pageStudio/transferRecoveryCoordinator'
import { TransferRecoveryInspectionRequestSchema } from '~~/shared/pageStudio/transferRecoveryInspection'
import { TransferRecoveryInventoryRequestSchema } from '~~/shared/pageStudio/transferRecoveryInventory'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import { authorizeCustomerTransferRecoveryInventory } from './customerTransferRecoveryInventory'
import { captureCustomerTransferRecoveryReconciliation } from './customerTransferRecoveryReconciliation'
import { captureRecoveryRpc } from './recoveryPrivateRpc'
import type { assertManagedTransferSource } from './managedTransferIntent'

type Intent = Parameters<typeof assertManagedTransferSource>[1]
const denied = () => createError({ statusCode: 409, statusMessage: 'Transfer recovery inspection could not be completed' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)

/** Explicit operator inspection only. Derive every private selector from the
 * retained request; close/observe outside PG locks, then capture immutable proof.
 * A durable close is retained after any failure. No automatic retry or admission.
 */
export async function inspectCustomerTransferRecovery(input: unknown, dependencies: {
  env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction
}) {
  const parsed = TransferRecoveryInspectInputSchema.parse(input)
  const { siteId, requestId, operator, body } = parsed
  const { env } = dependencies, run = dependencies.runTransaction ?? transactionWithoutRetry
  const service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const ensure = captureRecoveryRpc(service, 'ensureInitialManagedTransferRecoveryClosed')
  const observe = captureRecoveryRpc(service, 'observeManagedTransferRecoveryInventory')
  const validate = () => {
    ensure?.assertCurrent()
    observe?.assertCurrent()
    if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production' || dependencies.env !== env
      || env.PAGE_STUDIO_PROVISIONER !== service || !ensure || !observe) throw denied()
  }
  validate()
  const inventory = await run(async db => {
    const view = await readCustomerTransferRecovery({ siteId, requestId, operator,
      query: { expectedRevision: body.expectedRevision } }, { runTransaction: work => work(db) })
    const head = view.recovery
    if (!head || head.state !== 'reconciling' || head.expired || head.epoch !== 1
      || head.version !== body.expectedHeadVersion || head.recoveryId !== body.recoveryId) throw denied()
    const rows = (await db.query<{ operation_id: string, intent_digest: string, intent: Intent,
      resource_request: unknown, catalogue_request: unknown }>(`
      SELECT r.operation_id,r.intent_digest,i.intent,a.request AS resource_request,c.request AS catalogue_request
      FROM page_studio_transfer_requests r
      JOIN page_studio_managed_transfer_intents i ON i.operation_id=r.operation_id AND i.site_id=r.site_id
      JOIN page_studio_managed_transfer_resources a ON a.operation_id=r.operation_id
      JOIN page_studio_managed_transfer_destination_catalogues c ON c.operation_id=r.operation_id
      WHERE r.site_id=$1 AND r.request_id=$2 AND r.revision=$3 AND r.state='reserved'`,
    [siteId, requestId, body.expectedRevision])).rows
    const row = rows[0]
    if (rows.length !== 1 || !row) throw denied()
    const request = { operationId: row.operation_id, intentDigest: row.intent_digest, resourceRequest: row.resource_request }
    const source = row.intent.source
    const value = TransferRecoveryInventoryRequestSchema.parse({ purpose: 'inventory', request,
      requestDigest: await collectionDigest(request),
      recovery: { operationId: row.operation_id, intentDigest: row.intent_digest, recoveryId: body.recoveryId,
        epoch: 1, version: 1, mode: 'closed' },
      inspection: { operatorId: operator.actorId, loginSessionHash: operator.loginSessionHash,
        pg: { requestId, requestRevision: body.expectedRevision, recoveryId: body.recoveryId,
          epoch: 1, version: 1, deadline: head.deadline } },
      source: { scope: row.intent.authority.source, target: source.context.state.target,
        freezeDigest: source.context.state.freeze_digest, checkpoint: { checkpointId: source.checkpoint.id,
          objectKey: source.checkpoint.object_key, digest: source.checkpoint.digest } }, catalogueRequest: row.catalogue_request })
    // Validate the exact original source, bindings, catalogue proof and all nine
    // later-phase absences, finishing with current authority under these locks.
    await authorizeCustomerTransferRecoveryInventory(value, { runTransaction: work => work(db) })
    return value
  })
  validate()
  const captured = await captureCustomerTransferRecoveryReconciliation({ captureId: body.captureId, inventory }, {
    runTransaction: run,
    observe: async value => {
      validate()
      const closure = TransferRecoveryInspectionRequestSchema.options[1].parse({ purpose: 'close', inspection: value.inspection,
        transition: { eventId: value.recovery.recoveryId, previous: null, next: { ...value.recovery,
          admissionId: null, appliedDigest: null, deadline: null, pendingDigest: null, preparedDigest: null,
          reconciliationDigest: null, reviewDigest: null, revision: null } } })
      const digest = await collectionDigest(closure)
      validate()
      const closed = TransferRecoveryInitialClosureResultSchema.parse(await ensure!.call(structuredClone(closure)))
      validate()
      if (closed.eventId !== closure.transition.eventId || !same(closed.head, closure.transition.next)
        || closed.verificationDigest !== digest || (closed.kind === 'created-initial-closure' && closed.historicalProofDigest !== digest)) throw denied()
      const result = await observe!.call(structuredClone(value))
      validate()
      return result
    }
  })
  validate()
  return TransferRecoveryInspectionViewSchema.parse({ siteId, requestId, revision: body.expectedRevision,
    recoveryId: body.recoveryId, captureId: body.captureId, state: 'observed', historical: captured.historical,
    digest: captured.receipt.digest, observedStartedAt: captured.receipt.observedStartedAt,
    observedCompletedAt: captured.receipt.observedCompletedAt })
}
