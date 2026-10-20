import { z } from 'zod'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const NativeRuntimeRecoveryReference = z.object({
  expectedControlPlaneEnvironment: z.literal('production'),
  phase: z.enum(['create', 'approve', 'advance']),
  reviewId: z.string().uuid(), attemptId: z.string().uuid(), reviewDigest: digest
}).strict()
export const NativeRuntimeRecoveryApproval = z.object({
  version: z.literal(1), reviewId: z.string().uuid(), attemptId: z.string().uuid(),
  authorityDigest: digest, intentDigest: digest, originalRowDigest: digest, reviewDigest: digest,
  requestId: z.string().uuid(), operationId: z.string(), scopeKey: z.string()
}).strict()
export const NativeRuntimeRecoveryAuthorityResult = z.object({
  reference: NativeRuntimeRecoveryReference,
  approval: NativeRuntimeRecoveryApproval.nullable()
}).strict()
export const NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL = 'https://page-studio-management.internal/native-runtime-recovery-authority'
export const NATIVE_RUNTIME_RECOVERY_AUTHORITY_PATH = '/internal/page-studio/customer-runtime-recovery/authorize'
