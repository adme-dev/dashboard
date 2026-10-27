import { z } from 'zod'

/** Wire vocabulary is not a capability declaration. Nothing executes by default. */
export const BANNER_ENGINE_IDS = ['photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'figcraft', 'soundcraft'] as const
export const BANNER_ENGINE_BOUNDS = Object.freeze({
  maxInputBytes: 256 * 1024 * 1024,
  maxOutputBytes: 64 * 1024 * 1024,
  maxPixels: 4096 * 4096,
  maxDimension: 4096,
  timeoutMs: 300000,
  memoryMb: 8192,
  cpuCount: 8,
  maxProcesses: 64,
  maxLogBytes: 1024 * 1024,
  deadlineHorizonMs: 900000
})
const positive = (max: number) => z.number().int().min(1).max(max)
const uuid = z.string().uuid()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const nativeMime = z.string().max(108).regex(/^application\/[a-z0-9][a-z0-9.+-]*$/)
const engineSchema = z.object({
  id: z.enum(BANNER_ENGINE_IDS),
  version: z.string().max(64).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/)
}).strict()
const sourceShape = {
  projectId: uuid,
  clientId: uuid.nullable(),
  sourceRevision: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:+-]{0,127}$/),
  sourceHash: digest
}
export const bannerEngineSourceSchema = z.object(sourceShape).strict()
const inputSchema = z.object({
  id: uuid, sha256: digest, bytes: positive(BANNER_ENGINE_BOUNDS.maxInputBytes), mimeType: nativeMime
}).strict()
const imageShape = {
  mimeType: z.literal('image/png'),
  width: positive(BANNER_ENGINE_BOUNDS.maxDimension),
  height: positive(BANNER_ENGINE_BOUNDS.maxDimension)
}
const identityShape = {
  version: z.literal(1), jobId: uuid, attemptId: uuid, ...sourceShape,
  engine: engineSchema, operation: z.literal('render-preview'), input: inputSchema
}
export const bannerEngineRequestSchema = z.object({
  ...identityShape,
  output: z.object(imageShape).strict(),
  limits: z.object({
    maxInputBytes: positive(BANNER_ENGINE_BOUNDS.maxInputBytes),
    maxOutputBytes: positive(BANNER_ENGINE_BOUNDS.maxOutputBytes),
    maxPixels: positive(BANNER_ENGINE_BOUNDS.maxPixels),
    timeoutMs: positive(BANNER_ENGINE_BOUNDS.timeoutMs),
    memoryMb: positive(BANNER_ENGINE_BOUNDS.memoryMb),
    cpuCount: positive(BANNER_ENGINE_BOUNDS.cpuCount),
    maxProcesses: positive(BANNER_ENGINE_BOUNDS.maxProcesses),
    maxLogBytes: positive(BANNER_ENGINE_BOUNDS.maxLogBytes)
  }).strict(),
  deadlineAt: z.string().datetime()
}).strict().superRefine((value, ctx) => {
  if (value.input.bytes > value.limits.maxInputBytes) ctx.addIssue({ code: 'custom', path: ['input', 'bytes'], message: 'Input exceeds job byte limit' })
  if (value.output.width * value.output.height > value.limits.maxPixels) ctx.addIssue({ code: 'custom', path: ['output'], message: 'Output exceeds job pixel limit' })
})
/** Success receipts only: runner failures/cancellation are execution state, not artifacts. */
export const bannerEngineResultSchema = z.object({
  ...identityShape,
  status: z.literal('succeeded'),
  output: z.object({ ...imageShape, id: uuid, sha256: digest, bytes: positive(BANNER_ENGINE_BOUNDS.maxOutputBytes) }).strict(),
  evidence: z.object({
    kind: z.literal('runtime-preview'), editableImport: z.literal(false),
    executableSha256: digest, capabilityProofSha256: digest
  }).strict()
}).strict()
/** Trusted operator configuration only; never accept these registrations from jobs. */
export const bannerEngineCapabilitySchema = z.object({
  engine: engineSchema,
  operation: z.literal('render-preview'),
  inputMimeType: nativeMime,
  executableSha256: digest,
  capabilityProofSha256: digest
}).strict()
export type BannerEngineRequest = z.infer<typeof bannerEngineRequestSchema>
export type BannerEngineResult = z.infer<typeof bannerEngineResultSchema>
export type BannerEngineCapability = z.infer<typeof bannerEngineCapabilitySchema>
export type BannerEngineSource = z.infer<typeof bannerEngineSourceSchema>

/** Caller owns proof authenticity, installed executable verification and OS isolation. */
export function assertExecutableBannerEngineRequest(
  value: unknown,
  options: { capabilities: readonly BannerEngineCapability[], now: number }
): BannerEngineCapability {
  const request = bannerEngineRequestSchema.parse(value)
  const remaining = Date.parse(request.deadlineAt) - options.now
  if (!Number.isFinite(options.now) || remaining <= 0 || remaining > BANNER_ENGINE_BOUNDS.deadlineHorizonMs) throw new Error('Invalid or expired engine deadline')
  const capabilities = options.capabilities.map(capability => bannerEngineCapabilitySchema.parse(capability))
  const matches = capabilities.filter(capability => capability.engine.id === request.engine.id
    && capability.engine.version === request.engine.version && capability.operation === request.operation
    && capability.inputMimeType === request.input.mimeType)
  if (matches.length !== 1) throw new Error('Engine capability unavailable or ambiguous')
  return matches[0]!
}

/** Identity/metadata fencing only. Actual bytes and current authority need independent checks. */
export function assertBannerEngineResultBinding(value: unknown, trustedRequest: unknown): BannerEngineResult {
  const request = bannerEngineRequestSchema.parse(trustedRequest)
  const result = bannerEngineResultSchema.parse(value)
  for (const key of ['version', 'jobId', 'attemptId', 'projectId', 'clientId', 'sourceRevision', 'sourceHash', 'operation'] as const) {
    if (result[key] !== request[key]) throw new Error(`Engine result ${key} mismatch`)
  }
  if (result.engine.id !== request.engine.id || result.engine.version !== request.engine.version) throw new Error('Engine result engine mismatch')
  for (const key of ['id', 'sha256', 'bytes', 'mimeType'] as const) {
    if (result.input[key] !== request.input[key]) throw new Error(`Engine result input ${key} mismatch`)
  }
  if (result.output.width !== request.output.width || result.output.height !== request.output.height
    || result.output.bytes > request.limits.maxOutputBytes
    || result.output.width * result.output.height > request.limits.maxPixels) throw new Error('Engine result output exceeds or differs from requested bounds')
  return result
}
