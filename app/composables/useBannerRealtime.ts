import type { Layer } from '~/types/banner-studio'

// ── Types ──────────────────────────────
export interface CollabUser {
  userId: string
  userName: string
  userAvatar?: string
  color: string
}

export interface RemoteCursor {
  userId: string
  userName: string
  color: string
  x: number
  y: number
  formatKey: string
  lastUpdate: number
}

export interface RemoteLock {
  userId: string
  userName: string
  color: string
}

// ── Module-scope singletons ─────────────
const remoteUsers = ref<CollabUser[]>([])
const remoteCursors = ref<Map<string, RemoteCursor>>(new Map())
const remoteLocks = ref<Map<number, RemoteLock>>(new Map())
const isConnected = ref(false)
const myColor = ref('#4a8fe8')

let ws: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let staleCursorTimer: ReturnType<typeof setInterval> | null = null
let reconnectAttempts = 0
let currentProjectId: string | null = null
let myUserId: string | null = null

// Cursor throttle state
let lastCursorSend = 0
let pendingCursor: { x: number; y: number; formatKey: string } | null = null
let cursorRafId: number | null = null

export function useBannerRealtime() {
  function connect(projectId: string): void {
    if (ws && currentProjectId === projectId) return
    disconnect()
    currentProjectId = projectId

    // Get current user ID from auth state
    const { user } = useAuth()
    myUserId = user.value?.id || null
    if (!myUserId) return

    attemptConnect(projectId)
  }

  function attemptConnect(projectId: string): void {
    // Build WS URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/agency/banner-studio/${projectId}/connect`

    try {
      ws = new WebSocket(wsUrl)
    } catch {
      handleConnectionFailure()
      return
    }

    ws.onopen = () => {
      isConnected.value = true
      reconnectAttempts = 0

      // Start heartbeat
      heartbeatTimer = setInterval(() => {
        sendRaw({ type: 'heartbeat' })
      }, 15_000)

      // Start stale cursor cleanup
      staleCursorTimer = setInterval(() => {
        const now = Date.now()
        let changed = false
        for (const [id] of remoteCursors.value) {
          const cursor = remoteCursors.value.get(id)
          if (cursor && now - cursor.lastUpdate > 5_000) {
            remoteCursors.value.delete(id)
            changed = true
          }
        }
        if (changed) triggerRef(remoteCursors)
      }, 2_000)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      cleanup()
      if (currentProjectId && reconnectAttempts < 3) {
        reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 8000)
        setTimeout(() => {
          if (currentProjectId) attemptConnect(currentProjectId)
        }, delay)
      }
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }

  function handleConnectionFailure(): void {
    isConnected.value = false
    // Silent single-user mode — all send* methods become no-ops
  }

  function handleMessage(data: any): void {
    switch (data.type) {
      case 'history': {
        // Initial state from DO
        if (data.myColor) myColor.value = data.myColor
        if (data.users) remoteUsers.value = (data.users as CollabUser[]).filter(u => u.userId !== myUserId)
        if (data.locks) {
          remoteLocks.value = new Map(
            Object.entries(data.locks).map(([k, v]: [string, any]) => [Number(k), v as RemoteLock])
          )
        }
        break
      }
      case 'presence': {
        remoteUsers.value = (data.users as CollabUser[]).filter(u => u.userId !== myUserId)
        break
      }
      case 'cursor': {
        if (data.userId === myUserId) break
        const cursor: RemoteCursor = {
          userId: data.userId,
          userName: data.userName,
          color: data.color,
          x: data.x,
          y: data.y,
          formatKey: data.formatKey,
          lastUpdate: Date.now(),
        }
        remoteCursors.value.set(data.userId, cursor)
        triggerRef(remoteCursors)
        break
      }
      case 'layer_locked': {
        remoteLocks.value.set(data.layerId, {
          userId: data.userId,
          userName: data.userName,
          color: data.color,
        })
        triggerRef(remoteLocks)
        break
      }
      case 'layer_unlocked': {
        remoteLocks.value.delete(data.layerId)
        triggerRef(remoteLocks)
        break
      }
      case 'layer_updated': {
        if (data.userId === myUserId) break
        applyRemoteLayerUpdate(data.formatKey, data.layerId, data.props)
        break
      }
      case 'layer_added': {
        if (data.userId === myUserId) break
        applyRemoteLayerAdd(data.formatKey, data.layer)
        break
      }
      case 'layer_removed': {
        if (data.userId === myUserId) break
        applyRemoteLayerRemove(data.formatKey, data.layerId)
        break
      }
      case 'layer_reordered': {
        if (data.userId === myUserId) break
        applyRemoteLayerReorder(data.formatKey, data.layerId, data.newZIndex)
        break
      }
    }
  }

  // ── Apply remote changes (no undo, no re-broadcast) ──
  function applyRemoteLayerUpdate(formatKey: string, layerId: number, props: Partial<Layer>): void {
    const { state } = useBannerStudio()
    const layers = state.sets[formatKey]?.layers
    if (!layers) return
    const layer = layers.find(l => l.id === layerId)
    if (layer) Object.assign(layer, props)
  }

  function applyRemoteLayerAdd(formatKey: string, layer: Layer): void {
    const { state } = useBannerStudio()
    if (!state.sets[formatKey]) state.sets[formatKey] = { layers: [] }
    // Avoid duplicate
    const existing = state.sets[formatKey].layers.find(l => l.id === layer.id)
    if (!existing) state.sets[formatKey].layers.push(layer)
  }

  function applyRemoteLayerRemove(formatKey: string, layerId: number): void {
    const { state } = useBannerStudio()
    const layers = state.sets[formatKey]?.layers
    if (!layers) return
    const idx = layers.findIndex(l => l.id === layerId)
    if (idx >= 0) layers.splice(idx, 1)
  }

  function applyRemoteLayerReorder(formatKey: string, layerId: number, newZIndex: number): void {
    const { state } = useBannerStudio()
    const layers = state.sets[formatKey]?.layers
    if (!layers) return
    const layer = layers.find(l => l.id === layerId)
    if (layer) layer.zIndex = newZIndex
  }

  // ── Outbound messages ───────────────────
  function sendRaw(data: object): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(data))
  }

  function sendCursorMove(x: number, y: number, formatKey: string): void {
    if (!isConnected.value) return
    pendingCursor = { x, y, formatKey }
    const now = performance.now()
    if (now - lastCursorSend < 83) {
      // Throttle: schedule via rAF if not already scheduled
      if (!cursorRafId) {
        cursorRafId = requestAnimationFrame(() => {
          cursorRafId = null
          if (pendingCursor) {
            sendRaw({ type: 'cursor_move', ...pendingCursor })
            lastCursorSend = performance.now()
            pendingCursor = null
          }
        })
      }
      return
    }
    sendRaw({ type: 'cursor_move', x, y, formatKey })
    lastCursorSend = now
    pendingCursor = null
  }

  function sendLayerSelect(layerId: number | null, formatKey: string): void {
    if (!isConnected.value) return
    sendRaw({ type: 'layer_select', layerId, formatKey })
  }

  function sendLayerUpdate(layerId: number, formatKey: string, props: Partial<Layer>): void {
    if (!isConnected.value) return
    sendRaw({ type: 'layer_update', layerId, formatKey, props })
  }

  function sendLayerAdd(layer: Layer, formatKey: string): void {
    if (!isConnected.value) return
    sendRaw({ type: 'layer_add', layer: JSON.parse(JSON.stringify(layer)), formatKey })
  }

  function sendLayerRemove(layerId: number, formatKey: string): void {
    if (!isConnected.value) return
    sendRaw({ type: 'layer_remove', layerId, formatKey })
  }

  function sendLayerReorder(layerId: number, formatKey: string, newZIndex: number): void {
    if (!isConnected.value) return
    sendRaw({ type: 'layer_reorder', layerId, formatKey, newZIndex })
  }

  // ── Query ───────────────────────────────
  function isLayerLockedByOther(layerId: number): boolean {
    const lock = remoteLocks.value.get(layerId)
    return !!lock && lock.userId !== myUserId
  }

  function getLayerLockOwner(layerId: number): RemoteLock | null {
    return remoteLocks.value.get(layerId) || null
  }

  // ── Cleanup ─────────────────────────────
  function cleanup(): void {
    isConnected.value = false
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (staleCursorTimer) { clearInterval(staleCursorTimer); staleCursorTimer = null }
    if (cursorRafId) { cancelAnimationFrame(cursorRafId); cursorRafId = null }
  }

  function disconnect(): void {
    cleanup()
    if (ws) {
      try { ws.close(1000, 'Leaving') } catch {}
      ws = null
    }
    currentProjectId = null
    reconnectAttempts = 0
    remoteUsers.value = []
    remoteCursors.value = new Map()
    remoteLocks.value = new Map()
  }

  return {
    // Reactive state
    remoteUsers,
    remoteCursors,
    remoteLocks,
    isConnected,
    myColor,

    // Connection
    connect,
    disconnect,

    // Outbound
    sendCursorMove,
    sendLayerSelect,
    sendLayerUpdate,
    sendLayerAdd,
    sendLayerRemove,
    sendLayerReorder,

    // Query
    isLayerLockedByOther,
    getLayerLockOwner,
  }
}
