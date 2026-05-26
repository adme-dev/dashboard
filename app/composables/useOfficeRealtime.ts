import type { Ref } from 'vue'
import type { OfficeMediaSession } from '~~/app/types/office'

export type OfficeRealtimeState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

type RealtimeTrackPayload = {
  location: 'local'
  mid?: string
  trackName?: string
  kind?: 'audio' | 'video'
}

type RealtimeTracksResponse = {
  sessionDescription?: RTCSessionDescriptionInit
  requiresImmediateRenegotiation?: boolean
  tracks?: Array<{
    mid?: string
    status?: 'active' | 'inactive' | 'waiting'
    errorDescription?: string
  }>
}

type RealtimeSessionStateResponse = {
  tracks?: Array<{
    mid?: string
    status?: 'active' | 'inactive' | 'waiting'
    errorDescription?: string
  }>
}

type UseOfficeRealtimeOptions = {
  officeId: Ref<string>
  zoneId: Ref<string>
  mediaSession: Ref<OfficeMediaSession | null | undefined>
  occupantCount?: Ref<number>
  getStreams: () => MediaStream[]
}

function liveMediaTracks(streams: MediaStream[]) {
  return streams.flatMap(stream =>
    stream.getTracks()
      .filter(track =>
        track.readyState === 'live'
        && (track.kind === 'audio' || track.kind === 'video')
      )
      .map(track => ({ stream, track }))
  )
}

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, 1800)

    function done() {
      window.clearTimeout(timeout)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }

    function onChange() {
      if (pc.iceGatheringState === 'complete') done()
    }

    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function transceiverTrackPayloads(pc: RTCPeerConnection): RealtimeTrackPayload[] {
  return pc.getTransceivers()
    .filter(transceiver => transceiver.sender.track)
    .map((transceiver, index) => {
      const track = transceiver.sender.track
      return {
        location: 'local',
        mid: transceiver.mid ?? String(index),
        trackName: track?.id,
        kind: track?.kind === 'audio' || track?.kind === 'video' ? track.kind : undefined
      }
    })
}

function upsertRemoteStream(streams: MediaStream[], next: MediaStream) {
  const index = streams.findIndex(stream => stream.id === next.id)
  if (index === -1) return [...streams, next]
  return streams.map((stream, streamIndex) => streamIndex === index ? next : stream)
}

function removeInactiveRemoteStreams(streams: MediaStream[]) {
  return streams.filter(stream =>
    stream.getTracks().some(track => track.readyState === 'live')
  )
}

export function useOfficeRealtime(options: UseOfficeRealtimeOptions) {
  const state = ref<OfficeRealtimeState>('idle')
  const error = ref<string | null>(null)
  const remoteStreams = ref<MediaStream[]>([])
  const activeSessionId = ref<string | null>(null)
  const activeTrackCount = ref(0)
  const waitingTrackCount = ref(0)

  let pc: RTCPeerConnection | null = null
  let publishRun = 0
  let lastOccupantRefresh = 0
  let publishedTrackMids: string[] = []
  let sessionStateTimer: number | null = null

  function currentPublishedTrackMids(currentPc: RTCPeerConnection | null) {
    const mids = currentPc
      ? currentPc.getTransceivers()
          .map(transceiver => transceiver.mid)
          .filter((mid): mid is string => Boolean(mid))
      : []
    return mids.length ? mids : publishedTrackMids
  }

  async function closePublishedTracks(force = true) {
    const session = options.mediaSession.value
    const officeId = options.officeId.value
    const mids = currentPublishedTrackMids(pc)
    if (!session || !officeId || mids.length === 0) return

    publishedTrackMids = []
    await $fetch(
      `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/tracks/close`,
      {
        method: 'PUT',
        body: {
          zone_id: options.zoneId.value,
          tracks: mids.map(mid => ({ mid })),
          force
        }
      }
    )
  }

  function closePeerConnection(nextState: OfficeRealtimeState = 'closed') {
    if (pc) {
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    remoteStreams.value = []
    activeSessionId.value = null
    activeTrackCount.value = 0
    waitingTrackCount.value = 0
    publishedTrackMids = []
    if (state.value !== 'failed') state.value = nextState
  }

  async function refreshSessionState() {
    const session = options.mediaSession.value
    const officeId = options.officeId.value
    if (!session || !officeId) return

    try {
      const response = await $fetch<RealtimeSessionStateResponse>(
        `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}`,
        {
          query: {
            zone_id: options.zoneId.value
          }
        }
      )
      const tracks = response.tracks ?? []
      activeTrackCount.value = tracks.filter(track => track.status === 'active').length
      waitingTrackCount.value = tracks.filter(track => track.status === 'waiting').length
    } catch {
      // Status polling is advisory; publish/renegotiate errors remain the user-facing failures.
    }
  }

  function startSessionStatePolling() {
    if (sessionStateTimer !== null) return
    void refreshSessionState()
    sessionStateTimer = window.setInterval(() => {
      void refreshSessionState()
    }, 7000)
  }

  function stopSessionStatePolling() {
    if (sessionStateTimer === null) return
    window.clearInterval(sessionStateTimer)
    sessionStateTimer = null
  }

  async function publish() {
    const run = ++publishRun
    const session = options.mediaSession.value
    const officeId = options.officeId.value
    const zoneId = options.zoneId.value
    const tracks = liveMediaTracks(options.getStreams())

    await closePublishedTracks(true).catch(() => {})
    closePeerConnection(tracks.length ? 'connecting' : 'idle')
    error.value = null

    if (!session || !officeId || !zoneId || tracks.length === 0) {
      state.value = session ? 'idle' : 'closed'
      return
    }

    try {
      const nextPc = new RTCPeerConnection()
      pc = nextPc
      activeSessionId.value = session.sessionId
      state.value = 'connecting'

      nextPc.ontrack = (event) => {
        const streams = event.streams.length ? event.streams : [new MediaStream([event.track])]
        for (const stream of streams) {
          remoteStreams.value = upsertRemoteStream(remoteStreams.value, stream)
          for (const track of stream.getTracks()) {
            track.addEventListener('ended', () => {
              remoteStreams.value = removeInactiveRemoteStreams(remoteStreams.value)
            })
          }
        }
      }
      nextPc.onconnectionstatechange = () => {
        if (run !== publishRun) return
        if (nextPc.connectionState === 'connected') state.value = 'connected'
        if (nextPc.connectionState === 'failed' || nextPc.connectionState === 'disconnected') {
          state.value = 'failed'
          error.value = 'Realtime media connection dropped.'
        }
      }

      for (const { stream, track } of tracks) {
        nextPc.addTrack(track, stream)
      }

      const offer = await nextPc.createOffer()
      await nextPc.setLocalDescription(offer)
      await waitForIceGatheringComplete(nextPc)

      const localDescription = nextPc.localDescription
      if (!localDescription) throw new Error('Could not create Realtime offer.')

      const response = await $fetch<RealtimeTracksResponse>(
        `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/tracks`,
        {
          method: 'POST',
          body: {
            zone_id: zoneId,
            sessionDescription: {
              type: localDescription.type,
              sdp: localDescription.sdp
            },
            tracks: transceiverTrackPayloads(nextPc),
            autoDiscover: true
          }
        }
      )

      if (run !== publishRun) {
        nextPc.close()
        return
      }

      publishedTrackMids = (response.tracks ?? [])
        .map(track => track.mid)
        .filter((mid): mid is string => Boolean(mid))
      if (!publishedTrackMids.length) {
        publishedTrackMids = transceiverTrackPayloads(nextPc)
          .map(track => track.mid)
          .filter((mid): mid is string => Boolean(mid))
      }

      if (response.sessionDescription) {
        await nextPc.setRemoteDescription(response.sessionDescription)
        if (response.sessionDescription.type === 'offer') {
          const answer = await nextPc.createAnswer()
          await nextPc.setLocalDescription(answer)
          await waitForIceGatheringComplete(nextPc)

          const answerDescription = nextPc.localDescription
          if (!answerDescription) throw new Error('Could not create Realtime answer.')

          await $fetch(
            `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/renegotiate`,
            {
              method: 'PUT',
              body: {
                zone_id: zoneId,
                sessionDescription: {
                  type: answerDescription.type,
                  sdp: answerDescription.sdp
                }
              }
            }
          )
        }
      }

      state.value = nextPc.connectionState === 'connected' ? 'connected' : 'connecting'
      startSessionStatePolling()
    } catch (err) {
      if (run !== publishRun) return
      closePeerConnection('failed')
      state.value = 'failed'
      error.value = err instanceof Error ? err.message : 'Realtime media failed.'
    }
  }

  function disconnect() {
    publishRun++
    error.value = null
    void closePublishedTracks(true).catch(() => {})
    stopSessionStatePolling()
    closePeerConnection('closed')
  }

  watch(options.mediaSession, (session) => {
    if (session) {
      startSessionStatePolling()
    } else {
      disconnect()
    }
  })

  if (options.occupantCount) {
    watch(options.occupantCount, (next, previous) => {
      if (!options.mediaSession.value || !pc || next === previous) return

      const now = Date.now()
      if (now - lastOccupantRefresh < 2000) return
      lastOccupantRefresh = now
      void publish()
    })
  }

  onBeforeUnmount(disconnect)

  return {
    state,
    error,
    remoteStreams,
    activeSessionId,
    activeTrackCount,
    waitingTrackCount,
    refreshSessionState,
    publish,
    disconnect
  }
}
