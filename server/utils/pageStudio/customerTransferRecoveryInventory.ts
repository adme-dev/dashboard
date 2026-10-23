import { createError } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { planManagedTransferDestinationCatalogue } from '~~/shared/pageStudio/managed-transfer-destination-catalogue-result'
import { TransferRecoveryInventoryRequestSchema, TransferRecoveryInventoryAcknowledgmentSchema } from '~~/shared/pageStudio/transferRecoveryInventory'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { authorizeCustomerTransferRecoveryInspection } from './customerTransferRecoveryInspection'
import { retainedManagedTransferDestinationCatalogue } from './managedTransferDestinationCatalogue'
import type { assertManagedTransferSource } from './managedTransferIntent'

const denied = () => createError({ statusCode: 403, statusMessage: 'Complete recovery inventory inspection is unavailable' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
type Intent = Parameters<typeof assertManagedTransferSource>[1]
// Fixed complete PG later-phase admission map. Missing tables fail the query;
// absence is never inferred from a UI state, timeout, missing key or old lease.
const LaterAdmissions = `SELECT 'sourceExecution' AS phase FROM page_studio_managed_transfer_executions WHERE operation_id=$1
  UNION ALL SELECT 'sourceDrafts' FROM page_studio_managed_transfer_source_drafts WHERE operation_id=$1
  UNION ALL SELECT 'destinationExecution' FROM page_studio_managed_transfer_destination_executions WHERE operation_id=$1
  UNION ALL SELECT 'destinationVerification' FROM page_studio_managed_transfer_destination_execution_verifications WHERE operation_id=$1
  UNION ALL SELECT 'copyRequest' FROM page_studio_managed_transfer_copy_graph_requests WHERE operation_id=$1
  UNION ALL SELECT 'copyVerification' FROM page_studio_managed_transfer_copy_graph_verifications WHERE operation_id=$1
  UNION ALL SELECT 'formsHistoryRequest' FROM page_studio_managed_transfer_forms_history_requests WHERE operation_id=$1
  UNION ALL SELECT 'formsHistoryVerification' FROM page_studio_managed_transfer_forms_history_verifications WHERE operation_id=$1
  UNION ALL SELECT 'completion' FROM page_studio_managed_transfer_completions WHERE operation_id=$1`

/** Exact PG prerequisite acknowledgment only. The complete Studio observer
 * must still inspect both registries/physical resources and prove supported
 * noninterference. This helper neither claims eligibility nor stores a receipt. */
export async function authorizeCustomerTransferRecoveryInventory(input: unknown,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = TransferRecoveryInventoryRequestSchema.safeParse(input)
  if (!parsed.success) throw denied()
  const envelope = parsed.data
  const envelopeDigest = await collectionDigest(envelope)
  const { source, catalogueRequest, ...base } = envelope
  const inspection = { ...base, purpose: 'observe' as const }
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const authority = () => authorizeCustomerTransferRecoveryInspection(inspection, { runTransaction: work => work(db) })
      await authority()
      const read = async () => {
        const rows = (await db.query<{ intent: Intent }>('SELECT intent FROM page_studio_managed_transfer_intents WHERE operation_id=$1',
          [envelope.request.operationId])).rows
        const intent = rows[0]?.intent
        if (rows.length !== 1 || !intent || await collectionDigest(intent) !== envelope.request.intentDigest
          || !same(source, { scope: intent.authority.source, target: intent.source.context.state.target,
            freezeDigest: intent.source.context.state.freeze_digest,
            checkpoint: { checkpointId: intent.source.checkpoint.id, objectKey: intent.source.checkpoint.object_key,
              digest: intent.source.checkpoint.digest } })) throw denied()
        const current = await retainedManagedTransferDestinationCatalogue(db, intent)
        if (!current.saved || !same(current.saved, catalogueRequest)
          || !same(catalogueRequest.resourceRequest, envelope.request)) throw denied()
        const plan = await planManagedTransferDestinationCatalogue(current.saved)
        const verified = (await db.query<{ intent_digest: string, request_digest: string, plan_digest: string, receipt: unknown, receipt_digest: string }>(
          `SELECT intent_digest,request_digest,plan_digest,receipt,receipt_digest
            FROM page_studio_managed_transfer_catalogue_verifications WHERE operation_id=$1`, [intent.operationId])).rows
        const row = verified[0]
        if (verified.length !== 1 || !row || row.intent_digest !== envelope.request.intentDigest
          || row.request_digest !== plan.requestDigest || row.plan_digest !== plan.planDigest
          || row.receipt_digest !== plan.receipt.digest || !same(row.receipt, plan.receipt)) throw denied()
        if ((await db.query(LaterAdmissions, [intent.operationId])).rows.length !== 0) throw denied()
      }
      await read()
      await read()
      // Same transaction: original party/site locks stay held across all reads.
      // Final existing authority includes the last principal/head clock query.
      await authority()
      return TransferRecoveryInventoryAcknowledgmentSchema.parse({ purpose: 'inventory', envelopeDigest })
    })
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) {
      throw createError({ statusCode: 503, statusMessage: 'Recovery inventory is changing. Retry the same inspection.' })
    }
    throw error
  }
}
