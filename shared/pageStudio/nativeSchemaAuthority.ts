import { z } from 'zod'
import { CollectionUpgradeOperationSchema } from './collection-upgrade'
import { WorkflowUpgradeOperationSchema } from './workflow-upgrade'
import { CollectionStagingUpgradeOperationSchema } from './collection-staging-upgrade'
import { FormDraftsRuntimeRequestSchema, FormDraftsUpgradeOperationSchema } from './form-drafts-upgrade'

export const NativeSchemaContracts = {
  'collection': { schema: CollectionUpgradeOperationSchema, path: '/internal/page-studio/collection-upgrades/authorize' },
  'workflow': { schema: WorkflowUpgradeOperationSchema, path: '/internal/page-studio/workflow-upgrades/authorize' },
  'collection-staging': { schema: CollectionStagingUpgradeOperationSchema, path: '/internal/page-studio/collection-staging-upgrades/authorize' },
  'form-runtime': { schema: FormDraftsRuntimeRequestSchema, path: '/internal/page-studio/form-drafts-runtimes/authorize' },
  'form-drafts': { schema: FormDraftsUpgradeOperationSchema, path: '/internal/page-studio/form-drafts-upgrades/authorize' }
} as const
export const NativeSchemaKind = z.enum(['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'])
export const NativeSchemaAuthorityRequest = z.object({
  kind: NativeSchemaKind, expectedControlPlaneEnvironment: z.literal('production'), intent: z.unknown()
}).strict()
export const NativeSchemaAuthorityResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ code: z.enum(['NATIVE_SCHEMA_INVALID', 'NATIVE_SCHEMA_DENIED', 'NATIVE_SCHEMA_UNAVAILABLE']), statusCode: z.number(), message: z.string() }).strict() }).strict()
])

export const NATIVE_SCHEMA_AUTHORITY_URL = 'https://page-studio-management.internal/native-schema-authority'
