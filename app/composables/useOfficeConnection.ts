import type { Ref } from 'vue'
import type {
  OfficeMediaSession,
  OfficeMediaUnavailableReason,
  OfficePresenceEvent,
  OfficePresenceEventKind,
  OfficePresenceEventTarget,
  OfficeParticipant,
  OfficeRemoteTrackCapability,
  OfficeSnapshot,
  OfficeStatus,
  OfficeZoneRow,
  ActorHandle
} from '~~/app/types/office'
import type {
  InboundMessage,
  OutboundMessage
} from '../../workers/office-room/src/types'

interface UseOfficeConnectionOptions {
  officeId: Ref<string | null>
  tokenEndpoint?: Ref<string | null>
  initialZoneId?: Ref<string | null>
}

type OfficeJoinFailure = {
  zoneId: string
  reason: 'denied' | 'full'
  message: string
}

type OfficeMediaUnavailable = {
  zoneId: string
  reason: OfficeMediaUnavailableReason
  message: string
}

export function useOfficeConnection(opts: UseOfficeConnectionOptions) {
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string }
  ) => Promise<T>
  const participants = ref<Map<ActorHandle, OfficeParticipant>>(new Map())
  const zoneOccupancy = ref<Record<string, ActorHandle[]>>({})
  const transientEvents = ref<OfficePresenceEvent[]>([])
  const isConnected = ref(false)
  const lastError = ref<string | null>(null)
  const currentZoneId = ref<string | null>(null)
  const joinFailure = ref<OfficeJoinFailure | null>(null)
  const mediaSession = ref<OfficeMediaSession | null>(null)
  const remoteTrackCapabilities = ref<OfficeRemoteTrackCapability[]>([])
  const mediaUnavailable = ref<OfficeMediaUnavailable | null>(null)
  const zoneNoteUpdates = ref<Record<string, Pick<OfficeZoneRow, 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'>>>({})
  const deletedZoneIds = ref<Set<string>>(new Set())
  const upsertedZones = ref<Record<string, OfficeZoneRow>>({})

  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let mediaGrantRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const eventTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let desiredStatus: OfficeStatus | null = null
  let desiredZoneId: string | null = opts.initialZoneId?.value ?? null

  function applySnapshot(snap: OfficeSnapshot) {
    const m = new Map<ActorHandle, OfficeParticipant>()
    for (const p of snap.participants) m.set(p.handle, p)
    participants.value = m
    zoneOccupancy.value = { ...snap.zoneOccupancy }
  }

  function clearMediaGrantRefreshTimer() {
    if (!mediaGrantRefreshTimer) return
    clearTimeout(mediaGrantRefreshTimer)
    mediaGrantRefreshTimer = null
  }

  function scheduleMediaGrantRefresh(session: OfficeMediaSession) {
    clearMediaGrantRefreshTimer()
    const delay = Math.max(1000, session.grantExpiresAt - Date.now() - 60_000)
    mediaGrantRefreshTimer = setTimeout(() => {
      mediaGrantRefreshTimer = null
      send({ type: 'media:grant-refresh', sessionId: session.sessionId })
    }, delay)
  }

  function clearPresenceState() {
    participants.value = new Map()
    zoneOccupancy.value = {}
    transientEvents.value = []
    currentZoneId.value = null
    joinFailure.value = null
    mediaSession.value = null
    remoteTrackCapabilities.value = []
    mediaUnavailable.value = null
    zoneNoteUpdates.value = {}
    deletedZoneIds.value = new Set()
    upsertedZones.value = {}
    clearMediaGrantRefreshTimer()
    for (const timer of eventTimers.values()) clearTimeout(timer)
    eventTimers.clear()
  }

  function removeTransientEvent(id: string) {
    if (eventTimers.has(id)) {
      clearTimeout(eventTimers.get(id))
      eventTimers.delete(id)
    }
    transientEvents.value = transientEvents.value.filter(event => event.id !== id)
  }

  function addTransientEvent(event: OfficePresenceEvent) {
    removeTransientEvent(event.id)
    transientEvents.value = [...transientEvents.value, event]
      .filter(item => item.expiresAt > Date.now())
      .slice(-24)

    const ttl = Math.max(0, event.expiresAt - Date.now())
    eventTimers.set(event.id, setTimeout(() => removeTransientEvent(event.id), ttl))
  }

  function applyMessage(msg: OutboundMessage) {
    switch (msg.type) {
      case 'snapshot':
        applySnapshot(msg.snapshot)
        return
      case 'participant:joined': {
        const m = new Map(participants.value)
        m.set(msg.handle, {
          handle: msg.handle,
          name: msg.name,
          avatarUrl: msg.avatarUrl,
          role: msg.role,
          status: msg.status,
          currentZoneId: null,
          joinedAt: Date.now(),
          isGuest: msg.isGuest
        })
        participants.value = m
        return
      }
      case 'participant:left': {
        const m = new Map(participants.value)
        const left = m.get(msg.handle)
        m.delete(msg.handle)
        participants.value = m
        if (left?.currentZoneId) {
          const zo = { ...zoneOccupancy.value }
          zo[left.currentZoneId] = (zo[left.currentZoneId] || []).filter(
            h => h !== msg.handle
          )
          zoneOccupancy.value = zo
        }
        return
      }
      case 'participant:updated': {
        const m = new Map(participants.value)
        const p = m.get(msg.handle)
        if (p) m.set(msg.handle, { ...p, status: msg.status })
        participants.value = m
        return
      }
      case 'participant:moved': {
        const m = new Map(participants.value)
        const p = m.get(msg.handle)
        if (!p) return
        const zo = { ...zoneOccupancy.value }
        if (p.currentZoneId) {
          zo[p.currentZoneId] = (zo[p.currentZoneId] || []).filter(
            h => h !== msg.handle
          )
        }
        if (msg.zoneId) {
          zo[msg.zoneId] = [...(zo[msg.zoneId] || []), msg.handle]
        }
        m.set(msg.handle, { ...p, currentZoneId: msg.zoneId })
        participants.value = m
        zoneOccupancy.value = zo
        return
      }
      case 'zone:denied':
        desiredZoneId = null
        currentZoneId.value = null
        remoteTrackCapabilities.value = []
        joinFailure.value = {
          zoneId: msg.zoneId,
          reason: 'denied',
          message: `Zone access denied: ${msg.reason}`
        }
        lastError.value = joinFailure.value.message
        return
      case 'zone:full':
        desiredZoneId = null
        currentZoneId.value = null
        remoteTrackCapabilities.value = []
        joinFailure.value = {
          zoneId: msg.zoneId,
          reason: 'full',
          message: 'Room is full'
        }
        lastError.value = joinFailure.value.message
        return
      case 'zone:entered':
        desiredZoneId = msg.zoneId
        currentZoneId.value = msg.zoneId
        joinFailure.value = null
        mediaSession.value = null
        clearMediaGrantRefreshTimer()
        remoteTrackCapabilities.value = []
        mediaUnavailable.value = null
        lastError.value = null
        return
      case 'zone:media-session':
        if (currentZoneId.value === msg.zoneId) {
          mediaSession.value = msg.media
          mediaUnavailable.value = null
          scheduleMediaGrantRefresh(msg.media)
        }
        return
      case 'zone:media-tracks':
        if (currentZoneId.value === msg.zoneId) {
          remoteTrackCapabilities.value = msg.tracks.filter(track => track.expiresAt > Date.now())
        }
        return
      case 'zone:media-unavailable':
        if (currentZoneId.value === msg.zoneId) {
          mediaSession.value = null
          clearMediaGrantRefreshTimer()
          mediaUnavailable.value = {
            zoneId: msg.zoneId,
            reason: msg.reason,
            message: msg.message ?? 'Realtime media is unavailable.'
          }
        }
        return
      case 'zone:notes-updated':
        zoneNoteUpdates.value = {
          ...zoneNoteUpdates.value,
          [msg.zoneId]: {
            notes: msg.notes,
            notes_version: msg.version,
            notes_updated_at: msg.updatedAt,
            notes_updated_by: msg.updatedBy
          }
        }
        return
      case 'zone:taken-over':
        currentZoneId.value = null
        joinFailure.value = null
        mediaSession.value = null
        clearMediaGrantRefreshTimer()
        remoteTrackCapabilities.value = []
        mediaUnavailable.value = null
        lastError.value = 'This room session moved to another tab.'
        disconnect()
        return
      case 'zone:evicted':
        currentZoneId.value = null
        desiredZoneId = null
        joinFailure.value = {
          zoneId: msg.zoneId,
          reason: 'denied',
          message: 'You were removed from this room by an office admin.'
        }
        mediaSession.value = null
        clearMediaGrantRefreshTimer()
        remoteTrackCapabilities.value = []
        mediaUnavailable.value = null
        lastError.value = joinFailure.value.message
        return
      case 'zone:access-revoked':
        currentZoneId.value = null
        desiredZoneId = null
        joinFailure.value = {
          zoneId: msg.zoneId,
          reason: 'denied',
          message: `Room access changed: ${msg.reason}`
        }
        mediaSession.value = null
        clearMediaGrantRefreshTimer()
        remoteTrackCapabilities.value = []
        mediaUnavailable.value = null
        lastError.value = joinFailure.value.message
        return
      case 'zone:deleted': {
        deletedZoneIds.value = new Set([...deletedZoneIds.value, msg.zoneId])
        const { [msg.zoneId]: _removedZone, ...remainingZones } = upsertedZones.value
        upsertedZones.value = remainingZones
        const { [msg.zoneId]: _removedOccupancy, ...remainingOccupancy } = zoneOccupancy.value
        zoneOccupancy.value = remainingOccupancy
        if (currentZoneId.value === msg.zoneId || desiredZoneId === msg.zoneId) {
          currentZoneId.value = null
          desiredZoneId = null
          joinFailure.value = {
            zoneId: msg.zoneId,
            reason: 'denied',
            message: msg.reason
          }
          mediaSession.value = null
          clearMediaGrantRefreshTimer()
          remoteTrackCapabilities.value = []
          mediaUnavailable.value = null
          lastError.value = msg.reason
        }
        return
      }
      case 'zone:upserted':
        deletedZoneIds.value = new Set([...deletedZoneIds.value].filter(zoneId => zoneId !== msg.zone.id))
        upsertedZones.value = {
          ...upsertedZones.value,
          [msg.zone.id]: msg.zone
        }
        return
      case 'presence:event':
        addTransientEvent(msg.event)
        return
      case 'error':
        lastError.value = msg.message
        return
    }
  }

  // Set true by disconnect() so the subsequent onclose doesn't schedule a
  // phantom reconnect to an office we deliberately left.
  let intentionallyClosed = false

  async function fetchHandshake(officeId: string): Promise<{ token: string, workerUrl: string }> {
    return await apiFetch<{ token: string, workerUrl: string, exp: number }>(
      opts.tokenEndpoint?.value ?? `/api/office/${officeId}/token`,
      { method: 'POST' }
    )
  }

  async function connect() {
    if (!opts.officeId.value) return
    // Block when CONNECTING(0), OPEN(1), or CLOSING(2) — only CLOSED(3)
    // and `null` should let us open a new socket.
    if (ws && ws.readyState !== WebSocket.CLOSED) return
    // Browser-only — never run during SSR
    if (typeof window === 'undefined') return

    intentionallyClosed = false
    const officeId = opts.officeId.value

    let handshake: { token: string, workerUrl: string }
    try {
      handshake = await fetchHandshake(officeId)
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 401 || status === 403) {
        lastError.value = status === 401
          ? 'Your session expired — please log in again.'
          : 'You are not a member of this office.'
        // Don't schedule reconnect on permanent auth failures
        return
      }
      lastError.value = `Couldn't authenticate to office: ${(err as Error).message}`
      scheduleReconnect()
      return
    }

    // Bail if officeId changed while we were fetching the handshake
    if (opts.officeId.value !== officeId) return

    ws = new WebSocket(
      `${handshake.workerUrl}/office/${officeId}?t=${encodeURIComponent(handshake.token)}`
    )

    ws.onopen = () => {
      isConnected.value = true
      reconnectAttempt = 0
      replayDesiredState()
      heartbeatTimer = setInterval(() => {
        ws?.send(JSON.stringify({ type: 'heartbeat' } satisfies InboundMessage))
      }, 20_000)
    }

    ws.onmessage = (e) => {
      try {
        applyMessage(JSON.parse(e.data as string) as OutboundMessage)
      } catch {
        /* ignore */
      }
    }

    ws.onclose = (e) => {
      isConnected.value = false
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      // Don't reconnect on intentional close OR on auth-permanent codes
      if (intentionallyClosed) return
      if (e.code === 4001 || e.code === 4003) {
        lastError.value = 'Session expired — please reload the page.'
        return
      }
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    const delays = [1_000, 2_000, 5_000, 10_000]
    const delay = delays[Math.min(reconnectAttempt, delays.length - 1)]!
    reconnectAttempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function disconnect() {
    intentionallyClosed = true
    isConnected.value = false
    clearPresenceState()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    ws?.close()
    ws = null
  }

  function send(msg: InboundMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }

  function replayDesiredState() {
    if (desiredStatus) {
      send({ type: 'status:set', status: desiredStatus })
    }
    if (desiredZoneId) {
      send({ type: 'zone:enter', zoneId: desiredZoneId })
    }
  }

  function setStatus(status: OfficeStatus) {
    desiredStatus = status
    send({ type: 'status:set', status })
  }
  function enterZone(zoneId: string) {
    desiredZoneId = zoneId
    joinFailure.value = null
    mediaSession.value = null
    clearMediaGrantRefreshTimer()
    remoteTrackCapabilities.value = []
    mediaUnavailable.value = null
    send({ type: 'zone:enter', zoneId })
  }
  function leaveZone() {
    desiredZoneId = null
    currentZoneId.value = null
    joinFailure.value = null
    mediaSession.value = null
    clearMediaGrantRefreshTimer()
    remoteTrackCapabilities.value = []
    mediaUnavailable.value = null
    send({ type: 'zone:leave' })
  }
  function sendPresenceEvent(kind: OfficePresenceEventKind, target: OfficePresenceEventTarget) {
    send({ type: 'presence:event', kind, target })
  }
  function announcePublishedTracks(
    sessionId: string,
    tracks: Array<{ trackName: string, kind: 'audio' | 'video' }>
  ) {
    return send({ type: 'media:tracks-published', sessionId, tracks })
  }
  function evictParticipant(handle: ActorHandle) {
    send({ type: 'participant:evict', handle })
  }
  function sendZoneNotesUpdated(zone: Pick<OfficeZoneRow, 'id' | 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'>) {
    zoneNoteUpdates.value = {
      ...zoneNoteUpdates.value,
      [zone.id]: {
        notes: zone.notes,
        notes_version: zone.notes_version,
        notes_updated_at: zone.notes_updated_at,
        notes_updated_by: zone.notes_updated_by
      }
    }
    send({
      type: 'zone:notes-updated',
      zoneId: zone.id,
      notes: zone.notes,
      version: zone.notes_version,
      updatedAt: zone.notes_updated_at,
      updatedBy: zone.notes_updated_by
    })
  }

  watch(
    () => opts.initialZoneId?.value ?? null,
    (zoneId) => {
      if (!zoneId || desiredZoneId === zoneId) return
      desiredZoneId = zoneId
      joinFailure.value = null
      mediaSession.value = null
      clearMediaGrantRefreshTimer()
      remoteTrackCapabilities.value = []
      mediaUnavailable.value = null
      send({ type: 'zone:enter', zoneId })
    }
  )

  watch(
    () => opts.officeId.value,
    (newId, oldId) => {
      if (oldId) {
        disconnect()
      }
      if (newId) {
        desiredZoneId = opts.initialZoneId?.value ?? null
        connect()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(disconnect)

  return {
    participants,
    zoneOccupancy,
    transientEvents,
    isConnected,
    lastError,
    currentZoneId,
    joinFailure,
    mediaSession,
    remoteTrackCapabilities,
    mediaUnavailable,
    zoneNoteUpdates,
    deletedZoneIds,
    upsertedZones,
    disconnect,
    setStatus,
    enterZone,
    leaveZone,
    sendPresenceEvent,
    announcePublishedTracks,
    evictParticipant,
    sendZoneNotesUpdated
  }
}
