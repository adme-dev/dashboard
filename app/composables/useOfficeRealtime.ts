import type { Ref } from 'vue'
import type { MediaCredentials } from '~~/app/types/office'
import { resolveForceRelay } from '~/composables/officeForceRelay'

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
// Client has a private constructor, so InstanceType<typeof Client> doesn't
// type-check. Pull the instance type out of init()'s return value instead.
type RealtimeKitClient = Awaited<ReturnType<RealtimeKitClientCtor['init']>>

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

  // Connect-sequence counter — every connect() and disconnect() bumps this.
  // Each in-flight connect captures its own seq at entry and verifies after
  // every await that it's still the current attempt. If a newer connect (or
  // a disconnect) has bumped seq, the stale call tears down its own
  // partially-initialised client without touching composable state — that
  // state belongs to the newer attempt now. Without this, rapid credential
  // changes (e.g. zone:enter → zone:leave → zone:enter within ~1s, or a
  // token refresh racing with the watch) could leave two SDK clients alive
  // simultaneously and emit cross-talk events into the participants ref.
  let connectSeq = 0

  // Local tracks / toggles
  const localAudioTrack = ref<MediaStreamTrack | null>(null)
  const localVideoTrack = ref<MediaStreamTrack | null>(null)
  const localMicEnabled = ref(false)
  const localCamEnabled = ref(false)
  const localScreenEnabled = ref(false)

  // Remote participant list
  const participants = ref<RemoteParticipant[]>([])

  // SDK Client — stored in shallowRef to prevent Vue from tracking SDK internals
  const clientRef = shallowRef<RealtimeKitClient | null>(null)

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function rebuildLocal(c: RealtimeKitClient): void {
    const s = c.self as any
    localAudioTrack.value = s.audioEnabled && s.audioTrack ? s.audioTrack : null
    localVideoTrack.value = s.videoEnabled && s.videoTrack ? s.videoTrack : null
    localMicEnabled.value = Boolean(s.audioEnabled)
    localCamEnabled.value = Boolean(s.videoEnabled)
    localScreenEnabled.value = Boolean(s.screenShareEnabled)
  }

  function rebuildParticipants(c: RealtimeKitClient): void {
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

  function wireParticipant(p: any, c: RealtimeKitClient): void {
    const onUpdate = () => rebuildParticipants(c)
    p.on('videoUpdate', onUpdate)
    p.on('audioUpdate', onUpdate)
    p.on('screenShareUpdate', onUpdate)
  }

  // ─── Connect ─────────────────────────────────────────────────────────────

  async function connect(creds: MediaCredentials): Promise<void> {
    // Always tear down any prior session before starting a new attempt.
    // Don't gate on state — 'failed' and 'closed' can still hold a leaked
    // half-initialised clientRef. disconnect() itself bumps connectSeq.
    await disconnect()

    const mySeq = ++connectSeq
    state.value = 'connecting'
    lastError.value = null

    // After every await below: if connectSeq has moved past mySeq, a newer
    // connect() or disconnect() has taken over. Tear down anything we've
    // already created locally and return without touching composable state.
    const abortIfStale = async (client: RealtimeKitClient | null): Promise<boolean> => {
      if (mySeq === connectSeq) return false
      if (client) {
        try { await (client as any).leaveRoom() } catch { /* ignore */ }
      }
      return true
    }

    try {
      const SDK = await loadSDK()
      if (await abortIfStale(null)) return

      const client = await SDK.init({
        authToken: creds.authToken,
        overrides: { forceRelay: resolveForceRelay(useRuntimeConfig()) },
      })
      if (await abortIfStale(client)) return
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
      if (await abortIfStale(client)) return

      state.value = 'connected'
    } catch (err) {
      // If a newer attempt took over while we were failing, don't write our
      // 'failed' state on top of theirs.
      if (mySeq !== connectSeq) return
      state.value = 'failed'
      lastError.value = (err as Error)?.message ?? String(err)
      // Best-effort cleanup. disconnect() preserves 'failed' (its terminal
      // guard only writes 'closed' when state !== 'failed').
      await disconnect()
    }
  }

  // ─── Disconnect ──────────────────────────────────────────────────────────

  async function disconnect(): Promise<void> {
    // Bump seq so any in-flight connect aborts on its next await checkpoint.
    connectSeq++

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
