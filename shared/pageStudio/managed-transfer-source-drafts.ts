// Wire mirror of the private Studio source fence protocol. No authority.
import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'
import { CmsStorageTargetSchema, ReleaseSha256Schema } from './cmsManaged'

export const ManagedTransferSourceDraftsRequestSchema = z.object({
  formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: ReleaseSha256Schema,
  executionIdentity: ReleaseSha256Schema,
  fenceIntent: z.object({ formatVersion: z.literal(1), nativeIntentDigest: ReleaseSha256Schema,
    scope: PageStudioContentScopeSchema, target: CmsStorageTargetSchema, transferId: z.uuid()
  }).strict()
}).strict().refine(r => r.fenceIntent.scope.environment === 'staging'
  && r.fenceIntent.nativeIntentDigest === r.intentDigest && r.fenceIntent.transferId === r.operationId,
'Managed source fence identity mismatch')

export const ManagedTransferSourceDraftsAuthorizationSchema = z.object({
  action: z.enum(['freeze', 'read']), request: ManagedTransferSourceDraftsRequestSchema
}).strict()

export const ManagedTransferSourceDraftsFenceReceiptSchema = z.object({
  digest: ReleaseSha256Schema, identityDigest: ReleaseSha256Schema,
  request: ManagedTransferSourceDraftsRequestSchema.shape.fenceIntent, state: z.literal('frozen')
}).strict()
