/**
 * POST /api/office/:officeId/realtime/:sessionId/tracks
 *
 * Authenticated browser-side WebRTC negotiation proxy for Cloudflare Realtime.
 * The browser owns the RTCPeerConnection offer; the app secret stays server-side.
 */
import { z } from 'zod'
import { requireOfficeRealtimeAccess, requireOfficeRealtimeZone } from '~~/server/utils/officeRealtimeAccess'
import { addRealtimeTracks } from '~~/server/utils/officeRealtime'

const SessionDescription = z.object({
  sdp: z.string().min(1),
  type: z.enum(['offer', 'answer'])
})

const Track = z.object({
  location: z.enum(['local', 'remote']),
  mid: z.string().optional(),
  sessionId: z.string().optional(),
  trackName: z.string().optional(),
  kind: z.enum(['audio', 'video']).optional(),
  bidirectionalMediaStream: z.boolean().optional()
})

const Body = z.object({
  zone_id: z.string().uuid(),
  sessionDescription: SessionDescription,
  tracks: z.array(Track).min(1),
  autoDiscover: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const { appId, appSecret, officeId, sessionId } = await requireOfficeRealtimeAccess(event)
  const body = Body.parse(await readBody(event))
  await requireOfficeRealtimeZone(officeId, body.zone_id)

  return await addRealtimeTracks({
    appId,
    appSecret,
    sessionId,
    sessionDescription: body.sessionDescription,
    tracks: body.tracks,
    autoDiscover: body.autoDiscover
  })
})
