// Small customer-safe completion projection and private management wire only.
import { z } from 'zod'
import { managementResultSchema, ManagementStatusErrorSchema } from './managementResult'

export const CompletedManagedTransferStatusSchema = z.object({
  siteId: z.uuid(), completed: z.literal(true), editorConnection: z.enum(['pending', 'ready', 'unavailable']), sourceRetention: z.enum(['pending', 'retained', 'unavailable']), canRetryConnection: z.boolean(), canRetryRetention: z.boolean()
}).strict().refine(value => value.canRetryConnection === (value.editorConnection === 'pending') && value.canRetryRetention === (value.sourceRetention === 'pending'))
export type CompletedManagedTransferStatus = z.infer<typeof CompletedManagedTransferStatusSchema>
export const CompletedManagedTransferManagementRequestSchema = z.object({ siteId: z.uuid(), action: z.enum(['status', 'connect', 'retain']), expectedEnvironment: z.literal('production') }).strict()
export const CompletedManagedTransferManagementResultSchema = managementResultSchema(CompletedManagedTransferStatusSchema, ManagementStatusErrorSchema)
