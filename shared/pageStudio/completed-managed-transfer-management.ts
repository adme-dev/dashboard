// Small customer-safe completion projection and private management wire only.
import { z } from 'zod'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const CompletedManagedTransferStatusSchema = z.object({
  siteId: z.uuid(), completed: z.literal(true), editorConnection: z.enum(['pending', 'ready', 'unavailable']), sourceRetention: z.enum(['pending', 'retained', 'unavailable']), canRetryConnection: z.boolean(), canRetryRetention: z.boolean()
}).strict().refine(value => value.canRetryConnection === (value.editorConnection === 'pending') && value.canRetryRetention === (value.sourceRetention === 'pending'))
export type CompletedManagedTransferStatus = z.infer<typeof CompletedManagedTransferStatusSchema>
export const CompletedManagedTransferManagementRequestSchema = z.object({ siteId: z.uuid(), action: z.enum(['status', 'connect', 'retain']), expectedEnvironment: z.literal('production') }).strict()
export const CompletedManagedTransferManagementResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: Digest, value: CompletedManagedTransferStatusSchema }).strict(),
  z.object({ ok: z.literal(false), requestDigest: Digest, error: z.object({ statusCode: z.number().int().min(400).max(599), message: z.string().min(1).max(256) }).strict() }).strict()
])
