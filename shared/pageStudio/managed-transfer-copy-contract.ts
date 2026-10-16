// Private transfer admission wire. This does not select a destination or publish.
import { z } from 'zod'
import { PageStudioContentScopeSchema as Scope } from './businessContent'
import { CmsApplicationManifestSchema, CmsFreezeReceiptSchema, CmsObjectPinSchema, CmsStorageTargetSchema,
  ReleaseSha256Schema as Digest, ReleaseScopedIdSchema, BuilderArtifactPinSchema } from './cmsManaged'
import { ContentAttachmentRequestSchema } from './content-attachment'

const reference = { operationId: z.uuid(), intentDigest: Digest }
const pin = z.object({ id: ReleaseScopedIdSchema, digest: Digest }).strict()
const actor = ContentAttachmentRequestSchema.shape.actor.extend({ kind: z.literal('agency-user') })
const mapping = z.object({ sourceObjectId: z.uuid(), destinationObjectId: z.uuid() }).strict()
export const ManagedTransferCopyGraphRequestSchema = z.object({ formatVersion: z.literal(1), ...reference, sourceDigest: Digest,
  destinationExecutionRequestDigest: Digest, destinationExecutionProofDigest: Digest, destinationExecutionIdentity: Digest,
  copy: z.object({ formatVersion: z.literal(1), transferId: z.uuid(), actor,
    source: z.object({ scope: Scope, target: CmsStorageTargetSchema, generation: z.uuid(), freezeDigest: Digest,
      application: pin.extend({ id: z.uuid() }), checkpoint: pin, contentHead: CmsObjectPinSchema.nullable(),
      objects: z.array(CmsObjectPinSchema).min(1).max(128) }).strict(),
    destination: z.object({ scope: Scope, target: CmsStorageTargetSchema, freezeReceipt: CmsFreezeReceiptSchema }).strict() }).strict(),
  sourceGraph: z.object({ scope: Scope, objects: z.array(CmsObjectPinSchema).min(1).max(128), artifactBytes: z.array(z.string().max(512000)).max(288),
    base: z.object({ scope: Scope, target: CmsStorageTargetSchema, generation: z.uuid(), freezeDigest: Digest,
      application: z.object({ manifest: CmsApplicationManifestSchema, digest: Digest }).strict(),
      checkpoint: pin.extend({ manifest: z.unknown() }), content: z.object({ pin: CmsObjectPinSchema.nullable(), revision: z.number().int().nonnegative() }).strict(),
      schemas: z.array(z.object({ objectId: z.uuid(), pin: CmsObjectPinSchema, bodyBytes: z.string().max(128000) }).strict()).max(128) }).strict() }).strict(),
  sourceObjects: z.array(z.object({ nativeId: z.uuid(), pin: CmsObjectPinSchema, body: z.unknown(), schema: CmsObjectPinSchema.nullable(),
    actorId: z.string().min(1), createdAt: z.iso.datetime(), head: z.boolean() }).strict()).min(1).max(128),
  sourceArtifactPins: z.array(BuilderArtifactPinSchema).max(288),
  destinationGraph: z.object({ scope: Scope, target: CmsStorageTargetSchema, freezeDigest: Digest, generation: z.uuid(), applicationId: z.uuid(),
    checkpointId: ReleaseScopedIdSchema, schemaObjects: z.array(mapping).max(128) }).strict(),
  objectIds: z.array(mapping).min(1).max(128),
  checkpointMetadata: z.object({ createdAt: z.iso.datetime(), userId: z.string().min(1) }).strict()
}).strict()
