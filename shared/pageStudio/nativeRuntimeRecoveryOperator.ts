import { z } from 'zod'

export const NativeRuntimeRecoveryOperatorBody = z.object({
  action: z.enum(['prepare', 'apply', 'status']), reviewId: z.string().uuid().optional()
}).strict()
export const NativeRuntimeRecoveryProjection = z.object({
  reviewId: z.string().uuid(), siteId: z.string().uuid(), requestId: z.string().uuid(),
  operationId: z.string(), reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum(['prepared', 'approval-retained', 'admitted'])
}).strict()
