import { createError } from 'h3'
import { collectionCanonical as canonical } from '~~/shared/pageStudio/collectionApi'
import { requireMatchingManagedTransferDestinationExecutionProof as matchingProof } from '~~/shared/pageStudio/managed-transfer-destination-execution-result'
import { retainedManagedTransferDestinationExecution } from './managedTransferDestinationExecution'
import type { withReservedManagedTransfer } from './managedTransferIntent'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed transfer destination verification changed or is unavailable' })
/** Historical evidence only. Caller must hold original native authority; provider
 * effects must independently inspect current physical execution again. */
export async function retainedManagedTransferDestinationExecutionProof(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  const execution = await retainedManagedTransferDestinationExecution(db, intent, env)
  if (!execution) throw conflict()
  const row = (await db.query<{ intent_digest: string, request_digest: string, proof: unknown, proof_json: string, proof_digest: string, execution_identity: string }>(
    `SELECT intent_digest,request_digest,proof,proof_json,proof_digest,execution_identity FROM page_studio_managed_transfer_destination_execution_verifications WHERE operation_id=$1`, [intent.operationId])).rows[0]
  if (!row) throw conflict()
  const proof = await matchingProof(row.proof, execution)
  if (row.intent_digest !== execution.intentDigest || row.request_digest !== proof.requestDigest || row.proof_digest !== proof.digest
    || row.proof_json !== canonical(proof) || row.execution_identity !== proof.envelope.execution.identity) throw conflict()
  return { execution, proof }
}
