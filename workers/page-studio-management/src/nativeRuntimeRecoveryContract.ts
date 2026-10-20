import { z } from 'zod'
import { CollectionUpgradeOperationSchema } from '../../../shared/pageStudio/collection-upgrade'
import { DispatchWorkerIntentSchema } from '../../../shared/pageStudio/managed-transfer-execution'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const RuntimeGenerationRecordSchema = z
  .object({
    base_snapshot: z.string(),
    claim_token: z.string().nullable(),
    claimed_until: z.string().nullable(),
    created_at: z.iso.datetime(),
    etag: z.string().nullable(),
    identity: digest,
    intent: z.string(),
    policy: z.string(),
    request: z.string(),
    scope_key: z.string(),
    state: z.enum(['reserved', 'uploading', 'ready', 'disabled'])
  })
  .strict()
export const ContentRuntimeRecoveryReviewSchema = z
  .object({
    attemptId: z.uuid(),
    authorityDigest: digest,
    intent: DispatchWorkerIntentSchema,
    intentDigest: digest,
    original: RuntimeGenerationRecordSchema,
    originalRowDigest: digest,
    preparedAt: z.iso.datetime(),
    request: CollectionUpgradeOperationSchema,
    requestId: z.uuid(),
    reviewId: z.uuid(),
    version: z.literal(1)
  })
  .strict()
export const ContentRuntimeRecoveryApprovalSchema = z
  .object({
    attemptId: z.uuid(),
    authorityDigest: digest,
    intentDigest: digest,
    operationId: z.string(),
    originalRowDigest: digest,
    requestId: z.uuid(),
    reviewDigest: digest,
    reviewId: z.uuid(),
    scopeKey: z.string(),
    version: z.literal(1)
  })
  .strict()
export const ContentRuntimeRecoveryReferenceSchema = z
  .object({
    approval: z.string().nullable(),
    attemptId: z.uuid(),
    intentDigest: digest,
    originalRowDigest: digest,
    reviewId: z.uuid()
  })
  .strict()

export const NativeRuntimeRecoveryCallbackSchema = z.object({ expectedControlPlaneEnvironment: z.literal('production'),
  phase: z.enum(['create', 'approve', 'advance']), reviewId: z.string().uuid(), attemptId: z.string().uuid(), reviewDigest: digest }).strict()
export const NativeRuntimeRecoveryOperatorSchema = z.object({ expectedControlPlaneEnvironment: z.literal('production'),
  action: z.enum(['prepare', 'apply', 'status']), siteId: z.string().uuid(), requestId: z.string().uuid(), reviewId: z.string().uuid().optional(),
  operator: z.object({ actorId: z.string().uuid(), loginSessionHash: digest }).strict() }).strict()
export const NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL = 'https://page-studio-management.internal/native-runtime-recovery-authority'
