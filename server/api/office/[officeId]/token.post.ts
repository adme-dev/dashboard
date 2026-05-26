/**
 * POST /api/office/:officeId/token
 *
 * Mints a short-lived (5min) HS256 JWT carrying the staff identity, scoped
 * to one office. The browser presents this token when opening a WebSocket
 * directly to the office-room worker (which is on a different origin from
 * Pages, so cookies can't ride the handshake).
 *
 * Phase 1a: staff-only. Client portal support in Phase 1d will pass through
 * the same endpoint with a separate auth resolver.
 */

import type { H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { toActorHandle } from '~~/server/utils/officeRoom'
import { signOfficeJwt, type OfficeJwtClaims } from '~~/server/utils/officeJwt'
import type { OfficeMemberRow, OfficeZoneAccessPolicy } from '~~/app/types/office'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getCfOrProcessEnv(event: H3Event, key: string): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.[key] as string | undefined) ?? process.env[key]
}

const DEFAULT_WORKER_URL = 'wss://office-room-worker.adme-dev.workers.dev'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const secret = getCfOrProcessEnv(event, 'OFFICE_SYNC_SECRET')
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'OFFICE_SYNC_SECRET not configured' })
  }

  const zoneRows = await queryRows<{
    id: string
    capacity: number
    zone_type: OfficeZoneAccessPolicy['zone_type']
    is_private: boolean
    acl: OfficeZoneAccessPolicy['acl']
  }>(
    `SELECT id, capacity, zone_type, is_private, acl
     FROM office_zones
     WHERE office_id = $1`,
    [officeId]
  )
  const zoneCapacities = Object.fromEntries(
    zoneRows
      .filter(zone => Number.isFinite(Number(zone.capacity)) && Number(zone.capacity) > 0)
      .map(zone => [zone.id, Math.floor(Number(zone.capacity))])
  )
  const zoneAccessPolicies = Object.fromEntries(
    zoneRows.map(zone => [
      zone.id,
      {
        zone_type: zone.zone_type,
        is_private: Boolean(zone.is_private),
        acl: zone.acl ?? {}
      } satisfies OfficeZoneAccessPolicy
    ])
  )

  const claims: OfficeJwtClaims = {
    handle: toActorHandle({ id: user.id }, 'user'),
    name: user.name || user.email,
    avatarUrl: user.avatar_url || null,
    role: membership.role,
    isGuest: false,
    officeId,
    zoneCapacities,
    zoneAccessPolicies,
    exp: Math.floor(Date.now() / 1000) + 5 * 60
  }
  const token = await signOfficeJwt(claims, secret)

  return {
    token,
    workerUrl: getCfOrProcessEnv(event, 'OFFICE_WORKER_URL') ?? DEFAULT_WORKER_URL,
    exp: claims.exp
  }
})
