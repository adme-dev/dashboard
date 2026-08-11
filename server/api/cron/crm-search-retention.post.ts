import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, eventHandler, getHeader, type H3Event } from 'h3'
import {
  createCrmSearchRetentionDependencies,
  runCrmSearchRetention,
  type CrmSearchRetentionRunInput
} from '~~/server/utils/crm/search/retention'

const encoder = new TextEncoder()
const maximumSecretBytes = 256
const retentionBatchLimit = 1_000
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu

interface RetentionResult {
  deletedRows: number
  attestations: string[]
  complete: boolean
  legalHoldBlockedCount: number
  destroyedAnalyticsKeyVersions: string[]
  erasureAlerts: number
}

export interface CrmSearchRetentionPostDependencies {
  resolveExpectedSecret(event: H3Event): string | null
  readSuppliedSecret(event: H3Event): string | null
  resolveExecutorId(event: H3Event): string | null
  now(): string
  retain(event: H3Event, input: CrmSearchRetentionRunInput): Promise<RetentionResult>
}

function environmentValue(event: H3Event, key: string): unknown {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  if (env && Object.prototype.hasOwnProperty.call(env, key)) return env[key]
  return process.env[key]
}

export function resolveCrmSearchRetentionCronSecret(event: H3Event): string | null {
  const value = environmentValue(event, 'CRON_SECRET')
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function resolveCrmSearchRetentionExecutorId(event: H3Event): string | null {
  const value = environmentValue(event, 'CRM_SEARCH_RETENTION_EXECUTOR_ID')
  return typeof value === 'string' && uuidPattern.test(value) ? value : null
}

function secretsMatch(provided: string, expected: string): boolean {
  if (encoder.encode(provided).byteLength > maximumSecretBytes
    || encoder.encode(expected).byteLength > maximumSecretBytes) return false
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest()
  )
}

function safeInteger(value: unknown, maximum = 100_000): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
}

function projectResult(value: unknown): {
  deletedRows: number
  attestationCount: number
  complete: boolean
  legalHoldBlockedCount: number
  destroyedAnalyticsKeyCount: number
  erasureAlerts: number
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null
  const result = value as Record<string, unknown>
  const keys = [
    'deletedRows', 'attestations', 'complete', 'legalHoldBlockedCount',
    'destroyedAnalyticsKeyVersions', 'erasureAlerts'
  ]
  if (Object.keys(result).length !== keys.length || keys.some(key => !(key in result))
    || !safeInteger(result.deletedRows)
    || !Array.isArray(result.attestations) || result.attestations.length > 100
    || result.attestations.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    || typeof result.complete !== 'boolean'
    || !safeInteger(result.legalHoldBlockedCount)
    || !Array.isArray(result.destroyedAnalyticsKeyVersions)
    || result.destroyedAnalyticsKeyVersions.length > 8
    || result.destroyedAnalyticsKeyVersions.some(value => typeof value !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value))
    || !safeInteger(result.erasureAlerts)) return null
  return {
    deletedRows: result.deletedRows,
    attestationCount: result.attestations.length,
    complete: result.complete,
    legalHoldBlockedCount: result.legalHoldBlockedCount,
    destroyedAnalyticsKeyCount: result.destroyedAnalyticsKeyVersions.length,
    erasureAlerts: result.erasureAlerts
  }
}

const defaults: CrmSearchRetentionPostDependencies = {
  resolveExpectedSecret: resolveCrmSearchRetentionCronSecret,
  readSuppliedSecret: event => getHeader(event, 'x-cron-secret') ?? null,
  resolveExecutorId: resolveCrmSearchRetentionExecutorId,
  now: () => new Date().toISOString(),
  retain: (event, input) => runCrmSearchRetention(
    input,
    createCrmSearchRetentionDependencies(event)
  )
}

export function createCrmSearchRetentionPostHandler(
  overrides: Partial<CrmSearchRetentionPostDependencies> = {}
) {
  const dependencies = { ...defaults, ...overrides }
  return async (event: H3Event) => {
    const expected = dependencies.resolveExpectedSecret(event)
    const provided = dependencies.readSuppliedSecret(event)
    if (!expected || !provided || !secretsMatch(provided, expected)) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const executorId = dependencies.resolveExecutorId(event)
    const now = dependencies.now()
    if (!executorId || !uuidPattern.test(executorId) || !Number.isFinite(Date.parse(now))) {
      throw createError({ statusCode: 503, statusMessage: 'CRM search retention unavailable' })
    }
    let result: unknown
    try {
      result = await dependencies.retain(event, { now, executorId, batchLimit: retentionBatchLimit })
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'CRM search retention unavailable' })
    }
    const projected = projectResult(result)
    if (!projected) {
      throw createError({ statusCode: 503, statusMessage: 'CRM search retention unavailable' })
    }
    return projected
  }
}

export default eventHandler(createCrmSearchRetentionPostHandler())
