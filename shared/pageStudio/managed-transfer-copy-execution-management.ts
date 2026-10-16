import { z } from 'zod'
import { ManagedTransferCopyAuthorizationSchema as Authorization } from './managed-transfer-copy-authorization'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const reference = { operationId: z.uuid(), intentDigest: Digest }
export const ManagedTransferCopyExecutionManagementRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...reference, expectedEnvironment: z.literal('production'), action: z.enum(['status', 'start', 'resume', 'verify']) }).strict(),
  z.object({ ...reference, expectedEnvironment: z.literal('production'), action: z.literal('authorize'), authorization: Authorization }).strict()
]).refine(r => r.action !== 'authorize' || (r.authorization.operationId === r.operationId && r.authorization.intentDigest === r.intentDigest))
const status = z.discriminatedUnion('state', [
  z.object({ operationId: z.uuid(), state: z.enum(['not-started', 'pending', 'resume-required', 'disabled', 'ready']) }).strict(),
  z.object({ operationId: z.uuid(), state: z.literal('verified'), proofDigest: Digest }).strict()
])
export const ManagedTransferCopyExecutionManagementResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: Digest, value: z.union([status, Authorization]) }).strict(),
  z.object({ ok: z.literal(false), requestDigest: Digest, error: z.object({ statusCode: z.number().int(), message: z.string().max(256) }).strict() }).strict()
])
