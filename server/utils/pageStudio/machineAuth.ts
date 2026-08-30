import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, type H3Event } from 'h3'

const MAX_SECRET_BYTES = 256
const encoder = new TextEncoder()

type HttpErrorInput = {
  statusCode: number
  statusMessage: string
  data: { error: { code: string, message: string } }
}

interface MachineAuthDependencies {
  createHttpError(input: HttpErrorInput): Error
  readAuthorization(event: H3Event): string | null
  resolveExpectedSecret(event: H3Event): string | null
}

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

export function resolvePageStudioControlSecret(event: H3Event): string | null {
  const env = (event.context as CloudflareContext).cloudflare?.env
  if (env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_CONTROL_SECRET')) {
    const value = env.PAGE_STUDIO_CONTROL_SECRET
    return typeof value === 'string' && value.length > 0 ? value : null
  }
  const value = process.env.PAGE_STUDIO_CONTROL_SECRET
  return typeof value === 'string' && value.length > 0 ? value : null
}

function credentialMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

function machineAuthError(
  dependencies: MachineAuthDependencies,
  statusCode: 401 | 403 | 503,
  code: string,
  message: string
): never {
  throw dependencies.createHttpError({
    statusCode,
    statusMessage: message,
    data: { error: { code, message } }
  })
}

const defaultDependencies: MachineAuthDependencies = {
  createHttpError: input => createError(input),
  readAuthorization: event => getHeader(event, 'authorization') ?? null,
  resolveExpectedSecret: resolvePageStudioControlSecret
}

export function requirePageStudioMachineAuth(
  event: H3Event,
  overrides: Partial<MachineAuthDependencies> = {}
): { service: 'page-studio' } {
  const dependencies = { ...defaultDependencies, ...overrides }
  const expected = dependencies.resolveExpectedSecret(event)
  if (!expected || encoder.encode(expected).byteLength > MAX_SECRET_BYTES) {
    machineAuthError(
      dependencies,
      503,
      'PAGE_STUDIO_CONTROL_UNAVAILABLE',
      'Page Studio control authentication is not configured'
    )
  }

  const authorization = dependencies.readAuthorization(event)
  const match = authorization?.match(/^Bearer ([^\s]+)$/i)
  if (!match) {
    machineAuthError(
      dependencies,
      401,
      'MACHINE_AUTH_REQUIRED',
      'Bearer authentication required'
    )
  }

  const provided = match[1]
  if (!provided
    || encoder.encode(provided).byteLength > MAX_SECRET_BYTES
    || !credentialMatches(provided, expected)) {
    machineAuthError(
      dependencies,
      403,
      'MACHINE_AUTH_INVALID',
      'Machine credential rejected'
    )
  }

  return { service: 'page-studio' }
}
