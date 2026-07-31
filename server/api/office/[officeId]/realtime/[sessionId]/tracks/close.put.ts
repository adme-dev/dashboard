/**
 * PUT /api/office/:officeId/realtime/:sessionId/tracks/close
 *
 * Authenticated browser-side proxy for closing Cloudflare Realtime tracks.
 */
import { z } from 'zod'
import { requireOfficeRealtimeAccess, requireOfficeRealtimeZone } from '~~/server/utils/officeRealtimeAccess'
import { closeRealtimeTracks } from '~~/server/utils/officeRealtime'

const Body = z.object({
  zone_id: z.string().uuid(),
  tracks: z.array(z.object({
    mid: z.string().min(1)
  })).min(1),
  sessionDescription: z.object({
    sdp: z.string().min(1),
    type: z.enum(['offer', 'answer'])
  }).optional(),
  force: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event))
  const { appId, appSecret, officeId, sessionId } = await requireOfficeRealtimeAccess(event, {
    scope: 'close',
    zoneId: body.zone_id
  })
  await requireOfficeRealtimeZone(officeId, body.zone_id)

  return await closeRealtimeTracks({
    appId,
    appSecret,
    sessionId,
    tracks: body.tracks,
    sessionDescription: body.sessionDescription,
    force: body.force
  })
})
