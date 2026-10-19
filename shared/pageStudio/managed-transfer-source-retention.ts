import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest as digest } from './collectionApi'
import { ReleaseSha256Schema as Digest } from './cmsManaged'
import { ManagedTransferCompletionReceiptSchema, requireManagedTransferCompletionReceipt } from './managed-transfer-completion'
import { ManagedTransferSourceDraftsRequestSchema } from './managed-transfer-source-drafts'

export const ManagedTransferSourceRetentionRequestSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  sourceRequest: ManagedTransferSourceDraftsRequestSchema, completion: ManagedTransferCompletionReceiptSchema }).strict()
export const ManagedTransferSourceRetentionAuthorizationSchema = z.object({ action: z.enum(['read', 'retain']), request: ManagedTransferSourceRetentionRequestSchema }).strict()
const Receipt = z.object({ request: ManagedTransferSourceDraftsRequestSchema.shape.fenceIntent, identityDigest: Digest, digest: Digest, state: z.enum(['frozen', 'retained']) }).strict()
const invalid = () => new Error('Terminal source retention identity differs')
export async function requireMatchingManagedTransferSourceRetentionRequest(input: unknown) {
  const request = ManagedTransferSourceRetentionRequestSchema.parse(input), { completion, sourceRequest } = request
  await requireManagedTransferCompletionReceipt(completion)
  if (completion.operationId !== request.operationId || completion.intentDigest !== request.intentDigest
    || sourceRequest.operationId !== request.operationId || sourceRequest.intentDigest !== request.intentDigest
    || canonical(completion.source.scope) !== canonical(sourceRequest.fenceIntent.scope) || canonical(completion.source.target) !== canonical(sourceRequest.fenceIntent.target)
    || new TextEncoder().encode(canonical(request)).length > 32768) throw invalid()
  return request
}
export async function requireMatchingManagedTransferSourceRetentionReceipt(input: unknown, requestInput: unknown, action: 'read' | 'retain') {
  const receipt = Receipt.parse(input), request = await requireMatchingManagedTransferSourceRetentionRequest(requestInput)
  const { digest: value, ...body } = receipt
  if ((action === 'retain' && receipt.state !== 'retained') || canonical(receipt.request) !== canonical(request.sourceRequest.fenceIntent)
    || receipt.identityDigest !== await digest(receipt.request) || value !== await digest(body)) throw invalid()
  return receipt
}
