import { z } from 'zod'
import { CheckpointStagingRequestSchema } from '~~/shared/pageStudio/checkpointStagingOrigin'
import { PageStudioStagingStateSchema } from '~~/shared/pageStudio/staging'

const statusCodes = { STAGING_INVALID: 400, STAGING_ACCESS_DENIED: 403, STAGING_CHANGED: 409, STAGING_BUSY: 409, STAGING_BUILD_LIMIT: 429, STAGING_SERVICE_UNAVAILABLE: 503 } as const
type ErrorCode = keyof typeof statusCodes
const Code = z.enum(['STAGING_INVALID', 'STAGING_ACCESS_DENIED', 'STAGING_CHANGED', 'STAGING_BUSY', 'STAGING_BUILD_LIMIT', 'STAGING_SERVICE_UNAVAILABLE'])
const Response = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), request: CheckpointStagingRequestSchema, value: PageStudioStagingStateSchema }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ code: Code, statusCode: z.number().int() }).strict() }).strict()
])
export class CheckpointStagingServiceError extends Error {
  readonly statusCode: number
  constructor(readonly code: ErrorCode) {
    super(code === 'STAGING_SERVICE_UNAVAILABLE' ? 'Checkpoint staging is temporarily unavailable' : code)
    this.name = 'CheckpointStagingServiceError'
    this.statusCode = statusCodes[code]
  }
}
const unavailable = () => new CheckpointStagingServiceError('STAGING_SERVICE_UNAVAILABLE')

/** Private dispatcher boundary. No raw login token, replacement actor, HTTP
 * endpoint or implicit retry crosses this service call. */
export async function requestCheckpointStaging(raw: unknown, env?: Record<string, unknown>) {
  const parsed = CheckpointStagingRequestSchema.safeParse(raw)
  if (!parsed.success) throw new CheckpointStagingServiceError('STAGING_INVALID')
  const input = parsed.data
  const service = env?.PAGE_STUDIO_MANAGEMENT as { checkpointStaging?: (input: unknown) => Promise<unknown> } | undefined
  if (input.expectedEnvironment !== env?.PAGE_STUDIO_RELEASE_ENVIRONMENT || typeof service?.checkpointStaging !== 'function') throw unavailable()
  let result: unknown
  try {
    result = await service.checkpointStaging(input)
  } catch {
    throw unavailable()
  }
  const response = Response.safeParse(result)
  if (!response.success) throw unavailable()
  if (!response.data.ok) {
    const { code, statusCode } = response.data.error
    if (statusCode !== statusCodes[code]) throw unavailable()
    throw new CheckpointStagingServiceError(code)
  }
  const returned = response.data.request
  if (returned.auditId !== input.auditId || returned.checkpointId !== input.checkpointId || returned.digest !== input.digest
    || returned.expectedEnvironment !== input.expectedEnvironment || returned.scope.tenantId !== input.scope.tenantId
    || returned.scope.clientId !== input.scope.clientId || returned.scope.siteId !== input.scope.siteId
    || response.data.value.siteId !== input.scope.siteId.toLowerCase()) throw unavailable()
  return response.data.value
}
