import { z } from 'zod'
import { CmsFreezeReceiptSchema, CmsObjectPinSchema, CmsPreparationReceiptSchema, ReleaseSha256Schema as Digest } from '~~/shared/pageStudio/cmsManaged'
import { ManagedTransferCopyGraphRequestSchema as Admission } from '~~/shared/pageStudio/managed-transfer-copy-contract'
import { ManagedTransferDestinationExecutionRequestSchema } from '~~/shared/pageStudio/managed-transfer-destination-execution'
import { ManagedTransferDestinationExecutionProofSchema } from '~~/shared/pageStudio/managed-transfer-destination-execution-result'
import { ManagedTransferSourceDraftsRequestSchema } from '~~/shared/pageStudio/managed-transfer-source-drafts'

const reference = { operationId: z.uuid(), intentDigest: Digest }
export const CopyContextSchema = z.object({ formatVersion: z.literal(1), ...reference, admission: Admission,
  sourceRequest: ManagedTransferSourceDraftsRequestSchema, destinationRequest: ManagedTransferDestinationExecutionRequestSchema,
  destinationProof: ManagedTransferDestinationExecutionProofSchema }).strict()
export const CopyReceiptSchema = z.object({ contentHead: CmsObjectPinSchema.nullable(), formatVersion: z.literal(1), freeze: CmsFreezeReceiptSchema,
  objects: z.array(z.object({ source: CmsObjectPinSchema, destination: CmsObjectPinSchema }).strict()).min(1).max(128),
  operations: z.array(CmsPreparationReceiptSchema).min(1).max(128), requestDigest: Digest, state: z.literal('prepared'), digest: Digest }).strict()
export const CopyGraphProofSchema = z.object({ formatVersion: z.literal(1), ...reference, requestDigest: Digest, contextDigest: Digest,
  copyReceipt: CopyReceiptSchema,
  graphReceipt: z.object({ checkpoint: z.object({ digest: Digest, etag: z.string().min(1).max(256), objectKey: z.string().min(1).max(2048) }).strict(),
    graph: z.object({ artifactBytes: z.array(z.string()), base: Admission.shape.sourceGraph.shape.base,
      destinationProof: z.unknown(), sourceProof: z.unknown(), requestDigest: Digest, proofDigest: Digest, state: z.literal('prepared'), version: z.literal(1) }).strict(),
    requestDigest: Digest, state: z.literal('prepared'), version: z.literal(1), digest: Digest }).strict(),
  destinationObjects: z.array(z.object({ actorId: z.string().min(1).max(128), body: z.unknown(), createdAt: z.iso.datetime(), head: z.literal(false),
    pin: CmsObjectPinSchema, schema: CmsObjectPinSchema.nullable() }).strict()).min(1).max(128), digest: Digest }).strict()
export const CopyGraphStatusSchema = z.discriminatedUnion('state', [
  z.object({ ...reference, requestDigest: Digest, contextDigest: Digest, state: z.enum(['pending', 'resume-required', 'disabled']) }).strict(),
  z.object({ ...reference, requestDigest: Digest, contextDigest: Digest, state: z.literal('ready'), proof: CopyGraphProofSchema }).strict()
])
