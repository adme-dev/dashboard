import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { FormDraftHistoryImportReceiptSchema as Receipt } from '~~/shared/pageStudio/managed-transfer-forms-history'
import { requireMatchingManagedTransferFormsHistoryStatus as matchingStatus } from '~~/shared/pageStudio/managed-transfer-forms-history-result'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { readManagedTransferFormsHistoryAdmission, prepareManagedTransferFormsHistory, retainedManagedTransferFormsHistoryAdmission } from './managedTransferFormsHistory'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed Forms history verification differs or is unavailable' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Managed Forms history inspection is unavailable' })
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/** Original-authority caller only. This is immutable historical evidence, not
 * current provider authority or permission to skip final independent inspection. */
export async function retainedManagedTransferFormsHistoryVerification(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  const admission = await retainedManagedTransferFormsHistoryAdmission(db, intent, env)
  if (!admission) return null
  const row = (await db.query<{
    intent_digest: string
    request_digest: string
    receipt: unknown
    receipt_json: string
    receipt_digest: string
  }>('SELECT intent_digest,request_digest,receipt,receipt_json,receipt_digest FROM page_studio_managed_transfer_forms_history_verifications WHERE operation_id=$1', [intent.operationId])).rows[0]
  if (!row) return null
  const receipt = Receipt.parse(row.receipt), { digest: receiptDigest, ...body } = receipt
  const requestDigest = await digest(admission.request)
  if (row.intent_digest !== admission.request.intentDigest || row.request_digest !== requestDigest
    || row.receipt_digest !== receiptDigest || row.receipt_json !== canonical(receipt) || receiptDigest !== await digest(body)
    || !same(receipt, admission.expectedReceipt)) throw conflict()
  return { request: admission.request, requestDigest, receipt, receiptDigest }
}

/** Private progress and explicit independent verification only. No final
 * authoring selection, publication or source-fence terminal action. */
export async function coordinateManagedTransferFormsHistory(input: unknown, dependencies: Dependencies) {
  const parsed = Reference.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict().safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Forms history action' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const { action, ...reference } = parsed.data
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const remote = capturePageStudioRpcMethod(service, action === 'status'
    ? 'readManagedTransferFormsHistory'
    : action === 'verify' ? 'inspectManagedTransferFormsHistory' : 'prepareManagedTransferFormsHistory')
  let before = await readManagedTransferFormsHistoryAdmission(reference, dependencies)
  if (!before && action === 'status') return { operationId: reference.operationId, state: 'not-started' }
  if (!before && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'start') {
    await prepareManagedTransferFormsHistory(reference, dependencies)
    before = await readManagedTransferFormsHistoryAdmission(reference, dependencies)
  }
  if (!before) throw conflict()
  const original = before
  const response = structuredClone(await (action === 'start' || action === 'resume'
    ? remote(structuredClone(original.request), action)
    : remote(structuredClone(original.request))))
  let observed: Awaited<ReturnType<typeof matchingStatus>>
  try {
    observed = await matchingStatus(response, original.request, original.expectedReceipt)
  } catch {
    throw conflict()
  }
  if (action === 'verify' && observed.state !== 'ready') throw conflict()
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await retainedManagedTransferFormsHistoryAdmission(db, intent, dependencies.env)
    if (!same(current, original)) throw conflict()
    if (action !== 'verify' || observed.state !== 'ready') return { operationId: reference.operationId, state: observed.state }
    const previous = await retainedManagedTransferFormsHistoryVerification(db, intent, dependencies.env)
    if (previous && !same(previous.receipt, observed.receipt)) throw conflict()
    if (!previous) {
      const json = canonical(observed.receipt)
      await db.query(`INSERT INTO page_studio_managed_transfer_forms_history_verifications
        (operation_id,intent_digest,request_digest,receipt,receipt_json,receipt_digest) VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
      [reference.operationId, reference.intentDigest, observed.requestDigest, json, json, observed.receipt.digest])
    }
    return { operationId: reference.operationId, state: 'verified', receiptDigest: observed.receipt.digest }
  }, dependencies)
}
