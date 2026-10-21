import { z } from 'zod'
import { managementResultSchema, ManagementCopyErrorSchema, ManagementDigestSchema as Digest } from './managementResult'
import { ManagedTransferCopyAuthorizationSchema as Authorization } from './managed-transfer-copy-authorization'

const reference = { operationId: z.uuid(), intentDigest: Digest }
export const ManagedTransferCopyExecutionManagementRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...reference, expectedEnvironment: z.literal('production'), action: z.enum(['status', 'start', 'resume', 'verify']) }).strict(),
  z.object({ ...reference, expectedEnvironment: z.literal('production'), action: z.literal('authorize'), authorization: Authorization }).strict()
]).refine(r => r.action !== 'authorize' || (r.authorization.operationId === r.operationId && r.authorization.intentDigest === r.intentDigest))
const status = z.discriminatedUnion('state', [
  z.object({ operationId: z.uuid(), state: z.enum(['not-started', 'pending', 'resume-required', 'disabled', 'ready']) }).strict(),
  z.object({ operationId: z.uuid(), state: z.literal('verified'), proofDigest: Digest }).strict()
])
export const ManagedTransferCopyExecutionManagementResultSchema = managementResultSchema(z.union([status, Authorization]), ManagementCopyErrorSchema)
