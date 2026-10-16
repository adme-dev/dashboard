import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferCopyAuthorizationSchema as Authorization } from '~~/shared/pageStudio/managed-transfer-copy-authorization'
import { withReservedManagedTransfer, ManagedTransferReferenceSchema as Reference } from '~~/server/utils/pageStudio/managedTransferIntent'
import { retainedManagedTransferSourceDrafts } from '~~/server/utils/pageStudio/managedTransferSourceDrafts'
import { retainedManagedTransferDestinationExecutionProof } from '~~/server/utils/pageStudio/managedTransferDestinationExecutionRead'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { retainedManagedTransferCopyGraph } from './managedTransferCopyAdmission'
import { CopyContextSchema, CopyGraphProofSchema, CopyGraphStatusSchema } from './transfer/copyGraphContract'
import { verifyManagedTransferCopyContext, verifyManagedTransferCopyGraphProof, verifyManagedTransferCopyGraphStatus } from './generated/managed-transfer-copy/managedTransferCopyVerifier.mjs'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed transfer copy evidence changed or is unavailable' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Managed transfer copy inspection is unavailable' })
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
/** Existing original-authority transaction required. Historical admissions never
 * substitute for fresh physical inspection by the private executor. */
export async function retainedManagedTransferCopyContext(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const destination = await retainedManagedTransferDestinationExecutionProof(db, intent, env)
  const admission = await retainedManagedTransferCopyGraph(db, intent, destination)
  if (!admission) return null
  const source = await retainedManagedTransferSourceDrafts(db, intent)
  if (!source.saved) throw conflict()
  return CopyContextSchema.parse(await verifyManagedTransferCopyContext({ formatVersion: 1, operationId: intent.operationId,
    intentDigest: admission.intentDigest, admission, sourceRequest: source.saved, destinationRequest: destination.execution, destinationProof: destination.proof }))
}
export async function readManagedTransferCopyContext(input: unknown, dependencies: Dependencies) {
  return withReservedManagedTransfer(Reference.parse(input), (db, intent) => retainedManagedTransferCopyContext(db, intent, dependencies.env), dependencies)
}
export async function authorizeManagedTransferCopyGraph(input: unknown, dependencies: Dependencies) {
  const wire = Authorization.parse(input)
  return withReservedManagedTransfer({ operationId: wire.operationId, intentDigest: wire.intentDigest }, async (db, intent) => {
    const context = await retainedManagedTransferCopyContext(db, intent, dependencies.env)
    if (!context || wire.requestDigest !== await digest(context.admission) || wire.contextDigest !== await digest(context)) throw conflict()
    return structuredClone(wire)
  }, dependencies)
}
/** Immutable historical evidence only; final acceptance must independently
 * inspect again and compare under the original native authority transaction. */
export async function readVerifiedCopyGraph(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  const context = await retainedManagedTransferCopyContext(db, intent, env)
  if (!context) return null
  const row = (await db.query<{ intent_digest: string, request_digest: string, context_digest: string, proof: unknown, proof_json: string, proof_digest: string }>(
    'SELECT intent_digest,request_digest,context_digest,proof,proof_json,proof_digest FROM page_studio_managed_transfer_copy_graph_verifications WHERE operation_id=$1', [intent.operationId])).rows[0]
  if (!row) return null
  const proof = CopyGraphProofSchema.parse(await verifyManagedTransferCopyGraphProof(row.proof, context))
  const requestDigest = await digest(context.admission), contextDigest = await digest(context)
  if (row.intent_digest !== context.intentDigest || row.request_digest !== requestDigest || row.context_digest !== contextDigest
    || row.proof_json !== canonical(proof) || row.proof_digest !== proof.digest) throw conflict()
  return { request: context.admission, requestDigest, context, contextDigest, proof, proofDigest: proof.digest }
}
export async function coordinateManagedTransferCopyGraph(input: unknown, dependencies: Dependencies) {
  const { action, ...reference } = Reference.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict().parse(input)
  const method = action === 'status' ? 'readManagedTransferCopyGraph' : action === 'verify' ? 'inspectManagedTransferCopyGraph' : 'prepareManagedTransferCopyGraph'
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined, method)
  const original = await readManagedTransferCopyContext(reference, dependencies)
  if (!original && action === 'status') return { operationId: reference.operationId, state: 'not-started' }
  if (!original) throw conflict()
  if (!remote) throw unavailable()
  const raw = structuredClone(await (action === 'start' || action === 'resume'
    ? remote(structuredClone(original), action)
    : remote(structuredClone(original))))
  let observed: z.infer<typeof CopyGraphStatusSchema>
  try {
    observed = CopyGraphStatusSchema.parse(await verifyManagedTransferCopyGraphStatus(raw, original))
  } catch {
    throw conflict()
  }
  if (action === 'verify' && observed.state !== 'ready') throw conflict()
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await retainedManagedTransferCopyContext(db, intent, dependencies.env)
    if (!same(current, original)) throw conflict()
    if (action !== 'verify' || observed.state !== 'ready') return { operationId: reference.operationId, state: observed.state }
    const previous = await readVerifiedCopyGraph(db, intent, dependencies.env)
    if (previous && !same(previous.proof, observed.proof)) throw conflict()
    if (!previous) {
      const json = canonical(observed.proof)
      await db.query(`INSERT INTO page_studio_managed_transfer_copy_graph_verifications
        (operation_id,intent_digest,request_digest,context_digest,proof,proof_json,proof_digest) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [reference.operationId, reference.intentDigest, observed.requestDigest, observed.contextDigest, json, json, observed.proof.digest])
    }
    return { operationId: reference.operationId, state: 'verified', proofDigest: observed.proof.digest }
  }, dependencies)
}
