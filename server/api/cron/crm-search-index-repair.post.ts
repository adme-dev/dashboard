import { createHash, timingSafeEqual } from 'node:crypto'

import { createError, eventHandler, getHeader, type H3Event } from 'h3'

import {
  CRM_SEARCH_PUBLISH_DEFAULT_LIMIT,
  publishCrmSearchOperations,
  type CrmSearchIndexPublishResult
} from '~~/server/utils/crm/searchIndex/publisher'
import {
  CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS
} from '~~/server/utils/crm/searchIndex/dirtyExpansionRepository'

export interface CrmSearchIndexRepairDependencies {
  resolveExpectedSecret(event: H3Event): string | null
  readSuppliedSecret(event: H3Event): string | null
  publish(
    event: H3Event,
    options: { limit: number }
  ): Promise<CrmSearchIndexPublishResult>
}

const encoder = new TextEncoder()
const CRM_SEARCH_CRON_SECRET_MAX_BYTES = 256

function fail(statusCode: 401 | 503, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function resolveCrmSearchCronSecret(event: H3Event): string | null {
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
  if (
    encoder.encode(provided).byteLength > CRM_SEARCH_CRON_SECRET_MAX_BYTES
    || encoder.encode(expected).byteLength > CRM_SEARCH_CRON_SECRET_MAX_BYTES
  ) return false
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

function projectResult(value: unknown): CrmSearchIndexPublishResult | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const maximums = {
      dirtyClaimed: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT,
      operationsCreated: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT
        * CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS,
      operationsPublished: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT,
      operationsRescheduled: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT,
      skippedByControl: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT
    } as const
    const expectedKeys = Object.keys(maximums) as Array<keyof typeof maximums>
    if (
      Object.keys(value).length !== expectedKeys.length
      || expectedKeys.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    ) return null
    const projected = Object.fromEntries(expectedKeys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor)) throw new TypeError('invalid result')
      const count = descriptor.value
      if (
        !Number.isSafeInteger(count)
        || count < 0
        || count > maximums[key]
      ) throw new TypeError('invalid result')
      return [key, count]
    })) as unknown as CrmSearchIndexPublishResult
    return {
      dirtyClaimed: projected.dirtyClaimed,
      operationsCreated: projected.operationsCreated,
      operationsPublished: projected.operationsPublished,
      operationsRescheduled: projected.operationsRescheduled,
      skippedByControl: projected.skippedByControl
    }
  } catch {
    return null
  }
}

const defaultDependencies: CrmSearchIndexRepairDependencies = {
  resolveExpectedSecret: resolveCrmSearchCronSecret,
  readSuppliedSecret: event => getHeader(event, 'x-cron-secret') ?? null,
  publish: publishCrmSearchOperations
}

export function createCrmSearchIndexRepairPostHandler(
  overrides: Partial<CrmSearchIndexRepairDependencies> = {}
) {
  const dependencies: CrmSearchIndexRepairDependencies = {
    ...defaultDependencies,
    ...overrides
  }
  return async (event: H3Event): Promise<CrmSearchIndexPublishResult> => {
    const expected = dependencies.resolveExpectedSecret(event)
    const provided = dependencies.readSuppliedSecret(event)
    if (!expected || !provided || !secretMatches(provided, expected)) {
      fail(401, 'Unauthorized')
    }

    let result: unknown
    try {
      result = await dependencies.publish(event, {
        limit: CRM_SEARCH_PUBLISH_DEFAULT_LIMIT
      })
    } catch {
      fail(503, 'crm_search_index_repair_unavailable')
    }
    const safe = projectResult(result)
    if (!safe) fail(503, 'crm_search_index_repair_unavailable')
    return safe
  }
}

export default eventHandler(createCrmSearchIndexRepairPostHandler())
