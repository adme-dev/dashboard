<script setup lang="ts">
import type { OfficeLobbyGuestRoomHandshake, OfficeStatus } from '~~/app/types/office'

type LobbyRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired'

type LobbyRequestStatusResponse = {
  request: {
    id: string
    status: LobbyRequestStatus
    handled_at: string | null
  }
}

type AccessEndReason = 'left' | 'ended'

definePageMeta({
  layout: false,
  auth: false
})

const route = useRoute()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string }
) => Promise<T>

const officeId = computed(() => String(route.params.officeId || ''))
const requestId = computed(() => String(route.params.requestId || ''))
const tokenEndpoint = computed(() =>
  `/api/public/office-lobby/${officeId.value}/request/${requestId.value}/token`
)
const lobbyPath = computed(() => `/lobby/${officeId.value}`)

const handshake = ref<OfficeLobbyGuestRoomHandshake | null>(null)
const pending = ref(false)
const error = ref<any>(null)

async function refreshHandshake() {
  pending.value = true
  error.value = null
  try {
    handshake.value = await apiFetch<OfficeLobbyGuestRoomHandshake>(tokenEndpoint.value, { method: 'POST' })
  } catch (err) {
    handshake.value = null
    error.value = err
  } finally {
    pending.value = false
  }
}

await refreshHandshake()

const initialZoneId = computed(() => handshake.value?.zone?.id ?? null)
const connectionOfficeId = computed(() => handshake.value ? officeId.value : null)
const status = ref<OfficeStatus>('available')
const accessEndReason = ref<AccessEndReason | null>(null)
const statusPolling = ref(false)
const micEnabled = ref(handshake.value?.guest.prejoin.micReady ?? true)
const cameraEnabled = ref(handshake.value?.guest.prejoin.cameraOn ?? false)
const screenSharing = ref(false)
const notesEnabled = ref(handshake.value?.guest.prejoin.notesApproved ?? false)
const recordingApproved = ref(handshake.value?.guest.prejoin.recordingApproved ?? false)
const localVideo = ref<HTMLVideoElement | null>(null)
const screenVideo = ref<HTMLVideoElement | null>(null)
const mediaLoading = ref(false)
const mediaError = ref<string | null>(null)
const leavingRoom = ref(false)
const nowMs = ref(Date.now())
const localStream = shallowRef<MediaStream | null>(null)
const screenStream = shallowRef<MediaStream | null>(null)
let statusTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
const connection = useOfficeConnection({
  officeId: connectionOfficeId,
  tokenEndpoint,
  initialZoneId
})

watch(status, value => connection.setStatus(value))

watch(
  () => handshake.value?.guest.prejoin,
  (prejoin) => {
    if (!prejoin) return
    micEnabled.value = prejoin.micReady
    cameraEnabled.value = prejoin.cameraOn
    notesEnabled.value = prejoin.notesApproved
    recordingApproved.value = prejoin.recordingApproved
    status.value = prejoin.micReady ? 'available' : 'busy'
  },
  { immediate: true }
)

watch(
  () => connection.lastError.value,
  (err) => {
    if (!err) return
    toast.add({
      title: 'Office room',
      description: err,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    connection.lastError.value = null
  }
)

const participants = computed(() =>
  Array.from(connection.participants.value.values())
)
const roomParticipants = computed(() =>
  participants.value.filter(participant => participant.currentZoneId === initialZoneId.value)
)
const guestContext = computed(() => ({
  note: handshake.value?.guest.note?.trim() ?? '',
  intakeAnswers: handshake.value?.guest.intakeAnswers ?? []
}))
const meetingLabel = computed(() => {
  const meeting = handshake.value?.meeting
  if (!meeting?.title && !meeting?.scheduledStartAt) return null
  const parts = [meeting.title]
  if (meeting.scheduledStartAt) {
    const date = new Date(meeting.scheduledStartAt)
    const formatted = Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }).format(date)
    if (formatted) parts.push(formatted)
  }
  if (meeting.durationMinutes) parts.push(`${meeting.durationMinutes} min`)
  return parts.filter(Boolean).join(' · ')
})
const connectionLabel = computed(() => {
  if (accessEndReason.value) return 'Ended'
  if (connection.isConnected.value) return 'Live'
  return 'Connecting'
})
const accessExpiryLabel = computed(() => {
  const expiresAt = handshake.value?.guest.accessExpiresAt
  if (!expiresAt) return 'Temporary access pass'
  const expiresAtMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresAtMs)) return 'Temporary access pass'
  const remainingMinutes = Math.ceil((expiresAtMs - nowMs.value) / 60_000)
  if (remainingMinutes <= 0) return 'Access expires on refresh'
  if (remainingMinutes === 1) return 'Access expires in 1 min'
  if (remainingMinutes < 60) return `Access expires in ${remainingMinutes} min`
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (minutes === 0) return `Access expires in ${hours} hr${hours === 1 ? '' : 's'}`
  return `Access expires in ${hours} hr ${minutes} min`
})
const roomUnavailableCopy = computed(() => {
  const message = error.value?.data?.statusMessage || error.value?.message
  if (message === 'Guest room link is missing an approved room') {
    return 'This approval does not have an approved room yet. Ask the host to assign a room and accept the request again.'
  }
  if (message === 'Guest room link has expired') {
    return 'This guest room approval has expired. Send a new lobby request if you need to rejoin.'
  }
  if (message === 'Lobby request has not been accepted') {
    return 'This lobby request has not been accepted yet. Return to the lobby request page and wait for the host.'
  }
  return 'This guest room link is not active. Ask the host to approve a new lobby request.'
})
const accessEndedCopy = computed(() => {
  if (accessEndReason.value === 'left') {
    return {
      icon: 'i-lucide-log-out',
      title: 'You left the room',
      description: 'This browser is no longer connected to the office presence layer.'
    }
  }
  return {
    icon: 'i-lucide-lock',
    title: 'Room access ended',
    description: 'The host ended this guest session. Ask for a new lobby approval if you need to rejoin.'
  }
})

function controlToast(title: string, description: string, icon: string) {
  toast.add({
    title,
    description,
    color: 'neutral',
    icon,
    duration: 2200
  })
}

function attachLocalVideo() {
  if (!localVideo.value) return
  localVideo.value.srcObject = cameraEnabled.value ? localStream.value : null
}

function attachScreenVideo() {
  if (!screenVideo.value) return
  screenVideo.value.srcObject = screenSharing.value ? screenStream.value : null
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop())
}

function applyMediaTrackState() {
  const stream = localStream.value
  if (!stream) return
  stream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled.value
  })
  stream.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled.value
  })
  attachLocalVideo()
}

function localStreamHasRequiredTracks() {
  const stream = localStream.value
  if (!stream) return false
  if (micEnabled.value && !stream.getAudioTracks().length) return false
  if (cameraEnabled.value && !stream.getVideoTracks().length) return false
  return true
}

async function ensureLocalMedia() {
  if (typeof window === 'undefined') {
    return false
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    mediaError.value = 'Browser media capture is not available.'
    return false
  }

  if (localStream.value && localStreamHasRequiredTracks()) {
    applyMediaTrackState()
    return true
  }

  stopTracks(localStream.value)
  localStream.value = null

  mediaLoading.value = true
  mediaError.value = null
  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({
      audio: micEnabled.value,
      video: cameraEnabled.value
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }
        : false
    })
    applyMediaTrackState()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media permission was denied.'
    mediaError.value = message
    micEnabled.value = false
    cameraEnabled.value = false
    status.value = 'busy'
    toast.add({
      title: 'Media unavailable',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return false
  } finally {
    mediaLoading.value = false
  }
}

function releaseLocalMediaIfIdle() {
  if (micEnabled.value || cameraEnabled.value) return
  stopTracks(localStream.value)
  localStream.value = null
  attachLocalVideo()
}

async function toggleMic() {
  micEnabled.value = !micEnabled.value
  if (micEnabled.value) {
    const ok = await ensureLocalMedia()
    if (!ok) return
  } else {
    applyMediaTrackState()
    releaseLocalMediaIfIdle()
  }
  status.value = micEnabled.value ? 'available' : 'busy'
}

async function toggleCamera() {
  cameraEnabled.value = !cameraEnabled.value
  if (cameraEnabled.value) {
    const ok = await ensureLocalMedia()
    if (!ok) return
  } else {
    applyMediaTrackState()
    releaseLocalMediaIfIdle()
  }
  controlToast(
    cameraEnabled.value ? 'Camera preview on' : 'Camera preview off',
    cameraEnabled.value ? 'Your local camera preview is active.' : 'Camera capture has been stopped.',
    'i-lucide-video'
  )
}

async function toggleScreenShare() {
  if (screenSharing.value) {
    stopTracks(screenStream.value)
    screenStream.value = null
    screenSharing.value = false
    attachScreenVideo()
    controlToast('Screen share stopped', 'Screen capture is no longer active.', 'i-lucide-monitor-up')
    return
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    controlToast('Screen share unavailable', 'This browser does not support screen capture.', 'i-lucide-monitor-up')
    return
  }

  try {
    screenStream.value = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    screenSharing.value = true
    attachScreenVideo()
    screenStream.value.getVideoTracks()[0]?.addEventListener('ended', () => {
      screenSharing.value = false
      screenStream.value = null
      attachScreenVideo()
    }, { once: true })
    controlToast('Screen share ready', 'Your screen capture is active locally.', 'i-lucide-monitor-up')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screen share permission was denied.'
    toast.add({
      title: 'Screen share unavailable',
      description: message,
      color: 'neutral',
      icon: 'i-lucide-monitor-up'
    })
  }
}

function toggleNotes() {
  notesEnabled.value = !notesEnabled.value
  controlToast(
    notesEnabled.value ? 'AI notes armed' : 'AI notes paused',
    'Meeting notes are staged until room audio transcription is connected.',
    'i-lucide-notebook-pen'
  )
}

async function leaveRoom() {
  if (leavingRoom.value) return
  leavingRoom.value = true
  accessEndReason.value = 'left'
  stopStatusPolling()
  stopTracks(localStream.value)
  stopTracks(screenStream.value)
  connection.disconnect()
  try {
    await apiFetch(`/api/public/office-lobby/${officeId.value}/request/${requestId.value}/cancel`, {
      method: 'POST'
    })
  } catch {
    // Local disconnect is still valid; the host-side expiry poll will clean up
    // if the leave request is interrupted by navigation or a dev reload.
  }
}

async function pollRequestStatus() {
  if (statusPolling.value || accessEndReason.value) return

  statusPolling.value = true
  try {
    const response = await apiFetch<LobbyRequestStatusResponse>(
      `/api/public/office-lobby/${officeId.value}/request/${requestId.value}`
    )
    if (response.request.status !== 'accepted') {
      accessEndReason.value = 'ended'
      stopStatusPolling()
      connection.disconnect()
      toast.add({
        title: 'Room access ended',
        description: 'Ask the host to approve a new lobby request if you need to rejoin.',
        color: 'neutral',
        icon: 'i-lucide-lock'
      })
    }
  } catch {
    // A transient status polling failure should not disconnect a live guest.
  } finally {
    statusPolling.value = false
  }
}

function startStatusPolling() {
  stopStatusPolling()
  statusTimer = setInterval(() => {
    void pollRequestStatus()
  }, 5000)
}

function stopStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

watch(
  [handshake, error],
  ([nextHandshake, nextError]) => {
    if (nextError || accessEndReason.value) {
      stopStatusPolling()
      return
    }
    if (nextHandshake) startStatusPolling()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopStatusPolling()
  stopTracks(localStream.value)
  stopTracks(screenStream.value)
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

onMounted(() => {
  clockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
})

watch(localVideo, attachLocalVideo)
watch(screenVideo, attachScreenVideo)
watch(screenSharing, attachScreenVideo)

watch(
  [micEnabled, cameraEnabled, handshake],
  ([mic, camera, nextHandshake]) => {
    if (!nextHandshake || accessEndReason.value) return
    if (!mic && !camera) return
    void ensureLocalMedia()
  },
  { immediate: true }
)
</script>

<template>
  <main class="min-h-screen bg-[#06070a] text-white">
    <div class="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
            <UIcon name="i-lucide-video" class="size-4 text-emerald-400" />
          </div>
          <div>
            <div class="text-sm font-semibold">
              {{ handshake?.zone?.name || 'Office room' }}
            </div>
            <div class="text-xs text-white/40">
              <span>Guest room</span>
              <span v-if="handshake?.guest.source === 'embed'"> · Website embed</span>
            </div>
          </div>
        </div>
        <UBadge
          :color="connection.isConnected.value ? 'success' : 'neutral'"
          variant="subtle"
        >
          {{ connectionLabel }}
        </UBadge>
      </header>

      <section class="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <div
          v-if="pending"
          class="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-[#11141a] p-8"
        >
          <USkeleton class="h-8 w-56" />
          <USkeleton class="mt-4 h-4 w-96 max-w-full" />
        </div>

        <UAlert
          v-else-if="error"
          class="lg:col-span-2"
          color="error"
          icon="i-lucide-circle-alert"
          title="Room unavailable"
          :description="roomUnavailableCopy"
          :actions="[{
            label: 'Open lobby',
            icon: 'i-lucide-door-open',
            color: 'neutral',
            variant: 'soft',
            to: lobbyPath
          }]"
        />

        <UAlert
          v-else-if="accessEndReason"
          class="lg:col-span-2"
          color="neutral"
          :icon="accessEndedCopy.icon"
          :title="accessEndedCopy.title"
          :description="accessEndedCopy.description"
        />

        <div
          v-else
          class="min-h-[520px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0e] shadow-[inset_0_2px_30px_rgba(0,0,0,0.6)]"
        >
          <div class="relative flex h-full min-h-[520px] flex-col justify-between p-6">
            <div
              class="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.16)_0%,_rgba(80,120,255,0.08)_35%,_transparent_72%)]"
            />
            <div
              class="absolute inset-0 opacity-[0.08]"
              style="background-image: radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px); background-size: 28px 28px"
            />
            <div class="relative">
              <div class="mb-5 grid max-w-3xl gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div class="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <video
                    v-show="cameraEnabled && localStream"
                    ref="localVideo"
                    class="size-full object-cover"
                    autoplay
                    muted
                    playsinline
                  />
                  <div
                    v-if="!cameraEnabled || !localStream"
                    class="grid size-full place-items-center"
                  >
                    <div class="text-center">
                      <span class="mx-auto flex size-10 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]">
                        <UIcon :name="mediaLoading ? 'i-lucide-loader-circle' : 'i-lucide-video-off'" class="size-4 text-white/55" :class="mediaLoading ? 'animate-spin' : ''" />
                      </span>
                      <p class="mt-2 text-[11px] font-medium text-white/40">
                        {{ mediaLoading ? 'Preparing media' : 'Camera off' }}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  v-if="screenSharing || screenStream"
                  class="relative aspect-video overflow-hidden rounded-xl border border-sky-300/15 bg-black shadow-[0_18px_55px_-44px_rgba(56,189,248,0.7)] sm:order-3 sm:col-span-2"
                >
                  <video
                    ref="screenVideo"
                    class="size-full object-contain"
                    autoplay
                    muted
                    playsinline
                  />
                  <div class="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-sky-400/15 px-2 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-sky-300/20">
                    <span class="size-1.5 rounded-full bg-sky-300" />
                    Screen sharing
                  </div>
                </div>
                <div class="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 sm:order-2">
                  <div class="grid grid-cols-3 gap-2 text-xs">
                    <div class="rounded-lg bg-white/[0.04] px-2 py-2">
                      <div class="text-white/35">
                        Mic
                      </div>
                      <div class="mt-1 font-medium" :class="micEnabled ? 'text-emerald-200' : 'text-red-200'">
                        {{ micEnabled ? 'On' : 'Muted' }}
                      </div>
                    </div>
                    <div class="rounded-lg bg-white/[0.04] px-2 py-2">
                      <div class="text-white/35">
                        Camera
                      </div>
                      <div class="mt-1 font-medium" :class="cameraEnabled ? 'text-emerald-200' : 'text-white/55'">
                        {{ cameraEnabled ? 'On' : 'Off' }}
                      </div>
                    </div>
                    <div class="rounded-lg bg-white/[0.04] px-2 py-2">
                      <div class="text-white/35">
                        Share
                      </div>
                      <div class="mt-1 font-medium" :class="screenSharing ? 'text-sky-200' : 'text-white/55'">
                        {{ screenSharing ? 'On' : 'Off' }}
                      </div>
                    </div>
                  </div>
                  <p
                    v-if="mediaError"
                    class="mt-2 line-clamp-2 text-xs text-red-200/80"
                  >
                    {{ mediaError }}
                  </p>
                </div>
              </div>
              <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20">
                <span class="size-1.5 rounded-full bg-emerald-400" />
                Approved guest
              </div>
              <div
                v-if="handshake?.guest.source === 'embed'"
                class="mb-3 inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100 ring-1 ring-sky-300/20"
              >
                <UIcon name="i-lucide-code-2" class="size-3.5" />
                Website embed
              </div>
              <h1 class="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
                {{ handshake?.zone?.name || 'Office room' }}
              </h1>
              <p class="mt-4 max-w-xl text-sm leading-6 text-white/55">
                You are visible to the team in this room. Keep your meeting state ready while the host brings the conversation into the live media layer.
              </p>
              <div
                v-if="meetingLabel"
                class="mt-4 inline-flex max-w-full items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-sm text-white/70 ring-1 ring-white/[0.08]"
              >
                <UIcon name="i-lucide-calendar-check" class="size-4 shrink-0 text-emerald-300" />
                <span class="min-w-0 truncate">{{ meetingLabel }}</span>
              </div>
            </div>

            <div class="relative space-y-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div
                  v-for="participant in roomParticipants"
                  :key="participant.handle"
                  class="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] p-4"
                >
                  <OfficeAvatar
                    :participant="participant"
                    :size="40"
                    show-label
                  />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-white/85">
                      {{ participant.name }}
                    </div>
                    <div class="text-xs capitalize text-white/35">
                      {{ participant.isGuest ? 'Guest' : participant.status }}
                    </div>
                  </div>
                  <span
                    class="size-2 rounded-full"
                    :class="participant.status === 'available' ? 'bg-emerald-400' : participant.status === 'busy' ? 'bg-amber-300' : 'bg-white/35'"
                  />
                </div>

                <div
                  v-if="roomParticipants.length === 0"
                  class="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4 text-sm text-white/45 sm:col-span-2"
                >
                  Waiting for room presence...
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-[#11141a]/90 p-2">
                <button
                  type="button"
                  class="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition"
                  :class="micEnabled ? 'bg-white/[0.07] text-white ring-1 ring-white/[0.08]' : 'bg-red-400/12 text-red-200 ring-1 ring-red-400/20'"
                  @click="toggleMic"
                >
                  <UIcon :name="micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'" class="size-4" />
                  <span>{{ micEnabled ? 'Mic' : 'Muted' }}</span>
                </button>
                <button
                  type="button"
                  class="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition"
                  :class="cameraEnabled ? 'bg-emerald-400/12 text-emerald-100 ring-1 ring-emerald-400/20' : 'bg-white/[0.07] text-white ring-1 ring-white/[0.08]'"
                  @click="toggleCamera"
                >
                  <UIcon :name="cameraEnabled ? 'i-lucide-video' : 'i-lucide-video-off'" class="size-4" />
                  <span>{{ cameraEnabled ? 'Camera' : 'Camera off' }}</span>
                </button>
                <button
                  type="button"
                  class="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition"
                  :class="screenSharing ? 'bg-sky-400/12 text-sky-100 ring-1 ring-sky-400/20' : 'bg-white/[0.07] text-white ring-1 ring-white/[0.08]'"
                  @click="toggleScreenShare"
                >
                  <UIcon name="i-lucide-monitor-up" class="size-4" />
                  <span>{{ screenSharing ? 'Sharing' : 'Share' }}</span>
                </button>
                <button
                  type="button"
                  class="ml-auto flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-red-400/12 px-3 text-sm font-medium text-red-100 ring-1 ring-red-400/20 transition hover:bg-red-400/18"
                  :disabled="leavingRoom"
                  @click="leaveRoom"
                >
                  <UIcon :name="leavingRoom ? 'i-lucide-loader-circle' : 'i-lucide-phone-off'" class="size-4" :class="leavingRoom ? 'animate-spin' : ''" />
                  <span>{{ leavingRoom ? 'Leaving' : 'Leave' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside
          v-if="!pending && !error && !accessEndReason"
          class="rounded-2xl border border-white/[0.08] bg-[#11141a] p-5 shadow-2xl"
        >
          <h2 class="text-lg font-semibold">
            Room status
          </h2>
          <p class="mt-1 text-sm text-white/45">
            {{ connection.isConnected.value ? 'You are connected to the office presence layer.' : 'Connecting to the office presence layer.' }}
          </p>

          <div class="mt-5 space-y-3">
            <div
              v-if="meetingLabel"
              class="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-calendar-check" class="mt-0.5 size-4 text-emerald-300" />
                <div class="min-w-0">
                  <div class="text-xs font-medium uppercase tracking-[0.14em] text-emerald-100/55">
                    Meeting
                  </div>
                  <div class="mt-1 truncate text-sm font-medium text-white/85">
                    {{ meetingLabel }}
                  </div>
                </div>
              </div>
            </div>

            <UFormField label="Availability">
              <USelect
                v-model="status"
                :items="[
                  { label: 'Available', value: 'available' },
                  { label: 'Busy', value: 'busy' },
                  { label: 'Away', value: 'away' }
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <div class="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
              <div class="flex items-center justify-between text-xs text-white/45">
                <span>In room</span>
                <span>{{ roomParticipants.length }}</span>
              </div>
            </div>

            <div class="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-badge-check" class="mt-0.5 size-4 text-emerald-300/70" />
                <div class="min-w-0">
                  <div class="text-sm font-medium text-white/80">
                    Guest pass
                  </div>
                  <p class="mt-1 text-xs leading-5 text-white/45">
                    {{ accessExpiryLabel }}
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="screenSharing"
              class="rounded-lg border border-sky-300/15 bg-sky-400/[0.04] p-3"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-monitor-up" class="mt-0.5 size-4 text-sky-300" />
                <div class="min-w-0">
                  <div class="text-sm font-medium text-sky-50/90">
                    Screen share active
                  </div>
                  <p class="mt-1 text-xs leading-5 text-sky-50/45">
                    Your browser is capturing the selected screen locally for this room session.
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="guestContext.note || guestContext.intakeAnswers.length"
              class="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3"
            >
              <div class="mb-2 flex items-center gap-2">
                <UIcon name="i-lucide-clipboard-list" class="size-4 text-white/45" />
                <span class="text-sm font-medium text-white/80">Shared context</span>
              </div>
              <p
                v-if="guestContext.note"
                class="whitespace-pre-line text-xs leading-5 text-white/50"
              >
                {{ guestContext.note }}
              </p>
              <div
                v-if="guestContext.intakeAnswers.length"
                class="mt-3 space-y-2"
              >
                <div
                  v-for="answer in guestContext.intakeAnswers"
                  :key="answer.label"
                  class="rounded-md bg-black/10 p-2 ring-1 ring-white/[0.05]"
                >
                  <div class="text-[11px] font-medium text-white/45">
                    {{ answer.label }}
                  </div>
                  <p class="mt-1 whitespace-pre-line text-xs leading-5 text-white/70">
                    {{ answer.value || 'No answer' }}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.035] p-3 text-left transition hover:bg-white/[0.055]"
              @click="toggleNotes"
            >
              <span class="flex items-center gap-2">
                <UIcon name="i-lucide-notebook-pen" class="size-4 text-white/45" />
                <span class="text-sm text-white/80">AI notes</span>
              </span>
              <UBadge
                :color="notesEnabled ? 'primary' : 'neutral'"
                variant="subtle"
              >
                {{ notesEnabled ? 'Armed' : 'Off' }}
              </UBadge>
            </button>

            <div class="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <UIcon name="i-lucide-radio" class="size-4 shrink-0 text-white/45" />
                  <span class="truncate text-sm text-white/80">Recording</span>
                </div>
                <UBadge color="neutral" variant="subtle">
                  {{ recordingApproved ? 'Ready' : 'Off' }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs leading-5 text-white/40">
                {{ recordingApproved ? 'Host recording can start after media capture is connected.' : 'Guest did not approve recording in prejoin.' }}
              </p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  </main>
</template>
