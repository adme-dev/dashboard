import { z } from 'zod'
import { managementResultSchema, ManagementDigestSchema as Hash } from './managementResult'

const Id = z.string().uuid()
const Revision = z.number().int().positive().max(2147483647)
const base = { siteId: Id, expectedEnvironment: z.literal('production') }
const owner = { ownerLoginSessionHash: Hash }
export const TransferControlsOperatorSchema = z.object({ actorId: Id, loginSessionHash: Hash }).strict()
const operator = { operator: TransferControlsOperatorSchema }
const existing = { requestId: Id, expectedRevision: Revision }
/** Private service binding input. HTTP callers derive credentials, never accept
 * these fields from a browser. Keep this module free of server/graph engines. */
export const TransferControlsRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), ...base, ...owner, requestId: Id }).strict(),
  z.object({ action: z.literal('owner-status'), ...base, ...owner }).strict(),
  z.object({ action: z.literal('approve'), ...base, ...owner, ...existing }).strict(),
  z.object({ action: z.literal('revoke'), ...base, ...owner, ...existing }).strict(),
  z.object({ action: z.literal('operator-status'), ...base, ...operator, requestId: Id }).strict(),
  z.object({ action: z.literal('operator-list'), expectedEnvironment: z.literal('production'), ...operator, cursor: Id.optional() }).strict(),
  z.object({ action: z.literal('review'), ...base, ...operator, ...existing }).strict(),
  z.object({ action: z.literal('reserve'), ...base, ...operator, ...existing }).strict()
])
export const TransferControlsReviewSchema = z.object({
  checkpointId: z.string().min(1).max(128), applicationId: Id, objectCount: z.number().int().min(0).max(1000)
}).strict()
export const TransferControlsViewSchema = z.object({
  requestId: Id, siteId: Id, revision: Revision,
  state: z.enum(['requested', 'reviewed', 'approved', 'reserving', 'reserved', 'revoked', 'expired', 'needs-attention']),
  review: TransferControlsReviewSchema.nullable(), expiresAt: z.string().datetime(),
  allowedActions: z.array(z.enum(['review', 'approve', 'revoke', 'reserve'])).max(4)
}).strict()
export const TransferControlsListSchema = z.object({
  requests: z.array(TransferControlsViewSchema).max(50), nextCursor: Id.nullable()
}).strict()
export const TransferControlsValueSchema = z.union([TransferControlsViewSchema, TransferControlsListSchema, z.null()])
export const TransferControlsResponseSchema = managementResultSchema(TransferControlsValueSchema, z.object({ statusCode: z.number().int(), message: z.string().max(160) }).strict())
export type TransferControlsRequest = z.infer<typeof TransferControlsRequestSchema>
export type TransferControlsView = z.infer<typeof TransferControlsViewSchema>
