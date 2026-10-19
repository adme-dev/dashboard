import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireMatchingManagedTransferDestinationExecutionStatus as matchingStatus,
  requireMatchingManagedTransferDestinationExecutionProof as matchingProof } from '~~/shared/pageStudio/managed-transfer-destination-execution-result'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { prepareManagedTransferDestinationExecution, retainedManagedTransferDestinationExecution } from './managedTransferDestinationExecution'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const conflict = () => createError({ statusCode: 409, statusMessage: 'Prepared destination execution evidence changed' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Prepared destination execution is unavailable' })

/** Private runtime preparation. Explicit verify alone retains independently
 * inspected evidence. Final transfer must inspect current extended storage again;
 * this historical proof never switches editing or publication authority. */
export async function coordinateManagedTransferDestinationExecution(input: unknown, dependencies: {
  env: Record<string, unknown>
  runTransaction?: RunPageStudioTransaction
}) {
  const parsed = Reference.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict().safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid destination execution action' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const { action, ...reference } = parsed.data, options = { runTransaction: dependencies.runTransaction }
  const methods = { status: 'readManagedTransferDestinationExecution', start: 'prepareManagedTransferDestinationExecution',
    resume: 'prepareManagedTransferDestinationExecution', verify: 'inspectManagedTransferDestinationExecution' }
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined, methods[action])
  const read = () => withReservedManagedTransfer(reference, (db, intent) => retainedManagedTransferDestinationExecution(db, intent, dependencies.env), options)
  const result = (state: string) => ({ operationId: reference.operationId, state })
  let original = await read()
  if (!original && action === 'status') return result('not-started')
  if (!original && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'start') original = await prepareManagedTransferDestinationExecution(reference, dependencies)
  if (!original) throw conflict()
  const observed = await remote(structuredClone(original), ...(['start', 'resume'].includes(action) ? [action] : []))
  let status: Awaited<ReturnType<typeof matchingStatus>>
  try {
    // Snapshot before asynchronous digest checks; the RPC cannot mutate either
    // our retained request or the evidence being independently reconstructed.
    status = await matchingStatus(structuredClone(observed), original)
  } catch { throw conflict() }
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await retainedManagedTransferDestinationExecution(db, intent, dependencies.env)
    if (!current || canonical(current) !== canonical(original)) throw conflict()
    const requestDigest = await collectionDigest(current)
    const row = (await db.query<{
      intent_digest: string
      request_digest: string
      execution_identity: string
      proof: unknown
      proof_json: string
      proof_digest: string
    }>(
      `SELECT intent_digest,request_digest,execution_identity,proof,proof_json,proof_digest
        FROM page_studio_managed_transfer_destination_execution_verifications WHERE operation_id=$1`, [reference.operationId])).rows[0]
    if (row) {
      let saved: Awaited<ReturnType<typeof matchingProof>>
      try {
        saved = await matchingProof(row.proof, current)
      } catch { throw conflict() }
      if (row.intent_digest !== reference.intentDigest || row.request_digest !== requestDigest
        || row.proof_json !== canonical(saved) || row.proof_digest !== saved.digest
        || row.execution_identity !== saved.envelope.execution.identity
        || (status.state === 'ready' && canonical(saved) !== canonical(status.proof))) throw conflict()
    }
    if (action === 'verify' && status.state === 'ready') {
      if (!row) {
        const proofJson = canonical(status.proof)
        if (new TextEncoder().encode(proofJson).byteLength > 65536) throw conflict()
        await db.query(`INSERT INTO page_studio_managed_transfer_destination_execution_verifications
          (operation_id,intent_digest,request_digest,execution_identity,proof,proof_json,proof_digest)
          VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [reference.operationId, reference.intentDigest,
          requestDigest, status.identity, proofJson, proofJson, status.proof.digest])
      }
      return result('execution-verified')
    }
    return result(status.state)
  }, options)
}
