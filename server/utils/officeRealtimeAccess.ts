import type { H3Event } from 'h3'
import { requireAuth } from './auth'
import { queryOne } from './db'
import type { OfficeMemberRow } from '~~/app/types/office'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getCfOrProcessEnv(event: H3Event, key: string): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.[key] as string | undefined) ?? process.env[key]
}

export async function requireOfficeRealtimeAccess(event: H3Event) {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const sessionId = getRouterParam(event, 'sessionId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'sessionId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const appId = getCfOrProcessEnv(event, 'REALTIME_APP_ID')
  const appSecret = getCfOrProcessEnv(event, 'REALTIME_APP_SECRET')
  if (!appId || !appSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Realtime media is not configured' })
  }

  return {
    user,
    membership,
    officeId,
    sessionId,
    appId,
    appSecret
  }
}

export async function requireOfficeRealtimeZone(officeId: string, zoneId: string) {
  const zone = await queryOne<{ id: string }>(
    `SELECT id
     FROM office_zones
     WHERE id = $1
       AND office_id = $2
       AND zone_type <> 'desk'`,
    [zoneId, officeId]
  )
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting room not found' })
  }
  return zone
}
