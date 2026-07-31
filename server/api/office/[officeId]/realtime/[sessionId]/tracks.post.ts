/**
 * POST /api/office/:officeId/realtime/:sessionId/tracks
 *
 * Authenticated browser-side WebRTC negotiation proxy for Cloudflare Realtime.
 * The browser owns the RTCPeerConnection offer; the app secret stays server-side.
 */
import { z } from 'zod'
import {
  requireOfficeRealtimeAccess,
  requireOfficeRealtimeZone,
  requireOfficeRemoteTrackAccess
} from '~~/server/utils/officeRealtimeAccess'
import { addRealtimeTracks } from '~~/server/utils/officeRealtime'

const SessionDescription = z.object({
  sdp: z.string().min(1),
  type: z.enum(['offer', 'answer'])
})

const LocalTrack = z.object({
  location: z.literal('local'),
  mid: z.string().optional(),
  trackName: z.string().optional(),
  kind: z.enum(['audio', 'video']).optional(),
  bidirectionalMediaStream: z.boolean().optional()
})

const RemoteTrack = z.object({
  location: z.literal('remote'),
  sessionId: z.string().min(1),
  trackName: z.string().min(1),
  kind: z.enum(['audio', 'video']),
  capability: z.string().min(1)
})

const Track = z.discriminatedUnion('location', [LocalTrack, RemoteTrack])

const Body = z.object({
  zone_id: z.string().uuid(),
  sessionDescription: SessionDescription.optional(),
  tracks: z.array(Track).min(1),
  autoDiscover: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event))
  const hasLocalTracks = body.tracks.some(track => track.location === 'local')
  const hasRemoteTracks = body.tracks.some(track => track.location === 'remote')
  if (hasLocalTracks && hasRemoteTracks) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Local publishing and remote pulling must use separate requests'
    })
  }
  if (hasLocalTracks && !body.sessionDescription) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Local publishing requires a WebRTC offer'
    })
  }

  const { appId, appSecret, officeId, sessionId } = await requireOfficeRealtimeAccess(event, {
    scope: hasRemoteTracks ? 'pull' : 'publish',
    zoneId: body.zone_id
  })
  await requireOfficeRealtimeZone(officeId, body.zone_id)

  if (hasRemoteTracks) {
    for (const track of body.tracks) {
      if (track.location !== 'remote') continue
      await requireOfficeRemoteTrackAccess(event, {
        officeId,
        zoneId: body.zone_id,
        publisherSessionId: track.sessionId,
        trackName: track.trackName,
        kind: track.kind,
        capability: track.capability
      })
    }
  }

  return await addRealtimeTracks({
    appId,
    appSecret,
    sessionId,
    sessionDescription: body.sessionDescription,
    tracks: body.tracks.map((track) => {
      if (track.location === 'local') return track
      const { capability: _capability, ...remoteTrack } = track
      return remoteTrack
    }),
    autoDiscover: body.autoDiscover
  })
})
