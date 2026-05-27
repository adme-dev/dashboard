<script setup lang="ts">
import type { OfficeMediaSession } from '~~/app/types/office'

const props = defineProps<{
  officeId: string
  zoneId: string
  occupantCount: number
  mediaSession?: OfficeMediaSession | null
  mediaUnavailableMessage?: string | null
  canUseLiveNotes?: boolean
  liveNotesDisabledMessage?: string | null
}>()

const emit = defineEmits<{
  liveNotesChanged: []
  openOfficeArtifacts: [meetingId?: string, artifactId?: string]
}>()

const toast = useToast()
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
const liveNotesState = ref<'idle' | 'starting' | 'recording' | 'stopping' | 'error'>('idle')
const liveNotesError = ref('')
const liveNotesLastTranscript = ref('')
const liveNotesSequence = ref(0)
const liveNotesSegmentCount = ref(0)
const liveNotesMeetingId = ref<string | null>(null)
const liveNotesPauseMessage = ref('')
const liveNotesRecorder = shallowRef<MediaRecorder | null>(null)
const endingLiveMeeting = ref(false)
let liveNotesTimer: ReturnType<typeof setTimeout> | null = null
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
const liveNotesSupported = computed(() =>
  typeof MediaRecorder !== 'undefined'
  && typeof FormData !== 'undefined'
)
const liveNotesAllowed = computed(() => props.canUseLiveNotes !== false)
const liveNotesBlockedMessage = computed(() =>
  props.liveNotesDisabledMessage || 'Enter this room before starting live AI notes.'
)
const audioEnabled = computed(() => {
  void mediaStateVersion.value
  return Boolean(localStream.value?.getAudioTracks().some(track => track.enabled && track.readyState === 'live'))
})
const hasAudioTrack = computed(() => {
  void mediaStateVersion.value
  return Boolean(localStream.value?.getAudioTracks().some(track => track.readyState === 'live'))
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
  if (requesting.value === 'audio') return audioEnabled.value ? 'Muting' : hasAudioTrack.value ? 'Unmuting' : 'Starting'
  if (audioEnabled.value) return 'Mute'
  return hasAudioTrack.value ? 'Unmute' : 'Start mic'
})
const audioButtonTitle = computed(() =>
  audioEnabled.value
    ? 'Turn microphone off.'
    : hasAudioTrack.value
      ? 'Turn microphone back on.'
      : 'Start microphone. Your browser may ask for permission.'
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
const liveNotesLabel = computed(() => {
  if (liveNotesState.value === 'starting') return 'Starting AI notes'
  if (liveNotesState.value === 'recording') return 'AI notes live'
  if (liveNotesState.value === 'stopping') return 'Saving AI notes'
  if (liveNotesState.value === 'error') return 'AI notes issue'
  return 'Start AI notes'
})
const liveNotesActionLabel = computed(() => {
  if (liveNotesState.value === 'recording') return 'Stop notes'
  if (liveNotesState.value === 'error') return 'Retry AI notes'
  return liveNotesLabel.value
})
const liveNotesDetail = computed(() => {
  if (!liveNotesSupported.value) return 'Live notes are not supported in this browser.'
  if (!liveNotesAllowed.value) return liveNotesBlockedMessage.value
  if (liveNotesState.value === 'recording' && !audioEnabled.value) return 'Microphone is muted. AI notes will pause until the mic is on.'
  if (liveNotesState.value === 'recording') return liveNotesLastTranscript.value || `Listening in short segments${liveNotesSegmentCount.value ? ` · ${liveNotesSegmentCount.value} saved` : ''}.`
  if (liveNotesState.value === 'stopping') return 'Finalizing the current audio segment.'
  if (liveNotesError.value) return liveNotesError.value
  return 'Transcribe microphone audio into the active meeting transcript.'
})
const liveNotesCountLabel = computed(() =>
  liveNotesSegmentCount.value
    ? `${liveNotesSegmentCount.value} segment${liveNotesSegmentCount.value === 1 ? '' : 's'}`
    : ''
)
const hasSavedLiveNotes = computed(() => liveNotesSegmentCount.value > 0)
const canEndLiveNotesMeeting = computed(() =>
  hasSavedLiveNotes.value
  && Boolean(liveNotesMeetingId.value)
  && !endingLiveMeeting.value
  && (liveNotesState.value === 'idle' || liveNotesState.value === 'error')
)
const endLiveNotesMeetingTitle = computed(() => {
  if (!liveNotesMeetingId.value) return 'Start live AI notes before ending this meeting.'
  if (liveNotesState.value === 'recording') return 'Stop AI notes first so the final audio segment can be saved.'
  if (liveNotesState.value === 'starting' || liveNotesState.value === 'stopping') return 'Wait for live notes to finish saving.'
  return 'End this live meeting and generate summary/action artifacts.'
})

function liveAudioTracks() {
  return localStream.value?.getAudioTracks().filter(track => track.readyState === 'live') ?? []
}

function preferredLiveNotesMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ].find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

function deviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
  return device.label || `${fallback} ${index + 1}`
}

function stopStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

function clearLiveNotesTimer() {
  if (!liveNotesTimer) return
  clearTimeout(liveNotesTimer)
  liveNotesTimer = null
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
  if (!hasAudioTrack.value) return
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

async function ensureLiveNotesAudio() {
  const tracks = liveAudioTracks()
  if (tracks.length) {
    for (const track of tracks) track.enabled = true
    syncMediaState()
    await realtime.publish()
    return true
  }

  const stream = await ensureLocalStream({ audio: audioConstraints(), video: false })
  await realtime.publish()
  await refreshDevices()
  return Boolean(stream?.getAudioTracks().some(track => track.readyState === 'live'))
}

async function sendLiveNotesChunk(blob: Blob, final = false) {
  if (!blob.size && !final) return

  const formData = new FormData()
  if (blob.size) {
    formData.append('audio', blob, `live-notes-${liveNotesSequence.value}.webm`)
  }
  formData.append('sequence', String(liveNotesSequence.value))
  formData.append('final', final ? 'true' : 'false')

  const result = await $fetch<{ meetingId: string, artifact?: { metadata?: Record<string, unknown> }, transcript: string, skipped?: boolean }>(
    `/api/office/${props.officeId}/zones/${props.zoneId}/live-transcription`,
    {
      method: 'POST',
      body: formData
    }
  )
  liveNotesMeetingId.value = result.meetingId

  if (result.transcript) {
    liveNotesLastTranscript.value = result.transcript
    const segmentCount = result.artifact?.metadata?.segment_count
    liveNotesSegmentCount.value = typeof segmentCount === 'number' && Number.isFinite(segmentCount)
      ? segmentCount
      : liveNotesSegmentCount.value + 1
    emit('liveNotesChanged')
  } else if (!result.skipped && !liveNotesLastTranscript.value) {
    liveNotesLastTranscript.value = 'No speech detected in the last segment.'
  }
}

function liveNotesRequestError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const statusMessage = (error as { data?: { statusMessage?: string, message?: string } }).data?.statusMessage
      || (error as { data?: { statusMessage?: string, message?: string } }).data?.message
    if (statusMessage) return statusMessage
  }
  return error instanceof Error ? error.message : 'Could not transcribe the live audio segment.'
}

function startLiveNotesSegment() {
  if (liveNotesState.value !== 'recording') return

  const tracks = liveAudioTracks().filter(track => track.enabled)
  if (!tracks.length) {
    liveNotesState.value = 'error'
    liveNotesError.value = 'Microphone is off. Turn it on before starting AI notes.'
    return
  }

  const mimeType = preferredLiveNotesMimeType()
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType } : undefined)
  liveNotesRecorder.value = recorder

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.onstop = () => {
    clearLiveNotesTimer()
    const final = liveNotesState.value === 'stopping'
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
    liveNotesSequence.value += 1
    void sendLiveNotesChunk(blob, final)
      .catch((error: unknown) => {
        liveNotesState.value = 'error'
        liveNotesError.value = liveNotesRequestError(error)
      })
      .finally(() => {
        if (final) {
          if (liveNotesPauseMessage.value) {
            liveNotesError.value = liveNotesPauseMessage.value
            liveNotesPauseMessage.value = ''
            liveNotesState.value = 'error'
          } else {
            liveNotesState.value = 'idle'
          }
          liveNotesRecorder.value = null
          return
        }
        if (liveNotesState.value === 'recording') startLiveNotesSegment()
      })
  }

  recorder.start()
  liveNotesTimer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, 15_000)
}

async function startLiveNotes() {
  if (!liveNotesSupported.value || liveNotesState.value === 'recording' || liveNotesState.value === 'starting') return
  if (!liveNotesAllowed.value) {
    liveNotesState.value = 'error'
    liveNotesError.value = liveNotesBlockedMessage.value
    return
  }
  liveNotesState.value = 'starting'
  liveNotesError.value = ''
  liveNotesPauseMessage.value = ''
  liveNotesLastTranscript.value = ''
  if (!liveNotesMeetingId.value) {
    liveNotesSequence.value = 0
    liveNotesSegmentCount.value = 0
  }
  try {
    const ready = await ensureLiveNotesAudio()
    if (!ready) {
      liveNotesState.value = 'error'
      liveNotesError.value = 'Microphone is unavailable.'
      return
    }
    liveNotesState.value = 'recording'
    startLiveNotesSegment()
  } catch (error) {
    markMediaFailure('audio', error)
    liveNotesState.value = 'error'
    liveNotesError.value = explainMediaError(error)
  }
}

function stopLiveNotes(reason = '') {
  if (liveNotesState.value !== 'recording') return
  liveNotesPauseMessage.value = reason
  liveNotesState.value = 'stopping'
  clearLiveNotesTimer()
  const recorder = liveNotesRecorder.value
  if (recorder?.state === 'recording') {
    recorder.stop()
    return
  }
  liveNotesState.value = 'idle'
}

function toggleLiveNotes() {
  if (liveNotesState.value === 'recording') {
    stopLiveNotes()
    return
  }
  if (!liveNotesAllowed.value) {
    liveNotesState.value = 'error'
    liveNotesError.value = liveNotesBlockedMessage.value
    return
  }
  void startLiveNotes()
}

async function endLiveNotesMeeting() {
  const meetingId = liveNotesMeetingId.value
  if (!meetingId || endingLiveMeeting.value) return
  if (liveNotesState.value !== 'idle' && liveNotesState.value !== 'error') return

  endingLiveMeeting.value = true
  try {
    const result = await $fetch<{
      generatedSummaryArtifactId?: string
      generatedActionItemsArtifactId?: string
    }>(`/api/office/${props.officeId}/meetings/${meetingId}`, {
      method: 'PATCH',
      body: { status: 'ended' }
    })
    const generated = Boolean(result.generatedSummaryArtifactId || result.generatedActionItemsArtifactId)
    toast.add({
      title: 'Meeting ended',
      description: generated ? 'Live summary and action items were generated.' : 'Live notes were saved to meeting artifacts.',
      icon: generated ? 'i-lucide-sparkles' : 'i-lucide-check',
      color: 'success',
      duration: 1800
    })
    emit('liveNotesChanged')
    emit('openOfficeArtifacts', meetingId, result.generatedSummaryArtifactId || result.generatedActionItemsArtifactId)
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not end meeting',
      description: message || 'Open meeting artifacts and try again.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    endingLiveMeeting.value = false
  }
}

async function toggleAudio() {
  const tracks = liveAudioTracks()
  if (tracks.length) {
    const nextEnabled = !audioEnabled.value
    for (const track of tracks) {
      track.enabled = nextEnabled
    }
    syncMediaState()
    await realtime.publish()
    if (!nextEnabled && liveNotesState.value === 'recording') {
      stopLiveNotes('AI notes paused because the microphone was muted.')
    }
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

watch(() => props.zoneId, () => {
  if (liveNotesState.value === 'recording') stopLiveNotes()
})

watch(liveNotesAllowed, (allowed) => {
  if (!allowed && liveNotesState.value === 'recording') stopLiveNotes()
})

watch(audioEnabled, (enabled) => {
  if (enabled || liveNotesState.value !== 'recording') return
  stopLiveNotes('AI notes paused because the microphone was muted.')
})

onMounted(() => {
  void refreshDevices()
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
})

onBeforeUnmount(() => {
  stopLiveNotes()
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

    <div class="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.025] p-2">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="flex h-9 flex-1 basis-36 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold ring-1 transition disabled:opacity-60 sm:flex-none"
          :class="liveNotesState === 'recording'
            ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
            : liveNotesState === 'error'
              ? 'bg-red-400/10 text-red-100 ring-red-300/15 hover:bg-red-400/15'
              : 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08]'"
          :disabled="liveNotesState === 'starting' || liveNotesState === 'stopping' || !liveNotesSupported || !liveNotesAllowed"
          :aria-pressed="liveNotesState === 'recording'"
          :title="liveNotesAllowed ? 'Transcribe microphone audio into the active meeting transcript.' : liveNotesBlockedMessage"
          @click="toggleLiveNotes"
        >
          <UIcon
            :name="liveNotesState === 'starting' || liveNotesState === 'stopping'
              ? 'i-lucide-loader-circle'
              : liveNotesState === 'recording'
                ? 'i-lucide-bot-message-square'
                : liveNotesState === 'error' ? 'i-lucide-rotate-cw' : 'i-lucide-notebook-tabs'"
            class="size-4"
            :class="liveNotesState === 'starting' || liveNotesState === 'stopping' ? 'animate-spin' : ''"
          />
          {{ liveNotesActionLabel }}
        </button>
        <button
          v-if="hasSavedLiveNotes"
          type="button"
          class="flex h-9 flex-1 basis-32 items-center justify-center gap-2 rounded-lg bg-sky-400/10 px-3 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/15 transition hover:bg-sky-400/15 sm:flex-none"
          title="Open the meeting artifacts for this room."
          @click="emit('openOfficeArtifacts', liveNotesMeetingId || undefined)"
        >
          <UIcon name="i-lucide-files" class="size-4" />
          Review notes
        </button>
        <button
          v-if="hasSavedLiveNotes"
          type="button"
          class="flex h-9 flex-1 basis-40 items-center justify-center gap-2 rounded-lg bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          :disabled="!canEndLiveNotesMeeting"
          :title="endLiveNotesMeetingTitle"
          @click="endLiveNotesMeeting"
        >
          <UIcon
            :name="endingLiveMeeting ? 'i-lucide-loader-circle' : 'i-lucide-check-check'"
            class="size-4"
            :class="endingLiveMeeting ? 'animate-spin' : ''"
          />
          End + summarize
        </button>
        <div class="min-w-0 basis-full">
          <div
            class="truncate text-[11px] font-medium"
            :class="liveNotesState === 'recording'
              ? 'text-emerald-100/80'
              : liveNotesState === 'error' ? 'text-red-100/80' : 'text-white/55'"
          >
            {{ liveNotesLabel }}<span v-if="liveNotesCountLabel" class="text-white/32"> · {{ liveNotesCountLabel }}</span>
          </div>
          <p class="line-clamp-2 text-[10px] leading-4 text-white/35">
            {{ liveNotesDetail }}
          </p>
        </div>
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
