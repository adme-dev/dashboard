import type { H3Event } from 'h3'

import { queryOneFresh as defaultQueryOneFresh } from '~~/server/utils/db'

export type GodModeAuthorityReason =
  | 'active_owner'
  | 'not_owner'
  | 'inactive_or_missing'
  | 'emergency_disabled'
  | 'verification_failed'

const authorityBrand: unique symbol = Symbol('GodModeAuthority')

export interface GodModeAuthority {
  readonly [authorityBrand]: true
  readonly active: boolean
  readonly actorUserId: string
  readonly reason: GodModeAuthorityReason
  readonly emergencyDisabled: boolean
}

export interface GodModeAuthorityDeps {
  queryOneFresh?: <T = { id: string }>(sql: string, params?: unknown[]) => Promise<T | null>
  processEnv?: Record<string, unknown>
  diagnostic?: (message: string) => void
}

const authorityCacheKey = Symbol('godModeAuthority')
const issuedAuthorities = new WeakSet<object>()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AuthorityCache = Map<string, Promise<GodModeAuthority>>

function getAuthorityCache(event: H3Event): AuthorityCache {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[authorityCacheKey]
  if (existing instanceof Map) return existing as AuthorityCache

  const cache: AuthorityCache = new Map()
  context[authorityCacheKey] = cache
  return cache
}

function parseEmergencyDisabled(value: unknown): { disabled: boolean, malformed: boolean } {
  if (value === undefined || value === null || value === '') return { disabled: false, malformed: false }
  if (value === true || value === 'true') return { disabled: true, malformed: false }
  if (value === false || value === 'false') return { disabled: false, malformed: false }
  return { disabled: true, malformed: true }
}

function getEmergencyDisabled(event: H3Event, deps: GodModeAuthorityDeps): boolean {
  const cloudflareEnv = (event.context as any).cloudflare?.env
  const hasRequestBinding = cloudflareEnv != null
    && Object.prototype.hasOwnProperty.call(cloudflareEnv, 'GOD_MODE_DISABLED')
  const runtimeEnv = deps.processEnv ?? (typeof process !== 'undefined' ? process.env : {})
  const value = hasRequestBinding
    ? cloudflareEnv.GOD_MODE_DISABLED
    : runtimeEnv.GOD_MODE_DISABLED
  const parsed = parseEmergencyDisabled(value)

  if (parsed.malformed) {
    ;(deps.diagnostic ?? console.warn)('[God mode] malformed emergency setting; denying access')
  }

  return parsed.disabled
}

type GodModeAuthoritySeed = Omit<GodModeAuthority, typeof authorityBrand>

function issue(authority: GodModeAuthoritySeed): GodModeAuthority {
  const issued = authority as GodModeAuthority
  Object.defineProperty(issued, authorityBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  })
  Object.freeze(issued)
  issuedAuthorities.add(issued)
  return issued
}

function denied(
  actorUserId: string,
  reason: Exclude<GodModeAuthorityReason, 'active_owner'>,
  emergencyDisabled = false
): GodModeAuthority {
  return issue({ active: false, actorUserId, reason, emergencyDisabled })
}

/** Runtime provenance check. Structural lookalikes, clones, JSON, headers, and bodies always fail. */
export function isGodModeAuthorityForActor(
  authority: unknown,
  authenticatedUserId: string
): authority is GodModeAuthority {
  return typeof authority === 'object'
    && authority !== null
    && issuedAuthorities.has(authority)
    && (authority as GodModeAuthority).actorUserId === authenticatedUserId
}

export function isActiveGodModeAuthority(
  authority: unknown,
  authenticatedUserId: string
): authority is GodModeAuthority {
  return isGodModeAuthorityForActor(authority, authenticatedUserId)
    && authority.active === true
    && authority.reason === 'active_owner'
    && authority.emergencyDisabled === false
}

export async function resolveGodModeAuthority(
  event: H3Event,
  authenticatedUserId: string,
  deps: GodModeAuthorityDeps = {}
): Promise<GodModeAuthority> {
  const emergencyDisabled = getEmergencyDisabled(event, deps)
  if (emergencyDisabled) return denied(authenticatedUserId, 'emergency_disabled', true)
  if (!uuidPattern.test(authenticatedUserId)) return denied(authenticatedUserId, 'inactive_or_missing')

  const cache = getAuthorityCache(event)
  const existing = cache.get(authenticatedUserId)
  if (existing) return await existing

  const queryOneFresh = deps.queryOneFresh ?? defaultQueryOneFresh
  const verification = (async (): Promise<GodModeAuthority> => {
    try {
      const owner = await queryOneFresh<{ id: string }>(
        `SELECT id
           FROM team_members
          WHERE id = $1
            AND is_active = TRUE
            AND user_role = 'owner'
          LIMIT 1`,
        [authenticatedUserId]
      )

      if (owner?.id === authenticatedUserId) {
        return issue({
          active: true,
          actorUserId: authenticatedUserId,
          reason: 'active_owner',
          emergencyDisabled: false
        })
      }

      return denied(authenticatedUserId, 'inactive_or_missing')
    } catch {
      ;(deps.diagnostic ?? console.warn)('[God mode] active-owner verification failed; denying access')
      return denied(authenticatedUserId, 'verification_failed')
    }
  })()

  cache.set(authenticatedUserId, verification)
  return await verification
}
