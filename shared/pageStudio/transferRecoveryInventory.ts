import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'
import { CmsStorageTargetSchema, ReleaseSha256Schema } from './cmsManaged'
import { ContentAttachmentRequestSchema } from './content-attachment'
import { ManagedTransferDestinationCatalogueRequestSchema } from './managed-transfer-destination-catalogue'
import { TransferRecoveryInspectionRequestSchema } from './transferRecoveryInspection'

/** Separate private inspection purpose. Frozen observe/close schemas do not
 * admit this source/catalogue provenance or grant complete inventory access. */
export const TransferRecoveryInventoryRequestSchema = TransferRecoveryInspectionRequestSchema.options[0]
  .omit({ purpose: true }).extend({ purpose: z.literal('inventory'),
    source: z.object({ scope: PageStudioContentScopeSchema.refine(scope => scope.environment === 'staging'),
      target: CmsStorageTargetSchema, freezeDigest: ReleaseSha256Schema,
      checkpoint: ContentAttachmentRequestSchema.shape.anchor.extend({ objectKey: z.string().min(1).max(1024) }).strict()
    }).strict(), catalogueRequest: ManagedTransferDestinationCatalogueRequestSchema
  }).strict()
export const TransferRecoveryInventoryAcknowledgmentSchema = z.object({
  purpose: z.literal('inventory'), envelopeDigest: ReleaseSha256Schema
}).strict()
