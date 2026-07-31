import type { Ref } from 'vue'
import type { OfficeMediaSession, OfficeRemoteTrackCapability } from '~~/app/types/office'

export type OfficeRealtimeState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

type RealtimeTrackPayload
  = | {
    location: 'local'
    mid?: string
    trackName?: string
    kind?: 'audio' | 'video'
  }
  | {
    location: 'remote'
    sessionId: string
    trackName: string
    kind: 'audio' | 'video'
    capability: string
  }

type RealtimeTracksResponse = {
  sessionDescription?: RTCSessionDescriptionInit
  requiresImmediateRenegotiation?: boolean
  tracks?: Array<{
    mid?: string
    location?: 'local' | 'remote'
    sessionId?: string
    trackName?: string
    kind?: 'audio' | 'video'
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
  remoteTracks?: Ref<OfficeRemoteTrackCapability[]>
  announcePublishedTracks?: (
    sessionId: string,
    tracks: Array<{ trackName: string, kind: 'audio' | 'video' }>
  ) => void
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

function transceiverTrackPayloads(
  pc: RTCPeerConnection
): Array<Extract<RealtimeTrackPayload, { location: 'local' }>> {
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
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: {
      method?: string
      body?: unknown
      query?: Record<string, unknown>
      headers?: Record<string, string>
    }
  ) => Promise<T>
  const state = ref<OfficeRealtimeState>('idle')
  const error = ref<string | null>(null)
  const remoteStreams = ref<MediaStream[]>([])
  const activeSessionId = ref<string | null>(null)
  const activeTrackCount = ref(0)
  const waitingTrackCount = ref(0)

  let pc: RTCPeerConnection | null = null
  let activeMediaSession: OfficeMediaSession | null = null
  let activeZoneId = ''
  let publishRun = 0
  let publishInProgress = false
  let sessionTrackMids: string[] = []
  const pulledTrackKeys = new Set<string>()
  let remotePullQueue = Promise.resolve()
  let sessionStateTimer: number | null = null

  function authorizationHeaders(session: OfficeMediaSession) {
    return { Authorization: `Bearer ${session.grant}` }
  }

  function remoteTrackKey(track: Pick<OfficeRemoteTrackCapability, 'publisherSessionId' | 'trackName' | 'kind'>) {
    return `${track.publisherSessionId}:${track.kind}:${track.trackName}`
  }

  async function closeSessionTracks(force = true) {
    const currentSession = options.mediaSession.value
    const session = currentSession?.sessionId === activeMediaSession?.sessionId
      ? currentSession
      : activeMediaSession ?? currentSession
    const officeId = options.officeId.value
    const zoneId = activeZoneId || options.zoneId.value
    const mids = [...sessionTrackMids]
    if (!session || !officeId) return

    sessionTrackMids = []
    pulledTrackKeys.clear()
    options.announcePublishedTracks?.(session.sessionId, [])
    if (mids.length === 0) return
    await apiFetch(
      `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/tracks/close`,
      {
        method: 'PUT',
        headers: authorizationHeaders(session),
        body: {
          zone_id: zoneId,
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
    sessionTrackMids = []
    pulledTrackKeys.clear()
    if (state.value !== 'failed') state.value = nextState
  }

  async function refreshSessionState() {
    const session = options.mediaSession.value
    const officeId = options.officeId.value
    if (!session || !officeId) return

    try {
      const response = await apiFetch<RealtimeSessionStateResponse>(
        `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}`,
        {
          headers: authorizationHeaders(session),
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

  function configurePeerConnection(nextPc: RTCPeerConnection, run: number) {
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
  }

  async function applyNegotiation(
    response: RealtimeTracksResponse,
    nextPc: RTCPeerConnection,
    session: OfficeMediaSession,
    officeId: string,
    zoneId: string
  ) {
    if (!response.sessionDescription) return
    await nextPc.setRemoteDescription(response.sessionDescription)
    if (response.sessionDescription.type !== 'offer') return

    const answer = await nextPc.createAnswer()
    await nextPc.setLocalDescription(answer)
    await waitForIceGatheringComplete(nextPc)
    const answerDescription = nextPc.localDescription
    if (!answerDescription) throw new Error('Could not create Realtime answer.')

    await apiFetch(
      `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/renegotiate`,
      {
        method: 'PUT',
        headers: authorizationHeaders(session),
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

  async function pullRemoteTracks(
    nextPc: RTCPeerConnection,
    run: number,
    session: OfficeMediaSession,
    officeId: string,
    zoneId: string
  ) {
    const now = Date.now()
    const remoteTracks = (options.remoteTracks?.value ?? [])
      .filter(track => track.expiresAt > now && !pulledTrackKeys.has(remoteTrackKey(track)))
    if (!remoteTracks.length) return

    const response = await apiFetch<RealtimeTracksResponse>(
      `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/tracks`,
      {
        method: 'POST',
        headers: authorizationHeaders(session),
        body: {
          zone_id: zoneId,
          tracks: remoteTracks.map(track => ({
            location: 'remote' as const,
            sessionId: track.publisherSessionId,
            trackName: track.trackName,
            kind: track.kind,
            capability: track.capability
          }))
        }
      }
    )
    if (run !== publishRun || pc !== nextPc) return

    await applyNegotiation(response, nextPc, session, officeId, zoneId)
    for (const track of remoteTracks) pulledTrackKeys.add(remoteTrackKey(track))
    sessionTrackMids.push(
      ...(response.tracks ?? [])
        .map(track => track.mid)
        .filter((mid): mid is string => Boolean(mid) && !sessionTrackMids.includes(mid))
    )
  }

  async function publish() {
    const run = ++publishRun
    const session = options.mediaSession.value
    const officeId = options.officeId.value
    const zoneId = options.zoneId.value
    const tracks = liveMediaTracks(options.getStreams())
    const hasRemoteTracks = Boolean(options.remoteTracks?.value.some(track => track.expiresAt > Date.now()))

    publishInProgress = true
    try {
      await closeSessionTracks(true).catch(() => {})
      closePeerConnection(tracks.length || hasRemoteTracks ? 'connecting' : 'idle')
      error.value = null

      if (!session || !officeId || !zoneId || (!tracks.length && !hasRemoteTracks)) {
        activeMediaSession = session ?? null
        activeZoneId = zoneId
        state.value = session ? 'idle' : 'closed'
        return
      }

      activeMediaSession = session
      activeZoneId = zoneId
      const nextPc = new RTCPeerConnection()
      pc = nextPc
      activeSessionId.value = session.sessionId
      state.value = 'connecting'
      configurePeerConnection(nextPc, run)

      if (tracks.length) {
        for (const { stream, track } of tracks) {
          nextPc.addTrack(track, stream)
        }
        const offer = await nextPc.createOffer()
        await nextPc.setLocalDescription(offer)
        await waitForIceGatheringComplete(nextPc)
        const localDescription = nextPc.localDescription
        if (!localDescription) throw new Error('Could not create Realtime offer.')
        const localPayloads = transceiverTrackPayloads(nextPc)
        const response = await apiFetch<RealtimeTracksResponse>(
          `/api/office/${encodeURIComponent(officeId)}/realtime/${encodeURIComponent(session.sessionId)}/tracks`,
          {
            method: 'POST',
            headers: authorizationHeaders(session),
            body: {
              zone_id: zoneId,
              sessionDescription: {
                type: localDescription.type,
                sdp: localDescription.sdp
              },
              tracks: localPayloads,
              autoDiscover: true
            }
          }
        )
        if (run !== publishRun) {
          nextPc.close()
          return
        }

        const responseTracks = response.tracks ?? []
        sessionTrackMids.push(
          ...responseTracks
            .map(track => track.mid)
            .filter((mid): mid is string => Boolean(mid))
        )
        if (!sessionTrackMids.length) {
          sessionTrackMids = localPayloads
            .map(track => track.mid)
            .filter((mid): mid is string => Boolean(mid))
        }
        const announced = responseTracks.map((track, index) => ({
          trackName: track.trackName ?? localPayloads[index]?.trackName,
          kind: track.kind ?? localPayloads[index]?.kind
        })).filter(
          (track): track is { trackName: string, kind: 'audio' | 'video' } =>
            Boolean(track.trackName) && (track.kind === 'audio' || track.kind === 'video')
        )
        options.announcePublishedTracks?.(session.sessionId, announced)
        await applyNegotiation(response, nextPc, session, officeId, zoneId)
      }

      await pullRemoteTracks(nextPc, run, session, officeId, zoneId)
      state.value = nextPc.connectionState === 'connected' ? 'connected' : 'connecting'
      startSessionStatePolling()
    } catch (err) {
      if (run !== publishRun) return
      closePeerConnection('failed')
      state.value = 'failed'
      error.value = err instanceof Error ? err.message : 'Realtime media failed.'
    } finally {
      publishInProgress = false
    }
  }

  function disconnect() {
    publishRun++
    error.value = null
    void closeSessionTracks(true).catch(() => {})
    activeMediaSession = null
    activeZoneId = ''
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

  if (options.remoteTracks) {
    watch(options.remoteTracks, (tracks) => {
      if (!options.mediaSession.value || !pc || publishInProgress) return
      const activeKeys = new Set(
        tracks
          .filter(track => track.expiresAt > Date.now())
          .map(remoteTrackKey)
      )
      const removed = [...pulledTrackKeys].some(key => !activeKeys.has(key))
      if (removed) {
        void publish()
        return
      }
      const currentPc = pc
      const currentRun = publishRun
      const currentSession = options.mediaSession.value
      remotePullQueue = remotePullQueue.then(() => pullRemoteTracks(
        currentPc,
        currentRun,
        currentSession,
        options.officeId.value,
        options.zoneId.value
      )).catch((err) => {
        state.value = 'failed'
        error.value = err instanceof Error ? err.message : 'Remote media failed.'
      })
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
