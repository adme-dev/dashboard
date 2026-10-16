import { capturePageStudioRpcMethod } from './privateRpc'
import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferExecutionStatusSchema } from '~~/shared/pageStudio/managed-transfer-execution'
import { ManagedTransferSourceDraftsRequestSchema as Request, ManagedTransferSourceDraftsAuthorizationSchema as Authorization, ManagedTransferSourceDraftsFenceReceiptSchema as Receipt } from '~~/shared/pageStudio/managed-transfer-source-drafts'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { retainedManagedTransferExecution } from './managedTransferExecution'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { z } from 'zod'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 403, statusMessage: 'Managed source draft access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed source draft transfer changed' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Managed source draft transfer is unavailable' })
export async function retainedManagedTransferSourceDrafts(db: PageStudioQueryClient, intent: Intent) {
  const execution = await retainedManagedTransferExecution(db, intent)
  if (!execution) throw conflict()
  const row = (await db.query<{ request: unknown, request_digest: string }>(
    'SELECT request,request_digest FROM page_studio_managed_transfer_source_drafts WHERE operation_id=$1', [intent.operationId])).rows[0]
  let saved: z.infer<typeof Request> | null = null
  if (row) {
    const parsed = Request.safeParse(row.request)
    if (!parsed.success || await collectionDigest(parsed.data) !== row.request_digest) throw denied()
    saved = parsed.data
    if (saved.operationId !== execution.operationId || saved.intentDigest !== execution.intentDigest
      || canonical(saved.fenceIntent.scope) !== canonical(execution.sourceScope)
      || canonical(saved.fenceIntent.target) !== canonical(execution.sourceTarget)) throw conflict()
  }
  return { execution, saved }
}

/** Reserve a source-only Forms fence request after independent execution
 * inspection. No remote mutation, destination selection or terminal decision. */
export async function prepareManagedTransferSourceDrafts(input: unknown, dependencies: Dependencies & { env: Record<string, unknown> }) {
  const parsed = Reference.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  const reference = parsed.data, options = { runTransaction: dependencies.runTransaction }
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as { inspectManagedTransferExecution?: (input: unknown) => Promise<unknown> } | undefined
  const inspect = capturePageStudioRpcMethod(service, 'inspectManagedTransferExecution')
  if (!inspect) throw unavailable()
  const before = await withReservedManagedTransfer(reference, retainedManagedTransferSourceDrafts, options)
  const observed = ManagedTransferExecutionStatusSchema.safeParse(await inspect(structuredClone(before.execution)))
  if (!observed.success || observed.data.operationId !== reference.operationId || observed.data.intentDigest !== reference.intentDigest
    || observed.data.state !== 'ready' || !observed.data.identity) throw conflict()
  const request = Request.parse({ formatVersion: 1, ...reference, executionIdentity: observed.data.identity,
    fenceIntent: { formatVersion: 1, nativeIntentDigest: reference.intentDigest, transferId: reference.operationId,
      scope: before.execution.sourceScope, target: before.execution.sourceTarget } })
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await retainedManagedTransferSourceDrafts(db, intent)
    if (canonical(before.execution) !== canonical(current.execution)
      || (current.saved && canonical(current.saved) !== canonical(request))) throw conflict()
    if (!current.saved) {
      await db.query(`INSERT INTO page_studio_managed_transfer_source_drafts(operation_id,intent_digest,request,request_digest)
        VALUES($1,$2,$3::jsonb,$4)`, [reference.operationId, reference.intentDigest, JSON.stringify(request), await collectionDigest(request)])
    }
    return request
  }, options)
}

/** Private callback only. The router separately verifies current physical
 * execution on every invocation; native checks original owner/plan/source.
 * Cancellation and retention require a future serialized terminal decision. */
export async function authorizeManagedTransferSourceDrafts(input: unknown, dependencies: Dependencies = {}) {
  const parsed = Authorization.safeParse(input)
  if (!parsed.success) throw denied()
  const auth = parsed.data, { operationId, intentDigest } = auth.request
  return withReservedManagedTransfer({ operationId, intentDigest }, async (db, intent) => {
    const current = await retainedManagedTransferSourceDrafts(db, intent)
    if (!current.saved || canonical(current.saved) !== canonical(auth.request)) throw denied()
    return auth
  }, dependencies)
}

/** Private progress only; frozen Forms remain at the original staging target.
 * Status cannot reserve/freeze. Lost responses preserve the same retained
 * request for explicit recovery, never cancellation or authoring selection. */
export async function coordinateManagedTransferSourceDrafts(input: unknown, dependencies: Dependencies & { env: Record<string, unknown> }) {
  const parsed = Reference.extend({ action: z.enum(['status', 'start', 'resume']) }).strict().safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid source draft transfer action' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const { action, ...reference } = parsed.data, options = { runTransaction: dependencies.runTransaction }
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, (value: unknown) => Promise<unknown>> | undefined
  const remote = capturePageStudioRpcMethod(service, action === 'status' ? 'readManagedTransferSourceDraftsFence' : 'freezeManagedTransferSourceDrafts')
  const read = () => withReservedManagedTransfer(reference, async (db, intent) => (await retainedManagedTransferSourceDrafts(db, intent)).saved, options)
  const result = (state: string) => ({ operationId: reference.operationId, state })
  let original = await read()
  if (!original && action === 'status') return result('not-started')
  if (!original && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'start') original = await prepareManagedTransferSourceDrafts(reference, dependencies)
  if (!original) throw conflict()
  const observed = await remote(structuredClone(original))
  let frozen = false
  if (observed !== null) {
    const proof = Receipt.safeParse(observed)
    if (!proof.success) throw conflict()
    const { digest, ...body } = proof.data
    if (canonical(body.request) !== canonical(original.fenceIntent)
      || body.identityDigest !== await collectionDigest(original.fenceIntent) || digest !== await collectionDigest(body)) throw conflict()
    frozen = true
  }
  if (action !== 'status' && !frozen) throw conflict()
  if (canonical(await read()) !== canonical(original)) throw conflict()
  return result(frozen ? 'frozen' : 'not-frozen')
}
