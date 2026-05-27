<script setup lang="ts">
import type { OfficeMeetingSessionRow, OfficeRecordingRow, OfficeSettingsRow } from '~~/app/types/office'

type MeetingOption = Pick<OfficeMeetingSessionRow, 'id' | 'title'>
type RecordingRecentView = {
  viewer_email: string | null
  viewer_key?: string | null
  percent_watched: number
  watched_seconds: number
  created_at: string
}
type RecordingWithMeeting = OfficeRecordingRow & {
  meeting_title: string | null
  action_items_content?: string | null
  viewer_count?: number | null
  average_percent_watched?: number | null
  recent_views?: RecordingRecentView[]
}

const props = defineProps<{
  officeId: string
  defaultOpen?: boolean
  targetMeetingId?: string | null
  targetRecordingId?: string | null
}>()

const emit = defineEmits<{
  officeArtifactsChanged: []
  openOfficeArtifacts: [meetingId?: string]
}>()

const toast = useToast()
const open = ref(props.defaultOpen ?? false)
const saving = ref(false)
const accessFilter = ref<'all' | 'workspace' | 'private' | 'public' | 'password'>('all')
const meetingScope = ref<'all' | 'target'>('all')
const title = ref('')
const description = ref('')
const access = ref<'private' | 'workspace' | 'public' | 'password'>('workspace')
const password = ref('')
const meetingSessionId = ref<string | null>(null)
const retentionDays = ref(180)
const updatingRecordingId = ref<string | null>(null)
const uploadingRecordingId = ref<string | null>(null)
const transcribingRecordingId = ref<string | null>(null)
const openingRecordingThreadId = ref<string | null>(null)
const passwordProtectRecordingId = ref<string | null>(null)
const passwordProtectDraft = ref('')
const autoTranscribeUploads = ref(true)
const captureState = ref<'idle' | 'requesting' | 'recording' | 'stopped'>('idle')
const captureError = ref('')
const captureSeconds = ref(0)
const captureUrl = ref<string | null>(null)
const capturedBlob = shallowRef<Blob | null>(null)
const mediaRecorder = shallowRef<MediaRecorder | null>(null)
const captureStream = shallowRef<MediaStream | null>(null)
const appliedTargetMeetingId = ref<string | null>(null)
const lastFocusedRecordingId = ref<string | null>(null)
let captureTimer: ReturnType<typeof setInterval> | null = null
let captureStartedAt = 0

const {
  data: recordingsData,
  refresh: refreshRecordings,
  pending,
  error
} = useFetch<{ recordings: RecordingWithMeeting[] }>(
  () => `/api/office/${props.officeId}/recordings`,
  {
    watch: [() => props.officeId],
    default: () => ({ recordings: [] })
  }
)

const { data: meetingsData } = useFetch<{ meetings: MeetingOption[] }>(
  () => `/api/office/${props.officeId}/meetings`,
  {
    watch: [() => props.officeId],
    default: () => ({ meetings: [] })
  }
)

const { data: settingsData } = useFetch<{ settings: OfficeSettingsRow | null }>(
  () => `/api/office/${props.officeId}/settings`,
  {
    watch: [() => props.officeId],
    default: () => ({ settings: null })
  }
)

const recordings = computed(() => recordingsData.value?.recordings ?? [])
const meetings = computed(() => meetingsData.value?.meetings ?? [])
const targetMeeting = computed(() =>
  props.targetMeetingId
    ? meetings.value.find(meeting => meeting.id === props.targetMeetingId) ?? null
    : null
)
const settings = computed(() => settingsData.value?.settings ?? null)
const recordingAllowed = computed(() => settings.value?.recording_enabled !== false)
const aiNotesAllowed = computed(() => settings.value?.ai_notes_enabled !== false)
const publicLinksAllowed = computed(() => settings.value?.public_recording_links_enabled === true)
const retentionValid = computed(() => retentionDays.value >= 1 && retentionDays.value <= 3650)
const passwordValid = computed(() => access.value !== 'password' || password.value.trim().length >= 8)
const canCreateRecording = computed(() =>
  recordingAllowed.value
  && retentionValid.value
  && passwordValid.value
  && Boolean(title.value.trim())
  && ((access.value !== 'public' && access.value !== 'password') || publicLinksAllowed.value)
)
const filteredRecordings = computed(() =>
  (accessFilter.value === 'all'
    ? recordings.value
    : recordings.value.filter(recording => recording.access === accessFilter.value))
    .filter(recording => meetingScope.value === 'all' || recording.meeting_session_id === props.targetMeetingId)
)
const targetMeetingRecordingCount = computed(() =>
  props.targetMeetingId
    ? recordings.value.filter(recording => recording.meeting_session_id === props.targetMeetingId).length
    : 0
)
const recordingFilters = computed(() => [
  { value: 'all' as const, label: 'All', count: recordings.value.length },
  { value: 'workspace' as const, label: 'Workspace', count: recordings.value.filter(recording => recording.access === 'workspace').length },
  { value: 'private' as const, label: 'Private', count: recordings.value.filter(recording => recording.access === 'private').length },
  { value: 'public' as const, label: 'Public', count: recordings.value.filter(recording => recording.access === 'public').length },
  { value: 'password' as const, label: 'Password', count: recordings.value.filter(recording => recording.access === 'password').length }
])
const publicRecordingCount = computed(() => recordings.value.filter(recording => recording.access === 'public' || recording.access === 'password').length)
const transcriptReadyCount = computed(() => recordings.value.filter(recording => hasGeneratedTranscript(recording)).length)
const transcriptPendingCount = computed(() =>
  recordings.value.filter(recording =>
    recording.status !== 'archived'
    && hasRecordingMedia(recording)
    && !hasGeneratedTranscript(recording)
  ).length
)
const totalViews = computed(() => recordings.value.reduce((sum, recording) => sum + (recording.view_count ?? 0), 0))
const recordingDraftReadiness = computed(() => [
  {
    key: 'meeting',
    label: meetingSessionId.value ? 'Meeting linked' : 'Standalone',
    detail: meetingSessionId.value
      ? meetings.value.find(meeting => meeting.id === meetingSessionId.value)?.title ?? 'Selected meeting'
      : 'No meeting artifact will be created automatically.',
    icon: meetingSessionId.value ? 'i-lucide-calendar-check' : 'i-lucide-file-video',
    state: meetingSessionId.value ? 'done' : 'pending'
  },
  {
    key: 'access',
    label: access.value === 'public' ? 'Public link' : access.value === 'password' ? 'Password link' : access.value === 'workspace' ? 'Workspace access' : 'Private access',
    detail: access.value === 'public'
      ? publicLinksAllowed.value ? 'External share link will be available.' : 'Public links are disabled.'
      : access.value === 'password'
        ? passwordValid.value ? 'External viewers must enter the recording password.' : 'Password must be at least 8 characters.'
        : access.value === 'workspace'
          ? 'Available to office members.'
          : 'Only hosts can manage this recording.',
    icon: access.value === 'public' ? 'i-lucide-link' : access.value === 'password' ? 'i-lucide-key-round' : access.value === 'workspace' ? 'i-lucide-building-2' : 'i-lucide-lock-keyhole',
    state: ((access.value === 'public' || access.value === 'password') && !publicLinksAllowed.value) || !passwordValid.value ? 'attention' : 'done'
  },
  {
    key: 'retention',
    label: retentionValid.value ? `${retentionDays.value} day retention` : 'Check retention',
    detail: retentionValid.value ? 'Recording follows this retention window.' : 'Retention must be 1 to 3650 days.',
    icon: retentionValid.value ? 'i-lucide-shield-check' : 'i-lucide-shield-alert',
    state: retentionValid.value ? 'done' : 'attention'
  },
  {
    key: 'artifact',
    label: meetingSessionId.value ? 'Artifact handoff' : 'No artifact handoff',
    detail: meetingSessionId.value ? 'Mark ready to attach this to meeting artifacts.' : 'Link a meeting if this belongs to a session.',
    icon: meetingSessionId.value ? 'i-lucide-file-stack' : 'i-lucide-unlink',
    state: meetingSessionId.value ? 'done' : 'pending'
  }
])
const captureSupported = computed(() =>
  typeof navigator !== 'undefined'
  && Boolean(navigator.mediaDevices?.getDisplayMedia)
  && typeof MediaRecorder !== 'undefined'
)
const captureStatusLabel = computed(() => {
  if (captureState.value === 'requesting') return 'Choose a screen'
  if (captureState.value === 'recording') return `Recording ${formatDuration(captureSeconds.value)}`
  if (captureState.value === 'stopped') return `Captured ${formatDuration(captureSeconds.value)}`
  return 'Ready to capture'
})

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function viewTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function recordingRecentViews(recording: RecordingWithMeeting) {
  return Array.isArray(recording.recent_views) ? recording.recent_views : []
}

function recordingAverageWatchLabel(recording: RecordingWithMeeting) {
  const percent = Number(recording.average_percent_watched)
  if (!Number.isFinite(percent) || percent <= 0) return ''
  return `${Math.round(percent)}% avg watched`
}

function recordingViewerCountLabel(recording: RecordingWithMeeting) {
  const count = Number(recording.viewer_count)
  if (!Number.isFinite(count) || count <= 0) return ''
  return `${count} viewer${count === 1 ? '' : 's'}`
}

function recentViewLabel(view: RecordingRecentView) {
  return view.viewer_email || (view.viewer_key ? 'Anonymous viewer' : 'Anonymous viewer')
}

function recentViewKey(view: RecordingRecentView) {
  return `${view.viewer_email || view.viewer_key || 'anonymous'}:${view.created_at}`
}

function isTargetMeetingRecording(recording: RecordingWithMeeting) {
  return Boolean(props.targetMeetingId && recording.meeting_session_id === props.targetMeetingId)
}

function isTargetRecording(recording: RecordingWithMeeting) {
  return Boolean(props.targetRecordingId && recording.id === props.targetRecordingId)
}

function isActiveRecording(recording: RecordingWithMeeting) {
  return recording.status !== 'archived'
}

function hasRecordingMedia(recording: RecordingWithMeeting) {
  return Boolean(recording.storage_key)
}

function hasGeneratedTranscript(recording: RecordingWithMeeting) {
  return Boolean(recording.transcript?.trim())
}

function recordingActionItems(recording: RecordingWithMeeting) {
  return (recording.action_items_content ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== 'No action items identified.')
    .map(line => line.replace(/^-+\s*/, ''))
}

function canTranscribeRecording(recording: RecordingWithMeeting) {
  return recordingAllowed.value
    && aiNotesAllowed.value
    && recording.status !== 'archived'
    && hasRecordingMedia(recording)
}

function hasPublicShareLink(recording: RecordingWithMeeting) {
  return isActiveRecording(recording)
    && recording.status === 'ready'
    && (recording.access === 'public' || recording.access === 'password')
    && Boolean(recording.share_token)
}

function canMakePublic(recording: RecordingWithMeeting) {
  return isActiveRecording(recording)
    && recording.status === 'ready'
    && hasRecordingMedia(recording)
    && recording.access !== 'public'
}

function canPasswordProtect(recording: RecordingWithMeeting) {
  return isActiveRecording(recording)
    && recording.status === 'ready'
    && hasRecordingMedia(recording)
    && recording.access !== 'password'
    && publicLinksAllowed.value
}

function canChangeRecordingPassword(recording: RecordingWithMeeting) {
  return isActiveRecording(recording)
    && recording.status === 'ready'
    && hasRecordingMedia(recording)
    && recording.access === 'password'
    && publicLinksAllowed.value
}

function startPasswordProtect(recording: RecordingWithMeeting) {
  passwordProtectRecordingId.value = recording.id
  passwordProtectDraft.value = ''
}

function cancelPasswordProtect() {
  passwordProtectRecordingId.value = null
  passwordProtectDraft.value = ''
}

async function savePasswordProtect(recording: RecordingWithMeeting) {
  const nextPassword = passwordProtectDraft.value.trim()
  if (nextPassword.length < 8) {
    toast.add({ title: 'Recording password required', description: 'Use at least 8 characters.', color: 'error' })
    return
  }
  await updateRecording(
    recording,
    { access: 'password', password: nextPassword },
    recording.access === 'password'
      ? 'Recording password updated'
      : 'Password-protected recording link enabled'
  )
  toast.add({
    title: 'Share password separately',
    description: 'The copied link will not include the password.',
    icon: 'i-lucide-key-round',
    color: 'neutral',
    duration: 2600
  })
  cancelPasswordProtect()
}

function shareBlockedLabel(recording: RecordingWithMeeting) {
  if (recording.status !== 'ready') return 'Mark ready to share'
  if (!hasRecordingMedia(recording)) return 'Attach media to share'
  return 'Public sharing unavailable'
}

function draftReadinessClass(state: string) {
  if (state === 'done') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (state === 'attention') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  return 'bg-white/[0.035] text-white/50 ring-white/[0.06]'
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ].find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

function stopCaptureTimer() {
  if (!captureTimer) return
  clearInterval(captureTimer)
  captureTimer = null
}

function revokeCaptureUrl() {
  if (!captureUrl.value) return
  URL.revokeObjectURL(captureUrl.value)
  captureUrl.value = null
}

function releaseCaptureStream() {
  captureStream.value?.getTracks().forEach(track => track.stop())
  captureStream.value = null
}

function resetCapture() {
  stopCaptureTimer()
  mediaRecorder.value = null
  releaseCaptureStream()
  revokeCaptureUrl()
  capturedBlob.value = null
  captureError.value = ''
  captureSeconds.value = 0
  captureState.value = 'idle'
}

async function startScreenCapture() {
  if (!captureSupported.value) {
    captureError.value = 'Screen recording is not available in this browser.'
    return
  }
  if (!recordingAllowed.value) {
    captureError.value = 'Recordings are disabled in office controls.'
    return
  }

  resetCapture()
  captureState.value = 'requesting'
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    })
    captureStream.value = stream
    const chunks: BlobPart[] = []
    const mimeType = preferredMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorder.value = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      stopCaptureTimer()
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      capturedBlob.value = blob
      captureUrl.value = URL.createObjectURL(blob)
      captureState.value = 'stopped'
      releaseCaptureStream()
    }
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenCapture(), { once: true })
    recorder.start(1000)
    captureStartedAt = Date.now()
    captureSeconds.value = 0
    captureTimer = setInterval(() => {
      captureSeconds.value = Math.floor((Date.now() - captureStartedAt) / 1000)
    }, 1000)
    if (!title.value.trim()) {
      title.value = `Screen recording ${new Date().toLocaleDateString()}`
    }
    captureState.value = 'recording'
  } catch (err: unknown) {
    resetCapture()
    captureError.value = err instanceof Error ? err.message : 'Could not start screen recording.'
  }
}

function stopScreenCapture() {
  if (mediaRecorder.value?.state === 'recording') {
    mediaRecorder.value.stop()
    return
  }
  stopCaptureTimer()
  releaseCaptureStream()
  if (captureState.value !== 'stopped') captureState.value = 'idle'
}

function downloadCapture() {
  if (!captureUrl.value) return
  const anchor = document.createElement('a')
  anchor.href = captureUrl.value
  anchor.download = `${title.value.trim() || 'office-screen-recording'}.webm`
  anchor.click()
}

async function uploadCapturedRecording(recording: RecordingWithMeeting | OfficeRecordingRow) {
  if (!capturedBlob.value) return null
  uploadingRecordingId.value = recording.id
  try {
    const body = new FormData()
    body.append('file', capturedBlob.value, `${title.value.trim() || recording.title || 'office-recording'}.webm`)
    if (captureSeconds.value > 0) body.append('durationSeconds', String(captureSeconds.value))
    const result = await $fetch<{ recording: OfficeRecordingRow }>(`/api/office/${props.officeId}/recordings/${recording.id}/upload`, {
      method: 'POST',
      body
    })
    toast.add({ title: 'Recording media attached', icon: 'i-lucide-upload-cloud', color: 'success', duration: 1600 })
    resetCapture()
    if (autoTranscribeUploads.value && aiNotesAllowed.value) {
      await transcribeRecording(result.recording)
    }
    return result.recording
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not upload recording media', description: message || 'Download the local capture and try again.', color: 'error' })
    return null
  } finally {
    uploadingRecordingId.value = null
  }
}

function resetForm() {
  access.value = 'workspace'
  password.value = ''
  meetingSessionId.value = props.targetMeetingId && meetings.value.some(meeting => meeting.id === props.targetMeetingId)
    ? props.targetMeetingId
    : meetings.value[0]?.id ?? null
  const meeting = meetingSessionId.value
    ? meetings.value.find(item => item.id === meetingSessionId.value)
    : null
  title.value = meeting ? `${meeting.title} recording` : ''
  description.value = meeting ? `Recording attached to ${meeting.title}.` : ''
  retentionDays.value = settings.value?.default_recording_retention_days ?? 180
}

function applyTargetMeeting() {
  if (!props.targetMeetingId) {
    meetingScope.value = 'all'
    appliedTargetMeetingId.value = null
    return
  }
  if (appliedTargetMeetingId.value === props.targetMeetingId) return
  const meeting = meetings.value.find(item => item.id === props.targetMeetingId)
  if (!meeting) return
  meetingSessionId.value = meeting.id
  title.value = `${meeting.title} recording`
  description.value = `Recording attached to ${meeting.title}.`
  meetingScope.value = 'target'
  appliedTargetMeetingId.value = meeting.id
}

function shareUrl(recording: RecordingWithMeeting) {
  if (recording.access !== 'public' && recording.access !== 'password') return null
  if (!recording.share_token) return null
  if (typeof window === 'undefined') return `/recordings/${recording.share_token}`
  return `${window.location.origin}/recordings/${recording.share_token}`
}

function copyShareLabel(recording: RecordingWithMeeting) {
  return recording.access === 'password' ? 'Copy protected link' : 'Copy link'
}

function openShareLabel(recording: RecordingWithMeeting) {
  return recording.access === 'password' ? 'Open protected link' : 'Open link'
}

function recordingStatusClass(recording: RecordingWithMeeting) {
  if (recording.status === 'ready') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (recording.status === 'processing') return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  if (recording.status === 'archived') return 'bg-white/[0.05] text-white/45 ring-white/[0.06]'
  return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
}

function recordingAccessClass(recording: RecordingWithMeeting) {
  if (recording.access === 'public') return 'bg-violet-400/10 text-violet-100 ring-violet-300/15'
  if (recording.access === 'password') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  if (recording.access === 'private') return 'bg-white/[0.05] text-white/45 ring-white/[0.06]'
  return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
}

function recordingAccessLabel(recording: RecordingWithMeeting) {
  if (recording.access === 'password') return 'password protected'
  if (recording.access === 'public') return 'public link'
  return recording.access
}

function recordingMediaClass(recording: RecordingWithMeeting) {
  if (hasRecordingMedia(recording)) return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  if (recording.status === 'ready') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  return 'bg-white/[0.035] text-white/40 ring-white/[0.05]'
}

function recordingMediaLabel(recording: RecordingWithMeeting) {
  if (hasRecordingMedia(recording)) return 'media'
  if (recording.status === 'ready') return 'metadata only'
  return 'no media'
}

function recordingTranscriptLabel(recording: RecordingWithMeeting) {
  if (hasGeneratedTranscript(recording)) return 'AI notes ready'
  if (!hasRecordingMedia(recording)) return 'Attach media for AI notes'
  if (!aiNotesAllowed.value) return 'AI notes disabled'
  if (recording.status === 'processing') return 'Processing'
  return 'AI notes pending'
}

function recordingTranscriptClass(recording: RecordingWithMeeting) {
  if (hasGeneratedTranscript(recording)) return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (!hasRecordingMedia(recording) || !aiNotesAllowed.value) return 'bg-white/[0.035] text-white/40 ring-white/[0.05]'
  if (recording.status === 'processing') return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
}

function recordingLifecycleHint(recording: RecordingWithMeeting) {
  if (recording.status === 'archived') {
    return {
      icon: 'i-lucide-archive',
      title: 'Archived',
      detail: hasRecordingMedia(recording)
        ? 'This recording is retained for audit history and hidden from active workflows.'
        : 'Media has been removed or was never attached; metadata remains for audit history.',
      class: 'bg-white/[0.035] text-white/45 ring-white/[0.06]'
    }
  }
  if (recording.status === 'failed') {
    return {
      icon: 'i-lucide-circle-alert',
      title: 'Transcription failed',
      detail: hasRecordingMedia(recording)
        ? 'Retry AI notes or attach a different media file before sharing.'
        : 'Attach recording media before retrying AI notes.',
      class: 'bg-red-400/10 text-red-100 ring-red-300/15'
    }
  }
  if (recording.status === 'ready' && (recording.access === 'public' || recording.access === 'password') && recording.share_token) {
    return {
      icon: recording.access === 'password' ? 'i-lucide-key-round' : hasRecordingMedia(recording) ? 'i-lucide-link' : 'i-lucide-file-warning',
      title: recording.access === 'password' ? 'Password protected' : hasRecordingMedia(recording) ? 'Shareable' : 'Shareable metadata',
      detail: recording.access === 'password'
        ? 'External viewers need the password before playback and progress tracking.'
        : hasRecordingMedia(recording)
          ? 'Public link is available for external viewers and progress tracking.'
          : 'Public link is active, but the page has no playable media until a capture is attached.',
      class: hasRecordingMedia(recording)
        ? recording.access === 'password' ? 'bg-amber-300/10 text-amber-100 ring-amber-200/15' : 'bg-violet-400/10 text-violet-100 ring-violet-300/15'
        : 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
    }
  }
  if (recording.status === 'ready') {
    return {
      icon: hasRecordingMedia(recording) ? 'i-lucide-file-check-2' : 'i-lucide-file-warning',
      title: hasRecordingMedia(recording)
        ? recording.meeting_session_id ? 'Artifact ready' : 'Ready internally'
        : 'Ready without media',
      detail: hasRecordingMedia(recording)
        ? recording.meeting_session_id ? 'Attached to the meeting record. Make public only if it needs external sharing.' : 'Ready for workspace review.'
        : 'Attach a capture before sharing if this should play back as a recording.',
      class: hasRecordingMedia(recording)
        ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
        : 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
    }
  }
  if (recording.status === 'processing') {
    return {
      icon: 'i-lucide-loader-2',
      title: 'Processing',
      detail: 'Mark ready when the summary, transcript, or recording details are final.',
      class: 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
    }
  }
  return {
    icon: 'i-lucide-file-video',
    title: 'Draft',
    detail: 'Add context, confirm access, then mark ready to create the meeting artifact.',
    class: 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  }
}

async function copyShareLink(recording: RecordingWithMeeting) {
  const link = shareUrl(recording)
  if (!link) {
    toast.add({ title: 'No share link', description: 'Switch access to Public link or Password protected before sharing externally.', color: 'neutral' })
    return
  }
  try {
    await navigator.clipboard.writeText(link)
    toast.add({ title: recording.access === 'password' ? 'Protected link copied' : 'Recording link copied', description: link, icon: 'i-lucide-link', color: 'success', duration: 1800 })
  } catch {
    toast.add({ title: recording.access === 'password' ? 'Protected recording link' : 'Recording link', description: link, icon: 'i-lucide-link', color: 'neutral', duration: 5000 })
  }
}

function openShareLink(recording: RecordingWithMeeting) {
  const link = shareUrl(recording)
  if (!link) {
    toast.add({ title: 'No share link', description: 'Mark the recording ready and choose Public link or Password protected access first.', color: 'neutral' })
    return
  }
  window.open(link, '_blank', 'noopener,noreferrer')
}

async function openRecordingThread(recording: RecordingWithMeeting) {
  openingRecordingThreadId.value = recording.id
  try {
    const channel = await $fetch<{ id: string }>(`/api/office/${props.officeId}/recordings/${recording.id}/thread`, {
      method: 'POST'
    })
    await navigateTo(`/agency/chat?channel=${encodeURIComponent(channel.id)}`)
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not open recording thread', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    openingRecordingThreadId.value = null
  }
}

async function createRecording() {
  if (!title.value.trim()) {
    toast.add({ title: 'Recording title required', color: 'error' })
    return
  }
  if (!retentionValid.value) {
    toast.add({ title: 'Check retention policy', description: 'Retention must be between 1 and 3650 days.', color: 'error' })
    return
  }
  if (!recordingAllowed.value) {
    toast.add({ title: 'Recordings are disabled', color: 'neutral' })
    return
  }
  if ((access.value === 'public' || access.value === 'password') && !publicLinksAllowed.value) {
    toast.add({ title: 'Public recording links are disabled', color: 'neutral' })
    return
  }
  if (access.value === 'password' && !passwordValid.value) {
    toast.add({ title: 'Recording password required', description: 'Use at least 8 characters.', color: 'error' })
    return
  }

  saving.value = true
  const linkedMeetingId = meetingSessionId.value
  try {
    const result = await $fetch<{ recording: OfficeRecordingRow }>(`/api/office/${props.officeId}/recordings`, {
      method: 'POST',
      body: {
        meeting_session_id: meetingSessionId.value,
        title: title.value.trim(),
        description: description.value,
        access: access.value,
        password: access.value === 'password' ? password.value.trim() : undefined,
        retention_days: retentionDays.value,
        chapters: []
      }
    })
    if (capturedBlob.value) {
      await uploadCapturedRecording(result.recording)
    } else {
      toast.add({ title: 'Recording draft created', icon: 'i-lucide-screen-share', color: 'success', duration: 1600 })
    }
    resetForm()
    await refreshRecordings()
    if (linkedMeetingId) emit('officeArtifactsChanged')
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create recording', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function updateRecording(recording: RecordingWithMeeting, body: Record<string, unknown>, successTitle: string) {
  updatingRecordingId.value = recording.id
  try {
    await $fetch(`/api/office/${props.officeId}/recordings/${recording.id}`, {
      method: 'PATCH',
      body
    })
    toast.add({ title: successTitle, icon: 'i-lucide-check', color: 'success', duration: 1400 })
    await refreshRecordings()
    if (recording.meeting_session_id && (body.status === 'ready' || body.access === 'public' || body.access === 'password')) {
      emit('officeArtifactsChanged')
    }
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not update recording', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    updatingRecordingId.value = null
  }
}

async function transcribeRecording(recording: RecordingWithMeeting | OfficeRecordingRow) {
  transcribingRecordingId.value = recording.id
  try {
    const result = await $fetch<{ transcript: string, summary: string, actionItems?: string }>(
      `/api/office/${props.officeId}/recordings/${recording.id}/transcribe`,
      { method: 'POST' }
    )
    await refreshRecordings()
    if (recording.meeting_session_id) emit('officeArtifactsChanged')
    toast.add({
      title: 'AI transcript ready',
      description: result.actionItems
        ? 'Transcript, summary, and action items were saved.'
        : result.summary ? 'Transcript and summary were saved.' : 'Transcript was saved to the recording.',
      icon: 'i-lucide-notebook-tabs',
      color: 'success',
      duration: 2200
    })
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not transcribe recording',
      description: message || 'Check that AI notes are enabled and the media file is supported.',
      icon: 'i-lucide-message-circle-warning',
      color: 'error',
      duration: 4200
    })
    await refreshRecordings()
  } finally {
    transcribingRecordingId.value = null
  }
}

watch(open, (isOpen) => {
  if (isOpen && !title.value) resetForm()
  if (isOpen) applyTargetMeeting()
})

watch([targetMeeting, () => props.targetMeetingId], () => {
  applyTargetMeeting()
}, { immediate: true })

watch([() => props.targetRecordingId, filteredRecordings], ([recordingId]) => {
  if (!recordingId || typeof document === 'undefined') return
  if (lastFocusedRecordingId.value === recordingId) return
  if (!filteredRecordings.value.some(recording => recording.id === recordingId)) return
  nextTick(() => {
    const target = document.querySelector(`[data-office-recording-id="${recordingId}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    lastFocusedRecordingId.value = recordingId
  })
}, { immediate: true })

watch(settings, () => {
  retentionDays.value = settings.value?.default_recording_retention_days ?? retentionDays.value
  if (!publicLinksAllowed.value && (access.value === 'public' || access.value === 'password')) {
    access.value = 'workspace'
  }
})

onBeforeUnmount(() => {
  resetCapture()
})
</script>

<template>
  <section class="mb-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 text-white shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      @click="open = !open"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span class="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
          <UIcon name="i-lucide-screen-share" class="size-3.5 text-violet-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Screen recordings</span>
          <span class="block truncate text-xs text-white/40">{{ recordings.length }} async updates and walkthroughs</span>
        </span>
      </span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-white/45" />
    </button>

    <div
      v-if="open"
      class="grid gap-3 border-t border-white/[0.06] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div class="space-y-2">
        <div
          v-if="!recordingAllowed"
          class="rounded-lg bg-amber-300/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-200/15"
        >
          Recordings are disabled in office controls.
        </div>
        <div
          v-else-if="!aiNotesAllowed"
          class="rounded-lg bg-amber-300/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-200/15"
        >
          AI notes are disabled in office controls. Recording playback still works, but transcripts and summaries cannot be generated.
        </div>
        <div class="grid gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Recordings
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ recordings.length }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Views
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ totalViews }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Public links
            </div>
            <div
              class="mt-1 text-sm font-semibold"
              :class="publicRecordingCount ? 'text-violet-100' : 'text-white/75'"
            >
              {{ publicRecordingCount }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              AI notes
            </div>
            <div
              class="mt-1 text-sm font-semibold"
              :class="transcriptPendingCount ? 'text-amber-100' : transcriptReadyCount ? 'text-emerald-100' : 'text-white/75'"
            >
              {{ transcriptReadyCount }} ready<span v-if="transcriptPendingCount" class="text-white/35"> · {{ transcriptPendingCount }} pending</span>
            </div>
          </div>
        </div>
        <div
          v-if="pending"
          class="flex items-center justify-center rounded-lg bg-white/[0.035] px-3 py-8 ring-1 ring-white/[0.05]"
        >
          <XfLoader size="sm" />
        </div>
        <div
          v-else-if="error"
          class="rounded-lg bg-red-400/[0.07] px-3 py-3 text-sm text-red-50/80 ring-1 ring-red-300/15"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-red-50">
                Could not load recordings
              </div>
              <div class="mt-1 text-xs text-red-50/55">
                Recording artifacts are temporarily unavailable.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
              @click="refreshRecordings"
            >
              Retry
            </button>
          </div>
        </div>
        <div
          v-else-if="!recordings.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No recordings yet.
        </div>
        <div v-else class="space-y-2">
          <div
            v-if="targetMeeting"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-400/10 px-3 py-2 ring-1 ring-violet-300/15"
          >
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-violet-50/90">
                {{ targetMeeting.title }}
              </div>
              <p class="mt-0.5 text-[11px] text-violet-50/55">
                {{ targetMeetingRecordingCount }} recording{{ targetMeetingRecordingCount === 1 ? '' : 's' }} attached to this meeting
              </p>
            </div>
            <div class="flex shrink-0 rounded-lg bg-black/10 p-0.5 ring-1 ring-violet-200/10">
              <button
                type="button"
                class="h-7 rounded-md px-2 text-[11px] font-semibold transition"
                :class="meetingScope === 'target' ? 'bg-violet-300/15 text-violet-50' : 'text-violet-50/45 hover:text-violet-50/75'"
                @click="meetingScope = 'target'"
              >
                This meeting
              </button>
              <button
                type="button"
                class="h-7 rounded-md px-2 text-[11px] font-semibold transition"
                :class="meetingScope === 'all' ? 'bg-white/[0.08] text-white/75' : 'text-violet-50/45 hover:text-violet-50/75'"
                @click="meetingScope = 'all'"
              >
                All recordings
              </button>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-4">
            <button
              v-for="filter in recordingFilters"
              :key="filter.value"
              type="button"
              class="rounded-lg px-3 py-2 text-left ring-1 transition"
              :class="accessFilter === filter.value
                ? 'bg-violet-400/10 text-violet-100 ring-violet-300/20'
                : 'bg-white/[0.035] text-white/55 ring-white/[0.05] hover:bg-white/[0.055]'"
              @click="accessFilter = filter.value"
            >
              <div class="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
                {{ filter.label }}
              </div>
              <div class="mt-1 text-lg font-semibold tabular-nums">
                {{ filter.count }}
              </div>
            </button>
          </div>

          <div
            v-if="!filteredRecordings.length"
            class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
          >
            No {{ accessFilter }} recordings{{ meetingScope === 'target' ? ' for this meeting' : '' }}.
          </div>

          <div
            v-for="recording in filteredRecordings"
            :key="recording.id"
            :data-office-recording-id="recording.id"
            class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
            :class="isTargetRecording(recording)
              ? 'bg-sky-400/10 ring-sky-300/25'
              : isTargetMeetingRecording(recording) ? 'bg-violet-400/[0.055] ring-violet-300/20' : ''"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-medium">{{ recording.title }}</span>
              <span
                class="rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1"
                :class="recordingStatusClass(recording)"
              >
                {{ recording.status }}
              </span>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/40">
              <span class="truncate">{{ recording.meeting_title || 'Standalone walkthrough' }}</span>
              <span
                v-if="isTargetMeetingRecording(recording)"
                class="rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-100 ring-1 ring-violet-300/15"
              >
                Selected meeting
              </span>
              <span>·</span>
              <span>{{ recording.view_count }} views</span>
              <span v-if="recordingViewerCountLabel(recording)">
                {{ recordingViewerCountLabel(recording) }}
              </span>
              <span v-if="recordingAverageWatchLabel(recording)">
                {{ recordingAverageWatchLabel(recording) }}
              </span>
              <span
                class="rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1"
                :class="recordingMediaClass(recording)"
              >
                {{ recordingMediaLabel(recording) }}
              </span>
              <span
                class="rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1"
                :class="recordingTranscriptClass(recording)"
              >
                {{ recordingTranscriptLabel(recording) }}
              </span>
              <span
                v-if="recordingActionItems(recording).length"
                class="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-100 ring-1 ring-emerald-300/15"
              >
                {{ recordingActionItems(recording).length }} actions
              </span>
              <span
                class="rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1"
                :class="recordingAccessClass(recording)"
              >
                {{ recordingAccessLabel(recording) }}
              </span>
              <span>retention {{ recording.retention_days || 'default' }} days</span>
            </div>
            <div
              v-if="recordingRecentViews(recording).length"
              class="mt-2 rounded-md bg-black/10 p-2 ring-1 ring-white/[0.05]"
            >
              <div class="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                <span>Viewer progress</span>
                <span>{{ recordingRecentViews(recording).length }}</span>
              </div>
              <div class="grid gap-1.5 sm:grid-cols-2">
                <div
                  v-for="view in recordingRecentViews(recording).slice(0, 4)"
                  :key="recentViewKey(view)"
                  class="min-w-0 rounded bg-white/[0.035] px-2 py-1.5 text-[11px] ring-1 ring-white/[0.04]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium text-white/65">{{ recentViewLabel(view) }}</span>
                    <span class="shrink-0 tabular-nums text-violet-100/70">{{ Math.round(Number(view.percent_watched) || 0) }}%</span>
                  </div>
                  <div class="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/35">
                    <span>{{ formatDuration(Number(view.watched_seconds) || 0) }}</span>
                    <span class="truncate">{{ viewTimeLabel(view.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              class="mt-2 rounded-md px-2 py-1.5 ring-1"
              :class="recordingLifecycleHint(recording).class"
            >
              <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                <UIcon
                  :name="recordingLifecycleHint(recording).icon"
                  class="size-3.5 shrink-0"
                  :class="recording.status === 'processing' ? 'animate-spin' : ''"
                />
                <span class="truncate">{{ recordingLifecycleHint(recording).title }}</span>
              </div>
              <p class="mt-0.5 text-[10px] leading-4 opacity-75">
                {{ recordingLifecycleHint(recording).detail }}
              </p>
            </div>
            <div
              v-if="recording.summary || recording.transcript || recordingActionItems(recording).length"
              class="mt-2 rounded-md bg-black/10 p-2 ring-1 ring-white/[0.05]"
            >
              <div class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                <UIcon name="i-lucide-notebook-tabs" class="size-3" />
                AI output
              </div>
              <p
                v-if="recording.summary"
                class="line-clamp-3 text-[11px] leading-4 text-white/58"
              >
                {{ recording.summary }}
              </p>
              <p
                v-else
                class="line-clamp-2 text-[11px] leading-4 text-white/45"
              >
                Transcript generated. Open meeting artifacts for the full transcript and follow-up items.
              </p>
              <div
                v-if="recordingActionItems(recording).length"
                class="mt-2 flex flex-wrap gap-1.5"
              >
                <span
                  v-for="item in recordingActionItems(recording).slice(0, 3)"
                  :key="item"
                  class="max-w-full truncate rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100/75 ring-1 ring-emerald-300/15"
                >
                  {{ item }}
                </span>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-if="recording.status === 'draft' || recording.status === 'processing'"
                type="button"
                class="rounded-md bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingRecordingId === recording.id"
                @click="updateRecording(recording, { status: 'ready' }, 'Recording marked ready')"
              >
                Ready
              </button>
              <button
                v-if="capturedBlob && isActiveRecording(recording)"
                type="button"
                class="rounded-md bg-sky-400/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/15 transition hover:bg-sky-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="uploadingRecordingId === recording.id"
                @click="uploadCapturedRecording(recording)"
              >
                {{ uploadingRecordingId === recording.id ? 'Attaching' : 'Attach capture' }}
              </button>
              <button
                v-if="canTranscribeRecording(recording)"
                type="button"
                class="rounded-md bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="transcribingRecordingId === recording.id || updatingRecordingId === recording.id"
                :title="hasGeneratedTranscript(recording) ? 'Regenerate transcript, summary, and action items' : 'Generate transcript, summary, and action items'"
                @click="transcribeRecording(recording)"
              >
                {{ transcribingRecordingId === recording.id ? 'Transcribing' : hasGeneratedTranscript(recording) ? 'Retranscribe' : 'Transcribe' }}
              </button>
              <button
                v-if="canMakePublic(recording)"
                type="button"
                class="rounded-md bg-violet-400/10 px-2.5 py-1.5 text-xs font-semibold text-violet-100 ring-1 ring-violet-300/15 transition hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="updatingRecordingId === recording.id || !publicLinksAllowed"
                :title="publicLinksAllowed ? 'Create a public share link' : 'Public recording links are disabled'"
                @click="updateRecording(recording, { access: 'public' }, 'Public recording link enabled')"
              >
                Make public
              </button>
              <button
                v-if="canPasswordProtect(recording) && passwordProtectRecordingId !== recording.id"
                type="button"
                class="rounded-md bg-amber-300/10 px-2.5 py-1.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/15 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="updatingRecordingId === recording.id"
                title="Require a password for external viewers."
                @click="startPasswordProtect(recording)"
              >
                Password protect
              </button>
              <button
                v-if="canChangeRecordingPassword(recording) && passwordProtectRecordingId !== recording.id"
                type="button"
                class="rounded-md bg-amber-300/10 px-2.5 py-1.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/15 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="updatingRecordingId === recording.id"
                title="Set a new password for this protected recording link."
                @click="startPasswordProtect(recording)"
              >
                Change password
              </button>
              <span
                v-else-if="passwordProtectRecordingId !== recording.id && isActiveRecording(recording) && recording.access !== 'public' && recording.access !== 'password'"
                class="rounded-md bg-white/[0.035] px-2.5 py-1.5 text-xs font-medium text-white/40 ring-1 ring-white/[0.05]"
              >
                {{ shareBlockedLabel(recording) }}
              </span>
              <div
                v-if="passwordProtectRecordingId === recording.id"
                class="flex min-w-[240px] flex-1 flex-wrap items-center gap-1.5 rounded-md bg-amber-300/[0.055] p-1.5 ring-1 ring-amber-200/15"
              >
                <input
                  v-model="passwordProtectDraft"
                  type="password"
                  autocomplete="new-password"
                  placeholder="Password, min 8 chars"
                  class="h-8 min-w-0 flex-1 rounded bg-black/20 px-2 text-xs text-white outline-none ring-1 ring-white/[0.08] placeholder:text-white/30 focus:ring-amber-200/25"
                >
                <button
                  type="button"
                  class="h-8 rounded bg-amber-300/10 px-2 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/15 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="updatingRecordingId === recording.id || passwordProtectDraft.trim().length < 8"
                  @click="savePasswordProtect(recording)"
                >
                  Save
                </button>
                <button
                  type="button"
                  class="h-8 rounded bg-white/[0.04] px-2 text-xs font-medium text-white/55 ring-1 ring-white/[0.06]"
                  @click="cancelPasswordProtect"
                >
                  Cancel
                </button>
              </div>
              <button
                v-if="hasPublicShareLink(recording)"
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingRecordingId === recording.id"
                @click="copyShareLink(recording)"
              >
                {{ copyShareLabel(recording) }}
              </button>
              <button
                v-if="hasPublicShareLink(recording)"
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
                @click="openShareLink(recording)"
              >
                {{ openShareLabel(recording) }}
              </button>
              <button
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                :disabled="openingRecordingThreadId === recording.id"
                @click="openRecordingThread(recording)"
              >
                {{ openingRecordingThreadId === recording.id ? 'Opening' : 'Thread' }}
              </button>
              <button
                v-if="recording.meeting_session_id"
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
                @click="emit('openOfficeArtifacts', recording.meeting_session_id)"
              >
                Artifacts
              </button>
              <span
                v-if="isActiveRecording(recording) && recording.access === 'public' && !hasPublicShareLink(recording)"
                class="rounded-md bg-white/[0.035] px-2.5 py-1.5 text-xs font-medium text-white/40 ring-1 ring-white/[0.05]"
              >
                Link after ready
              </span>
              <button
                v-if="isActiveRecording(recording) && (recording.access === 'public' || recording.access === 'password')"
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/60 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingRecordingId === recording.id"
                @click="updateRecording(recording, { access: 'workspace' }, 'Recording returned to workspace access')"
              >
                Make workspace
              </button>
              <button
                v-if="isActiveRecording(recording) && (recording.access === 'public' || recording.access === 'password')"
                type="button"
                class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/60 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingRecordingId === recording.id"
                @click="updateRecording(recording, { access: 'private' }, 'Recording made private')"
              >
                Make private
              </button>
              <button
                v-if="isActiveRecording(recording)"
                type="button"
                class="ml-auto rounded-md bg-red-400/10 px-2.5 py-1.5 text-xs font-semibold text-red-100 ring-1 ring-red-300/15 transition hover:bg-red-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingRecordingId === recording.id"
                @click="updateRecording(recording, { status: 'archived' }, 'Recording archived')"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="rounded-lg border border-white/[0.08] bg-white/[0.035] p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-white">
                Browser recorder
              </div>
              <div class="mt-0.5 text-xs text-white/40">
                {{ captureStatusLabel }}
              </div>
            </div>
            <span
              class="rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1"
              :class="captureState === 'recording'
                ? 'bg-red-400/10 text-red-100 ring-red-300/15'
                : captureState === 'stopped'
                  ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                  : 'bg-white/[0.05] text-white/45 ring-white/[0.06]'"
            >
              {{ captureState === 'recording' ? 'Live' : captureState === 'stopped' ? 'Ready' : 'Local' }}
            </span>
          </div>

          <div
            v-if="!captureSupported"
            class="mt-3 rounded-md bg-amber-300/10 px-2 py-1.5 text-[11px] text-amber-100 ring-1 ring-amber-200/15"
          >
            This browser does not expose screen capture.
          </div>
          <div
            v-else-if="captureError"
            class="mt-3 rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100 ring-1 ring-red-300/15"
          >
            {{ captureError }}
          </div>

          <video
            v-if="captureUrl"
            :src="captureUrl"
            controls
            class="mt-3 aspect-video w-full rounded-lg bg-black ring-1 ring-white/[0.08]"
          />

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              v-if="captureState !== 'recording'"
              type="button"
              class="h-9 rounded-md bg-violet-400/15 text-xs font-semibold text-violet-100 ring-1 ring-violet-300/20 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!captureSupported || !recordingAllowed || captureState === 'requesting'"
              @click="startScreenCapture"
            >
              <UIcon name="i-lucide-screen-share" class="mr-1 inline size-3.5" />
              Start capture
            </button>
            <button
              v-else
              type="button"
              class="h-9 rounded-md bg-red-400/12 text-xs font-semibold text-red-100 ring-1 ring-red-300/20 transition hover:bg-red-400/18"
              @click="stopScreenCapture"
            >
              <UIcon name="i-lucide-square" class="mr-1 inline size-3.5" />
              Stop
            </button>
            <button
              type="button"
              class="h-9 rounded-md bg-white/[0.04] text-xs font-semibold text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!captureUrl"
              @click="downloadCapture"
            >
              <UIcon name="i-lucide-download" class="mr-1 inline size-3.5" />
              Download
            </button>
          </div>
          <p class="mt-2 text-[11px] leading-4 text-white/35">
            Captures stay local until attached to a recording. Create a draft below or attach the capture to an existing recording.
          </p>
        </div>

        <form class="space-y-2" @submit.prevent="createRecording">
          <div
            v-if="targetMeeting"
            class="rounded-lg bg-violet-400/10 px-3 py-2 text-xs text-violet-50/75 ring-1 ring-violet-300/15"
          >
            <div class="flex items-center gap-1.5 font-semibold text-violet-50/90">
              <UIcon name="i-lucide-calendar-check" class="size-3.5" />
              Recording for {{ targetMeeting.title }}
            </div>
            <p class="mt-1 text-[11px] leading-4 text-violet-50/55">
              This draft is prelinked to the selected meeting so ready recordings can appear in meeting artifacts.
            </p>
          </div>
          <input
            v-model="title"
            placeholder="Campaign walkthrough"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <select
            v-model="meetingSessionId"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option :value="null">
              Standalone recording
            </option>
            <option
              v-for="meeting in meetings"
              :key="meeting.id"
              :value="meeting.id"
            >
              {{ meeting.title }}
            </option>
          </select>
          <select
            v-model="access"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option value="workspace">
              Workspace
            </option>
            <option value="private">
              Private
            </option>
            <option value="public" :disabled="!publicLinksAllowed">
              Public link
            </option>
            <option value="password" :disabled="!publicLinksAllowed">
              Password link
            </option>
          </select>
          <input
            v-if="access === 'password'"
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="Recording password"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <input
            v-model.number="retentionDays"
            type="number"
            min="1"
            max="3650"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            placeholder="Retention days"
          >
          <textarea
            v-model="description"
            rows="2"
            placeholder="What this recording covers"
            class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          />
          <label
            v-if="capturedBlob && aiNotesAllowed"
            class="flex items-start gap-2 rounded-lg bg-emerald-400/[0.055] px-2.5 py-2 text-xs text-emerald-50/75 ring-1 ring-emerald-300/15"
          >
            <input
              v-model="autoTranscribeUploads"
              type="checkbox"
              class="mt-0.5 size-3.5 rounded border-white/[0.18] bg-black/20 accent-emerald-400"
            >
            <span class="min-w-0">
              <span class="block font-semibold text-emerald-50/90">Generate AI notes after upload</span>
              <span class="mt-0.5 block text-[11px] leading-4 text-emerald-50/55">Transcript, summary, and action items will be attached to the linked meeting.</span>
            </span>
          </label>
          <div class="rounded-lg bg-white/[0.025] p-2.5 ring-1 ring-white/[0.05]">
            <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              <UIcon name="i-lucide-clipboard-check" class="size-3.5 text-violet-300/80" />
              Draft readiness
            </div>
            <div class="grid gap-1.5 sm:grid-cols-2">
              <div
                v-for="item in recordingDraftReadiness"
                :key="item.key"
                class="min-w-0 rounded-md px-2 py-1.5 ring-1"
                :class="draftReadinessClass(item.state)"
              >
                <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                  <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                  <span class="truncate">{{ item.label }}</span>
                </div>
                <p class="mt-0.5 line-clamp-2 text-[10px] leading-4 opacity-70">
                  {{ item.detail }}
                </p>
              </div>
            </div>
          </div>
          <button
            type="submit"
            class="h-9 w-full rounded-md bg-violet-400/15 text-xs font-semibold text-violet-100 ring-1 ring-violet-300/20 transition hover:bg-violet-400/20 disabled:cursor-wait disabled:opacity-60"
            :disabled="saving || Boolean(uploadingRecordingId) || !canCreateRecording"
          >
            {{ capturedBlob ? 'Create draft and attach capture' : 'Create recording draft' }}
          </button>
          <p
            v-if="!retentionValid"
            class="rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100 ring-1 ring-red-300/15"
          >
            Retention must be between 1 and 3650 days.
          </p>
          <p
            v-if="access === 'password' && !passwordValid"
            class="rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100 ring-1 ring-red-300/15"
          >
            Password links need a password of at least 8 characters.
          </p>
        </form>
      </div>
    </div>
  </section>
</template>
