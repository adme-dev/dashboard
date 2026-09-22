// Wire mirror of Studio protocol cms-managed.ts at 6697b71. No visibility authority.
import { z } from 'zod'
import {
  PageStudioBusinessContentSchema as BusinessContentSchema,
  PageStudioContentScopeSchema as ContentScopeSchema
} from './businessContent'
import { CollectionRecordSchema } from './collectionApi'
import { CollectionDefinitionSchema, CollectionIdentitySchema } from './collectionDefinition'
import { ContentAttachmentRequestSchema } from './content-attachment'

export const ReleaseScopedIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const ReleaseSha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const BuilderArtifactPinSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/),
    kind: z.enum(['collection', 'component', 'action']),
    sha256: ReleaseSha256Schema,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
  })
  .strict()
export function contentScopeKey(input: z.infer<typeof ContentScopeSchema>) {
  const scope = ContentScopeSchema.parse(input)
  return JSON.stringify([
    scope.tenantId,
    scope.clientId,
    scope.businessId,
    scope.siteId,
    scope.environment
  ])
}
export const CMS_PREPARATION_MAX_ITEMS = 32
export const CMS_PREPARATION_MAX_BYTES = 1_500_000
export const CMS_INVENTORY_MAX_ROWS = 20
export const CMS_INVENTORY_MAX_BYTES = 1_048_576
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const { actor } = ContentAttachmentRequestSchema.shape
/** Storage incarnation supplied by the trusted native binding, never authority. */
export const CmsStorageTargetSchema = z
  .object({
    accountId: z.string().regex(/^[a-f0-9]{32}$/),
    collectionReceiptDigest: ReleaseSha256Schema,
    databaseId: z.uuid(),
    name: z.string().regex(/^ps-content-[a-f0-9]{32}$/),
    routeId: ReleaseScopedIdSchema,
    runtimeDigest: ReleaseSha256Schema,
    stagingReceiptDigest: ReleaseSha256Schema,
    workflowReceiptDigest: ReleaseSha256Schema
  })
  .strict()
export const CmsFreezeRequestSchema = z
  .object({
    actor,
    adoptionId: ReleaseScopedIdSchema,
    formatVersion: z.literal(1),
    scope: ContentScopeSchema,
    target: CmsStorageTargetSchema
  })
  .strict()
export const CmsFreezeReceiptBodySchema = z
  .object({
    createdAt: z.iso.datetime(),
    request: CmsFreezeRequestSchema,
    state: z.literal('frozen')
  })
  .strict()
export const CmsFreezeReceiptSchema = CmsFreezeReceiptBodySchema.extend({
  digest: ReleaseSha256Schema
}).strict()
const logicalIdentity = {
  collectionId: z.union([z.literal(''), CollectionIdentitySchema]),
  kind: z.enum(['content', 'schema', 'record']),
  recordId: z.union([z.literal(''), CollectionIdentitySchema]),
  version
}
function validIdentity(value: { kind: string, collectionId?: string, recordId?: string }) {
  if (value.kind === 'content') {
    return value.collectionId === '' && value.recordId === ''
  }
  return (
    value.collectionId !== ''
    && (value.kind === 'schema' ? value.recordId === '' : value.recordId !== '')
  )
}
export const CmsObjectPinSchema = z
  .object({
    ...logicalIdentity,
    bytes: z.number().int().min(1).max(512_000),
    freezeDigest: ReleaseSha256Schema,
    operationId: ReleaseScopedIdSchema,
    origin: z.enum(['legacy', 'prepared']),
    sha256: ReleaseSha256Schema
  })
  .strict()
  .refine(validIdentity, 'Invalid CMS logical identity')
export type CmsObjectPin = z.infer<typeof CmsObjectPinSchema>
const commonItem = { expectedBase: CmsObjectPinSchema.nullable(), version }
export const CmsPreparedItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...commonItem,
      body: BusinessContentSchema,
      kind: z.literal('content')
    })
    .strict(),
  z
    .object({
      ...commonItem,
      body: CollectionDefinitionSchema,
      kind: z.literal('schema')
    })
    .strict(),
  z
    .object({
      ...commonItem,
      body: CollectionRecordSchema,
      kind: z.literal('record'),
      schema: CmsObjectPinSchema
    })
    .strict()
])
export type CmsPreparedItem = z.infer<typeof CmsPreparedItemSchema>
export function cmsItemIdentity(item: CmsPreparedItem) {
  let collectionId = ''
  if (item.kind === 'schema') {
    collectionId = item.body.id
  }
  if (item.kind === 'record') {
    ;({ collectionId } = item.body)
  }
  return {
    collectionId,
    kind: item.kind,
    recordId: item.kind === 'record' ? item.body.id : '',
    version: item.version
  }
}
export function cmsLogicalKey(pin: { kind: string, collectionId?: string, recordId?: string }) {
  return JSON.stringify([pin.kind, pin.collectionId, pin.recordId])
}
/** Native supplies verified accepted bases. D1 validates exact bytes only;
 * neither this contract nor its preparation receipt makes anything visible. */
export const CmsPreparationSchema = z
  .object({
    action: BuilderArtifactPinSchema.extend({ kind: z.literal('action') })
      .strict()
      .nullable(),
    actor,
    candidateDigest: ReleaseSha256Schema.nullable(),
    formatVersion: z.literal(1),
    freezeDigest: ReleaseSha256Schema,
    items: z.array(CmsPreparedItemSchema).min(1).max(CMS_PREPARATION_MAX_ITEMS),
    operationId: ReleaseScopedIdSchema,
    scope: ContentScopeSchema
  })
  .strict()
  .superRefine((request, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    const keys = new Set<string>()
    for (const item of request.items) {
      const identity = cmsItemIdentity(item)
      const key = cmsLogicalKey(identity)
      if (keys.has(key)) {
        issue('Duplicate CMS effect identity')
      }
      keys.add(key)
      if (contentScopeKey(item.body.scope) !== contentScopeKey(request.scope)) {
        issue('CMS body scope mismatch')
      }
      if (item.version !== (item.expectedBase?.version ?? 0) + 1) {
        issue('CMS version must advance exactly once')
      }
      if (
        item.expectedBase
        && (cmsLogicalKey(item.expectedBase) !== key
          || item.expectedBase.freezeDigest !== request.freezeDigest)
      ) {
        issue('CMS expected base identity mismatch')
      }
      if (item.kind === 'schema' && item.version !== item.body.version) {
        issue('Schema version mismatch')
      }
      if (
        item.kind === 'record'
        && (item.version !== item.body.revision
          || item.schema.kind !== 'schema'
          || item.schema.collectionId !== item.body.collectionId
          || item.schema.version !== item.body.schemaVersion
          || item.schema.freezeDigest !== request.freezeDigest)
      ) {
        issue('Record schema pin mismatch')
      }
    }
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > CMS_PREPARATION_MAX_BYTES) {
      issue('CMS preparation byte limit exceeded')
    }
  })
export type CmsPreparation = z.infer<typeof CmsPreparationSchema>
export const CmsPreparationReceiptBodySchema = z
  .object({
    createdAt: z.iso.datetime(),
    freezeDigest: ReleaseSha256Schema,
    items: z.array(CmsObjectPinSchema).min(1).max(CMS_PREPARATION_MAX_ITEMS),
    operationId: ReleaseScopedIdSchema,
    requestDigest: ReleaseSha256Schema,
    scope: ContentScopeSchema,
    state: z.literal('prepared')
  })
  .strict()
export const CmsPreparationReceiptSchema = CmsPreparationReceiptBodySchema.extend({
  digest: ReleaseSha256Schema
}).strict()
export const CmsInventoryCursorSchema = z
  .object({
    ...logicalIdentity,
    formatVersion: z.literal(1),
    freezeDigest: ReleaseSha256Schema
  })
  .strict()
  .refine(validIdentity, 'Invalid inventory cursor identity')
export const CmsInventoryReadSchema = z
  .object({
    adoptionId: ReleaseScopedIdSchema,
    cursor: CmsInventoryCursorSchema.nullable(),
    freezeDigest: ReleaseSha256Schema,
    limit: z.number().int().min(1).max(CMS_INVENTORY_MAX_ROWS).default(CMS_INVENTORY_MAX_ROWS),
    scope: ContentScopeSchema
  })
  .strict()

// Native-only metadata request. Expected pins come from authorized accepted reads.
export const CmsCheckpointPinSchema = z
  .object({ id: ReleaseScopedIdSchema, digest: ReleaseSha256Schema })
  .strict()
export const CmsApplicationManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    scope: ContentScopeSchema,
    generation: z.uuid(),
    applicationId: z.uuid(),
    checkpoint: CmsCheckpointPinSchema,
    schemas: z
      .array(z.object({ collectionId: CollectionIdentitySchema, objectId: z.uuid() }).strict())
      .max(128),
    components: z.array(BuilderArtifactPinSchema.extend({ kind: z.literal('component') })).max(128),
    actions: z.array(BuilderArtifactPinSchema.extend({ kind: z.literal('action') })).max(128),
    previousApplicationId: z.uuid().nullable()
  })
  .strict()
  .refine(
    value =>
      new Set(value.schemas.map(item => item.collectionId)).size === value.schemas.length
        && new Set(value.components.map(item => item.id)).size === value.components.length
        && new Set(value.actions.map(item => item.id)).size === value.actions.length,
    'Duplicate application artifact identity'
  )
export const CmsNativeCommitSchema = z
  .object({
    formatVersion: z.literal(1),
    scope: ContentScopeSchema,
    operationId: ReleaseScopedIdSchema,
    generation: z.uuid(),
    target: CmsStorageTargetSchema,
    freezeDigest: ReleaseSha256Schema,
    preparedDigest: ReleaseSha256Schema,
    preparedRequestDigest: ReleaseSha256Schema,
    expectedApplication: z.object({ id: z.uuid(), digest: ReleaseSha256Schema }).strict(),
    expectedCheckpoint: CmsCheckpointPinSchema,
    expectedContent: CmsObjectPinSchema.nullable(),
    expectedSchemas: z.array(CmsObjectPinSchema).max(32),
    expectedRecords: z
      .array(
        z
          .object({
            collectionId: CollectionIdentitySchema,
            recordId: CollectionIdentitySchema,
            base: CmsObjectPinSchema.nullable()
          })
          .strict()
      )
      .max(32)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.expectedContent && value.expectedContent.kind !== 'content')
      ctx.addIssue({ code: 'custom', message: 'Invalid content base' })
    if (
      value.expectedSchemas.some(pin => pin.kind !== 'schema')
      || new Set(value.expectedSchemas.map(pin => pin.collectionId)).size
      !== value.expectedSchemas.length
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid schema expectations' })
    if (
      new Set(value.expectedRecords.map(pin => JSON.stringify([pin.collectionId, pin.recordId])))
        .size !== value.expectedRecords.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate record expectation' })
    for (const item of value.expectedRecords)
      if (
        item.base
        && (item.base.kind !== 'record'
          || item.base.collectionId !== item.collectionId
          || item.base.recordId !== item.recordId)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid record base' })
  })
export type CmsNativeCommit = z.infer<typeof CmsNativeCommitSchema>

/** Durable native intent, recorded under authority before remote freeze work. */
export const CmsAdoptionIntentSchema = z
  .object({
    formatVersion: z.literal(1),
    scope: ContentScopeSchema,
    actor,
    adoptionId: ReleaseScopedIdSchema,
    generation: z.uuid(),
    target: CmsStorageTargetSchema,
    expectedCheckpoint: CmsCheckpointPinSchema
  })
  .strict()
export type CmsAdoptionIntent = z.infer<typeof CmsAdoptionIntentSchema>
export const CmsAdoptionRecoverySchema = z
  .object({
    intent: CmsAdoptionIntentSchema,
    expectedAdoptionDigest: ReleaseSha256Schema,
    recoveryId: ReleaseScopedIdSchema,
    expectedRecoveryId: ReleaseScopedIdSchema.nullable(),
    actor
  })
  .strict()
