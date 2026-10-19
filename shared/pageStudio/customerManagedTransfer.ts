import { z } from 'zod'

const stage = z.enum(['preparing-resources', 'freezing-source', 'preparing-destination', 'copying-content', 'verifying', 'needs-attention'])
export const CustomerManagedTransferSchema = z.discriminatedUnion('completed', [
  z.object({ siteId: z.uuid(), completed: z.literal(false), stage,
    canRetryConnection: z.literal(false), canRetryRetention: z.literal(false) }).strict(),
  z.object({ siteId: z.uuid(), completed: z.literal(true), stage: z.literal('completed'),
    editorConnection: z.enum(['pending', 'ready', 'unavailable']), sourceRetention: z.enum(['pending', 'retained', 'unavailable']),
    canRetryConnection: z.boolean(), canRetryRetention: z.boolean() }).strict()
])
export const CustomerManagedTransferRecoverySchema = z.object({ action: z.enum(['retry-connection', 'retry-retention']) }).strict()
export type CustomerManagedTransfer = z.infer<typeof CustomerManagedTransferSchema>
