import type { H3Event } from 'h3'

export const CRM_SEARCH_ANALYTICS_KEYRING_BINDING
  = 'CRM_SEARCH_ANALYTICS_KEYRING' as const
export const CRM_SEARCH_ANALYTICS_KEYRING_MAX_KEYS = 8 as const
export const CRM_SEARCH_ANALYTICS_KEY_VERSION_MAX_BYTES = 80 as const
export const CRM_SEARCH_ANALYTICS_SECRET_MIN_BYTES = 32 as const
export const CRM_SEARCH_ANALYTICS_SECRET_MAX_BYTES = 128 as const

const encoder = new TextEncoder()
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u

export interface CrmSearchAnalyticsKeyring {
  activeKeyVersion: string
  /** Dedicated analytics HMAC secrets; never service, confirmation, or cron keys. */
  keys: Readonly<Record<string, string>>
}

export interface CrmSearchAnalyticsDigestKey {
  keyVersion: string
  secret: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function validKeyVersion(value: unknown): value is string {
  return typeof value === 'string'
    && encoder.encode(value).byteLength <= CRM_SEARCH_ANALYTICS_KEY_VERSION_MAX_BYTES
    && keyVersionPattern.test(value)
}

function validSecret(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const byteLength = encoder.encode(value).byteLength
  return byteLength >= CRM_SEARCH_ANALYTICS_SECRET_MIN_BYTES
    && byteLength <= CRM_SEARCH_ANALYTICS_SECRET_MAX_BYTES
}

/** Strictly parses only the independently versioned analytics keyring shape. */
export function parseCrmSearchAnalyticsKeyring(
  value: unknown
): CrmSearchAnalyticsKeyring | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isPlainRecord(candidate)
      || Object.keys(candidate).length !== 2
      || !Object.prototype.hasOwnProperty.call(candidate, 'activeKeyVersion')
      || !Object.prototype.hasOwnProperty.call(candidate, 'keys')) return null

    const activeKeyVersion = ownValue(candidate, 'activeKeyVersion')
    const rawKeys = ownValue(candidate, 'keys')
    if (!validKeyVersion(activeKeyVersion) || !isPlainRecord(rawKeys)) return null
    const versions = Object.keys(rawKeys)
    if (versions.length < 1 || versions.length > CRM_SEARCH_ANALYTICS_KEYRING_MAX_KEYS) {
      return null
    }

    const keys: Record<string, string> = Object.create(null)
    const uniqueSecrets = new Set<string>()
    for (const version of versions) {
      const secret = ownValue(rawKeys, version)
      if (!validKeyVersion(version) || !validSecret(secret) || uniqueSecrets.has(secret)) {
        return null
      }
      uniqueSecrets.add(secret)
      keys[version] = secret
    }
    if (!Object.prototype.hasOwnProperty.call(keys, activeKeyVersion)) return null
    return Object.freeze({
      activeKeyVersion,
      keys: Object.freeze(keys)
    })
  } catch {
    return null
  }
}

export function selectActiveCrmSearchAnalyticsDigestKey(
  keyring: CrmSearchAnalyticsKeyring | null
): CrmSearchAnalyticsDigestKey | null {
  const parsed = parseCrmSearchAnalyticsKeyring(keyring)
  if (!parsed) return null
  return Object.freeze({
    keyVersion: parsed.activeKeyVersion,
    secret: parsed.keys[parsed.activeKeyVersion]!
  })
}

/** A malformed deployed binding never falls back to local process state. */
export function resolveCrmSearchAnalyticsKeyring(
  event: H3Event
): CrmSearchAnalyticsKeyring | null {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env
  if (env && Object.prototype.hasOwnProperty.call(
    env,
    CRM_SEARCH_ANALYTICS_KEYRING_BINDING
  )) {
    const value = env[CRM_SEARCH_ANALYTICS_KEYRING_BINDING]
    return typeof value === 'string' ? parseCrmSearchAnalyticsKeyring(value) : null
  }
  return parseCrmSearchAnalyticsKeyring(
    process.env[CRM_SEARCH_ANALYTICS_KEYRING_BINDING]
  )
}
