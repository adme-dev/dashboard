import { z } from 'zod'
import type { PageStudioContentScope } from './businessContent'

const Identity = {
  operationId: z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9_:-]*$/),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['model', 'action-test', 'action-execution'])
}
export const PageStudioAiUsageRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...Identity, action: z.literal('reserve') }).strict(),
  z.object({ ...Identity, action: z.literal('settle'), outcome: z.enum(['succeeded', 'failed']) }).strict()
])
export interface PageStudioAiUsageReceipt {
  operationId: string
  fingerprint: string
  kind: 'model' | 'action-test' | 'action-execution'
  scope: PageStudioContentScope
  state: 'reserved' | 'succeeded' | 'failed'
  charged: true
  admitted: boolean
}
