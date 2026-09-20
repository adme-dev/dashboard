// Wire mirror of @xeroflow/protocol collection-api.ts. Keep golden fixtures in sync.
import { z } from 'zod'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { CollectionDefinitionSchema, CollectionIdentitySchema } from './collectionDefinition'

const ReleaseScopedIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const ReleaseSha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const expectedVersion = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1)
export const CollectionDefinitionReadSchema = z
  .object({ id: CollectionIdentitySchema, scope: ContentScopeSchema, version: version.optional() })
  .strict()
export const CollectionDefinitionWriteSchema = z
  .object({
    actorId: ReleaseScopedIdSchema,
    definition: CollectionDefinitionSchema,
    expectedVersion,
    sha256: ReleaseSha256Schema
  })
  .strict()
  .refine(
    request => request.definition.version === request.expectedVersion + 1,
    'Definition version conflict'
  )
export const CollectionRecordReadSchema = z
  .object({
    collectionId: CollectionIdentitySchema,
    id: CollectionIdentitySchema,
    revision: version.optional(),
    scope: ContentScopeSchema
  })
  .strict()
export const CollectionRecordValuesSchema = z
  .record(CollectionIdentitySchema, z.union([z.string().max(4000), z.number().finite(), z.boolean()]))
  .refine(values => Object.keys(values).length <= 30, 'Too many values')
const recordShape = {
  archived: z.boolean(),
  collectionId: CollectionIdentitySchema,
  id: CollectionIdentitySchema,
  schemaVersion: version,
  scope: ContentScopeSchema,
  values: CollectionRecordValuesSchema
}
export const CollectionRecordWriteSchema = z
  .object({ ...recordShape, actorId: ReleaseScopedIdSchema, expectedRevision: expectedVersion })
  .strict()
export const CollectionRecordSchema = z.object({ ...recordShape, revision: version }).strict()
export const CollectionListSchema = z
  .object({
    scope: ContentScopeSchema,
    after: CollectionIdentitySchema.optional(),
    limit: z.number().int().min(1).max(100).default(50)
  })
  .strict()
export const CollectionRecordListSchema = CollectionListSchema.extend({
  collectionId: CollectionIdentitySchema,
  includeArchived: z.boolean().default(false)
}).strict()
const metadata = {
  actorId: ReleaseScopedIdSchema,
  createdAt: z.string().min(1).max(64),
  sha256: ReleaseSha256Schema
}
export const CollectionDefinitionRevisionSchema = z
  .object({ ...metadata, definition: CollectionDefinitionSchema })
  .strict()
export const CollectionRecordRevisionSchema = z
  .object({ ...metadata, record: CollectionRecordSchema })
  .strict()
export const CollectionDefinitionPageSchema = z
  .object({
    items: z.array(CollectionDefinitionRevisionSchema).max(100),
    nextCursor: CollectionIdentitySchema.nullable()
  })
  .strict()
export const CollectionRecordPageSchema = z
  .object({
    items: z.array(CollectionRecordRevisionSchema).max(100),
    nextCursor: CollectionIdentitySchema.nullable()
  })
  .strict()

export function collectionCanonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(collectionCanonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${collectionCanonical(object[key])}`)
    .join(',')}}`
}
export async function collectionDigest(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(collectionCanonical(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export const CollectionDefinitionEditSchema = z
  .object({
    definition: z.object(CollectionDefinitionSchema.shape).omit({ scope: true }).strict(),
    expectedVersion
  })
  .strict()
  .refine(value => value.definition.version === value.expectedVersion + 1, 'Definition version conflict')
export const CollectionRecordEditSchema = z
  .object({
    archived: z.boolean(),
    schemaVersion: version,
    values: CollectionRecordValuesSchema,
    expectedRevision: expectedVersion
  })
  .strict()
export type CollectionDefinitionRevision = z.infer<typeof CollectionDefinitionRevisionSchema>
export type CollectionRecordRevision = z.infer<typeof CollectionRecordRevisionSchema>
