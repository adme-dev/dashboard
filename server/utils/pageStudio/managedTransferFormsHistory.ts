import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferFormsHistoryRequestSchema as Request, ManagedTransferFormsHistoryAuthorizationSchema as Authorization,
  FormDraftHistoryImportReceiptSchema as ImportReceipt } from '~~/shared/pageStudio/managed-transfer-forms-history'
import { ManagedTransferSourceDraftsFenceReceiptSchema as Fence } from '~~/shared/pageStudio/managed-transfer-source-drafts'
import { planFormDraftHistoryTransfer, expectedFormDraftHistoryImportReceipt, FormDraftTransferHistorySchema } from '~~/shared/pageStudio/managed-transfer-forms-history-plan'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { retainedManagedTransferSourceDrafts } from './managedTransferSourceDrafts'
import { retainedManagedTransferDestinationExecutionProof } from './managedTransferDestinationExecutionRead'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { runTransaction?: RunPageStudioTransaction, env: Record<string, unknown> }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed Forms history admission changed or is unavailable' })
const denied = () => createError({ statusCode: 403, statusMessage: 'Managed Forms history access denied' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Production Forms history admission is unavailable' })
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
function configured(env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
}
async function prerequisites(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  const source = await retainedManagedTransferSourceDrafts(db, intent)
  if (!source.saved) throw conflict()
  const destination = await retainedManagedTransferDestinationExecutionProof(db, intent, env)
  return { sourceRequest: source.saved, destinationRequest: destination.execution, destinationProof: destination.proof }
}
function transferIntent(current: Awaited<ReturnType<typeof prerequisites>>, fenceDigest: string) {
  return { formatVersion: 1 as const, transferId: current.sourceRequest.operationId, nativeIntentDigest: current.sourceRequest.intentDigest,
    source: { scope: current.sourceRequest.fenceIntent.scope, target: current.sourceRequest.fenceIntent.target, fenceDigest },
    destination: { scope: current.destinationRequest.freezeRequest.scope, target: current.destinationRequest.freezeRequest.target } }
}
async function retained(db: PageStudioQueryClient, intent: Intent, current: Awaited<ReturnType<typeof prerequisites>>) {
  const row = (await db.query<{
    request: unknown
    request_json: string
    request_digest: string
    intent_digest: string
    source_request_digest: string
    destination_proof_digest: string
    expected_receipt: unknown
    expected_receipt_json: string
    expected_receipt_digest: string
  }>(
    'SELECT * FROM page_studio_managed_transfer_forms_history_requests WHERE operation_id=$1', [intent.operationId])).rows[0]
  if (!row) return null
  const request = Request.parse(row.request), expected = ImportReceipt.parse(row.expected_receipt)
  const body = { destination: request.importRequest.intent.destination, formatVersion: 1, nativeIntentDigest: request.intentDigest,
    planDigest: request.importRequest.planDigest, source: { ...request.importRequest.intent.source, historyDigest: request.importRequest.historyDigest }, transferId: request.operationId }
  const { digest: receiptDigest, ...receiptBody } = expected
  if (!same({ sourceRequest: request.sourceRequest, destinationRequest: request.destinationRequest, destinationProof: request.destinationProof }, current)
    || request.operationId !== intent.operationId || request.intentDigest !== await digest(intent)
    || !same(request.importRequest.intent, transferIntent(current, request.importRequest.intent.source.fenceDigest))
    || row.intent_digest !== request.intentDigest || row.source_request_digest !== await digest(current.sourceRequest)
    || row.destination_proof_digest !== current.destinationProof.digest || row.request_json !== canonical(request) || row.request_digest !== await digest(request)
    || !same(expected, { ...body, importIdentityDigest: await digest(body), destinationHistoryDigest: expected.destinationHistoryDigest, digest: receiptDigest })
    || row.expected_receipt_json !== canonical(expected) || receiptDigest !== row.expected_receipt_digest || receiptDigest !== await digest(receiptBody)) throw conflict()
  return { request, expectedReceipt: expected }
}
/** Full history validation happens outside SQL locks. Retained identity is small,
 * exact and immutable. No remote mutation or authoring selection is performed. */
export async function prepareManagedTransferFormsHistory(input: unknown, dependencies: Dependencies) {
  const reference = Reference.parse(input)
  configured(dependencies.env)
  const before = await withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await prerequisites(db, intent, dependencies.env)
    return { ...current, saved: await retained(db, intent, current) }
  }, dependencies)
  if (before.saved) return before.saved.request
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, (input: unknown) => Promise<unknown>> | undefined
  const readFence = capturePageStudioRpcMethod(service, 'readManagedTransferSourceDraftsFence')
  const readHistory = capturePageStudioRpcMethod(service, 'readManagedTransferSourceDraftsHistory')
  if (!readFence || !readHistory) throw unavailable()
  const fence = Fence.parse(await readFence(structuredClone(before.sourceRequest)))
  const { digest: fenceDigest, ...fenceBody } = fence
  if (!same(fence.request, before.sourceRequest.fenceIntent) || fence.identityDigest !== await digest(before.sourceRequest.fenceIntent) || fenceDigest !== await digest(fenceBody)) throw conflict()
  const history = FormDraftTransferHistorySchema.parse(await readHistory(structuredClone(before.sourceRequest)))
  const plan = await planFormDraftHistoryTransfer(transferIntent(before, fenceDigest), history)
  if (!same(Fence.parse(await readFence(structuredClone(before.sourceRequest))), fence)) throw conflict()
  const request = Request.parse({ formatVersion: 1, ...reference, sourceRequest: before.sourceRequest, destinationRequest: before.destinationRequest,
    destinationProof: before.destinationProof, importRequest: { intent: transferIntent(before, fenceDigest), historyDigest: history.digest, planDigest: plan.digest } })
  const expected = await expectedFormDraftHistoryImportReceipt(plan)
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await prerequisites(db, intent, dependencies.env)
    if (!same(current, { sourceRequest: before.sourceRequest, destinationRequest: before.destinationRequest, destinationProof: before.destinationProof })) throw conflict()
    const saved = await retained(db, intent, current)
    if (saved) {
      if (!same(saved.request, request) || !same(saved.expectedReceipt, expected)) throw conflict()
      return saved.request
    }
    const json = canonical(request), receiptJson = canonical(expected)
    await db.query(`INSERT INTO page_studio_managed_transfer_forms_history_requests
      (operation_id,intent_digest,source_request_digest,destination_proof_digest,request,request_json,request_digest,expected_receipt,expected_receipt_json,expected_receipt_digest)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10)`, [reference.operationId, reference.intentDigest, await digest(current.sourceRequest),
      current.destinationProof.digest, json, json, await digest(request), receiptJson, receiptJson, expected.digest])
    return request
  }, dependencies)
}
export async function authorizeManagedTransferFormsHistory(input: unknown, dependencies: Dependencies) {
  const parsed = Authorization.safeParse(input)
  if (!parsed.success) throw denied()
  configured(dependencies.env)
  const auth = parsed.data
  return withReservedManagedTransfer({ operationId: auth.request.operationId, intentDigest: auth.request.intentDigest }, async (db, intent) => {
    const current = await prerequisites(db, intent, dependencies.env), saved = await retained(db, intent, current)
    if (!saved || !same(saved.request, auth.request)) throw denied()
    return auth
  }, dependencies)
}

/** Native historical admission read only; never a current provider proof. */
export async function readManagedTransferFormsHistoryAdmission(input: unknown, dependencies: Dependencies) {
  const reference = Reference.parse(input)
  configured(dependencies.env)
  return withReservedManagedTransfer(reference, async (db, intent) =>
    retained(db, intent, await prerequisites(db, intent, dependencies.env)), dependencies)
}

/** Caller holds original native transfer authority. Historical admission only. */
export async function retainedManagedTransferFormsHistoryAdmission(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  configured(env)
  return retained(db, intent, await prerequisites(db, intent, env))
}
