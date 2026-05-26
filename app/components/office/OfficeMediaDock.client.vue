<script setup lang="ts">
import type { OfficeMediaSession } from '~~/app/types/office'

const props = defineProps<{
  officeId: string
  zoneId: string
  occupantCount: number
  mediaSession?: OfficeMediaSession | null
  mediaUnavailableMessage?: string | null
}>()

const localVideoEl = ref<HTMLVideoElement | null>(null)
const screenVideoEl = ref<HTMLVideoElement | null>(null)
const localStream = ref<MediaStream | null>(null)
const screenStream = ref<MediaStream | null>(null)
const mediaStateVersion = ref(0)
const mediaError = ref<string | null>(null)
const permissionBlocked = ref<'audio' | 'video' | 'screen' | null>(null)
const requesting = ref<'audio' | 'video' | 'screen' | null>(null)
const settingsOpen = ref(false)
const mediaDevices = ref<MediaDeviceInfo[]>([])
const selectedAudioInputId = ref('')
const selectedVideoInputId = ref('')
const selectedAudioOutputId = ref('')
const refreshingDevices = ref(false)
const realtime = useOfficeRealtime({
  officeId: toRef(props, 'officeId'),
  zoneId: toRef(props, 'zoneId'),
  mediaSession: toRef(props, 'mediaSession'),
  occupantCount: toRef(props, 'occupantCount'),
  getStreams: () => [localStream.value, screenStream.value].filter((stream): stream is MediaStream => Boolean(stream))
})

const hasMediaDevices = computed(() =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
)
const hasDisplayMedia = computed(() =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
)
const canSelectOutputDevice = computed(() =>
  typeof HTMLMediaElement !== 'undefined'
  && 'setSinkId' in HTMLMediaElement.prototype
)
const audioEnabled = computed(() => {
  void mediaStateVersion.value
  return Boolean(localStream.value?.getAudioTracks().some(track => track.enabled && track.readyState === 'live'))
})
const videoEnabled = computed(() => {
  void mediaStateVersion.value
  return Boolean(localStream.value?.getVideoTracks().some(track => track.enabled && track.readyState === 'live'))
})
const screenEnabled = computed(() => {
  void mediaStateVersion.value
  return Boolean(screenStream.value?.getVideoTracks().some(track => track.readyState === 'live'))
})
const realtimeLabel = computed(() => {
  if (!props.mediaSession) return audioEnabled.value || videoEnabled.value || screenEnabled.value ? 'Ready' : 'Off'
  if (realtime.state.value === 'connected') return 'Live'
  if (realtime.state.value === 'failed') return 'Issue'
  if (realtime.state.value === 'connecting') return 'Joining'
  return 'Realtime'
})
const realtimeBadgeClass = computed(() => {
  if (realtime.state.value === 'failed') return 'bg-red-400/10 text-red-100 ring-red-300/15'
  if (props.mediaSession || audioEnabled.value || videoEnabled.value || screenEnabled.value) {
    return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  }
  return 'bg-white/[0.04] text-white/40 ring-white/[0.06]'
})
const remoteStreamCount = computed(() => realtime.remoteStreams.value.length)
const lurkingNotice = computed(() => {
  if (!permissionBlocked.value) return null
  if (permissionBlocked.value === 'screen') {
    return 'Screen sharing was blocked. You can stay in the room and use mic or camera.'
  }
  return 'Device permission was blocked. You can stay in the room without transmitting audio or video.'
})
const mediaIssue = computed(() => {
  if (permissionBlocked.value === 'audio') return 'Microphone permission was blocked.'
  if (permissionBlocked.value === 'video') return 'Camera permission was blocked.'
  if (permissionBlocked.value === 'screen') return 'Screen sharing permission was blocked.'
  return mediaError.value || realtime.error.value
})
const audioInputs = computed(() => mediaDevices.value.filter(device => device.kind === 'audioinput'))
const videoInputs = computed(() => mediaDevices.value.filter(device => device.kind === 'videoinput'))
const audioOutputs = computed(() => mediaDevices.value.filter(device => device.kind === 'audiooutput'))
const audioButtonLabel = computed(() => {
  if (requesting.value === 'audio') return audioEnabled.value ? 'Muting' : 'Starting'
  return audioEnabled.value ? 'Mute' : 'Unmute'
})
const audioButtonTitle = computed(() =>
  audioEnabled.value
    ? 'Turn microphone off.'
    : 'Turn microphone on. Your browser may ask for permission.'
)
const videoButtonLabel = computed(() => {
  if (requesting.value === 'video') return videoEnabled.value ? 'Stopping' : 'Starting'
  return videoEnabled.value ? 'Cam on' : 'Cam off'
})
const activeAudioTrackLabel = computed(() =>
  localStream.value?.getAudioTracks().find(track => track.readyState === 'live')?.label ?? ''
)
const activeVideoTrackLabel = computed(() =>
  localStream.value?.getVideoTracks().find(track => track.readyState === 'live')?.label ?? ''
)
const selectedAudioInputLabel = computed(() =>
  activeAudioTrackLabel.value
  || audioInputs.value.find(device => device.deviceId === selectedAudioInputId.value)?.label
  || 'Default microphone'
)
const selectedVideoInputLabel = computed(() =>
  activeVideoTrackLabel.value
  || videoInputs.value.find(device => device.deviceId === selectedVideoInputId.value)?.label
  || 'Default camera'
)
const selectedAudioOutputLabel = computed(() =>
  audioOutputs.value.find(device => device.deviceId === selectedAudioOutputId.value)?.label
  || 'Default speaker'
)
const setupSummary = computed(() => [
  audioEnabled.value ? selectedAudioInputLabel.value : permissionBlocked.value === 'audio' ? 'Mic blocked' : 'Mic off',
  videoEnabled.value ? selectedVideoInputLabel.value : 'Cam off',
  canSelectOutputDevice.value ? selectedAudioOutputLabel.value : 'System output'
])

function deviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
  return device.label || `${fallback} ${index + 1}`
}

function stopStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

function syncMediaState() {
  mediaStateVersion.value += 1
}

function cleanupEmptyLocalStream() {
  if (localStream.value && localStream.value.getTracks().length === 0) {
    localStream.value = null
  }
  syncMediaState()
}

function bindLocalTrackLifecycle(track: MediaStreamTrack) {
  track.addEventListener('ended', () => {
    localStream.value?.removeTrack(track)
    cleanupEmptyLocalStream()
    void realtime.publish()
  }, { once: true })
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return

  refreshingDevices.value = true
  try {
    mediaDevices.value = await navigator.mediaDevices.enumerateDevices()
    selectedAudioInputId.value ||= audioInputs.value[0]?.deviceId ?? ''
    selectedVideoInputId.value ||= videoInputs.value[0]?.deviceId ?? ''
    selectedAudioOutputId.value ||= audioOutputs.value[0]?.deviceId ?? ''
  } catch (error) {
    markMediaFailure('audio', error)
  } finally {
    refreshingDevices.value = false
  }
}

function audioConstraints(): boolean | MediaTrackConstraints {
  return selectedAudioInputId.value
    ? { deviceId: { exact: selectedAudioInputId.value } }
    : true
}

function videoConstraints(): boolean | MediaTrackConstraints {
  return selectedVideoInputId.value
    ? { deviceId: { exact: selectedVideoInputId.value } }
    : true
}

async function switchAudioInput() {
  if (!audioEnabled.value) return
  requesting.value = 'audio'
  try {
    await ensureLocalStream({ audio: audioConstraints(), video: false })
    await realtime.publish()
    await refreshDevices()
  } catch (error) {
    markMediaFailure('audio', error)
  } finally {
    requesting.value = null
  }
}

async function switchVideoInput() {
  if (!videoEnabled.value) return
  requesting.value = 'video'
  try {
    await ensureLocalStream({ audio: false, video: videoConstraints() })
    await realtime.publish()
    await refreshDevices()
  } catch (error) {
    mediaError.value = explainMediaError(error)
  } finally {
    requesting.value = null
  }
}

function explainMediaError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permission was blocked for this device.'
    if (error.name === 'NotFoundError') return 'No matching device was found.'
    if (error.name === 'NotReadableError') return 'The device is already in use.'
  }
  return error instanceof Error ? error.message : 'Could not start media.'
}

function markMediaFailure(kind: 'audio' | 'video' | 'screen', error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    permissionBlocked.value = kind
    mediaError.value = null
    return
  }

  permissionBlocked.value = null
  mediaError.value = explainMediaError(error)
}

async function ensureLocalStream(constraints: MediaStreamConstraints) {
  if (!hasMediaDevices.value) {
    mediaError.value = 'Media devices are not available in this browser.'
    return null
  }

  mediaError.value = null
  permissionBlocked.value = null
  const next = await navigator.mediaDevices.getUserMedia(constraints)
  if (!localStream.value) {
    localStream.value = next
    for (const track of next.getTracks()) bindLocalTrackLifecycle(track)
    syncMediaState()
    return next
  }

  for (const track of next.getTracks()) {
    const existingKindTracks = localStream.value.getTracks().filter(item => item.kind === track.kind)
    for (const existing of existingKindTracks) {
      localStream.value.removeTrack(existing)
      existing.stop()
    }
    localStream.value.addTrack(track)
    bindLocalTrackLifecycle(track)
  }
  syncMediaState()
  return localStream.value
}

async function toggleAudio() {
  if (audioEnabled.value) {
    for (const track of localStream.value?.getAudioTracks() ?? []) {
      track.stop()
      localStream.value?.removeTrack(track)
    }
    cleanupEmptyLocalStream()
    await realtime.publish()
    return
  }

  requesting.value = 'audio'
  try {
    await ensureLocalStream({ audio: audioConstraints(), video: false })
    await realtime.publish()
    await refreshDevices()
  } catch (error) {
    markMediaFailure('audio', error)
  } finally {
    requesting.value = null
  }
}

async function toggleVideo() {
  if (videoEnabled.value) {
    for (const track of localStream.value?.getVideoTracks() ?? []) {
      track.stop()
      localStream.value?.removeTrack(track)
    }
    cleanupEmptyLocalStream()
    await realtime.publish()
    return
  }

  requesting.value = 'video'
  try {
    await ensureLocalStream({ audio: false, video: videoConstraints() })
    await realtime.publish()
    await refreshDevices()
  } catch (error) {
    markMediaFailure('video', error)
  } finally {
    requesting.value = null
  }
}

async function toggleScreen() {
  if (screenEnabled.value) {
    stopStream(screenStream.value)
    screenStream.value = null
    syncMediaState()
    await realtime.publish()
    return
  }

  if (!hasDisplayMedia.value) {
    mediaError.value = 'Screen sharing is not available in this browser.'
    return
  }

  requesting.value = 'screen'
  mediaError.value = null
  permissionBlocked.value = null
  try {
    const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    screenStream.value = next
    syncMediaState()
    for (const track of next.getTracks()) {
      track.addEventListener('ended', () => {
        if (screenStream.value === next) {
          screenStream.value = null
          syncMediaState()
          void realtime.publish()
        }
      })
    }
    await realtime.publish()
  } catch (error) {
    markMediaFailure('screen', error)
  } finally {
    requesting.value = null
  }
}

watch([localStream, localVideoEl], ([stream, el]) => {
  if (el) el.srcObject = stream
}, { flush: 'post' })

watch([screenStream, screenVideoEl], ([stream, el]) => {
  if (el) el.srcObject = stream
}, { flush: 'post' })

watch(selectedAudioInputId, () => {
  void switchAudioInput()
})

watch(selectedVideoInputId, () => {
  void switchVideoInput()
})

watch(() => props.mediaSession, () => {
  void realtime.publish()
})

onMounted(() => {
  void refreshDevices()
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
})

onBeforeUnmount(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
  stopStream(localStream.value)
  stopStream(screenStream.value)
  realtime.disconnect()
})
</script>

<template>
  <section class="border-t border-white/[0.06] px-3 py-3">
    <div class="mb-2 flex items-center justify-between gap-3">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Meeting devices
        </div>
        <div class="mt-0.5 text-[11px] text-white/35">
          {{ mediaSession ? realtime.activeTrackCount.value || realtime.waitingTrackCount.value ? `${realtime.activeTrackCount.value} active · ${realtime.waitingTrackCount.value} waiting` : 'Realtime session reserved for this room.' : 'Local preview before the room call starts.' }}
        </div>
      </div>
      <span
        class="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
        :class="realtimeBadgeClass"
      >
        {{ realtimeLabel }}
      </span>
    </div>

    <p
      v-if="mediaUnavailableMessage"
      class="mb-3 rounded-lg border border-amber-300/10 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-100"
    >
      {{ mediaUnavailableMessage }}
    </p>

    <p
      v-if="lurkingNotice"
      class="mb-3 rounded-lg border border-amber-300/10 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-100"
    >
      {{ lurkingNotice }}
    </p>

    <div
      v-if="remoteStreamCount"
      class="mb-3"
    >
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          In call
        </span>
        <span class="text-[11px] text-white/35">{{ remoteStreamCount }} remote</span>
      </div>
      <div class="grid gap-2" :class="remoteStreamCount > 1 ? 'grid-cols-2' : 'grid-cols-1'">
        <OfficeRemoteMediaTile
          v-for="(stream, index) in realtime.remoteStreams.value"
          :key="stream.id"
          :stream="stream"
          :label="`Remote ${index + 1}`"
          :output-device-id="selectedAudioOutputId"
        />
      </div>
    </div>

    <div
      v-if="videoEnabled || screenEnabled"
      class="mb-3 grid gap-2"
      :class="videoEnabled && screenEnabled ? 'grid-cols-2' : 'grid-cols-1'"
    >
      <div
        v-if="videoEnabled"
        class="relative overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.08]"
      >
        <video
          ref="localVideoEl"
          autoplay
          muted
          playsinline
          class="aspect-video w-full object-cover"
        />
        <span class="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
          Camera
        </span>
      </div>
      <div
        v-if="screenEnabled"
        class="relative overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.08]"
      >
        <video
          ref="screenVideoEl"
          autoplay
          muted
          playsinline
          class="aspect-video w-full object-cover"
        />
        <span class="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
          Screen
        </span>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-2">
      <button
        type="button"
        class="flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold ring-1 transition"
        :class="audioEnabled
          ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
          : 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08]'"
        :disabled="requesting === 'audio'"
        :aria-pressed="audioEnabled"
        :title="audioButtonTitle"
        @click="toggleAudio"
      >
        <UIcon
          :name="requesting === 'audio' ? 'i-lucide-loader-circle' : audioEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
          class="size-4"
          :class="requesting === 'audio' ? 'animate-spin' : ''"
        />
        {{ audioButtonLabel }}
      </button>
      <button
        type="button"
        class="flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold ring-1 transition"
        :class="videoEnabled
          ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
          : 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08]'"
        :disabled="requesting === 'video'"
        :aria-pressed="videoEnabled"
        @click="toggleVideo"
      >
        <UIcon
          :name="requesting === 'video' ? 'i-lucide-loader-circle' : videoEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
          class="size-4"
          :class="requesting === 'video' ? 'animate-spin' : ''"
        />
        {{ videoButtonLabel }}
      </button>
      <button
        type="button"
        class="flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold ring-1 transition"
        :class="screenEnabled
          ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
          : 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08]'"
        :disabled="requesting === 'screen'"
        @click="toggleScreen"
      >
        <UIcon
          :name="requesting === 'screen' ? 'i-lucide-loader-circle' : 'i-lucide-monitor-up'"
          class="size-4"
          :class="requesting === 'screen' ? 'animate-spin' : ''"
        />
        Share
      </button>
      <button
        type="button"
        class="flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold ring-1 transition"
        :class="settingsOpen
          ? 'bg-sky-400/10 text-sky-100 ring-sky-300/15 hover:bg-sky-400/15'
          : 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08]'"
        @click="settingsOpen = !settingsOpen"
      >
        <UIcon name="i-lucide-settings-2" class="size-4" />
        Setup
      </button>
    </div>

    <div class="mt-2 grid gap-1.5 text-[11px] text-white/40 sm:grid-cols-3">
      <div class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.025] px-2 py-1 ring-1 ring-white/[0.05]">
        <UIcon
          :name="audioEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
          class="size-3.5 shrink-0"
          :class="audioEnabled ? 'text-emerald-200/70' : 'text-white/25'"
        />
        <span class="truncate">{{ setupSummary[0] }}</span>
      </div>
      <div class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.025] px-2 py-1 ring-1 ring-white/[0.05]">
        <UIcon
          :name="videoEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
          class="size-3.5 shrink-0"
          :class="videoEnabled ? 'text-emerald-200/70' : 'text-white/25'"
        />
        <span class="truncate">{{ setupSummary[1] }}</span>
      </div>
      <div class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.025] px-2 py-1 ring-1 ring-white/[0.05]">
        <UIcon
          name="i-lucide-volume-2"
          class="size-3.5 shrink-0"
          :class="canSelectOutputDevice ? 'text-sky-200/70' : 'text-white/25'"
        />
        <span class="truncate">{{ setupSummary[2] }}</span>
      </div>
    </div>

    <div
      v-if="settingsOpen"
      class="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Device setup
          </div>
          <div class="mt-0.5 text-[11px] text-white/35">
            Choose devices before or during the room call.
          </div>
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
          :disabled="refreshingDevices"
          aria-label="Refresh devices"
          @click="refreshDevices"
        >
          <UIcon
            :name="refreshingDevices ? 'i-lucide-loader-circle' : 'i-lucide-refresh-cw'"
            class="size-4"
            :class="refreshingDevices ? 'animate-spin' : ''"
          />
        </button>
      </div>

      <div class="space-y-2">
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-white/45">Microphone</span>
          <select
            v-model="selectedAudioInputId"
            class="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0d1016] px-2 text-xs text-white/75 outline-none transition focus:border-emerald-300/35"
          >
            <option value="">
              Default microphone
            </option>
            <option
              v-for="(device, index) in audioInputs"
              :key="device.deviceId || `audio-${index}`"
              :value="device.deviceId"
            >
              {{ deviceLabel(device, 'Microphone', index) }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-white/45">Camera</span>
          <select
            v-model="selectedVideoInputId"
            class="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0d1016] px-2 text-xs text-white/75 outline-none transition focus:border-emerald-300/35"
          >
            <option value="">
              Default camera
            </option>
            <option
              v-for="(device, index) in videoInputs"
              :key="device.deviceId || `video-${index}`"
              :value="device.deviceId"
            >
              {{ deviceLabel(device, 'Camera', index) }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-white/45">Speaker</span>
          <select
            v-model="selectedAudioOutputId"
            class="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0d1016] px-2 text-xs text-white/75 outline-none transition focus:border-emerald-300/35 disabled:opacity-50"
            :disabled="!canSelectOutputDevice"
          >
            <option value="">
              Default speaker
            </option>
            <option
              v-for="(device, index) in audioOutputs"
              :key="device.deviceId || `speaker-${index}`"
              :value="device.deviceId"
            >
              {{ deviceLabel(device, 'Speaker', index) }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <p
      v-if="mediaIssue"
      class="mt-2 rounded-lg border border-red-300/10 bg-red-400/10 px-2.5 py-2 text-xs text-red-100"
    >
      {{ mediaIssue }}
    </p>
  </section>
</template>
