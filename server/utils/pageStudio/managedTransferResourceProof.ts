import { z } from 'zod'
import { ContentAttachmentRequestSchema } from '~~/shared/pageStudio/content-attachment'
import { ManagedTransferReferenceSchema } from './managedTransferIntent'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Account = z.string().regex(/^[a-f0-9]{32}$/)
const Name = z.string().regex(/^ps-content-[a-f0-9]{32}$/)
/** Private provider evidence only. Native authority and exact request matching
 * are checked separately; this schema never grants permission to select it. */
export const ManagedTransferPhysicalResourcesSchema = ManagedTransferReferenceSchema.extend({
  version: z.literal(1),
  resourceIdentity: z.string().regex(/^cms_attach_[a-f0-9]{64}$/),
  preparationId: z.string().uuid(),
  preparationDigest: Digest,
  database: z.object({ accountId: Account, databaseId: z.string().uuid(), name: Name, schemaDigest: Digest }).strict(),
  worker: z.object({
    accountId: Account, databaseId: z.string().uuid(), scope: ContentAttachmentRequestSchema.shape.scope,
    namespace: z.literal('xeroflow-page-studio-dispatch-production'), scriptName: Name,
    ownerTag: z.string().regex(/^ps-owner-[a-f0-9]{32}$/), compatibilityDate: z.string().date(),
    runtimeDigest: Digest, setupDigest: Digest, etag: z.string().min(1).max(200)
  }).strict()
}).strict()
export const ManagedTransferProviderSchema = z.object({ accountId: Account, compatibilityDate: z.string().date() }).strict()
