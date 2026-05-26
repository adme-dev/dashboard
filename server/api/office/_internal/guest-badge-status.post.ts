/**
 * POST /api/office/_internal/guest-badge-status
 *
 * INTERNAL: called by the OfficeRoom DO with OFFICE_SYNC_SECRET to enforce
 * guest badge revocation after a WebSocket token has already been minted.
 */
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeGuestBadgesTable } from '~~/server/utils/officeGuestBadges'
import type { OfficeGuestBadgeRow } from '~~/app/types/office'

const Body = z.object({
  office_id: z.string().uuid(),
  badge_id: z.string().uuid(),
  allowed_zone_id: z.string().uuid().nullable().optional()
})

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getSecret(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  const expected = getSecret(event)
  if (!expected || !secret || !timingSafeEqual(secret, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  await ensureOfficeGuestBadgesTable()
  const body = Body.parse(await readBody(event))
  const badge = await queryOne<Pick<OfficeGuestBadgeRow, 'status' | 'expires_at' | 'allowed_zone_id'>>(
    `SELECT status, expires_at, allowed_zone_id
     FROM office_guest_badges
     WHERE office_id = $1
       AND id = $2`,
    [body.office_id, body.badge_id]
  )

  if (!badge) {
    return { active: false, reason: 'guest badge was not found' }
  }
  if (badge.status !== 'active') {
    return { active: false, reason: 'guest badge is not active' }
  }
  if (new Date(badge.expires_at).getTime() <= Date.now()) {
    return { active: false, reason: 'guest badge has expired' }
  }
  if (badge.allowed_zone_id !== body.allowed_zone_id) {
    return { active: false, reason: 'guest badge room does not match token' }
  }

  return { active: true }
})
