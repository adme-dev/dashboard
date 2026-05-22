import type { Ref } from 'vue'
import type {
  OfficeParticipant,
  OfficeSnapshot,
  OfficeStatus,
  ActorHandle
} from '~~/app/types/office'
import type {
  InboundMessage,
  OutboundMessage
} from '../../workers/office-room/src/types'

interface UseOfficeConnectionOptions {
  officeId: Ref<string | null>
}

export function useOfficeConnection(opts: UseOfficeConnectionOptions) {
  const participants = ref<Map<ActorHandle, OfficeParticipant>>(new Map())
  const zoneOccupancy = ref<Record<string, ActorHandle[]>>({})
  const isConnected = ref(false)
  const lastError = ref<string | null>(null)

  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  function applySnapshot(snap: OfficeSnapshot) {
    const m = new Map<ActorHandle, OfficeParticipant>()
    for (const p of snap.participants) m.set(p.handle, p)
    participants.value = m
    zoneOccupancy.value = { ...snap.zoneOccupancy }
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
          role: 'member',
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
        lastError.value = `Zone access denied: ${msg.reason}`
        return
      case 'zone:full':
        lastError.value = 'Room is full'
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
    return await $fetch<{ token: string, workerUrl: string, exp: number }>(
      `/api/office/${officeId}/token`,
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
    }
  }

  function setStatus(status: OfficeStatus) {
    send({ type: 'status:set', status })
  }
  function enterZone(zoneId: string) {
    send({ type: 'zone:enter', zoneId })
  }
  function leaveZone() {
    send({ type: 'zone:leave' })
  }

  watch(
    () => opts.officeId.value,
    (newId, oldId) => {
      if (oldId) disconnect()
      if (newId) connect()
    },
    { immediate: true }
  )

  onBeforeUnmount(disconnect)

  return {
    participants,
    zoneOccupancy,
    isConnected,
    lastError,
    setStatus,
    enterZone,
    leaveZone
  }
}
