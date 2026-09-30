import { z } from 'zod'

const kind = z.enum(['collection', 'workflow', 'collection-staging'])
const id = z.string().uuid()
export const CustomerSchemaUpgradeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), kind }).strict(),
  z.object({ action: z.literal('start'), kind, requestId: id }).strict(),
  z.object({ action: z.literal('recover'), kind, requestId: id, expectedRecoveryId: id.nullable() }).strict()
])
export type CustomerSchemaUpgradeRequest = z.infer<typeof CustomerSchemaUpgradeRequestSchema>
export const CustomerSchemaUpgradeStatusSchema = z.object({
  kind, status: z.enum(['pending', 'running', 'reserved', 'installed', 'disabled', 'reconciliation']),
  requestId: id.optional(), recoveryId: id.nullable(), canConfigure: z.boolean()
}).strict()
