// Private wire mirror of Studio's destination catalogue request. Shape and
// matching establish identity only; original native authority is separate.
import { z } from 'zod'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity } from './content-attachment'
import { collectionCanonical, collectionDigest } from './collectionApi'
import { ReleaseSha256Schema as Digest } from './cmsManaged'

const Reference = z.object({ operationId: z.uuid(), intentDigest: Digest })
const Account = z.string().regex(/^[a-f0-9]{32}$/)
const Name = z.string().regex(/^ps-content-[a-f0-9]{32}$/)
const Resources = Reference.extend({ resourceRequest: ContentAttachmentRequestSchema }).strict().refine(r =>
  r.resourceRequest.operationId === `transfer_${r.operationId}`
  && r.resourceRequest.scope.environment === 'production'
  && r.resourceRequest.actor.kind === 'agency-user'
  && r.resourceRequest.policyVersion === 'content-attachment-v1', 'Managed transfer resource identity mismatch')
const PhysicalResources = Reference.extend({
  version: z.literal(1), resourceIdentity: z.string().regex(/^cms_attach_[a-f0-9]{64}$/),
  preparationId: z.uuid(), preparationDigest: Digest,
  database: z.object({ accountId: Account, databaseId: z.uuid(), name: Name, schemaDigest: Digest }).strict(),
  worker: z.object({
    accountId: Account, databaseId: z.uuid(), scope: ContentAttachmentRequestSchema.shape.scope,
    namespace: z.literal('xeroflow-page-studio-dispatch-production'), scriptName: Name,
    ownerTag: z.string().regex(/^ps-owner-[a-f0-9]{32}$/), compatibilityDate: z.iso.date(),
    runtimeDigest: Digest, setupDigest: Digest, etag: z.string().min(1).max(200)
  }).strict()
}).strict()
export const ManagedTransferDestinationCatalogueRequestSchema = Reference.extend({
  formatVersion: z.literal(1), resourceRequest: Resources, baseline: PhysicalResources
}).strict().refine(r => r.operationId === r.resourceRequest.operationId && r.operationId === r.baseline.operationId
  && r.intentDigest === r.resourceRequest.intentDigest && r.intentDigest === r.baseline.intentDigest,
'Managed destination catalogue identity mismatch')
export const ManagedTransferDestinationCatalogueAuthorizationSchema = z.object({
  action: z.enum(['prepare', 'read']), request: ManagedTransferDestinationCatalogueRequestSchema
}).strict()

/** Same proof matching as Studio; no provider query or admission side effect. */
export async function requireMatchingManagedTransferDestinationCatalogueRequest(input: unknown) {
  const request = ManagedTransferDestinationCatalogueRequestSchema.parse(input)
  const attachment = request.resourceRequest.resourceRequest, proof = request.baseline
  const identity = await contentAttachmentIdentity(attachment)
  if (proof.resourceIdentity !== identity
    || collectionCanonical(proof.worker.scope) !== collectionCanonical(attachment.scope)
    || proof.worker.runtimeDigest !== attachment.runtimeDigest || proof.database.schemaDigest !== attachment.schemaDigest
    || proof.worker.databaseId !== proof.database.databaseId || proof.worker.accountId !== proof.database.accountId
    || proof.worker.setupDigest !== await collectionDigest({ attachmentIdentity: identity, mode: attachment.mode })
    || new TextEncoder().encode(collectionCanonical(request)).byteLength > 65536) {
    throw new Error('Managed destination catalogue evidence mismatch')
  }
  return request
}
