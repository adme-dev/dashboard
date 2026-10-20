import { z } from 'zod'
import { CustomerEditorClaimsSchema } from '../../server/utils/pageStudio/customerEditorToken'
import { CustomerSchemaUpgradeRequestSchema, CustomerSchemaUpgradeStatusSchema } from './customerSchemaUpgrade'

export const NATIVE_SCHEMA_COORDINATOR_URL = 'https://page-studio-management.internal/native-schema-coordinator'
export const NativeSchemaCoordinatorRequest = z.object({
  expectedControlPlaneEnvironment: z.literal('production'),
  request: CustomerSchemaUpgradeRequestSchema,
  claims: CustomerEditorClaimsSchema.refine(value => value.environment === 'staging')
}).strict()
export const NativeSchemaCoordinatorResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: z.string().regex(/^[a-f0-9]{64}$/), value: CustomerSchemaUpgradeStatusSchema }).strict(),
  z.object({ ok: z.literal(false), requestDigest: z.string().regex(/^[a-f0-9]{64}$/), error: z.object({
    statusCode: z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(409), z.literal(503)]),
    message: z.literal('Customer CMS setup could not be verified.')
  }).strict() }).strict()
])
