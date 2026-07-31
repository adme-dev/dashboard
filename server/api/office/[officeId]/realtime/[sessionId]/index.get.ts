/**
 * GET /api/office/:officeId/realtime/:sessionId
 *
 * Authenticated browser-side proxy for Cloudflare Realtime session state.
 */
import { z } from 'zod'
import { requireOfficeRealtimeAccess, requireOfficeRealtimeZone } from '~~/server/utils/officeRealtimeAccess'
import { getRealtimeSessionState } from '~~/server/utils/officeRealtime'

const Query = z.object({
  zone_id: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const query = Query.parse(getQuery(event))
  const { appId, appSecret, officeId, sessionId } = await requireOfficeRealtimeAccess(event, {
    scope: 'state',
    zoneId: query.zone_id
  })
  await requireOfficeRealtimeZone(officeId, query.zone_id)

  return await getRealtimeSessionState({
    appId,
    appSecret,
    sessionId
  })
})
