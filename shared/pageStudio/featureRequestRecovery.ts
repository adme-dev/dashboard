import { z } from 'zod'

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const PageStudioFeatureRequestReceiptSchema = z.object({
  id: id.max(80),
  checkpointId: id,
  digest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export const PageStudioFeatureRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read') }).strict(),
  z.object({ operation: z.literal('claim'), receipt: PageStudioFeatureRequestReceiptSchema }).strict(),
  z.object({ operation: z.literal('dismiss'), id: id.max(80) }).strict()
])
export interface PageStudioFeatureRequestResult {
  pending: z.infer<typeof PageStudioFeatureRequestReceiptSchema> | null
  claimed: boolean
}
