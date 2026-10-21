import { z } from 'zod'
import { PageStudioSessionClaimsSchema } from './sessionClaims'
import { CustomerEditorClaimsSchema } from '../../server/utils/pageStudio/customerEditorToken'
import { CmsAdoptionControlRequestSchema } from './cmsAdoptionControl'
import { PageStudioContentScopeSchema } from './businessContent'
import { CmsObjectPinSchema } from './cmsManaged'
import { PageStudioHistoryMutationSchema } from './draftHistory'

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const environment = z.enum(['staging', 'production'])
const actor = z.discriminatedUnion('role', [
  z.object({ role: z.literal('agency'), actorId: id, tenantId: id, canEdit: z.boolean() }).strict(),
  z.object({ role: z.literal('client'), actorId: id, clientId: id }).strict()
])
const login = z.object({ role: z.enum(['agency', 'client']), userId: id, tokenHash: digest,
  issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }).strict()
export const CmsManagementPrincipalSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('native-login'), request: z.object({ actor, login, siteId: z.uuid(), collectionAccess: z.boolean().optional() }).strict() }).strict(),
  z.object({ source: z.literal('studio-session'), claims: PageStudioSessionClaimsSchema.strict(), capability: z.enum(['workspace:checkpoint', 'model:invoke']) }).strict(),
  z.object({ source: z.literal('customer-session'), claims: CustomerEditorClaimsSchema, capability: z.enum(['workspace:checkpoint', 'workspace:create', 'cms:adopt']) }).strict()
])
export const CmsGraphCheckpointSchema = z.object({
  checkpointId: id, digest, objectKey: z.string().max(1024),
  createdAt: z.iso.datetime(), etag: z.string().min(1).max(256), userId: z.string().min(1).max(128),
  scope: PageStudioContentScopeSchema.pick({ tenantId: true, clientId: true, siteId: true }).strict()
}).strict()
export const CmsGraphTransitionSchema = z.object({
  operationId: id, candidateId: id, candidateDigest: digest, privacyReviewDigest: digest.optional(),
  expectedApplication: z.object({ id: z.uuid(), digest }).strict(), expectedCheckpoint: z.object({ id, digest }).strict(),
  expectedContent: CmsObjectPinSchema.nullable(), contentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  nextCheckpoint: CmsGraphCheckpointSchema,
  preparations: z.array(z.object({ operationId: id, requestDigest: digest, receiptDigest: digest }).strict()).max(32),
  summary: z.string().min(1).max(4000)
}).strict()
const checkpoint = z.object({ checkpoint: CmsGraphCheckpointSchema, expectedCheckpointId: id.nullable() }).strict()
const internal = z.object({ mode: z.enum(['checkpoint', 'ai-page', 'restore']).optional(), summary: z.string().max(4000).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(), expectedBaseDigest: digest.optional(), history: PageStudioHistoryMutationSchema.optional() }).strict()
const scope = { expectedEnvironment: environment, contentEnvironment: environment, principal: CmsManagementPrincipalSchema }
export const CmsManagementRequestSchema = z.discriminatedUnion('operation', [
  z.object({ ...scope, operation: z.literal('adoption'), body: CmsAdoptionControlRequestSchema }).strict(),
  z.object({ ...scope, operation: z.literal('transition'), body: CmsGraphTransitionSchema }).strict(),
  z.object({ ...scope, operation: z.literal('checkpoint'), body: z.object({ input: checkpoint, internal }).strict() }).strict(),
  z.object({ ...scope, operation: z.literal('restore'), body: PageStudioHistoryMutationSchema }).strict()
])
export type CmsManagementOperation = z.infer<typeof CmsManagementRequestSchema>['operation']
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const CmsAdoptionStatusSchema = z.object({
  phase: z.enum(['idle', 'freezing', 'importing', 'ready', 'managed', 'blocked']), adoptionId: id.nullable(),
  progress: z.object({ consumed: z.union([count, z.object({ content: count, record: count, schema: count }).strict()]), done: z.boolean() }).strict().nullable(),
  recoveryId: id.nullable(), recoveryRequired: z.boolean(), recoveryReason: z.string().max(256).nullable(),
  receiptDigest: digest.nullable(), application: z.object({ id: z.uuid(), digest }).strict().nullable(), progressDigest: digest
}).strict()
export const CmsGraphCommitReceiptSchema = z.object({ acknowledged: z.literal(true), operationId: id, checkpointId: id,
  application: z.object({ id: z.uuid(), digest }).strict(), versionId: z.string().nullable(), currentCheckpointId: id.nullable(), isCurrent: z.boolean() }).strict()
export const CmsGraphRestoreReceiptSchema = CmsGraphCommitReceiptSchema.pick({ checkpointId: true, currentCheckpointId: true, isCurrent: true }).strict()
export function cmsManagementResultSchema(operation: CmsManagementOperation) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), requestDigest: digest, value: operation === 'adoption' ? CmsAdoptionStatusSchema : operation === 'restore' ? CmsGraphRestoreReceiptSchema : CmsGraphCommitReceiptSchema }).strict(),
    z.object({ ok: z.literal(false), requestDigest: digest, error: z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
      statusCode: z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(404), z.literal(409), z.literal(413), z.literal(422), z.literal(429), z.literal(503)]), message: z.string().max(512) }).strict() }).strict()
  ])
}

export const CMS_STATUS_URL = 'https://page-studio-management.internal/customer-cms-adoption-status'
export function isPlacedCmsStatus(request: z.infer<typeof CmsManagementRequestSchema>) {
  return request.operation === 'adoption' && request.body.action === 'status'
    && request.expectedEnvironment === 'production' && request.contentEnvironment === 'staging'
    && request.principal.source === 'customer-session' && request.principal.claims.environment === 'staging'
    && ['workspace:create', 'cms:adopt'].includes(request.principal.capability)
}
