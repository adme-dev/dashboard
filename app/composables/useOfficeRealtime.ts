import type { Ref } from 'vue'
import type { MediaCredentials } from '~~/app/types/office'

// ─── Public types ─────────────────────────────────────────────────────────────

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface RemoteParticipant {
  peerId: string
  customParticipantId: string | null
  name: string
  audioTrack: MediaStreamTrack | null
  videoTrack: MediaStreamTrack | null
  isScreenSharing: boolean
  micMuted: boolean
}

export interface UseOfficeRealtimeOptions {
  credentials: Ref<MediaCredentials | null>
}

// ─── SDK lazy-loader ──────────────────────────────────────────────────────────
// Dynamic import keeps RealtimeKit out of non-office bundles and out of SSR.

type RealtimeKitClientCtor = typeof import('@cloudflare/realtimekit').default

let SDKPromise: Promise<RealtimeKitClientCtor> | null = null

function loadSDK(): Promise<RealtimeKitClientCtor> {
  if (!SDKPromise) {
    SDKPromise = import('@cloudflare/realtimekit').then(m => m.default)
  }
  return SDKPromise
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useOfficeRealtime(opts: UseOfficeRealtimeOptions) {
  // State
  const state = ref<RealtimeState>('idle')
  const lastError = ref<string | null>(null)

  // Local tracks / toggles
  const localAudioTrack = ref<MediaStreamTrack | null>(null)
  const localVideoTrack = ref<MediaStreamTrack | null>(null)
  const localMicEnabled = ref(false)
  const localCamEnabled = ref(false)
  const localScreenEnabled = ref(false)

  // Remote participant list
  const participants = ref<RemoteParticipant[]>([])

  // SDK Client — stored in shallowRef to prevent Vue from tracking SDK internals
  const clientRef = shallowRef<InstanceType<RealtimeKitClientCtor> | null>(null)

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function rebuildLocal(c: InstanceType<RealtimeKitClientCtor>): void {
    const s = c.self as any
    localAudioTrack.value = s.audioEnabled && s.audioTrack ? s.audioTrack : null
    localVideoTrack.value = s.videoEnabled && s.videoTrack ? s.videoTrack : null
    localMicEnabled.value = Boolean(s.audioEnabled)
    localCamEnabled.value = Boolean(s.videoEnabled)
    localScreenEnabled.value = Boolean(s.screenShareEnabled)
  }

  function rebuildParticipants(c: InstanceType<RealtimeKitClientCtor>): void {
    // ClientMap extends Map<string, Participant>, so .values() is standard Map iteration
    const joined = c.participants.joined as any
    const list: RemoteParticipant[] = []

    let iter: Iterable<any>
    if (typeof joined.values === 'function') {
      iter = joined.values()
    } else if (typeof joined.toArray === 'function') {
      iter = joined.toArray()
    } else {
      iter = Array.from(joined)
    }

    for (const p of iter) {
      list.push({
        peerId: p.id,
        customParticipantId: p.customParticipantId ?? null,
        name: p.name ?? 'Participant',
        audioTrack: p.audioEnabled && p.audioTrack ? p.audioTrack : null,
        videoTrack: p.videoEnabled && p.videoTrack ? p.videoTrack : null,
        isScreenSharing: p.screenShareEnabled === true,
        micMuted: !p.audioEnabled,
      })
    }
    participants.value = list
  }

  function wireParticipant(p: any, c: InstanceType<RealtimeKitClientCtor>): void {
    const onUpdate = () => rebuildParticipants(c)
    p.on('videoUpdate', onUpdate)
    p.on('audioUpdate', onUpdate)
    p.on('screenShareUpdate', onUpdate)
  }

  // ─── Connect ─────────────────────────────────────────────────────────────

  async function connect(creds: MediaCredentials): Promise<void> {
    // Tear down any existing session first
    if (state.value === 'connecting' || state.value === 'connected') {
      await disconnect()
    }

    state.value = 'connecting'
    lastError.value = null

    try {
      const SDK = await loadSDK()
      const client = await SDK.init({ authToken: creds.authToken })
      clientRef.value = client

      // Wire local self events
      const onLocal = () => rebuildLocal(client)
      const self = client.self as any
      self.on('videoUpdate', onLocal)
      self.on('audioUpdate', onLocal)
      self.on('screenShareUpdate', onLocal)
      onLocal()

      // Wire participant map events
      const onParticipants = () => rebuildParticipants(client)
      const joined = client.participants.joined as any

      joined.on('participantJoined', (p: any) => {
        wireParticipant(p, client)
        onParticipants()
      })
      joined.on('participantLeft', onParticipants)
      joined.on('participantsUpdate', onParticipants)
      joined.on('participantsCleared', onParticipants)

      // Wire any participants already present before we subscribed
      let existingIter: Iterable<any>
      if (typeof joined.values === 'function') {
        existingIter = joined.values()
      } else if (typeof joined.toArray === 'function') {
        existingIter = joined.toArray()
      } else {
        existingIter = Array.from(joined)
      }
      for (const p of existingIter) {
        wireParticipant(p, client)
      }
      onParticipants()

      await client.join()
      state.value = 'connected'
    } catch (err) {
      state.value = 'failed'
      lastError.value = (err as Error)?.message ?? String(err)
      // Best-effort cleanup — ignore secondary errors
      await disconnect()
    }
  }

  // ─── Disconnect ──────────────────────────────────────────────────────────

  async function disconnect(): Promise<void> {
    const c = clientRef.value
    clientRef.value = null

    // Clear all local reactive state
    localAudioTrack.value = null
    localVideoTrack.value = null
    localMicEnabled.value = false
    localCamEnabled.value = false
    localScreenEnabled.value = false
    participants.value = []

    if (!c) {
      // Only update state if we're not already in a terminal/error state
      if (state.value !== 'failed') {
        state.value = 'closed'
      }
      return
    }

    try {
      await (c as any).leaveRoom()
    } catch {
      // Best-effort — ignore errors on leave
    }

    if (state.value !== 'failed') {
      state.value = 'closed'
    }
  }

  // ─── Toggle helpers ───────────────────────────────────────────────────────

  async function toggleMic(): Promise<void> {
    const c = clientRef.value
    if (!c) return
    try {
      if (c.self.audioEnabled) {
        await c.self.disableAudio()
      } else {
        await c.self.enableAudio()
      }
    } catch (err) {
      lastError.value = (err as Error)?.message ?? String(err)
    }
  }

  async function toggleCam(): Promise<void> {
    const c = clientRef.value
    if (!c) return
    try {
      if (c.self.videoEnabled) {
        await c.self.disableVideo()
      } else {
        await c.self.enableVideo()
      }
    } catch (err) {
      lastError.value = (err as Error)?.message ?? String(err)
    }
  }

  async function toggleScreen(): Promise<void> {
    const c = clientRef.value
    if (!c) return
    try {
      if (c.self.screenShareEnabled) {
        await c.self.disableScreenShare()
      } else {
        await c.self.enableScreenShare()
      }
    } catch (err) {
      lastError.value = (err as Error)?.message ?? String(err)
    }
  }

  // ─── Credentials watch ────────────────────────────────────────────────────
  // Handles all 4 transitions:
  //   null  → creds   : connect
  //   creds → null    : disconnect
  //   same token      : no-op (e.g. reactive re-render without credential change)
  //   diff token      : reconnect (token refresh path)

  watch(
    () => opts.credentials.value,
    async (next, prev) => {
      if (!next) {
        // Credentials cleared — disconnect if we had a session
        if (prev) await disconnect()
        return
      }

      if (prev && prev.authToken === next.authToken) {
        // Same token, nothing to do
        return
      }

      // New credentials or refreshed token — (re)connect
      await connect(next)
    },
    { immediate: true },
  )

  // ─── Lifecycle cleanup ────────────────────────────────────────────────────

  onBeforeUnmount(() => {
    void disconnect()
  })

  // ─── Public interface ─────────────────────────────────────────────────────

  return {
    state,
    lastError,
    localAudioTrack,
    localVideoTrack,
    localMicEnabled,
    localCamEnabled,
    localScreenEnabled,
    participants,
    toggleMic,
    toggleCam,
    toggleScreen,
    disconnect,
  }
}
