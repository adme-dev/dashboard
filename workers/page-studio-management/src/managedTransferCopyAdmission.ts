import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferCopyGraphRequestSchema as Request } from '~~/shared/pageStudio/managed-transfer-copy-contract'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from '~~/server/utils/pageStudio/managedTransferIntent'
import { retainedManagedTransferDestinationExecutionProof as state } from '~~/server/utils/pageStudio/managedTransferDestinationExecutionRead'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { createTransferCopyReaders, planTransferCopyGraph } from './transfer/copyPlan'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed transfer copy admission changed or is unavailable' })
function configured(env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') {
    throw createError({ statusCode: 503, statusMessage: 'Production transfer admission is unavailable' })
  }
}
async function retained(db: PageStudioQueryClient, intent: Intent, current: Awaited<ReturnType<typeof state>>) {
  const row = (await db.query<{ intent_digest: string, request: unknown, request_json: string, request_digest: string, destination_proof_digest: string }>(
    `SELECT intent_digest,request,request_json,request_digest,destination_proof_digest FROM page_studio_managed_transfer_copy_graph_requests WHERE operation_id=$1`, [intent.operationId])).rows[0]
  if (!row) return null
  const request = Request.parse(row.request)
  const expected = await planTransferCopyGraph(intent, current.execution, current.proof, { checkpoint: request.sourceGraph.base.checkpoint,
    artifactBytes: request.sourceGraph.artifactBytes, objects: request.sourceObjects.map(({ nativeId: _, ...object }) => object) }, request.checkpointMetadata.createdAt)
  if (row.intent_digest !== current.execution.intentDigest || row.destination_proof_digest !== current.proof.digest
    || row.request_json !== canonical(request) || row.request_digest !== await collectionDigest(request) || canonical(expected) !== canonical(request)) throw conflict()
  return request
}
export async function readManagedTransferCopyGraph(input: unknown, dependencies: Dependencies) {
  const reference = Reference.parse(input)
  configured(dependencies.env)
  return withReservedManagedTransfer(reference, async (db, intent) => retained(db, intent, await state(db, intent, dependencies.env)), dependencies)
}

/** Save exact original copy/graph admission, with read-only discovery outside
 * native SQL locks. No destination write, metadata selection or publication. */
export async function prepareManagedTransferCopyGraph(input: unknown, dependencies: Dependencies) {
  const reference = Reference.parse(input)
  configured(dependencies.env)
  const discover = createTransferCopyReaders(dependencies.env)
  const before = await withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await state(db, intent, dependencies.env)
    return { intent, ...current, saved: await retained(db, intent, current) }
  }, dependencies)
  if (before.saved) return structuredClone(before.saved)
  const discovered = await discover(before.intent)
  const proposed = await planTransferCopyGraph(before.intent, before.execution, before.proof, discovered, new Date().toISOString())
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await state(db, intent, dependencies.env)
    if (canonical(current.execution) !== canonical(before.execution) || canonical(current.proof) !== canonical(before.proof)) throw conflict()
    const saved = await retained(db, intent, current)
    if (saved) return structuredClone(saved)
    const json = canonical(proposed)
    await db.query(`INSERT INTO page_studio_managed_transfer_copy_graph_requests
      (operation_id,intent_digest,destination_proof_digest,request,request_json,request_digest)
      VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [reference.operationId, reference.intentDigest, current.proof.digest, json, json, await collectionDigest(proposed)])
    return structuredClone(proposed)
  }, dependencies)
}
