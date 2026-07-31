/**
 * PUT /api/office/:officeId/realtime/:sessionId/renegotiate
 *
 * Authenticated browser-side proxy for Cloudflare Realtime renegotiation.
 */
import { z } from 'zod'
import { requireOfficeRealtimeAccess, requireOfficeRealtimeZone } from '~~/server/utils/officeRealtimeAccess'
import { renegotiateRealtimeSession } from '~~/server/utils/officeRealtime'

const Body = z.object({
  zone_id: z.string().uuid(),
  sessionDescription: z.object({
    sdp: z.string().min(1),
    type: z.enum(['offer', 'answer'])
  })
})

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event))
  const { appId, appSecret, officeId, sessionId } = await requireOfficeRealtimeAccess(event, {
    scope: 'renegotiate',
    zoneId: body.zone_id
  })
  await requireOfficeRealtimeZone(officeId, body.zone_id)

  return await renegotiateRealtimeSession({
    appId,
    appSecret,
    sessionId,
    sessionDescription: body.sessionDescription
  })
})
