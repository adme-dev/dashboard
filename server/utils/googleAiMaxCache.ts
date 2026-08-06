import type { H3Event } from 'h3'
import type { GoogleAiMaxReadinessFilters } from '~~/server/utils/googleAiMaxReadiness'
import { getKV, kvGet, kvPut } from '~~/server/utils/kv'

interface ReadinessCacheEntry<T> {
  value: T
  expiresAt: number
}

interface ReadinessCacheAdapter {
  get(key: string): Promise<unknown | null>
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>
}

function stableFilterEntries(filters: GoogleAiMaxReadinessFilters) {
  const keys: Array<keyof GoogleAiMaxReadinessFilters> = [
    'page', 'pageSize', 'status', 'connectionId', 'clientId', 'campaignStatus',
    'migrationReason', 'stale', 'changedSince', 'search'
  ]
  return keys
    .filter(key => filters[key] !== undefined)
    .map(key => `${key}=${encodeURIComponent(String(filters[key]))}`)
    .join('&')
}

export function googleAiMaxReadinessCacheKey(
  tenantId: string,
  filters: GoogleAiMaxReadinessFilters
) {
  return `google-ai-max:${tenantId}:readiness:${stableFilterEntries(filters)}`
}

function isEntry<T>(value: unknown): value is ReadinessCacheEntry<T> {
  return Boolean(value && typeof value === 'object'
    && typeof (value as ReadinessCacheEntry<T>).expiresAt === 'number'
    && 'value' in value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isFailedZero(value: unknown) {
  if (!isRecord(value)) return false

  const latestRun = value.latestRun
  const summary = value.summary

  return isRecord(latestRun)
    && latestRun.status === 'failed'
    && Array.isArray(value.items)
    && value.items.length === 0
    && isRecord(summary)
    && Number(summary.eligible ?? 0) === 0
}

export async function readGoogleAiMaxReadinessCached<T>(input: {
  key: string
  loader: () => Promise<T>
  cache: ReadinessCacheAdapter
  now?: number
}): Promise<T> {
  const now = input.now ?? Date.now()
  const cached = await input.cache.get(input.key)
  if (isEntry<T>(cached) && cached.expiresAt > now) return cached.value

  const value = await input.loader()
  if (!isFailedZero(value)) {
    await input.cache.put(input.key, { value, expiresAt: now + 60_000 }, 60)
  }
  return value
}

export function readGoogleAiMaxReadinessForEvent<T>(
  event: H3Event,
  key: string,
  loader: () => Promise<T>
) {
  return readGoogleAiMaxReadinessCached({
    key,
    loader,
    cache: {
      get: cacheKey => kvGet(event, cacheKey),
      put: (cacheKey, value, ttlSeconds) => kvPut(event, cacheKey, value, ttlSeconds)
    }
  })
}

export function captureGoogleAiMaxCacheInvalidator(event: H3Event) {
  const kv = getKV(event)
  return async (tenantId: string) => {
    if (!kv) return 0
    const prefix = `google-ai-max:${tenantId}:`
    let deleted = 0
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const result = await kv.list({ prefix, cursor })
      await Promise.all(result.keys.map(key => kv.delete(key.name)))
      deleted += result.keys.length
      if (result.list_complete || !result.cursor) break
      cursor = result.cursor
    }
    return deleted
  }
}
