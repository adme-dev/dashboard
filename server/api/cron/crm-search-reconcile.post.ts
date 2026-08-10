import { createHash, timingSafeEqual } from 'node:crypto'

import { createError, eventHandler, getHeader, type H3Event } from 'h3'

import {
  reconcileCrmSearchIndexRequest,
  type CrmSearchReconciliationResult
} from '~~/server/utils/crm/searchIndex/reconciliation'

const encoder = new TextEncoder()
const maxSecretBytes = 256
const reconciliationLimit = 25

type CrmSearchReconcileCronResult = Omit<CrmSearchReconciliationResult, 'repairsCreated'>

export interface CrmSearchReconcilePostDependencies {
  resolveExpectedSecret(event: H3Event): string | null
  readSuppliedSecret(event: H3Event): string | null
  now(): string
  reconcile(
    event: H3Event,
    input: { limit: number, now: string }
  ): Promise<CrmSearchReconcileCronResult>
}

function fail(statusCode: 401 | 503, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function resolveCrmSearchReconcileCronSecret(event: H3Event): string | null {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env
  if (env && Object.prototype.hasOwnProperty.call(env, 'CRON_SECRET')) {
    const value = env.CRON_SECRET
    return typeof value === 'string' && value.length > 0 ? value : null
  }
  const value = process.env.CRON_SECRET
  return typeof value === 'string' && value.length > 0 ? value : null
}

function secretMatches(provided: string, expected: string): boolean {
  if (encoder.encode(provided).byteLength > maxSecretBytes
    || encoder.encode(expected).byteLength > maxSecretBytes) return false
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

function projectResult(value: unknown): CrmSearchReconcileCronResult | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const maximums = {
      claimed: reconciliationLimit,
      indexed: reconciliationLimit,
      deleted: reconciliationLimit,
      rescheduled: reconciliationLimit,
      deadLettered: reconciliationLimit
    } as const
    const keys = Object.keys(maximums) as Array<keyof typeof maximums>
    if (Object.keys(value).length !== keys.length
      || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return null
    const projected = {} as Record<keyof typeof maximums, number>
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) return null
      const count = descriptor.value
      if (!Number.isSafeInteger(count) || count < 0 || count > maximums[key]) return null
      projected[key] = count
    }
    if (projected.indexed + projected.deleted + projected.rescheduled
      + projected.deadLettered > projected.claimed) return null
    return {
      claimed: projected.claimed,
      indexed: projected.indexed,
      deleted: projected.deleted,
      rescheduled: projected.rescheduled,
      deadLettered: projected.deadLettered
    }
  } catch {
    return null
  }
}

const defaultDependencies: CrmSearchReconcilePostDependencies = {
  resolveExpectedSecret: resolveCrmSearchReconcileCronSecret,
  readSuppliedSecret: event => getHeader(event, 'x-cron-secret') ?? null,
  now: () => new Date().toISOString(),
  reconcile: reconcileCrmSearchIndexRequest
}

export function createCrmSearchReconcilePostHandler(
  overrides: Partial<CrmSearchReconcilePostDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  return async (event: H3Event): Promise<CrmSearchReconcileCronResult> => {
    const expected = dependencies.resolveExpectedSecret(event)
    const provided = dependencies.readSuppliedSecret(event)
    if (!expected || !provided || !secretMatches(provided, expected)) {
      fail(401, 'Unauthorized')
    }
    let result: unknown
    try {
      const now = dependencies.now()
      if (typeof now !== 'string' || !Number.isFinite(Date.parse(now))) {
        fail(503, 'crm_search_reconciliation_unavailable')
      }
      result = await dependencies.reconcile(event, {
        limit: reconciliationLimit,
        now
      })
    } catch {
      fail(503, 'crm_search_reconciliation_unavailable')
    }
    const safe = projectResult(result)
    if (!safe) fail(503, 'crm_search_reconciliation_unavailable')
    return safe
  }
}

export default eventHandler(createCrmSearchReconcilePostHandler())
