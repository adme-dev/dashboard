import { z } from 'zod'
import { bannerEngineRequestSchema, bannerEngineResultSchema } from './bannerEngine'

// Zod omits own __proto__ properties; inspect wire objects before parsing so
// unknown fields cannot silently disappear. Bound traversal before recursion.
function wireSchema<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value, context) => {
    const pending: unknown[] = [value]
    const seen = new Set<object>()
    while (pending.length) {
      const current = pending.pop()
      if (!current || typeof current !== 'object') continue
      if (seen.has(current) || seen.size >= 256) {
        context.addIssue({ code: 'custom', message: 'Invalid engine wire object' })
        break
      }
      seen.add(current)
      if (Object.keys(current).some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) {
        context.addIssue({ code: 'custom', message: 'Unknown engine wire field' })
        break
      }
      for (const item of Object.values(current)) {
        if (!item || typeof item !== 'object') continue
        if (pending.length + seen.size >= 256) {
          context.addIssue({ code: 'custom', message: 'Invalid engine wire object' })
          return value
        }
        pending.push(item)
      }
    }
    return value
  }, schema)
}

/** Deliberately narrower than the engine runner's hard resource ceilings. */
export const ENGINE_JOB_LIMITS = Object.freeze({
  inputBytes: 16 * 1024 * 1024,
  outputBytes: 16 * 1024 * 1024,
  jsonBytes: 24 * 1024 * 1024,
  dimension: 2048,
  pixels: 2048 * 2048,
  timeoutMs: 120000,
  controlBytes: 65536
})
export const ENGINE_JOB_SERVICE_PATH = '/api/internal/banner-engine'
export const ENGINE_JOB_STATUSES = ['queued', 'running', 'cancelling', 'cancelled', 'succeeded', 'failed', 'uncertain', 'expired'] as const
export const engineJobStatusSchema = z.enum(ENGINE_JOB_STATUSES)
export type EngineJobStatus = z.infer<typeof engineJobStatusSchema>
const uuid = z.string().uuid()
const claimToken = z.string().regex(/^[a-f0-9]{64}$/)
export const engineJobEngineSchema = z.object({
  id: z.enum(['photocraft', 'vectorcraft']),
  version: z.string().max(64).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
}).strict()
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Canonical padded base64 only; check size and pad bits before decoding. */
export function isEngineJobBase64(value: string, maxBytes: number): boolean {
  if (!value || value.length > Math.ceil(maxBytes / 3) * 4 || value.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  if (value.length / 4 * 3 - padding > maxBytes) return false
  const last = alphabet.indexOf(value[value.length - padding - 1]!)
  return padding === 0 || (padding === 1 ? last % 4 === 0 : last % 16 === 0)
}
const encodedBytes = (maxBytes: number) => z.string()
  .max(Math.ceil(maxBytes / 3) * 4)
  .refine(value => isEngineJobBase64(value, maxBytes), 'Invalid or oversized canonical base64')

export const engineJobSubmitSchema = wireSchema(z.object({
  requestId: uuid,
  projectId: uuid,
  sourceRevision: z.string().datetime({ offset: true }),
  engine: engineJobEngineSchema,
  input: z.object({
    mimeType: z.enum(['application/x-photocraft', 'application/x-vectorcraft']),
    base64: encodedBytes(ENGINE_JOB_LIMITS.inputBytes)
  }).strict(),
  output: z.object({
    width: z.number().int().min(1).max(ENGINE_JOB_LIMITS.dimension),
    height: z.number().int().min(1).max(ENGINE_JOB_LIMITS.dimension)
  }).strict()
}).strict())
export type EngineJobSubmit = z.infer<typeof engineJobSubmitSchema>
export const engineJobCancelSchema = wireSchema(z.object({ attemptId: uuid }).strict())
const attempt = { jobId: uuid, attemptId: uuid, claimToken }
export const engineJobFailureCodeSchema = z.enum([
  'invalid-request', 'unsupported-capability', 'invalid-input', 'invalid-output',
  'duplicate-attempt', 'cancelled', 'deadline-exceeded', 'resource-limit',
  'output-limit', 'engine-failed', 'workspace-failed', 'receipt-failed', 'transport-failed'
])
export const engineJobTerminationSchema = z.enum(['not-started', 'adapter-settled', 'unconfirmed'])
export const engineJobServiceActionSchema = wireSchema(z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), engine: engineJobEngineSchema }).strict(),
  z.object({ action: z.literal('input'), ...attempt }).strict(),
  z.object({ action: z.literal('status'), ...attempt }).strict(),
  z.object({ action: z.literal('complete'), ...attempt, result: bannerEngineResultSchema,
    outputBase64: encodedBytes(ENGINE_JOB_LIMITS.outputBytes) }).strict(),
  z.object({ action: z.literal('fail'), ...attempt,
    code: engineJobFailureCodeSchema, termination: engineJobTerminationSchema }).strict()
]))
export type EngineJobServiceAction = z.infer<typeof engineJobServiceActionSchema>
const hostedRequest = bannerEngineRequestSchema.refine(value =>
  ['photocraft', 'vectorcraft'].includes(value.engine.id)
  && value.input.bytes <= ENGINE_JOB_LIMITS.inputBytes
  && value.limits.maxInputBytes <= ENGINE_JOB_LIMITS.inputBytes
  && value.limits.maxOutputBytes <= ENGINE_JOB_LIMITS.outputBytes
  && value.limits.maxPixels <= ENGINE_JOB_LIMITS.pixels
  && value.limits.timeoutMs <= ENGINE_JOB_LIMITS.timeoutMs
  && value.output.width <= ENGINE_JOB_LIMITS.dimension
  && value.output.height <= ENGINE_JOB_LIMITS.dimension,
'Engine request exceeds the application job limits')
export const engineJobClaimSchema = wireSchema(z.union([
  z.object({ request: z.null() }).strict(),
  z.object({ request: hostedRequest, claimToken }).strict()
]))
export type EngineJobClaim = z.infer<typeof engineJobClaimSchema>
export const engineJobInputSchema = wireSchema(z.object({ base64: encodedBytes(ENGINE_JOB_LIMITS.inputBytes) }).strict())
export const engineJobStatusResponseSchema = wireSchema(z.object({ status: engineJobStatusSchema }).strict())
