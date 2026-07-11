<script setup lang="ts">
import type { OfficeLobbyConfig, OfficeLobbyRequestSource } from '~~/app/types/office'
import { isInOfficeLobbyAvailabilityWindow } from '~~/app/utils/officeLobbyAvailability'
import { formatOfficeLobbyMessage } from '~~/app/utils/officePrejoin'

type LobbyZone = {
  id: string
  slug: string
  name: string
  zone_type: string
  capacity: number
}

type LobbyRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired'

type LobbyRequestStatusResponse = {
  request: {
    id: string
    status: LobbyRequestStatus
    created_at: string
    handled_at: string | null
    scheduled_start_at: string | null
    pending_expires_at: string
    accepted_expires_at: string | null
    zone_name: string | null
    zone_slug: string | null
  }
  handoff: {
    type: 'room'
    label: string
    path: string
  } | null
  meeting: {
    id: string
    title: string | null
    scheduledStartAt: string | null
    durationMinutes: number | null
  } | null
  guestContext: {
    note: string
    intakeAnswers: Array<{
      label: string
      value: string
    }>
  }
}

type LobbyAvailability = {
  mode: 'manual' | 'office_presence' | 'scheduled'
  isAvailable: boolean
  reason: string | null
  onlineStaffCount: number
  eventDurationMinutes: number
  minimumNoticeMinutes: number
  dailyCap: number | null
  availabilityWindows?: NonNullable<OfficeLobbyConfig['availability_windows']>
}

type LobbyIntakeField = NonNullable<OfficeLobbyConfig['intake_fields']>[number]

type StoredLobbyRequest = {
  requestId: string
  status: Extract<LobbyRequestStatus, 'pending' | 'accepted'>
  createdAt: string | null
  expiresAt: string | null
  scheduledStartAt: string | null
  roomName: string | null
  handoffPath: string | null
  meetingTitle: string | null
  meetingDurationMinutes: number | null
}

type WaitingRoomShelfItem = {
  label: string
  value: string
  icon: string
  url?: string | null
}

definePageMeta({
  layout: false,
  auth: false
})

const route = useRoute()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

const officeId = computed(() => String(route.params.officeId || ''))
const requestedRoom = computed(() => typeof route.query.room === 'string' ? route.query.room : '')
const requestedLobby = computed(() => typeof route.query.lobby === 'string' ? route.query.lobby : '')
const requestedMeetingId = computed(() => typeof route.query.meeting === 'string' ? route.query.meeting : '')
const requestedMeetingTitle = computed(() => typeof route.query.title === 'string' ? route.query.title : '')
const requestedMeetingStart = computed(() => typeof route.query.start === 'string' ? route.query.start : '')
const requestedMeetingDuration = computed(() => typeof route.query.duration === 'string' ? route.query.duration : '')
const requestedSource = computed<OfficeLobbyRequestSource | undefined>(() => route.query.source === 'embed' ? 'embed' : undefined)
const requestedMeetingDurationMinutes = computed(() => {
  const duration = Number(requestedMeetingDuration.value)
  return Number.isInteger(duration) && duration > 0 ? duration : null
})
const storageKey = computed(() => {
  const scope = [
    officeId.value,
    requestedLobby.value || 'default-lobby',
    requestedMeetingId.value || 'drop-in',
    requestedRoom.value || 'default-room'
  ].map(part => encodeURIComponent(part)).join(':')
  return `office-lobby-request:${scope}`
})

const data = ref<{
  office: { id: string, name: string }
  zones: LobbyZone[]
  lobby: {
    id: string
    handle: string
    name: string
    description: string
    destination_zone_id: string | null
    destination_zone_slug: string | null
    destination_zone_name: string | null
    config: OfficeLobbyConfig
  } | null
  availability: LobbyAvailability | null
  meeting: {
    id: string
    title: string
    zone_id: string | null
    zone_slug: string | null
    zone_name: string | null
    scheduled_start_at: string | null
    duration_minutes: number | null
    intake_prompt: string | null
  } | null
} | null>(null)
const pending = ref(false)
const error = ref<any>(null)

const lobbyUrl = computed(() => {
  const params = new URLSearchParams()
  if (requestedLobby.value) params.set('lobby', requestedLobby.value)
  if (requestedMeetingId.value) params.set('meeting', requestedMeetingId.value)
  const query = params.toString() ? `?${params.toString()}` : ''
  return `/api/public/office-lobby/${officeId.value}${query}`
})

async function refreshLobby() {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch(lobbyUrl.value)
  } catch (err) {
    data.value = null
    error.value = err
  } finally {
    pending.value = false
  }
}

await refreshLobby()
watch(lobbyUrl, () => {
  void refreshLobby()
})

const name = ref('')
const email = ref('')
const message = ref(requestedMeetingTitle.value ? `Joining ${requestedMeetingTitle.value}` : '')
const intakeAnswers = reactive<Record<string, string>>({})
const selectedRoomSlug = ref(requestedRoom.value)
const submitting = ref(false)
const cancelling = ref(false)
const submitted = ref(false)
const micReady = ref(true)
const cameraReady = ref(false)
const notesConsent = ref(false)
const recordingConsent = ref(false)
const scheduledStartAt = ref(toDatetimeLocal(requestedMeetingStart.value))
const scheduledStartSuggested = ref(false)
const requestId = ref<string | null>(null)
const requestStatus = ref<LobbyRequestStatus>('pending')
const statusRoomName = ref<string | null>(null)
const handoffPath = ref<string | null>(null)
const statusPolling = ref(false)
const requestCreatedAt = ref<string | null>(null)
const requestExpiresAt = ref<string | null>(null)
const requestScheduledStartAt = ref<string | null>(null)
const requestAcceptedExpiresAt = ref<string | null>(null)
const requestMeetingTitle = ref<string | null>(requestedMeetingTitle.value || null)
const requestMeetingDurationMinutes = ref<number | null>(requestedMeetingDurationMinutes.value)
const requestGuestNote = ref('')
const requestIntakeAnswers = ref<Array<{ label: string, value: string }>>([])
const autoOpeningRoom = ref(false)
const nowMs = ref(Date.now())
let statusTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
let handoffTimer: ReturnType<typeof setTimeout> | null = null

const PENDING_EXPIRY_MINUTES = 30
const PENDING_STATUS_POLL_MS = 2500
const ACCEPTED_STATUS_POLL_MS = 30_000
let statusPollIntervalMs = PENDING_STATUS_POLL_MS

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function dateToDatetimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function minutesUntil(timestamp: string) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return null
  return Math.ceil((time - nowMs.value) / 60_000)
}

watch(
  () => data.value?.zones,
  (zones) => {
    if (!zones?.length) return
    if (requestedRoom.value && zones.some(zone => zone.slug === requestedRoom.value)) {
      selectedRoomSlug.value = requestedRoom.value
      return
    }
    if (!selectedRoomSlug.value || !zones.some(zone => zone.slug === selectedRoomSlug.value)) {
      selectedRoomSlug.value = zones.find(zone => zone.zone_type === 'lobby')?.slug ?? zones[0]?.slug ?? ''
    }
  },
  { immediate: true }
)

const selectedRoom = computed(() =>
  data.value?.zones.find(zone => zone.slug === selectedRoomSlug.value) ?? null
)
const roomResolvedByMeetingInvite = computed(() =>
  Boolean(requestedMeetingId.value && !requestedRoom.value)
)
const lobbyIntakeFields = computed<LobbyIntakeField[]>(() =>
  [
    ...(data.value?.lobby?.config?.intake_fields?.filter(field => field.id && field.label) ?? []),
    ...(data.value?.meeting?.intake_prompt
      ? [{
          id: `meeting_context_${data.value.meeting.id}`,
          label: data.value.meeting.intake_prompt,
          type: 'textarea' as const,
          required: true
        }]
      : [])
  ]
)
const missingRequiredIntakeFields = computed(() =>
  lobbyIntakeFields.value.filter(field => field.required && !intakeAnswers[field.id]?.trim())
)

function isScheduledTimeInWindow(value: string) {
  return isInOfficeLobbyAvailabilityWindow(value, data.value?.availability?.availabilityWindows)
}

function suggestScheduledStart() {
  const availability = data.value?.availability
  if (availability?.mode !== 'scheduled') return ''

  const intervalMs = 15 * 60_000
  const minimumTime = Date.now() + availability.minimumNoticeMinutes * 60_000
  let candidateMs = Math.ceil(minimumTime / intervalMs) * intervalMs
  const searchUntilMs = candidateMs + 14 * 24 * 60 * 60_000

  while (candidateMs <= searchUntilMs) {
    const candidate = new Date(candidateMs)
    const localValue = dateToDatetimeLocal(candidate)
    if (isScheduledTimeInWindow(localValue)) return localValue
    candidateMs += intervalMs
  }

  return ''
}

const scheduledMinDateTime = computed(() => {
  const availability = data.value?.availability
  if (availability?.mode !== 'scheduled') return undefined

  const minimumMs = Date.now() + availability.minimumNoticeMinutes * 60_000
  const intervalMs = 15 * 60_000
  return dateToDatetimeLocal(new Date(Math.ceil(minimumMs / intervalMs) * intervalMs))
})

const scheduledTimeIssue = computed(() => {
  const availability = data.value?.availability
  if (availability?.mode !== 'scheduled' || !scheduledStartAt.value) return null

  const selectedTime = new Date(scheduledStartAt.value).getTime()
  if (!Number.isFinite(selectedTime)) return 'valid meeting time'

  const minimumNoticeMs = availability.minimumNoticeMinutes * 60_000
  if (selectedTime < Date.now() + minimumNoticeMs) return 'meeting time outside minimum notice'
  if (!isScheduledTimeInWindow(scheduledStartAt.value)) return 'meeting time inside an available window'
  return null
})

const submitBlockers = computed(() => {
  const blockers: string[] = []
  if (!name.value.trim()) blockers.push('name')
  if (!email.value.trim()) blockers.push('email')
  else if (!emailValid.value) blockers.push('valid email')
  if (!selectedRoomSlug.value && !roomResolvedByMeetingInvite.value) blockers.push('room')
  if (missingRequiredIntakeFields.value.length) {
    blockers.push(`${missingRequiredIntakeFields.value.length} required detail${missingRequiredIntakeFields.value.length === 1 ? '' : 's'}`)
  }
  if (data.value?.availability?.isAvailable === false) blockers.push('host availability')
  if (data.value?.availability?.mode === 'scheduled' && !scheduledStartAt.value) blockers.push('meeting time')
  if (scheduledTimeIssue.value) blockers.push(scheduledTimeIssue.value)
  return blockers
})
const submitBlockerCopy = computed(() =>
  submitBlockers.value.length
    ? `Complete ${submitBlockers.value.join(', ')} before requesting entry.`
    : ''
)
watch(
  lobbyIntakeFields,
  (fields) => {
    for (const field of fields) {
      if (!(field.id in intakeAnswers)) intakeAnswers[field.id] = ''
    }
  },
  { immediate: true }
)

watch(
  () => [
    data.value?.availability?.mode,
    data.value?.availability?.minimumNoticeMinutes,
    data.value?.availability?.availabilityWindows?.length
  ],
  () => {
    if (scheduledStartAt.value || requestedMeetingStart.value) return
    const suggested = suggestScheduledStart()
    if (suggested) {
      scheduledStartAt.value = suggested
      scheduledStartSuggested.value = true
    }
  },
  { immediate: false }
)
const requestedRoomUnavailable = computed(() =>
  Boolean(
    requestedRoom.value
    && data.value?.zones?.length
    && !data.value.zones.some(zone => zone.slug === requestedRoom.value)
  )
)

function roomIcon(zoneType: string) {
  if (zoneType === 'lobby') return 'i-lucide-sofa'
  if (zoneType === 'focus') return 'i-lucide-headphones'
  if (zoneType === 'theater') return 'i-lucide-presentation'
  if (zoneType === 'client_lounge') return 'i-lucide-handshake'
  return 'i-lucide-users'
}

const roomOptions = computed(() =>
  (data.value?.zones ?? []).map(zone => ({
    label: zone.name,
    value: zone.slug,
    icon: zone.zone_type === 'lobby'
      ? 'i-lucide-sofa'
      : zone.zone_type === 'focus'
        ? 'i-lucide-headphones'
        : 'i-lucide-users'
  }))
)

const emailValid = computed(() =>
  !email.value.trim()
  || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
)

const canSubmit = computed(() =>
  name.value.trim().length > 0
  && email.value.trim().length > 0
  && emailValid.value
  && (selectedRoomSlug.value.length > 0 || roomResolvedByMeetingInvite.value)
  && missingRequiredIntakeFields.value.length === 0
  && data.value?.availability?.isAvailable !== false
  && (data.value?.availability?.mode !== 'scheduled' || scheduledStartAt.value.length > 0)
  && !scheduledTimeIssue.value
)

const lobbyModeCopy = computed(() => {
  const availability = data.value?.availability
  if (!availability) return null
  if (availability.mode === 'office_presence') {
    return availability.isAvailable
      ? `${availability.onlineStaffCount} host${availability.onlineStaffCount === 1 ? '' : 's'} online now.`
      : availability.reason || 'No hosts are currently available.'
  }
  if (availability.mode === 'scheduled') {
    const notice = availability.minimumNoticeMinutes
    const windows = availability.availabilityWindows ?? []
    const windowCopy = windows.length
      ? ` Availability is limited to ${windows.length} configured window${windows.length === 1 ? '' : 's'}.`
      : ''
    return notice > 0
      ? `Choose a meeting time at least ${notice} min from now.${windowCopy}`
      : `Choose a meeting time for this lobby.${windowCopy}`
  }
  return 'The host will review your request.'
})

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatWindowDays(days: number[]) {
  const normalized = Array.from(new Set(days)).filter(day => day >= 0 && day <= 6).sort((a, b) => a - b)
  if (normalized.length === 7) return 'Every day'
  if (normalized.join(',') === '1,2,3,4,5') return 'Weekdays'
  if (normalized.join(',') === '0,6') return 'Weekends'
  return normalized.map(day => weekdayLabels[day]).join(', ')
}

const availabilityWindowSummaries = computed(() =>
  (data.value?.availability?.availabilityWindows ?? []).map(window => ({
    days: formatWindowDays(window.days),
    time: `${window.start}-${window.end}`,
    timezone: window.timezone || 'UTC'
  }))
)

const requestedMeetingCopy = computed(() => {
  const meeting = data.value?.meeting
  const title = meeting?.title ?? requestMeetingTitle.value
  const start = meeting?.scheduled_start_at ?? scheduledStartAt.value
  const duration = meeting?.duration_minutes ?? requestMeetingDurationMinutes.value
  if (!title && !start) return null
  const parts = [title]
  if (start) {
    const date = new Date(start)
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
  if (duration) parts.push(`${duration} min`)
  return parts.filter(Boolean).join(' · ')
})
const prejoinReadinessItems = computed(() => [
  {
    label: 'Microphone',
    value: micReady.value ? 'Ready' : 'Muted',
    icon: micReady.value ? 'i-lucide-mic' : 'i-lucide-mic-off',
    active: micReady.value
  },
  {
    label: 'Camera',
    value: cameraReady.value ? 'On' : 'Off',
    icon: cameraReady.value ? 'i-lucide-video' : 'i-lucide-video-off',
    active: cameraReady.value
  },
  {
    label: 'AI notes',
    value: notesConsent.value ? 'Approved' : 'Not approved',
    icon: 'i-lucide-notebook-pen',
    active: notesConsent.value
  },
  {
    label: 'Recording',
    value: recordingConsent.value ? 'Approved' : 'Not approved',
    icon: 'i-lucide-radio',
    active: recordingConsent.value
  }
])
const lobbyBrand = computed(() => data.value?.lobby?.config?.brand ?? {})
const brandAccentColor = computed(() => sanitizeBrandColor(lobbyBrand.value.background))
const brandTexture = computed(() => normalizeBrandTexture(lobbyBrand.value.texture))
const configuredShelfItems = computed<WaitingRoomShelfItem[]>(() =>
  (data.value?.lobby?.config?.shelf_items ?? [])
    .map(item => ({
      label: item.label?.trim() ?? '',
      value: item.value?.trim() ?? '',
      url: safePublicUrl(item.url),
      icon: safePublicUrl(item.url) ? 'i-lucide-link' : 'i-lucide-sparkles'
    }))
    .filter(item => item.label && item.value)
    .slice(0, 6)
)
const lobbyPageStyle = computed(() => {
  if (!brandAccentColor.value) return undefined
  return {
    background: `radial-gradient(circle at 24% 18%, ${brandAccentColor.value}33 0, transparent 34rem), #06070a`
  }
})
const lobbyHeroPanelStyle = computed(() => {
  if (!brandAccentColor.value) return undefined
  return {
    boxShadow: `inset 0 2px 30px rgba(0,0,0,0.6), 0 0 90px -55px ${brandAccentColor.value}`
  }
})
const lobbyTextureStyle = computed(() => {
  if (brandTexture.value === 'none') return undefined
  if (brandTexture.value === 'grid') {
    return {
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
      backgroundSize: '40px 40px'
    }
  }
  if (brandTexture.value === 'mesh') {
    return {
      backgroundImage: 'radial-gradient(circle at 24px 24px, rgba(255,255,255,0.28) 1px, transparent 1.5px), linear-gradient(135deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
      backgroundSize: '32px 32px, 64px 64px'
    }
  }
  return {
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
    backgroundSize: '28px 28px'
  }
})
const waitingRoomShelfItems = computed<WaitingRoomShelfItem[]>(() => {
  const items: WaitingRoomShelfItem[] = [
    {
      label: roomResolvedByMeetingInvite.value ? 'Meeting route' : 'Destination',
      value: roomResolvedByMeetingInvite.value
        ? data.value?.meeting?.zone_name || 'Assigned by host'
        : selectedRoom.value?.name || 'Select a room',
      icon: roomResolvedByMeetingInvite.value ? 'i-lucide-calendar-check' : roomIcon(selectedRoom.value?.zone_type ?? 'lobby')
    },
    {
      label: 'Host status',
      value: data.value?.availability?.isAvailable === false
        ? data.value.availability.reason || 'Unavailable'
        : lobbyModeCopy.value || 'Host review',
      icon: data.value?.availability?.isAvailable === false ? 'i-lucide-clock' : 'i-lucide-radio-tower'
    },
    {
      label: 'Prejoin',
      value: [
        micReady.value ? 'Mic ready' : 'Muted',
        cameraReady.value ? 'Camera on' : 'Camera off',
        notesConsent.value ? 'Notes approved' : null
      ].filter(Boolean).join(' · '),
      icon: 'i-lucide-sliders-horizontal'
    }
  ]

  if (data.value?.lobby?.config?.brand?.verified) {
    items.unshift({
      label: 'Verified lobby',
      value: data.value.lobby.name || data.value.office.name,
      icon: 'i-lucide-badge-check'
    })
  }

  if (brandTexture.value !== 'dots') {
    items.push({
      label: 'Brand texture',
      value: brandTexture.value === 'none' ? 'Clean background' : `${brandTexture.value[0].toUpperCase()}${brandTexture.value.slice(1)} surface`,
      icon: 'i-lucide-grid-3x3'
    })
  }

  return [
    ...configuredShelfItems.value,
    ...items
  ]
})
const lobbyHeroTitle = computed(() => {
  if (roomResolvedByMeetingInvite.value) return data.value?.meeting?.title || requestMeetingTitle.value || 'Meeting invite'
  return selectedRoom.value?.name || data.value?.office.name || 'Office lobby'
})
const lobbyLogoUrl = computed(() => safePublicUrl(lobbyBrand.value.logo_url))
const lobbyFormIntro = computed(() => {
  if (roomResolvedByMeetingInvite.value) {
    return 'Request access for this meeting. The room is assigned by the invite.'
  }
  return selectedRoom.value ? `Request access to ${selectedRoom.value.name}.` : 'Select where you need to go.'
})

const pendingExpiryLabel = computed(() => {
  if (requestScheduledStartAt.value) {
    const scheduledMinutes = minutesUntil(requestScheduledStartAt.value)
    if (scheduledMinutes === null) return 'Scheduled time pending'
    if (scheduledMinutes <= 0) return 'Host response window is open'
    if (scheduledMinutes === 1) return 'Scheduled in 1 min'
    if (scheduledMinutes < 60) return `Scheduled in ${scheduledMinutes} min`
    const hours = Math.floor(scheduledMinutes / 60)
    const minutes = scheduledMinutes % 60
    if (minutes === 0) return `Scheduled in ${hours} hr${hours === 1 ? '' : 's'}`
    return `Scheduled in ${hours} hr ${minutes} min`
  }
  if (!requestExpiresAt.value) return 'Expires in 30 min'
  const minutes = minutesUntil(requestExpiresAt.value)
  if (minutes === null) return 'Expiry pending'
  const remainingMinutes = Math.min(PENDING_EXPIRY_MINUTES, minutes)
  if (remainingMinutes <= 0) return 'Expiring now'
  if (remainingMinutes === 1) return 'Expires in 1 min'
  return `Expires in ${remainingMinutes} min`
})

const pendingExpiryPercent = computed(() => {
  if (requestScheduledStartAt.value) return 100
  if (!requestCreatedAt.value || !requestExpiresAt.value) return 100
  const startedAt = new Date(requestCreatedAt.value).getTime()
  const expiresAt = new Date(requestExpiresAt.value).getTime()
  const total = expiresAt - startedAt
  if (!Number.isFinite(startedAt) || !Number.isFinite(expiresAt) || total <= 0) return 0
  const remaining = expiresAt - nowMs.value
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
})

const statusCopy = computed(() => {
  if (requestStatus.value === 'accepted') {
    return {
      icon: 'i-lucide-door-open',
      title: 'You are approved to enter',
      body: `${data.value?.office.name || 'The team'} accepted your request${statusRoomName.value ? ` for ${statusRoomName.value}` : ''}.`,
      color: 'success' as const
    }
  }
  if (requestStatus.value === 'declined') {
    return {
      icon: 'i-lucide-circle-x',
      title: 'Request declined',
      body: 'The team is not available for this room right now.',
      color: 'error' as const
    }
  }
  if (requestStatus.value === 'expired') {
    return {
      icon: 'i-lucide-clock',
      title: 'Request expired',
      body: 'Send another request if you still need to reach the team.',
      color: 'neutral' as const
    }
  }
  return {
    icon: 'i-lucide-loader-circle',
    title: 'Request sent',
    body: `Keep this page open. Someone from ${data.value?.office.name || 'the team'} has been notified.`,
    color: 'primary' as const
  }
})

const acceptedExpiryLabel = computed(() => {
  if (!requestAcceptedExpiresAt.value) return 'Room access is waiting for a room assignment.'
  const remainingMinutes = minutesUntil(requestAcceptedExpiresAt.value)
  if (remainingMinutes === null) return 'Room access expiry is pending.'
  if (remainingMinutes <= 0) return 'Room access is expiring now.'
  if (remainingMinutes === 1) return 'Room access expires in 1 min.'
  if (remainingMinutes < 60) return `Room access expires in ${remainingMinutes} min.`
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (minutes === 0) return `Room access expires in ${hours} hr${hours === 1 ? '' : 's'}.`
  return `Room access expires in ${hours} hr ${minutes} min.`
})

function errorMessage(err: unknown) {
  if (err && typeof err === 'object') {
    const data = 'data' in err ? (err as { data?: { statusMessage?: string } }).data : undefined
    const statusMessage = 'statusMessage' in err ? (err as { statusMessage?: string }).statusMessage : undefined
    const message = 'message' in err ? (err as { message?: string }).message : undefined
    return data?.statusMessage || statusMessage || message
  }
  return undefined
}

function requestMessage() {
  const intake = lobbyIntakeFields.value
    .map((field) => {
      const answer = intakeAnswers[field.id]?.trim()
      return answer ? `${field.label}: ${answer}` : ''
    })
    .filter(Boolean)
    .join('\n')
  const body = [message.value.trim(), intake ? `Intake:\n${intake}` : ''].filter(Boolean).join('\n\n')

  return formatOfficeLobbyMessage(
    body,
    {
      micReady: micReady.value,
      cameraOn: cameraReady.value,
      notesApproved: notesConsent.value,
      recordingApproved: recordingConsent.value
    },
    1800
  )
}

function intakeOptions(field: LobbyIntakeField) {
  return (field.options ?? []).filter(Boolean).map(option => ({
    label: option,
    value: option
  }))
}

function sanitizeBrandColor(value?: string) {
  const color = value?.trim()
  if (!color) return null
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : null
}

function normalizeBrandTexture(value?: string) {
  const texture = value?.trim().toLowerCase()
  if (texture === 'grid' || texture === 'mesh' || texture === 'none') return texture
  return 'dots'
}

function clearStoredRequest() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(storageKey.value)
}

function saveStoredRequest() {
  if (typeof window === 'undefined' || !requestId.value) return
  if (requestStatus.value !== 'pending' && requestStatus.value !== 'accepted') return

  const payload: StoredLobbyRequest = {
    requestId: requestId.value,
    status: requestStatus.value,
    createdAt: requestCreatedAt.value,
    expiresAt: requestExpiresAt.value,
    scheduledStartAt: requestScheduledStartAt.value,
    roomName: statusRoomName.value,
    handoffPath: handoffPath.value,
    meetingTitle: requestMeetingTitle.value,
    meetingDurationMinutes: requestMeetingDurationMinutes.value
  }
  window.sessionStorage.setItem(storageKey.value, JSON.stringify(payload))
}

function restoreStoredRequest() {
  if (typeof window === 'undefined' || submitted.value) return

  const raw = window.sessionStorage.getItem(storageKey.value)
  if (!raw) return

  try {
    const stored = JSON.parse(raw) as Partial<StoredLobbyRequest>
    if (!stored.requestId || (stored.status !== 'pending' && stored.status !== 'accepted')) {
      clearStoredRequest()
      return
    }

    requestId.value = stored.requestId
    requestStatus.value = stored.status
    requestCreatedAt.value = stored.createdAt ?? null
    requestExpiresAt.value = stored.expiresAt ?? null
    requestScheduledStartAt.value = stored.scheduledStartAt ?? null
    requestAcceptedExpiresAt.value = null
    statusRoomName.value = stored.roomName ?? null
    handoffPath.value = stored.handoffPath ?? null
    requestMeetingTitle.value = stored.meetingTitle ?? requestMeetingTitle.value
    requestMeetingDurationMinutes.value = stored.meetingDurationMinutes ?? requestMeetingDurationMinutes.value
    submitted.value = true
    startStatusPolling()
  } catch {
    clearStoredRequest()
  }
}

async function requestEntry() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  try {
    const response = await apiFetch<{
      requestId: string
      existing?: boolean
      pendingExpiresAt: string
      room: { id: string, slug: string, name: string } | null
      meeting: {
        id: string
        title: string
        scheduledStartAt: string | null
        durationMinutes: number | null
      } | null
    }>(`/api/public/office-lobby/${officeId.value}/request`, {
      method: 'POST',
      body: {
        name: name.value,
        email: email.value,
        lobbyHandle: requestedLobby.value || undefined,
        roomSlug: requestedMeetingId.value && !requestedRoom.value
          ? undefined
          : selectedRoomSlug.value,
        scheduledStartAt: scheduledStartAt.value
          ? new Date(scheduledStartAt.value).toISOString()
          : undefined,
        meetingId: requestedMeetingId.value || undefined,
        meetingTitle: requestedMeetingTitle.value || undefined,
        meetingDurationMinutes: requestedMeetingDurationMinutes.value ?? undefined,
        source: requestedSource.value,
        message: requestMessage()
      }
    })
    requestId.value = response.requestId
    requestStatus.value = 'pending'
    requestCreatedAt.value = null
    requestExpiresAt.value = response.pendingExpiresAt
    requestScheduledStartAt.value = response.meeting?.scheduledStartAt
      ?? (scheduledStartAt.value ? new Date(scheduledStartAt.value).toISOString() : null)
    requestAcceptedExpiresAt.value = null
    requestMeetingTitle.value = response.meeting?.title ?? requestMeetingTitle.value
    requestMeetingDurationMinutes.value = response.meeting?.durationMinutes ?? requestMeetingDurationMinutes.value
    scheduledStartAt.value = toDatetimeLocal(requestScheduledStartAt.value)
    statusRoomName.value = response.room?.name ?? selectedRoom.value?.name ?? null
    submitted.value = true
    saveStoredRequest()
    startStatusPolling()
    toast.add({
      title: response.existing ? 'Request already pending' : 'Request sent',
      description: response.existing ? 'Keep this page open while the host responds.' : 'The team has been notified.',
      color: 'success',
      icon: 'i-lucide-bell'
    })
  } catch (err: unknown) {
    toast.add({
      title: 'Could not send request',
      description: errorMessage(err) || 'Try again in a moment.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    submitting.value = false
  }
}

async function pollStatus() {
  if (!requestId.value || statusPolling.value) return

  statusPolling.value = true
  try {
    const response = await apiFetch<LobbyRequestStatusResponse>(
      `/api/public/office-lobby/${officeId.value}/request/${requestId.value}`
    )
    const nextStatus = response.request.status
    requestStatus.value = nextStatus
    requestCreatedAt.value = response.request.created_at
    requestExpiresAt.value = response.request.pending_expires_at
    requestScheduledStartAt.value = response.request.scheduled_start_at
    requestAcceptedExpiresAt.value = response.request.accepted_expires_at
    requestMeetingTitle.value = response.meeting?.title ?? requestMeetingTitle.value
    requestMeetingDurationMinutes.value = response.meeting?.durationMinutes ?? requestMeetingDurationMinutes.value
    requestGuestNote.value = response.guestContext?.note ?? requestGuestNote.value
    requestIntakeAnswers.value = response.guestContext?.intakeAnswers ?? requestIntakeAnswers.value
    if (response.meeting?.scheduledStartAt) {
      requestScheduledStartAt.value = response.meeting.scheduledStartAt
      scheduledStartAt.value = toDatetimeLocal(response.meeting.scheduledStartAt)
    }
    statusRoomName.value = response.handoff?.label ?? response.request.zone_name ?? statusRoomName.value
    handoffPath.value = response.handoff?.path ?? null
    if (nextStatus === 'pending' || nextStatus === 'accepted') {
      saveStoredRequest()
    } else {
      clearStoredRequest()
    }

    if (nextStatus === 'accepted' && statusPollIntervalMs !== ACCEPTED_STATUS_POLL_MS) {
      startStatusPolling(ACCEPTED_STATUS_POLL_MS, false)
    }

    if (nextStatus === 'declined' || nextStatus === 'expired') {
      stopStatusPolling()
    }
  } catch {
    // Keep polling; transient dev reloads and short network blips should not
    // strand the guest in a false error state.
  } finally {
    statusPolling.value = false
  }
}

function startStatusPolling(intervalMs = PENDING_STATUS_POLL_MS, immediate = true) {
  stopStatusPolling()
  statusPollIntervalMs = intervalMs
  if (immediate) void pollStatus()
  statusTimer = setInterval(() => {
    void pollStatus()
  }, intervalMs)
}

function stopStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

function stopHandoffTimer() {
  if (handoffTimer) {
    clearTimeout(handoffTimer)
    handoffTimer = null
  }
  autoOpeningRoom.value = false
}

function scheduleRoomHandoff() {
  stopHandoffTimer()
  if (requestStatus.value !== 'accepted' || !handoffPath.value) return
  autoOpeningRoom.value = true
  handoffTimer = setTimeout(() => {
    const path = handoffPath.value
    handoffTimer = null
    if (!path || requestStatus.value !== 'accepted') {
      autoOpeningRoom.value = false
      return
    }
    void navigateTo(path)
  }, 1800)
}

function resetRequest() {
  stopStatusPolling()
  submitted.value = false
  requestId.value = null
  requestStatus.value = 'pending'
  statusPollIntervalMs = PENDING_STATUS_POLL_MS
  requestCreatedAt.value = null
  requestExpiresAt.value = null
  requestScheduledStartAt.value = null
  requestAcceptedExpiresAt.value = null
  requestMeetingTitle.value = requestedMeetingTitle.value || null
  requestMeetingDurationMinutes.value = requestedMeetingDurationMinutes.value
  handoffPath.value = null
  stopHandoffTimer()
  clearStoredRequest()
}

async function cancelRequest() {
  if (!requestId.value || cancelling.value) return

  cancelling.value = true
  stopHandoffTimer()
  try {
    await apiFetch(
      `/api/public/office-lobby/${officeId.value}/request/${requestId.value}/cancel`,
      { method: 'POST' }
    )
    toast.add({
      title: 'Request cancelled',
      description: 'You can update your details and send a new request.',
      color: 'neutral',
      icon: 'i-lucide-x'
    })
    resetRequest()
  } catch (err: unknown) {
    toast.add({
      title: 'Could not cancel request',
      description: errorMessage(err) || 'The host may have already handled it.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    void pollStatus()
  } finally {
    cancelling.value = false
  }
}

onMounted(() => {
  if (!scheduledStartAt.value && !requestedMeetingStart.value) {
    const suggested = suggestScheduledStart()
    if (suggested) {
      scheduledStartAt.value = suggested
      scheduledStartSuggested.value = true
    }
  }
  restoreStoredRequest()
  clockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  stopStatusPolling()
  stopHandoffTimer()
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

watch(
  [requestStatus, handoffPath],
  () => scheduleRoomHandoff()
)
</script>

<template>
  <main class="min-h-screen bg-[#06070a] text-white" :style="lobbyPageStyle">
    <div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10">
            <img
              v-if="lobbyLogoUrl"
              :src="lobbyLogoUrl"
              :alt="`${data?.lobby?.name || data?.office.name || 'Office'} logo`"
              class="size-full object-cover"
            >
            <UIcon v-else name="i-lucide-building-2" class="size-4 text-emerald-400" />
          </div>
          <div>
            <div class="text-sm font-semibold">
              {{ data?.office.name || 'Office' }}
            </div>
            <div class="flex items-center gap-1.5 text-xs text-white/40">
              <span>Guest lobby</span>
              <UIcon
                v-if="lobbyBrand.verified"
                name="i-lucide-badge-check"
                class="size-3.5 text-emerald-300"
              />
            </div>
          </div>
        </div>
        <UBadge color="neutral" variant="subtle">
          Prejoin
        </UBadge>
      </header>

      <section class="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1fr_420px]">
        <div
          class="min-h-[520px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0e] shadow-[inset_0_2px_30px_rgba(0,0,0,0.6)]"
          :style="lobbyHeroPanelStyle"
        >
          <div class="relative h-full min-h-[520px]">
            <div
              class="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_at_top,_rgba(120,90,255,0.2)_0%,_rgba(80,120,255,0.08)_35%,_transparent_72%)]"
            />
            <div
              class="absolute inset-0 opacity-[0.08]"
              :style="lobbyTextureStyle"
            />
            <div class="relative flex h-full min-h-[520px] flex-col justify-between p-6">
              <div>
                <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20">
                  <span class="size-1.5 rounded-full bg-emerald-400" />
                  Waiting room
                </div>
                <h1 class="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
                  {{ lobbyHeroTitle }}
                </h1>
                <p class="mt-4 max-w-xl text-sm leading-6 text-white/55">
                  Enter your details and the team will bring you into the right room.
                </p>
              </div>

              <div class="space-y-4">
                <div class="grid gap-2 sm:grid-cols-3">
                  <a
                    v-for="item in waitingRoomShelfItems"
                    :key="`${item.label}:${item.value}`"
                    :href="item.url"
                    :target="item.url ? '_blank' : undefined"
                    :rel="item.url ? 'noopener' : undefined"
                    class="block rounded-xl border border-white/[0.07] bg-black/15 p-3 no-underline"
                    :class="item.url ? 'transition hover:border-white/15 hover:bg-white/[0.04]' : ''"
                  >
                    <div class="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
                      <UIcon :name="item.icon" class="size-3.5 text-emerald-200/70" />
                      {{ item.label }}
                    </div>
                    <div class="line-clamp-2 text-xs leading-5 text-white/70">
                      {{ item.value }}
                    </div>
                  </a>
                </div>

                <div
                  v-if="roomResolvedByMeetingInvite"
                  class="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4"
                >
                  <div class="flex items-start gap-3">
                    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/20">
                      <UIcon name="i-lucide-calendar-check" class="size-4 text-emerald-300" />
                    </span>
                    <div>
                      <div class="text-sm font-medium text-white">
                        Meeting invite
                      </div>
                      <p class="mt-1 text-xs leading-5 text-white/50">
                        The host assigned the room to this meeting. Submit your request and we will route it to the right place.
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="grid gap-3 sm:grid-cols-3"
                >
                  <button
                    v-for="zone in (data?.zones || []).slice(0, 6)"
                    :key="zone.id"
                    type="button"
                    class="rounded-xl border border-white/[0.07] bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.06]"
                    :class="selectedRoomSlug === zone.slug ? 'ring-2 ring-emerald-300/70 bg-emerald-400/[0.05]' : ''"
                    @click="selectedRoomSlug = zone.slug"
                  >
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <UIcon
                        :name="roomIcon(zone.zone_type)"
                        class="size-4 text-white/50"
                      />
                      <span class="text-xs text-white/35">{{ zone.capacity }}</span>
                    </div>
                    <div class="truncate text-sm font-medium text-white/85">
                      {{ zone.name }}
                    </div>
                    <div class="mt-1 text-xs capitalize text-white/35">
                      {{ zone.zone_type.replace('_', ' ') }}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/[0.08] bg-[#11141a] p-5 shadow-2xl">
          <template v-if="pending">
            <div class="space-y-3">
              <USkeleton class="h-6 w-44" />
              <USkeleton class="h-10 w-full" />
              <USkeleton class="h-10 w-full" />
              <USkeleton class="h-24 w-full" />
            </div>
          </template>

          <UAlert
            v-else-if="error"
            color="error"
            icon="i-lucide-circle-alert"
            title="Lobby unavailable"
            description="This office link could not be loaded."
          />

          <template v-else-if="submitted">
            <div
              class="flex size-12 items-center justify-center rounded-full ring-1"
              :class="requestStatus === 'accepted'
                ? 'bg-emerald-400/10 ring-emerald-400/20'
                : requestStatus === 'declined'
                  ? 'bg-red-400/10 ring-red-400/20'
                  : 'bg-white/[0.05] ring-white/10'"
            >
              <UIcon
                :name="statusCopy.icon"
                class="size-5"
                :class="[
                  requestStatus === 'accepted' ? 'text-emerald-300' : requestStatus === 'declined' ? 'text-red-300' : 'text-white/65',
                  requestStatus === 'pending' ? 'animate-spin' : ''
                ]"
              />
            </div>
            <h2 class="mt-5 text-xl font-semibold">
              {{ statusCopy.title }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-white/50">
              {{ statusCopy.body }}
            </p>

            <div
              v-if="requestStatus === 'pending'"
              class="mt-5 rounded-lg border border-white/[0.07] bg-white/[0.035] p-3"
            >
              <div class="flex items-center justify-between text-xs text-white/45">
                <span>Waiting for host</span>
                <span>{{ statusPolling ? 'Checking...' : 'Live' }}</span>
              </div>
              <div
                v-if="requestMeetingTitle"
                class="mt-2 flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-xs text-white/65 ring-1 ring-white/[0.06]"
              >
                <UIcon name="i-lucide-calendar-check" class="size-3.5 text-emerald-200/80" />
                <span class="min-w-0 truncate">{{ requestMeetingTitle }}</span>
              </div>
              <div class="mt-2 flex items-center gap-2 text-xs text-white/45">
                <UIcon
                  :name="requestScheduledStartAt ? 'i-lucide-calendar-clock' : 'i-lucide-clock'"
                  class="size-3.5 text-white/30"
                />
                <span>{{ pendingExpiryLabel }}</span>
              </div>
              <div
                v-if="!requestScheduledStartAt"
                class="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]"
              >
                <div
                  class="h-full rounded-full bg-emerald-300/70 transition-[width] duration-500"
                  :style="{ width: pendingExpiryPercent + '%' }"
                />
              </div>
            </div>

            <div
              v-if="requestGuestNote || requestIntakeAnswers.length"
              class="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.035] p-3"
            >
              <div class="mb-2 flex items-center gap-2">
                <UIcon name="i-lucide-clipboard-list" class="size-4 text-white/45" />
                <span class="text-sm font-medium text-white/80">Shared context</span>
              </div>
              <p
                v-if="requestGuestNote"
                class="whitespace-pre-line text-xs leading-5 text-white/50"
              >
                {{ requestGuestNote }}
              </p>
              <div
                v-if="requestIntakeAnswers.length"
                class="mt-3 space-y-2"
              >
                <div
                  v-for="answer in requestIntakeAnswers"
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

            <div
              v-if="requestStatus === 'accepted'"
              class="mt-5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3"
            >
              <div class="flex items-start gap-3">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/20">
                  <UIcon name="i-lucide-video" class="size-4 text-emerald-300" />
                </span>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-white">
                    Room handoff ready
                  </div>
                  <p class="mt-1 text-xs leading-5 text-white/45">
                    The team can now bring you into {{ statusRoomName || 'the room' }}. {{ acceptedExpiryLabel }}
                  </p>
                  <a
                    v-if="handoffPath"
                    :href="handoffPath"
                    class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/[0.08] transition hover:bg-white/[0.12]"
                  >
                    <UIcon
                      :name="autoOpeningRoom ? 'i-lucide-loader-2' : 'i-lucide-arrow-up-right'"
                      class="size-3.5"
                      :class="autoOpeningRoom ? 'animate-spin' : ''"
                    />
                    {{ autoOpeningRoom ? 'Opening room...' : 'Open room link' }}
                  </a>
                  <p
                    v-else
                    class="mt-3 text-xs leading-5 text-amber-200/70"
                  >
                    This approval is missing a room handoff. Send another request so the host can approve a specific room.
                  </p>
                </div>
              </div>
            </div>

            <UButton
              class="mt-5"
              color="neutral"
              variant="soft"
              :icon="requestStatus === 'pending' ? 'i-lucide-x' : undefined"
              :label="requestStatus === 'pending' ? 'Cancel request' : 'Send another request'"
              :loading="cancelling"
              @click="requestStatus === 'pending' ? cancelRequest() : resetRequest()"
            />
          </template>

          <form
            v-else
            class="space-y-4"
            @submit.prevent="requestEntry"
          >
            <div>
              <h2 class="text-lg font-semibold">
                Join the lobby
              </h2>
              <p class="mt-1 text-sm text-white/45">
                {{ lobbyFormIntro }}
              </p>
            </div>

            <UAlert
              v-if="requestedRoomUnavailable"
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
              title="Requested room unavailable"
              description="This invite points to a room that is no longer available, so we selected the main lobby."
            />

            <UAlert
              v-if="lobbyModeCopy"
              :color="data?.availability?.isAvailable === false ? 'warning' : 'neutral'"
              variant="subtle"
              icon="i-lucide-calendar-clock"
              title="Lobby availability"
              :description="lobbyModeCopy"
            />

            <div
              v-if="availabilityWindowSummaries.length"
              class="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-white/85">
                    Available windows
                  </div>
                  <div class="text-xs text-white/40">
                    Pick a time that matches one of these windows.
                  </div>
                </div>
                <UIcon name="i-lucide-calendar-range" class="size-4 text-white/35" />
              </div>
              <div class="space-y-1.5">
                <div
                  v-for="window in availabilityWindowSummaries"
                  :key="`${window.days}:${window.time}:${window.timezone}`"
                  class="flex items-center justify-between gap-3 rounded-lg bg-black/10 px-2 py-1.5 text-xs ring-1 ring-white/[0.04]"
                >
                  <span class="min-w-0 truncate text-white/70">{{ window.days }}</span>
                  <span class="shrink-0 text-white/45">{{ window.time }} {{ window.timezone }}</span>
                </div>
              </div>
            </div>

            <UAlert
              v-if="requestedMeetingCopy"
              color="primary"
              variant="subtle"
              icon="i-lucide-calendar-check"
              title="Meeting invite"
              :description="requestedMeetingCopy"
            />

            <div
              v-if="requestedMeetingCopy"
              class="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-white/85">
                    Guest readiness
                  </div>
                  <div class="text-xs text-white/40">
                    Shared with the host before approval.
                  </div>
                </div>
                <UIcon name="i-lucide-shield-check" class="size-4 text-emerald-300/70" />
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <div
                  v-for="item in prejoinReadinessItems"
                  :key="item.label"
                  class="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 ring-1"
                  :class="item.active
                    ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                    : 'bg-white/[0.035] text-white/50 ring-white/[0.05]'"
                >
                  <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate text-[11px] font-medium">{{ item.label }}</span>
                  <span class="shrink-0 text-[10px]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <UAlert
              v-if="roomResolvedByMeetingInvite"
              color="neutral"
              variant="subtle"
              icon="i-lucide-map-pin-check"
              title="Room assigned by invite"
              description="The meeting invite will route this request to the approved room."
            />

            <UFormField v-else label="Room" class="w-full">
              <USelect
                v-model="selectedRoomSlug"
                :items="roomOptions"
                value-key="value"
                class="w-full"
                :ui="{ base: 'w-full', content: 'w-full' }"
              />
            </UFormField>

            <UFormField
              v-if="data?.availability?.mode === 'scheduled' || scheduledStartAt"
              label="Meeting time"
              class="w-full"
            >
              <UInput
                v-model="scheduledStartAt"
                type="datetime-local"
                :min="scheduledMinDateTime"
                step="900"
                class="w-full"
                :ui="{ base: 'w-full' }"
                @update:model-value="scheduledStartSuggested = false"
              />
            </UFormField>

            <p
              v-if="scheduledStartSuggested && scheduledStartAt && !scheduledTimeIssue"
              class="flex items-center gap-1.5 text-xs leading-5 text-emerald-100/70"
            >
              <UIcon name="i-lucide-calendar-check" class="size-3.5 text-emerald-300/80" />
              Suggested the next available time from this lobby's schedule.
            </p>

            <UAlert
              v-if="scheduledTimeIssue"
              color="warning"
              variant="subtle"
              icon="i-lucide-calendar-x"
              title="Choose another meeting time"
              :description="`Select a ${scheduledTimeIssue}.`"
            />

            <UFormField label="Name" class="w-full">
              <UInput
                v-model="name"
                autocomplete="name"
                placeholder="Jane Smith"
                required
                class="w-full"
                :ui="{ base: 'w-full' }"
              />
            </UFormField>

            <UFormField label="Email" class="w-full">
              <UInput
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="jane@example.com"
                required
                :aria-invalid="email.trim() && !emailValid ? 'true' : undefined"
                class="w-full"
                :ui="{ base: 'w-full' }"
              />
            </UFormField>

            <UFormField label="Message" class="w-full">
              <UTextarea
                v-model="message"
                :rows="4"
                placeholder="Optional context for the host"
                class="w-full"
                :ui="{ base: 'w-full' }"
              />
            </UFormField>

            <div
              v-if="lobbyIntakeFields.length"
              class="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-white/85">
                    Request details
                  </div>
                  <div class="text-xs text-white/40">
                    Shared with the host before they let you in.
                  </div>
                </div>
                <UIcon name="i-lucide-clipboard-list" class="size-4 text-white/35" />
              </div>

              <UFormField
                v-for="field in lobbyIntakeFields"
                :key="field.id"
                :label="field.label"
                :required="field.required"
                class="w-full"
              >
                <UTextarea
                  v-if="field.type === 'textarea'"
                  v-model="intakeAnswers[field.id]"
                  :rows="3"
                  :required="field.required"
                  :aria-invalid="field.required && !intakeAnswers[field.id]?.trim() ? 'true' : undefined"
                  class="w-full"
                  :ui="{ base: 'w-full' }"
                />
                <USelect
                  v-else-if="field.type === 'select'"
                  v-model="intakeAnswers[field.id]"
                  :items="intakeOptions(field)"
                  value-key="value"
                  :required="field.required"
                  :aria-invalid="field.required && !intakeAnswers[field.id]?.trim() ? 'true' : undefined"
                  class="w-full"
                  :ui="{ base: 'w-full', content: 'w-full' }"
                />
                <UInput
                  v-else
                  v-model="intakeAnswers[field.id]"
                  :type="field.type === 'email' ? 'email' : 'text'"
                  :required="field.required"
                  :aria-invalid="field.required && !intakeAnswers[field.id]?.trim() ? 'true' : undefined"
                  class="w-full"
                  :ui="{ base: 'w-full' }"
                />
              </UFormField>
            </div>

            <div class="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-white/85">
                    Prejoin setup
                  </div>
                  <div class="text-xs text-white/40">
                    This is shared with the host.
                  </div>
                </div>
                <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-white/35" />
              </div>

              <div class="grid gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  class="flex h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition"
                  :class="micReady ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-400/20' : 'bg-white/[0.05] text-white/60 ring-white/[0.07]'"
                  @click="micReady = !micReady"
                >
                  <UIcon :name="micReady ? 'i-lucide-mic' : 'i-lucide-mic-off'" class="size-4" />
                  {{ micReady ? 'Mic ready' : 'Muted' }}
                </button>
                <button
                  type="button"
                  class="flex h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition"
                  :class="cameraReady ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-400/20' : 'bg-white/[0.05] text-white/60 ring-white/[0.07]'"
                  @click="cameraReady = !cameraReady"
                >
                  <UIcon :name="cameraReady ? 'i-lucide-video' : 'i-lucide-video-off'" class="size-4" />
                  {{ cameraReady ? 'Camera on' : 'Camera off' }}
                </button>
                <button
                  type="button"
                  class="flex h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition"
                  :class="notesConsent ? 'bg-sky-400/10 text-sky-100 ring-sky-400/20' : 'bg-white/[0.05] text-white/60 ring-white/[0.07]'"
                  @click="notesConsent = !notesConsent"
                >
                  <UIcon name="i-lucide-notebook-pen" class="size-4" />
                  {{ notesConsent ? 'Notes ok' : 'No notes' }}
                </button>
                <button
                  type="button"
                  class="flex h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition"
                  :class="recordingConsent ? 'bg-sky-400/10 text-sky-100 ring-sky-400/20' : 'bg-white/[0.05] text-white/60 ring-white/[0.07]'"
                  @click="recordingConsent = !recordingConsent"
                >
                  <UIcon name="i-lucide-radio" class="size-4" />
                  {{ recordingConsent ? 'Recording ok' : 'No recording' }}
                </button>
              </div>
            </div>

            <UButton
              type="submit"
              block
              color="primary"
              icon="i-lucide-bell"
              label="Request entry"
              :loading="submitting"
              :disabled="!canSubmit"
            />
            <p
              v-if="submitBlockerCopy"
              class="text-center text-[11px] leading-4 text-white/35"
            >
              {{ submitBlockerCopy }}
            </p>
          </form>
        </div>
      </section>
    </div>
  </main>
</template>
