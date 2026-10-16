// Immutable native handoff identity. This receipt alone never grants public or
// authoring access: readers must check its native association and current policy.
import { z } from 'zod'
import { PageStudioContentScopeSchema as Scope } from './businessContent'
import { CmsStorageTargetSchema, ReleaseSha256Schema as Digest, ReleaseScopedIdSchema } from './cmsManaged'
import { collectionCanonical as canonical, collectionDigest } from './collectionApi'

const endpoint = z.object({ scope: Scope, generation: z.uuid(), target: CmsStorageTargetSchema, freezeDigest: Digest,
  application: z.object({ id: z.uuid(), digest: Digest }).strict(),
  checkpoint: z.object({ id: ReleaseScopedIdSchema, digest: Digest }).strict(), contentId: z.uuid().nullable() }).strict()
export const ManagedTransferCompletionReceiptSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  copyProofDigest: Digest, historyReceiptDigest: Digest, source: endpoint, destination: endpoint,
  auditId: z.uuid(), completedAt: z.iso.datetime(), digest: Digest }).strict()
export type ManagedTransferCompletionReceipt = z.infer<typeof ManagedTransferCompletionReceiptSchema>

export async function requireManagedTransferCompletionReceipt(input: unknown) {
  const receipt = ManagedTransferCompletionReceiptSchema.parse(input)
  const { source, destination } = receipt, { digest, ...body } = receipt
  if (source.scope.environment !== 'staging' || destination.scope.environment !== 'production'
    || canonical({ ...source.scope, environment: 'production' }) !== canonical(destination.scope)
    || source.generation === destination.generation || source.application.id === destination.application.id
    || source.checkpoint.id === destination.checkpoint.id || source.target.accountId !== destination.target.accountId
    || source.target.databaseId === destination.target.databaseId || source.target.name === destination.target.name
    || source.target.routeId === destination.target.routeId || digest !== await collectionDigest(body)) {
    throw new Error('Managed transfer completion identity is invalid')
  }
  return receipt
}
