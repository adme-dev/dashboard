// Exact Studio progress wire; ready alone is not native verification or activation.
import { z } from 'zod'
import { ReleaseSha256Schema as Digest } from './cmsManaged'
import { collectionCanonical as canonical, collectionDigest as digest } from './collectionApi'
import { ManagedTransferFormsHistoryRequestSchema as Request, FormDraftHistoryImportReceiptSchema as Receipt } from './managed-transfer-forms-history'

const refs = { operationId: z.uuid(), intentDigest: Digest, requestDigest: Digest }
export const ManagedTransferFormsHistoryStatusSchema = z.discriminatedUnion('state', [
  z.object({ ...refs, state: z.literal('resume-required') }).strict(),
  z.object({ ...refs, state: z.literal('pending') }).strict(),
  z.object({ ...refs, state: z.literal('ready'), receipt: Receipt }).strict()
])
/** Native retained expected receipt was derived independently from the complete
 * typed frozen history. Rehashing substituted destination rows is insufficient. */
export async function requireMatchingManagedTransferFormsHistoryStatus(input: unknown, requestInput: unknown, expectedInput: unknown) {
  const status = ManagedTransferFormsHistoryStatusSchema.parse(input), request = Request.parse(requestInput), expected = Receipt.parse(expectedInput)
  const invalid = () => new Error('Forms history progress or receipt differs from retained admission')
  if (status.operationId !== request.operationId || status.intentDigest !== request.intentDigest || status.requestDigest !== await digest(request)) throw invalid()
  if (status.state === 'ready') {
    const { digest: receiptDigest, ...body } = status.receipt
    if (canonical(status.receipt) !== canonical(expected) || receiptDigest !== await digest(body)) throw invalid()
  }
  return status
}
