import { createError, type H3Event } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { isQrAccessTeam } from '~~/shared/qr/teams'

/** These team tags now grant QR library access; ordinary members cannot self-assign. */
export async function requireQrTeamManager(event: H3Event, teamId: string) {
  if (typeof teamId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
    throw createError({ statusCode: 400, statusMessage: 'A canonical team ID is required' })
  }
  if (isQrAccessTeam(teamId)) await requireRole(event, ['admin', 'owner'])
}
