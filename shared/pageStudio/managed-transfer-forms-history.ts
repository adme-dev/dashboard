// Private exact admission, never caller-selected storage or history bytes.
import { z } from 'zod'
import { ReleaseSha256Schema as Digest } from './cmsManaged'
import { ManagedTransferSourceDraftsRequestSchema } from './managed-transfer-source-drafts'
import { ManagedTransferDestinationExecutionRequestSchema } from './managed-transfer-destination-execution'
import { ManagedTransferDestinationExecutionProofSchema } from './managed-transfer-destination-execution-result'
import { FormDraftHistoryTransferIntentSchema } from './managed-transfer-forms-history-plan'

export const ManagedTransferFormsHistoryRequestSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  sourceRequest: ManagedTransferSourceDraftsRequestSchema, destinationRequest: ManagedTransferDestinationExecutionRequestSchema,
  destinationProof: ManagedTransferDestinationExecutionProofSchema,
  importRequest: z.object({ intent: FormDraftHistoryTransferIntentSchema, historyDigest: Digest, planDigest: Digest }).strict()
}).strict()
export const ManagedTransferFormsHistoryAuthorizationSchema = z.object({ action: z.enum(['prepare', 'read']), request: ManagedTransferFormsHistoryRequestSchema }).strict()
export const FormDraftHistoryImportReceiptSchema = FormDraftHistoryTransferIntentSchema.extend({
  source: FormDraftHistoryTransferIntentSchema.shape.source.extend({ historyDigest: Digest }).strict(),
  planDigest: Digest, importIdentityDigest: Digest, destinationHistoryDigest: Digest, digest: Digest
}).strict()
