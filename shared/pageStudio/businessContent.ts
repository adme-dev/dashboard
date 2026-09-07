import { z } from 'zod'

// Wire contract v1 mirrors @xeroflow/protocol business-content at 758b701.
// Keep the standalone Worker contract and this API boundary compatible.
const ContentId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/)
const SiteId = z.union([z.string().min(3).max(64).regex(/^[a-z][a-z0-9_-]*$/), z.string().uuid()])
const AttributeKey = ContentId.refine(key => !['__proto__', 'constructor', 'prototype'].includes(key))
export const PageStudioContentScopeSchema = z.object({
  businessId: ContentId,
  clientId: ContentId,
  environment: z.enum(['preview', 'staging', 'production']),
  siteId: SiteId,
  tenantId: ContentId
}).strict()
export type PageStudioContentScope = z.infer<typeof PageStudioContentScopeSchema>

export const PageStudioContentRecordSchema = z.object({
  attributes: z.record(AttributeKey, z.union([
    z.string().max(4000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(500)).max(30)
  ])).refine(fields => Object.keys(fields).length <= 30),
  id: ContentId,
  status: z.enum(['draft', 'verified']),
  summary: z.string().max(4000),
  title: z.string().trim().min(1).max(120)
}).strict()
export type PageStudioContentRecord = z.infer<typeof PageStudioContentRecordSchema>

const Collections = z.array(z.object({
  id: ContentId,
  records: z.array(PageStudioContentRecordSchema).max(200)
    .refine(records => new Set(records.map(record => record.id)).size === records.length)
}).strict()).max(20).refine(collections => new Set(collections.map(collection => collection.id)).size === collections.length)
const bounded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 512_000
export const PageStudioBusinessContentSchema = z.object({
  collections: Collections,
  schemaVersion: z.literal(1),
  scope: PageStudioContentScopeSchema
}).strict().refine(bounded)
export type PageStudioBusinessContent = z.infer<typeof PageStudioBusinessContentSchema>

export const PageStudioContentEditSchema = z.object({
  collections: Collections,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1)
}).strict().refine(bounded)

export const PageStudioContentRevisionSchema = z.object({
  actorId: ContentId,
  content: PageStudioBusinessContentSchema,
  createdAt: z.string().min(1).max(64),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
}).strict()
export type PageStudioContentRevision = z.infer<typeof PageStudioContentRevisionSchema>
export type PageStudioContentState = PageStudioContentRevision | {
  actorId: null
  content: null
  createdAt: null
  revision: 0
}

export function samePageStudioContentScope(a: PageStudioContentScope, b: PageStudioContentScope): boolean {
  return a.tenantId === b.tenantId && a.clientId === b.clientId && a.businessId === b.businessId
    && a.siteId === b.siteId && a.environment === b.environment
}
