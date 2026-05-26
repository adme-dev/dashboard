<script setup lang="ts">
import type { OfficeLobbyRow, OfficeMeetingActionItemRow, OfficeMeetingActionItemStatus, OfficeMeetingArtifactRow, OfficeMeetingArtifactType, OfficeMeetingSessionRow, OfficeSettingsRow, OfficeZoneRow } from '~~/app/types/office'
import { parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'

type MeetingWithZone = OfficeMeetingSessionRow & {
  zone_name: string | null
  zone_slug: string | null
  consent: OfficeMeetingSessionRow['consent'] & {
    setup?: {
      meeting_type?: string
      context?: string
      intake_prompt?: string | null
      scheduled_start_at?: string | null
      duration_minutes?: number | null
    }
    invite_delivery?: {
      status?: string
      sent_at?: string
      recipients?: string[]
      guest_count?: number
      invite_url?: string
      intake_prompt?: string | null
      sent_by?: string
    }
  }
  artifact_count?: number
  artifact_types?: OfficeMeetingArtifactType[]
  has_notes?: boolean
  has_summary?: boolean
  has_action_items?: boolean
  has_guest_intake?: boolean
  recording_count?: number
  ready_recording_count?: number
  draft_recording_count?: number
  latest_recording_status?: string | null
}
type MeetingType = 'general' | 'client_review' | 'sales_call' | 'support' | 'standup' | 'interview' | 'all_hands'
type LobbyWithDestination = OfficeLobbyRow & { destination_zone_name: string | null }
type OfficeMemberOption = {
  id: string
  user_id: string | null
  name: string | null
  avatar_url: string | null
}
type DepartmentOption = {
  id: string
  name: string
}
type MeetingLobbyRequest = {
  id: string
  guest_name: string
  guest_email: string
  message: string
  status: string
  created_at: string
  accepted_expires_at?: string | null
}
type LobbyRequestPatchResponse = {
  request: MeetingLobbyRequest & {
    zone_id?: string | null
    zone_name?: string | null
    zone_slug?: string | null
  }
  meetingSessionId?: string | null
}
type MeetingReadinessItem = {
  key: string
  label: string
  detail: string
  icon: string
  state: 'done' | 'pending' | 'attention'
}
type HostNextStepAction = 'assign_room' | 'send_invites' | 'review_lobby' | 'start_meeting' | 'enter_room' | 'capture_notes' | 'open_recordings' | 'review_artifacts' | 'closeout'
type HostNextStepItem = {
  key: string
  label: string
  detail: string
  icon: string
  tone: 'primary' | 'success' | 'warning' | 'neutral'
  action: HostNextStepAction
}

const props = defineProps<{
  officeId: string
  zones: OfficeZoneRow[]
  defaultOpen?: boolean
  refreshKey?: number
  targetMeetingId?: string | null
  targetArtifactId?: string | null
  targetActionItemId?: string | null
  targetFocusKey?: number
  initialZoneId?: string | null
  myRole?: string
}>()

const emit = defineEmits<{
  openOfficeAssistant: [jobId?: string]
  openOfficeRecordings: [meetingId?: string]
  enterOfficeZone: [zoneId: string]
}>()

const toast = useToast()
const open = ref(props.defaultOpen ?? false)
const saving = ref(false)
const title = ref('')
const titleTouched = ref(false)
const meetingType = ref<MeetingType>('general')
const context = ref('')
const intakePrompt = ref('')
const intakePromptTouched = ref(false)
const guestEmails = ref('')
const guestEmailsTouched = ref(false)
const scheduledStartAt = ref('')
const durationMinutes = ref(30)
const durationTouched = ref(false)
const zoneId = ref<string | null>(null)
const aiNotes = ref(true)
const recording = ref(false)
const retentionDays = ref(90)
const retentionTouched = ref(false)
const selectedMeetingId = ref<string | null>(null)
const editingMeetingDetails = ref(false)
const savingMeetingDetails = ref(false)
const editMeetingTitle = ref('')
const editMeetingTitleTouched = ref(false)
const editMeetingZoneId = ref<string | null>(null)
const editMeetingType = ref<MeetingType>('general')
const editMeetingContext = ref('')
const editMeetingIntakePrompt = ref('')
const editMeetingGuestEmails = ref('')
const editMeetingGuestEmailsTouched = ref(false)
const editMeetingScheduledStartAt = ref('')
const editMeetingDurationMinutes = ref(30)
const editMeetingDurationTouched = ref(false)
const editMeetingRetentionDays = ref<number | null>(90)
const editMeetingRetentionTouched = ref(false)
const editingArtifactId = ref<string | null>(null)
const editingArtifactTitle = ref('')
const editingArtifactContent = ref('')
const savingArtifactId = ref<string | null>(null)
const noteArtifactType = ref<OfficeMeetingArtifactType>('notes')
const noteArtifactTitle = ref('')
const noteArtifactContent = ref('')
const savingNoteArtifact = ref(false)
const updatingMeetingStatus = ref<string | null>(null)
const creatingFollowUpForArtifactId = ref<string | null>(null)
const updatingActionItemId = ref<string | null>(null)
const creatingTaskForActionItemId = ref<string | null>(null)
const creatingAssistantForActionItemId = ref<string | null>(null)
const actionItemTaskDepartmentId = ref('')
const sendingInvitesForMeetingId = ref<string | null>(null)
const handlingLobbyRequestId = ref<string | null>(null)
const refreshingMeetingState = ref(false)
const openingMeetingThreadId = ref<string | null>(null)
const focusedArtifactId = ref<string | null>(null)
const focusedActionItemId = ref<string | null>(null)
const lastCreatedMeetingId = ref<string | null>(null)
const lastFocusedArtifactId = ref<string | null>(null)
const lastFocusedActionItemId = ref<string | null>(null)
const lastHandledFocusKey = ref<number | undefined>(undefined)
const focusedArtifactScrolled = ref(false)
const editMeetingRoomSelect = ref<HTMLSelectElement | null>(null)
const accessClockMs = ref(Date.now())
let focusedArtifactTimer: ReturnType<typeof setTimeout> | null = null
let accessClockTimer: ReturnType<typeof setInterval> | null = null
let lobbyStateTimer: ReturnType<typeof setInterval> | null = null

type FollowUpDelivery = {
  status?: string
  sent_at?: string
  recipients?: string[]
  job_id?: string
  edited_at?: string
}

type FollowUpJob = {
  status?: string
  job_id?: string
  edited_at?: string
  error?: string
}

const { data, refresh, pending, error } = useFetch<{ meetings: MeetingWithZone[] }>(
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

const { data: lobbiesData } = useFetch<{ lobbies: LobbyWithDestination[] }>(
  () => `/api/office/${props.officeId}/lobbies`,
  {
    watch: [() => props.officeId],
    default: () => ({ lobbies: [] })
  }
)

const { data: officeData } = useFetch<{ members: OfficeMemberOption[] }>(
  () => `/api/office/${props.officeId}`,
  {
    watch: [() => props.officeId],
    default: () => ({ members: [] })
  }
)

const { data: departmentsData } = useFetch<DepartmentOption[]>(
  '/api/agency/departments',
  {
    default: () => []
  }
)

const {
  data: pendingLobbyData,
  refresh: refreshPendingLobbyRequests
} = useFetch<{ requests: MeetingLobbyRequest[] }>(
  () => `/api/office/${props.officeId}/lobby-requests`,
  {
    query: { status: 'pending' },
    watch: [() => props.officeId],
    default: () => ({ requests: [] })
  }
)

const {
  data: acceptedLobbyData,
  refresh: refreshAcceptedLobbyRequests
} = useFetch<{ requests: MeetingLobbyRequest[] }>(
  () => `/api/office/${props.officeId}/lobby-requests`,
  {
    query: { status: 'accepted' },
    watch: [() => props.officeId],
    default: () => ({ requests: [] })
  }
)

const meetings = computed(() => data.value?.meetings ?? [])
const activeLobbies = computed(() => (lobbiesData.value?.lobbies ?? []).filter(lobby => lobby.is_active))
const officeMembers = computed(() => (officeData.value?.members ?? []).filter(member => member.user_id))
const officeMembersByUserId = computed(() => {
  const map = new Map<string, OfficeMemberOption>()
  for (const member of officeMembers.value) {
    if (member.user_id) map.set(member.user_id, member)
  }
  return map
})
const departments = computed(() => departmentsData.value ?? [])
const pendingLobbyRequests = computed(() => pendingLobbyData.value?.requests ?? [])
const acceptedLobbyRequests = computed(() => acceptedLobbyData.value?.requests ?? [])
const pendingLobbyRequestsByMeetingId = computed(() => {
  const groups = new Map<string, MeetingLobbyRequest[]>()
  for (const request of pendingLobbyRequests.value) {
    const meetingId = parseOfficeLobbyMessage(request.message).meetingId
    if (!meetingId) continue
    groups.set(meetingId, [...(groups.get(meetingId) ?? []), request])
  }
  return groups
})
const acceptedLobbyRequestsByMeetingId = computed(() => {
  const groups = new Map<string, MeetingLobbyRequest[]>()
  for (const request of acceptedLobbyRequests.value) {
    const meetingId = parseOfficeLobbyMessage(request.message).meetingId
    if (!meetingId) continue
    groups.set(meetingId, [...(groups.get(meetingId) ?? []), request])
  }
  return groups
})
const liveMeetingCount = computed(() => meetings.value.filter(meeting => meeting.status === 'live').length)
const plannedMeetingCount = computed(() => meetings.value.filter(meeting => meeting.status === 'planned').length)
const externalMeetingCount = computed(() =>
  meetings.value.filter(meeting => (meeting.guest_emails?.length ?? 0) > 0).length
)
const selectedMeeting = computed(() =>
  meetings.value.find(meeting => meeting.id === selectedMeetingId.value) ?? meetings.value[0] ?? null
)
const settings = computed(() => settingsData.value?.settings ?? null)
const aiNotesAllowed = computed(() => settings.value?.ai_notes_enabled !== false)
const recordingAllowed = computed(() => settings.value?.recording_enabled !== false)
const canHandleLobbyRequests = computed(() => props.myRole === 'admin')
const meetingZones = computed(() => props.zones.filter(zone => zone.zone_type !== 'desk'))
const selectedMeetingTypeDefaults = computed(() => meetingTypeDefaults[meetingType.value])
const meetingTypeOptions = [
  { value: 'general', label: 'General' },
  { value: 'client_review', label: 'Client review' },
  { value: 'sales_call', label: 'Sales call' },
  { value: 'support', label: 'Support' },
  { value: 'standup', label: 'Standup' },
  { value: 'interview', label: 'Interview' },
  { value: 'all_hands', label: 'All-hands' }
] as const
const meetingTypeDefaults: Record<MeetingType, {
  icon: string
  detail: string
  durationMinutes: number
  contextPlaceholder: string
  intakePrompt: string
}> = {
  general: {
    icon: 'i-lucide-calendar-days',
    detail: 'Flexible room session for ad hoc planning, reviews, or internal discussion.',
    durationMinutes: 30,
    contextPlaceholder: 'Agenda, customer context, goals, or anything the notes should remember',
    intakePrompt: ''
  },
  client_review: {
    icon: 'i-lucide-presentation',
    detail: 'Client-facing review with guest context, notes, and follow-up ready by default.',
    durationMinutes: 45,
    contextPlaceholder: 'Client, campaign, recent work, goals, risks, and decisions needed',
    intakePrompt: 'What should we review first?'
  },
  sales_call: {
    icon: 'i-lucide-handshake',
    detail: 'Discovery or proposal call with qualification context before the guest joins.',
    durationMinutes: 30,
    contextPlaceholder: 'Prospect, opportunity, pain points, budget, timeline, and next step',
    intakePrompt: 'What are you hoping to get out of the call?'
  },
  support: {
    icon: 'i-lucide-life-buoy',
    detail: 'Triage call for a customer issue, implementation blocker, or escalation.',
    durationMinutes: 30,
    contextPlaceholder: 'Account, issue summary, affected users, urgency, and current workaround',
    intakePrompt: 'What issue should we troubleshoot first?'
  },
  standup: {
    icon: 'i-lucide-list-checks',
    detail: 'Short team check-in optimized for blockers, decisions, and follow-up actions.',
    durationMinutes: 15,
    contextPlaceholder: 'Sprint, current priorities, blockers, owners, and decisions needed',
    intakePrompt: ''
  },
  interview: {
    icon: 'i-lucide-user-search',
    detail: 'Candidate or stakeholder interview with structured notes and retention controls.',
    durationMinutes: 45,
    contextPlaceholder: 'Candidate, role, interview stage, focus areas, and scorecard notes',
    intakePrompt: 'Is there anything you want us to know before we start?'
  },
  all_hands: {
    icon: 'i-lucide-megaphone',
    detail: 'Larger update session with recording, notes, and durable artifacts.',
    durationMinutes: 60,
    contextPlaceholder: 'Company update, agenda, presenters, key announcements, and Q&A topics',
    intakePrompt: 'What question should we cover if time allows?'
  }
}

const parsedGuestEmails = computed(() =>
  [...new Set(guestEmails.value
    .split(/[\s,;]+/)
    .map(email => email.trim())
    .filter(Boolean)
    .map(email => email.toLowerCase()))]
)
const invalidGuestEmails = computed(() =>
  parsedGuestEmails.value.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
)
const guestEmailsError = computed(() =>
  guestEmailsTouched.value && invalidGuestEmails.value.length
    ? `Invalid: ${invalidGuestEmails.value.join(', ')}`
    : ''
)
const parsedEditGuestEmails = computed(() =>
  [...new Set(editMeetingGuestEmails.value
    .split(/[\s,;]+/)
    .map(email => email.trim())
    .filter(Boolean)
    .map(email => email.toLowerCase()))]
)
const invalidEditGuestEmails = computed(() =>
  parsedEditGuestEmails.value.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
)
const editGuestEmailsError = computed(() =>
  editMeetingGuestEmailsTouched.value && invalidEditGuestEmails.value.length
    ? `Invalid: ${invalidEditGuestEmails.value.join(', ')}`
    : ''
)
const durationError = computed(() =>
  durationTouched.value && (durationMinutes.value < 15 || durationMinutes.value > 480)
    ? 'Duration must be between 15 minutes and 8 hours.'
    : ''
)
const editDurationError = computed(() =>
  editMeetingDurationTouched.value && (editMeetingDurationMinutes.value < 15 || editMeetingDurationMinutes.value > 480)
    ? 'Duration must be between 15 minutes and 8 hours.'
    : ''
)
const retentionError = computed(() =>
  retentionTouched.value && (retentionDays.value < 1 || retentionDays.value > 3650)
    ? 'Retention must be between 1 day and 10 years.'
    : ''
)
const editRetentionError = computed(() =>
  editMeetingRetentionTouched.value && ((editMeetingRetentionDays.value ?? 0) < 1 || (editMeetingRetentionDays.value ?? 0) > 3650)
    ? 'Retention must be between 1 day and 10 years.'
    : ''
)
const durationValid = computed(() => durationMinutes.value >= 15 && durationMinutes.value <= 480)
const editDurationValid = computed(() => editMeetingDurationMinutes.value >= 15 && editMeetingDurationMinutes.value <= 480)
const retentionValid = computed(() => retentionDays.value >= 1 && retentionDays.value <= 3650)
const editRetentionValid = computed(() => (editMeetingRetentionDays.value ?? 0) >= 1 && (editMeetingRetentionDays.value ?? 0) <= 3650)
const titleError = computed(() => title.value.trim() || !titleTouched.value ? '' : 'Meeting title is required.')
const editTitleError = computed(() => editMeetingTitle.value.trim() || !editMeetingTitleTouched.value ? '' : 'Meeting title is required.')
const canCreateSession = computed(() =>
  Boolean(title.value.trim())
  && invalidGuestEmails.value.length === 0
  && durationValid.value
  && retentionValid.value
)
const canSaveMeetingDetails = computed(() =>
  Boolean(editMeetingTitle.value.trim())
  && invalidEditGuestEmails.value.length === 0
  && editDurationValid.value
  && editRetentionValid.value
)
const draftMeetingReadinessItems = computed<MeetingReadinessItem[]>(() => {
  const selectedZone = meetingZones.value.find(zone => zone.id === zoneId.value)
  const hasGuests = parsedGuestEmails.value.length > 0
  const guestsValid = hasGuests && invalidGuestEmails.value.length === 0
  const captureEnabled = Boolean(aiNotes.value || recording.value)

  return [
    {
      key: 'room',
      label: selectedZone ? 'Room ready' : hasGuests ? 'Choose room' : 'Room optional',
      detail: selectedZone?.name ?? (hasGuests ? 'Required before guest invites can be shared.' : 'Assign one before starting live.'),
      icon: selectedZone ? 'i-lucide-map-pin-check' : 'i-lucide-map-pin-off',
      state: selectedZone ? 'done' : hasGuests ? 'attention' : 'pending'
    },
    {
      key: 'schedule',
      label: scheduledStartAt.value ? 'Scheduled' : 'Drop-in',
      detail: scheduledStartAt.value ? new Date(scheduledStartAt.value).toLocaleString() : 'No start time set.',
      icon: scheduledStartAt.value ? 'i-lucide-calendar-check' : 'i-lucide-calendar-clock',
      state: scheduledStartAt.value ? 'done' : 'pending'
    },
    {
      key: 'guests',
      label: hasGuests ? `${parsedGuestEmails.value.length} guest${parsedGuestEmails.value.length === 1 ? '' : 's'}` : 'Internal only',
      detail: hasGuests
        ? guestsValid
          ? 'External guest list is valid.'
          : 'Fix guest email formatting.'
        : 'Add guests for lobby access.',
      icon: hasGuests ? 'i-lucide-users-round' : 'i-lucide-user-round',
      state: hasGuests ? guestsValid ? 'done' : 'attention' : 'pending'
    },
    {
      key: 'invite',
      label: hasGuests ? 'Invite ready' : 'No invite needed',
      detail: hasGuests && selectedZone ? 'Email guests or copy the lobby link after setup.' : hasGuests ? 'Select a room before sending.' : 'Internal meeting only.',
      icon: hasGuests ? 'i-lucide-send' : 'i-lucide-mail',
      state: hasGuests ? selectedZone ? 'done' : 'attention' : 'pending'
    },
    {
      key: 'capture',
      label: captureEnabled ? 'Capture enabled' : 'Manual notes',
      detail: captureEnabled ? 'Notes, transcript, or recording artifacts will be prepared.' : 'Turn on AI notes or recording if needed.',
      icon: captureEnabled ? 'i-lucide-file-check-2' : 'i-lucide-file-pen-line',
      state: captureEnabled ? 'done' : 'pending'
    },
    {
      key: 'retention',
      label: retentionValid.value ? `${retentionDays.value} day retention` : 'Check retention',
      detail: retentionValid.value ? 'Meeting artifacts use this retention window.' : 'Retention must be 1 to 3650 days.',
      icon: retentionValid.value ? 'i-lucide-shield-check' : 'i-lucide-shield-alert',
      state: retentionValid.value ? 'done' : 'attention'
    }
  ]
})

const {
  data: artifactData,
  pending: artifactsPending,
  refresh: refreshArtifacts,
  error: artifactsError
} = useFetch<{ artifacts: OfficeMeetingArtifactRow[] }>(
  () => selectedMeeting.value ? `/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/artifacts` : null,
  {
    watch: [selectedMeetingId, () => props.officeId],
    default: () => ({ artifacts: [] })
  }
)

const selectedArtifacts = computed(() => artifactData.value?.artifacts ?? [])

const {
  data: actionItemsData,
  pending: actionItemsPending,
  refresh: refreshActionItems,
  error: actionItemsError
} = useFetch<{ actionItems: OfficeMeetingActionItemRow[] }>(
  () => selectedMeeting.value ? `/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/action-items` : null,
  {
    watch: [selectedMeetingId, () => props.officeId],
    default: () => ({ actionItems: [] })
  }
)

const selectedActionItems = computed(() => actionItemsData.value?.actionItems ?? [])
const openActionItemCount = computed(() => selectedActionItems.value.filter(item => item.status === 'open' || item.status === 'in_progress').length)

const artifactLabels: Record<OfficeMeetingArtifactType, string> = {
  transcript: 'Transcript',
  summary: 'Summary',
  recording: 'Recording',
  action_items: 'Actions',
  notes: 'Notes'
}

function setupLabel(meeting: MeetingWithZone) {
  const setup = meeting.consent?.setup
  if (setup && typeof setup === 'object' && 'meeting_type' in setup && typeof setup.meeting_type === 'string') {
    return setup.meeting_type.replaceAll('_', ' ')
  }
  return meeting.source.replace('_', ' ')
}

function meetingSetup(meeting: MeetingWithZone) {
  return meeting.consent?.setup ?? {}
}

function meetingInviteDelivery(meeting: MeetingWithZone) {
  const delivery = meeting.consent?.invite_delivery
  return delivery && typeof delivery === 'object' ? delivery : null
}

function readinessPillClass(state: MeetingReadinessItem['state']) {
  if (state === 'done') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (state === 'attention') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  return 'bg-white/[0.035] text-white/50 ring-white/[0.06]'
}

function meetingReadinessItems(meeting: MeetingWithZone): MeetingReadinessItem[] {
  const setup = meetingSetup(meeting)
  const hasGuests = (meeting.guest_emails?.length ?? 0) > 0
  const invitesSent = Boolean(meetingInviteDelivery(meeting)?.sent_at)
  const captureEnabled = Boolean(meeting.consent?.ai_notes || meeting.consent?.recording || meeting.consent?.transcript)

  return [
    {
      key: 'room',
      label: meeting.zone_id ? 'Room assigned' : hasGuests ? 'Needs room' : 'Room not assigned',
      detail: meeting.zone_name || (hasGuests ? 'Assign a meeting room before guests enter.' : 'Assign a room before starting live.'),
      icon: meeting.zone_id ? 'i-lucide-map-pin-check' : 'i-lucide-map-pin-off',
      state: meeting.zone_id ? 'done' : hasGuests ? 'attention' : 'pending'
    },
    {
      key: 'schedule',
      label: setup.scheduled_start_at ? 'Scheduled' : 'Drop-in',
      detail: setupScheduleLabel(meeting),
      icon: setup.scheduled_start_at ? 'i-lucide-calendar-check' : 'i-lucide-calendar-clock',
      state: setup.scheduled_start_at ? 'done' : 'pending'
    },
    {
      key: 'guests',
      label: hasGuests ? `${meeting.guest_emails?.length ?? 0} guest${(meeting.guest_emails?.length ?? 0) === 1 ? '' : 's'}` : 'Internal only',
      detail: hasGuests ? 'External guest list is ready.' : 'Add guests when this needs lobby access.',
      icon: hasGuests ? 'i-lucide-users-round' : 'i-lucide-user-round',
      state: hasGuests ? 'done' : 'pending'
    },
    {
      key: 'invites',
      label: !hasGuests ? 'No guest invite' : invitesSent ? 'Invites sent' : 'Send invites',
      detail: !hasGuests ? 'Copy the room invite if needed.' : invitesSent ? inviteDeliveryLabel(meeting) : 'Email guests or copy the lobby link.',
      icon: invitesSent ? 'i-lucide-mail-check' : 'i-lucide-send',
      state: !hasGuests || invitesSent ? 'done' : 'attention'
    },
    {
      key: 'capture',
      label: captureEnabled ? 'Capture enabled' : 'Manual notes',
      detail: captureEnabled ? 'Notes, transcript, or recording artifacts are prepared.' : 'No AI notes or recording selected.',
      icon: captureEnabled ? 'i-lucide-file-check-2' : 'i-lucide-file-pen-line',
      state: captureEnabled ? 'done' : 'pending'
    }
  ]
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function setupScheduleLabel(meeting: MeetingWithZone) {
  const setup = meetingSetup(meeting)
  if (!setup?.scheduled_start_at) return 'Not scheduled'
  const date = new Date(setup.scheduled_start_at)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  const when = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
  return setup.duration_minutes ? `${when} · ${setup.duration_minutes} min` : when
}

function meetingInviteLobby(meeting: MeetingWithZone) {
  return activeLobbies.value.find(lobby => lobby.destination_zone_id === meeting.zone_id)
    ?? activeLobbies.value.find(lobby => !lobby.destination_zone_id)
    ?? activeLobbies.value[0]
    ?? null
}

function meetingInviteLobbyForZone(zoneId: string | null) {
  return activeLobbies.value.find(lobby => lobby.destination_zone_id === zoneId)
    ?? activeLobbies.value.find(lobby => !lobby.destination_zone_id)
    ?? activeLobbies.value[0]
    ?? null
}

function meetingInvitePath(meeting: MeetingWithZone) {
  const lobby = meetingInviteLobby(meeting)
  return lobby ? `/l/${lobby.handle}` : `/lobby/${props.officeId}`
}

function meetingInviteUrl(meeting: MeetingWithZone) {
  const setup = meetingSetup(meeting)
  const query = new URLSearchParams()
  if (meeting.zone_slug) query.set('room', meeting.zone_slug)
  query.set('meeting', meeting.id)
  query.set('title', meeting.title)
  if (setup.scheduled_start_at) query.set('start', setup.scheduled_start_at)
  if (setup.duration_minutes) query.set('duration', String(setup.duration_minutes))
  const queryString = query.toString()
  const suffix = queryString ? `?${queryString}` : ''
  const path = `${meetingInvitePath(meeting)}${suffix}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

function draftMeetingInviteUrl(meetingId: string, draft: {
  zoneId: string | null
  title: string
  scheduledStartAt: string
  durationMinutes: number
}) {
  const lobby = meetingInviteLobbyForZone(draft.zoneId)
  const zone = meetingZones.value.find(item => item.id === draft.zoneId)
  const path = lobby ? `/l/${lobby.handle}` : `/lobby/${props.officeId}`
  const query = new URLSearchParams()
  if (zone?.slug) query.set('room', zone.slug)
  query.set('meeting', meetingId)
  query.set('title', draft.title)
  if (draft.scheduledStartAt) query.set('start', new Date(draft.scheduledStartAt).toISOString())
  if (draft.durationMinutes) query.set('duration', String(draft.durationMinutes))
  const url = `${path}?${query.toString()}`
  if (typeof window === 'undefined') return url
  return `${window.location.origin}${url}`
}

function meetingInviteText(meeting: MeetingWithZone) {
  const guests = meeting.guest_emails?.length
    ? `Guests: ${meeting.guest_emails.join(', ')}`
    : ''
  return [
    meeting.title,
    setupScheduleLabel(meeting),
    guests,
    meetingInviteUrl(meeting)
  ].filter(Boolean).join('\n')
}

function meetingHasExternalGuests(meeting: MeetingWithZone) {
  return (meeting.guest_emails?.length ?? 0) > 0
}

function meetingGuestInviteNeedsRoom(meeting: MeetingWithZone) {
  return meetingHasExternalGuests(meeting) && !meeting.zone_id
}

function meetingGuestInviteTitle(meeting: MeetingWithZone, action: string) {
  return meetingGuestInviteNeedsRoom(meeting)
    ? 'Assign a room before sharing guest invites'
    : action
}

function warnGuestInviteNeedsRoom(meeting: MeetingWithZone) {
  if (!meetingGuestInviteNeedsRoom(meeting)) return false
  toast.add({
    title: 'Assign a room first',
    description: 'Guest invites need an approved room before they are shared.',
    icon: 'i-lucide-map-pin-off',
    color: 'warning',
    duration: 2200
  })
  startEditingMeetingDetails(meeting, true)
  return true
}

function calendarTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function calendarFilename(meeting: MeetingWithZone) {
  const slug = meeting.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return `${slug || 'meeting'}.ics`
}

function meetingCalendarContent(meeting: MeetingWithZone) {
  const setup = meetingSetup(meeting)
  if (!setup.scheduled_start_at) return ''
  const startsAt = new Date(setup.scheduled_start_at)
  if (Number.isNaN(startsAt.getTime())) return ''
  const duration = setup.duration_minutes ?? 30
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)
  const description = [
    meeting.zone_name ? `Room: ${meeting.zone_name}` : '',
    meeting.guest_emails?.length ? `Guests: ${meeting.guest_emails.join(', ')}` : '',
    setup.context ? `Context: ${setup.context}` : '',
    `Lobby link: ${meetingInviteUrl(meeting)}`
  ].filter(Boolean).join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//XeroFlow//Office Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@xeroflow-office`,
    `DTSTAMP:${calendarTimestamp(new Date())}`,
    `DTSTART:${calendarTimestamp(startsAt)}`,
    `DTEND:${calendarTimestamp(endsAt)}`,
    `SUMMARY:${escapeCalendarText(meeting.title)}`,
    `LOCATION:${escapeCalendarText(meeting.zone_name || 'XeroFlow Office')}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${meetingInviteUrl(meeting)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
}

function downloadCalendarInvite(meeting: MeetingWithZone) {
  if (typeof window === 'undefined') return
  if (warnGuestInviteNeedsRoom(meeting)) return
  const content = meetingCalendarContent(meeting)
  if (!content) {
    toast.add({
      title: 'Add a start time first',
      description: 'Calendar files need a scheduled start time.',
      icon: 'i-lucide-calendar-clock',
      color: 'warning',
      duration: 2200
    })
    return
  }

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = calendarFilename(meeting)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Calendar invite ready', icon: 'i-lucide-calendar-check', color: 'success', duration: 1400 })
}

async function copyMeetingInvite(meeting: MeetingWithZone) {
  if (warnGuestInviteNeedsRoom(meeting)) return
  const invite = meetingInviteText(meeting)
  try {
    await navigator.clipboard.writeText(invite)
    toast.add({ title: 'Meeting invite copied', icon: 'i-lucide-copy-check', color: 'success', duration: 1400 })
  } catch {
    toast.add({ title: 'Meeting invite', description: meetingInviteUrl(meeting), icon: 'i-lucide-link', color: 'neutral', duration: 5000 })
  }
}

async function copyGuestEmails(meeting: MeetingWithZone) {
  const guests = meeting.guest_emails ?? []
  if (!guests.length) return
  const value = guests.join(', ')
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: 'Guest emails copied', icon: 'i-lucide-copy-check', color: 'success', duration: 1400 })
  } catch {
    toast.add({ title: 'Guest emails', description: value, icon: 'i-lucide-users', color: 'neutral', duration: 5000 })
  }
}

async function sendMeetingInvites(meeting: MeetingWithZone) {
  if (warnGuestInviteNeedsRoom(meeting)) return
  const guests = meeting.guest_emails ?? []
  if (!guests.length) {
    toast.add({
      title: 'Add guests first',
      description: 'Meeting invites need at least one external guest email.',
      icon: 'i-lucide-user-round-plus',
      color: 'warning',
      duration: 2200
    })
    return
  }

  sendingInvitesForMeetingId.value = meeting.id
  try {
    const response = await $fetch<{ invited: number, invitedAt: string }>(`/api/office/${props.officeId}/meetings/${meeting.id}/invite`, {
      method: 'POST',
      body: {
        invite_url: meetingInviteUrl(meeting),
        recipients: guests,
        note: meetingSetup(meeting).context
      }
    })
    toast.add({
      title: 'Meeting invites sent',
      description: `${response.invited} guest${response.invited === 1 ? '' : 's'} emailed.`,
      icon: 'i-lucide-mail-check',
      color: 'success',
      duration: 1600
    })
    await refresh()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not send invites',
      description: message || 'Copy the invite link and send it manually.',
      icon: 'i-lucide-mail-warning',
      color: 'error'
    })
  } finally {
    sendingInvitesForMeetingId.value = null
  }
}

function startEditingMeetingDetails(meeting: MeetingWithZone, focusRoom = false) {
  const setup = meetingSetup(meeting)
  editMeetingTitle.value = meeting.title
  editMeetingTitleTouched.value = false
  editMeetingZoneId.value = meeting.zone_id
  editMeetingType.value = meetingTypeOptions.some(option => option.value === setup.meeting_type)
    ? setup.meeting_type as MeetingType
    : 'general'
  editMeetingContext.value = setup.context ?? ''
  editMeetingIntakePrompt.value = setup.intake_prompt ?? ''
  editMeetingGuestEmails.value = (meeting.guest_emails ?? []).join(', ')
  editMeetingGuestEmailsTouched.value = false
  editMeetingScheduledStartAt.value = toDatetimeLocal(setup.scheduled_start_at)
  editMeetingDurationMinutes.value = setup.duration_minutes ?? 30
  editMeetingDurationTouched.value = false
  editMeetingRetentionDays.value = meeting.retention_days ?? settings.value?.default_meeting_retention_days ?? 90
  editMeetingRetentionTouched.value = false
  editingMeetingDetails.value = true
  if (focusRoom) {
    nextTick(() => editMeetingRoomSelect.value?.focus())
  }
}

function cancelEditingMeetingDetails() {
  editingMeetingDetails.value = false
}

async function saveMeetingDetails() {
  if (!selectedMeeting.value || !canSaveMeetingDetails.value) return
  savingMeetingDetails.value = true
  try {
    await $fetch(`/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}`, {
      method: 'PATCH',
      body: {
        title: editMeetingTitle.value,
        zone_id: editMeetingZoneId.value,
        meeting_type: editMeetingType.value,
        context: editMeetingContext.value,
        intake_prompt: editMeetingIntakePrompt.value || null,
        scheduled_start_at: editMeetingScheduledStartAt.value ? new Date(editMeetingScheduledStartAt.value).toISOString() : null,
        duration_minutes: editMeetingDurationMinutes.value,
        guest_emails: parsedEditGuestEmails.value,
        retention_days: editMeetingRetentionDays.value
      }
    })
    toast.add({ title: 'Meeting details saved', icon: 'i-lucide-save', color: 'success', duration: 1400 })
    editingMeetingDetails.value = false
    await refreshMeetingState()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not save meeting', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    savingMeetingDetails.value = false
  }
}

function artifactTypeLabels(meeting: MeetingWithZone) {
  return [
    ...(meeting.has_guest_intake ? ['Guest intake'] : []),
    ...(meeting.artifact_types ?? []).map(type => artifactLabels[type] ?? type)
  ]
}

function attendeeLabel(meeting: MeetingWithZone) {
  const handles = meeting.participant_handles ?? []
  const internalCount = handles.filter(handle => handle.startsWith('user:')).length
  const clientHandleCount = handles.filter(handle => handle.startsWith('client:')).length
  const guestCount = Math.max(meeting.guest_emails?.length ?? 0, clientHandleCount)
  const parts = [
    internalCount ? `${internalCount} host${internalCount === 1 ? '' : 's'}` : '',
    guestCount ? `${guestCount} guest${guestCount === 1 ? '' : 's'}` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Internal'
}

function pendingLobbyGuests(meeting: MeetingWithZone) {
  return pendingLobbyRequestsByMeetingId.value.get(meeting.id) ?? []
}

function acceptedLobbyGuests(meeting: MeetingWithZone) {
  return acceptedLobbyRequestsByMeetingId.value.get(meeting.id) ?? []
}

function pendingLobbyLabel(meeting: MeetingWithZone) {
  const count = pendingLobbyGuests(meeting).length
  if (!count) return ''
  return `Waiting · ${count} guest${count === 1 ? '' : 's'}`
}

function acceptedLobbyLabel(meeting: MeetingWithZone) {
  const count = acceptedLobbyGuests(meeting).length
  if (!count) return ''
  return `Accepted · ${count} guest${count === 1 ? '' : 's'}`
}

function meetingRecordingLabel(meeting: MeetingWithZone) {
  const count = meeting.recording_count ?? 0
  if (!count) return meeting.consent?.recording ? 'Recording planned' : ''
  const ready = meeting.ready_recording_count ?? 0
  const draft = meeting.draft_recording_count ?? 0
  if (ready) return `${ready} ready recording${ready === 1 ? '' : 's'}`
  if (draft) return `${draft} recording draft${draft === 1 ? '' : 's'}`
  return `${count} recording${count === 1 ? '' : 's'}`
}

function acceptedGuestCount(meeting: MeetingWithZone) {
  return acceptedLobbyGuests(meeting).length
}

function lobbyRequestParsed(request: MeetingLobbyRequest) {
  return parseOfficeLobbyMessage(request.message)
}

function lobbyRequestIntakeAnswers(request: MeetingLobbyRequest) {
  return lobbyRequestParsed(request).intakeAnswers
}

function lobbyRequestNote(request: MeetingLobbyRequest) {
  return lobbyRequestParsed(request).note
}

function meetingCloseoutLabel(meeting: MeetingWithZone, action: 'ended' | 'cancelled') {
  const guests = acceptedGuestCount(meeting)
  const base = action === 'ended' ? 'End' : 'Cancel'
  if (!guests) return base
  return `${base} + close ${guests} pass${guests === 1 ? '' : 'es'}`
}

function acceptedAccessLabel(request: MeetingLobbyRequest) {
  if (!request.accepted_expires_at) return 'Access window active'
  const expiresAt = new Date(request.accepted_expires_at).getTime()
  if (!Number.isFinite(expiresAt)) return 'Access window active'
  const minutes = Math.ceil((expiresAt - accessClockMs.value) / 60_000)
  if (minutes <= 0) return 'Access expiring'
  if (minutes === 1) return 'Expires in 1 min'
  if (minutes < 60) return `Expires in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (!remaining) return `Expires in ${hours} hr${hours === 1 ? '' : 's'}`
  return `Expires in ${hours} hr ${remaining} min`
}

function enterMeetingRoom(meeting: MeetingWithZone) {
  if (!meeting.zone_id) {
    toast.add({
      title: 'No room assigned',
      description: 'Assign a room before entering this meeting.',
      icon: 'i-lucide-map-pin-off',
      color: 'warning',
      duration: 2200
    })
    return
  }
  emit('enterOfficeZone', meeting.zone_id)
}

function guestRoomUrl(request: MeetingLobbyRequest) {
  const path = `/lobby-room/${props.officeId}/${request.id}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

async function copyGuestRoomLink(request: MeetingLobbyRequest) {
  const link = guestRoomUrl(request)
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(link)
    toast.add({
      title: 'Guest room link copied',
      description: request.guest_name,
      icon: 'i-lucide-link',
      color: 'success',
      duration: 1600
    })
  } catch {
    toast.add({
      title: 'Guest room link',
      description: link,
      icon: 'i-lucide-link',
      color: 'neutral',
      duration: 5000
    })
  }
}

async function handleLobbyRequest(request: MeetingLobbyRequest, status: 'accepted' | 'declined' | 'expired') {
  if (!canHandleLobbyRequests.value || handlingLobbyRequestId.value) return

  handlingLobbyRequestId.value = request.id
  try {
    const response = await $fetch<LobbyRequestPatchResponse>(`/api/office/${props.officeId}/lobby-requests/${request.id}`, {
      method: 'PATCH',
      body: { status }
    })
    toast.add({
      title: status === 'accepted'
        ? 'Guest accepted'
        : status === 'expired'
          ? 'Guest access ended'
          : 'Guest declined',
      description: [request.guest_name, response.request.zone_name].filter(Boolean).join(' · '),
      icon: status === 'accepted'
        ? 'i-lucide-user-round-check'
        : status === 'expired'
          ? 'i-lucide-lock'
          : 'i-lucide-user-round-x',
      color: status === 'accepted' ? 'success' : 'neutral',
      duration: 1600
    })
    await refreshPendingLobbyRequests()
    await refreshAcceptedLobbyRequests()
    await refresh()
    if (status === 'accepted' && response.meetingSessionId) {
      selectedMeetingId.value = response.meetingSessionId
    }
    const targetZoneId = response.request.zone_id ?? selectedMeeting.value?.zone_id ?? null
    if (status === 'accepted' && targetZoneId) {
      emit('enterOfficeZone', targetZoneId)
    }
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not update guest',
      description: message || 'Try again from the lobby queue.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    handlingLobbyRequestId.value = null
  }
}

function inviteDeliveryLabel(meeting: MeetingWithZone) {
  const delivery = meetingInviteDelivery(meeting)
  if (!delivery?.sent_at) return ''
  const date = new Date(delivery.sent_at)
  const when = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date)
  const count = delivery.guest_count ?? delivery.recipients?.length ?? 0
  return [
    'Invited',
    count ? `${count} guest${count === 1 ? '' : 's'}` : '',
    delivery.intake_prompt ? 'intake included' : '',
    when
  ].filter(Boolean).join(' · ')
}

function inviteDeliveryRecipients(meeting: MeetingWithZone) {
  const delivery = meetingInviteDelivery(meeting)
  return Array.isArray(delivery?.recipients)
    ? delivery.recipients.filter((item): item is string => typeof item === 'string')
    : []
}

function inviteDeliveryTitle(meeting: MeetingWithZone) {
  const delivery = meetingInviteDelivery(meeting)
  if (!delivery?.sent_at) return undefined
  const recipients = inviteDeliveryRecipients(meeting)
  return [
    inviteDeliveryLabel(meeting),
    recipients.length ? `Recipients: ${recipients.join(', ')}` : '',
    delivery.invite_url ? `Invite: ${delivery.invite_url}` : ''
  ].filter(Boolean).join('\n')
}

function retentionLabel(meeting: MeetingWithZone) {
  return meeting.retention_days ? `${meeting.retention_days} days` : 'Default retention'
}

function statusLabel(meeting: MeetingWithZone) {
  return meeting.status.replaceAll('_', ' ')
}

function hostNextStepClass(tone: HostNextStepItem['tone']) {
  if (tone === 'primary') return 'bg-sky-400/10 text-sky-100 ring-sky-300/15 hover:bg-sky-400/15'
  if (tone === 'success') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
  if (tone === 'warning') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15 hover:bg-amber-300/15'
  return 'bg-white/[0.04] text-white/65 ring-white/[0.06] hover:bg-white/[0.08] hover:text-white/85'
}

function hostNextSteps(meeting: MeetingWithZone): HostNextStepItem[] {
  const steps: HostNextStepItem[] = []
  const hasGuests = meetingHasExternalGuests(meeting)
  const invitesSent = Boolean(meetingInviteDelivery(meeting)?.sent_at)
  const waitingGuests = pendingLobbyGuests(meeting).length
  const artifactCount = meeting.artifact_count ?? 0

  if (!meeting.zone_id && meeting.status === 'planned') {
    steps.push({
      key: 'assign-room',
      label: 'Assign room',
      detail: 'Required before guests can be admitted or the host can start.',
      icon: 'i-lucide-map-pin-plus',
      tone: 'warning',
      action: 'assign_room'
    })
  }

  if (hasGuests && !invitesSent && meeting.zone_id && meeting.status === 'planned') {
    steps.push({
      key: 'send-invites',
      label: 'Email guests',
      detail: `${meeting.guest_emails?.length ?? 0} guest${(meeting.guest_emails?.length ?? 0) === 1 ? '' : 's'} ready for lobby links.`,
      icon: 'i-lucide-mail',
      tone: 'primary',
      action: 'send_invites'
    })
  }

  if (waitingGuests) {
    steps.push({
      key: 'review-lobby',
      label: 'Review lobby',
      detail: `${waitingGuests} guest${waitingGuests === 1 ? '' : 's'} waiting for admission.`,
      icon: 'i-lucide-door-open',
      tone: 'warning',
      action: 'review_lobby'
    })
  }

  if (meeting.status === 'planned' && meeting.zone_id) {
    steps.push({
      key: 'start-meeting',
      label: 'Start meeting',
      detail: 'Mark live and move into the assigned room.',
      icon: 'i-lucide-play',
      tone: 'success',
      action: 'start_meeting'
    })
  }

  if (meeting.status === 'live' && meeting.zone_id) {
    steps.push({
      key: 'enter-room',
      label: 'Enter room',
      detail: 'Join the live office room for this session.',
      icon: 'i-lucide-log-in',
      tone: 'success',
      action: 'enter_room'
    })
  }

  if (meeting.status === 'live' && artifactCount === 0) {
    steps.push({
      key: 'capture-notes',
      label: 'Capture notes',
      detail: 'Create notes, summary, actions, or transcript artifacts.',
      icon: 'i-lucide-notebook-pen',
      tone: 'primary',
      action: 'capture_notes'
    })
  }

  if (meeting.consent?.recording && !(meeting.artifact_types ?? []).includes('recording')) {
    const recordingCount = meeting.recording_count ?? 0
    const readyRecordingCount = meeting.ready_recording_count ?? 0
    const draftRecordingCount = meeting.draft_recording_count ?? 0
    steps.push({
      key: 'open-recordings',
      label: readyRecordingCount ? 'Publish recording' : recordingCount ? 'Manage recording' : 'Create recording',
      detail: readyRecordingCount
        ? `${readyRecordingCount} ready recording${readyRecordingCount === 1 ? '' : 's'} can be shared or attached.`
        : draftRecordingCount
          ? `${draftRecordingCount} recording draft${draftRecordingCount === 1 ? '' : 's'} in progress.`
          : 'Create the recording draft for this meeting.',
      icon: 'i-lucide-monitor-up',
      tone: readyRecordingCount ? 'success' : 'primary',
      action: 'open_recordings'
    })
  }

  if (artifactCount > 0) {
    steps.push({
      key: 'review-artifacts',
      label: 'Review artifacts',
      detail: `${artifactCount} artifact${artifactCount === 1 ? '' : 's'} attached to this session.`,
      icon: 'i-lucide-file-stack',
      tone: 'neutral',
      action: 'review_artifacts'
    })
  }

  if (meeting.status === 'live') {
    steps.push({
      key: 'closeout',
      label: 'End meeting',
      detail: acceptedGuestCount(meeting) ? 'Close guest access and write closeout artifacts.' : 'Close the live meeting session.',
      icon: 'i-lucide-flag',
      tone: 'neutral',
      action: 'closeout'
    })
  }

  return steps.slice(0, 4)
}

function artifactDelivery(artifact: OfficeMeetingArtifactRow): FollowUpDelivery | null {
  const delivery = artifact.metadata?.follow_up_delivery
  if (!delivery || typeof delivery !== 'object') return null
  const record = delivery as Record<string, unknown>
  return {
    status: typeof record.status === 'string' ? record.status : undefined,
    sent_at: typeof record.sent_at === 'string' ? record.sent_at : undefined,
    recipients: Array.isArray(record.recipients)
      ? record.recipients.filter((item): item is string => typeof item === 'string')
      : undefined,
    job_id: typeof record.job_id === 'string' ? record.job_id : undefined,
    edited_at: typeof record.edited_at === 'string' ? record.edited_at : undefined
  }
}

function actionItemDelivery(item: OfficeMeetingActionItemRow): FollowUpDelivery | null {
  const delivery = item.metadata?.follow_up_delivery
  if (!delivery || typeof delivery !== 'object') return null
  const record = delivery as Record<string, unknown>
  return {
    status: typeof record.status === 'string' ? record.status : undefined,
    sent_at: typeof record.sent_at === 'string' ? record.sent_at : undefined,
    recipients: Array.isArray(record.recipients)
      ? record.recipients.filter((recipient): recipient is string => typeof recipient === 'string')
      : undefined,
    job_id: typeof record.job_id === 'string' ? record.job_id : undefined,
    edited_at: typeof record.edited_at === 'string' ? record.edited_at : undefined
  }
}

function artifactDeliveryStatus(artifact: OfficeMeetingArtifactRow) {
  return artifactDelivery(artifact)?.status ?? ''
}

function actionItemDeliveryStatus(item: OfficeMeetingActionItemRow) {
  return actionItemDelivery(item)?.status ?? ''
}

function formatDeliveryTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function artifactDeliveryLabel(artifact: OfficeMeetingArtifactRow) {
  const delivery = artifactDelivery(artifact)
  if (!delivery || delivery.status !== 'sent') return ''
  const count = delivery.recipients?.length ?? 0
  const firstRecipient = delivery.recipients?.[0]
  const sentAt = formatDeliveryTime(delivery.sent_at)
  const recipientLabel = firstRecipient && count === 1
    ? `to ${firstRecipient}`
    : count
      ? `to ${count} recipients`
      : ''
  const editedLabel = delivery.edited_at ? 'reviewed' : ''
  return ['Sent', recipientLabel, editedLabel, sentAt].filter(Boolean).join(' ')
}

function actionItemDeliveryLabel(item: OfficeMeetingActionItemRow) {
  const delivery = actionItemDelivery(item)
  if (!delivery || delivery.status !== 'sent') return ''
  const count = delivery.recipients?.length ?? 0
  const firstRecipient = delivery.recipients?.[0]
  const sentAt = formatDeliveryTime(delivery.sent_at)
  const recipientLabel = firstRecipient && count === 1
    ? `to ${firstRecipient}`
    : count
      ? `to ${count} recipients`
      : ''
  const editedLabel = delivery.edited_at ? 'reviewed' : ''
  return ['Sent', recipientLabel, editedLabel, sentAt].filter(Boolean).join(' ')
}

function artifactDeliveryTitle(artifact: OfficeMeetingArtifactRow) {
  const delivery = artifactDelivery(artifact)
  if (!delivery || delivery.status !== 'sent') return undefined
  const recipients = delivery.recipients ?? []
  return [
    artifactDeliveryLabel(artifact),
    recipients.length ? `Recipients: ${recipients.join(', ')}` : '',
    delivery.edited_at ? `Reviewed: ${formatDeliveryTime(delivery.edited_at)}` : ''
  ].filter(Boolean).join('\n')
}

function actionItemDeliveryTitle(item: OfficeMeetingActionItemRow) {
  const delivery = actionItemDelivery(item)
  if (!delivery || delivery.status !== 'sent') return undefined
  const recipients = delivery.recipients ?? []
  return [
    actionItemDeliveryLabel(item),
    recipients.length ? `Recipients: ${recipients.join(', ')}` : '',
    delivery.edited_at ? `Reviewed: ${formatDeliveryTime(delivery.edited_at)}` : ''
  ].filter(Boolean).join('\n')
}

function artifactDeliveryJobId(artifact: OfficeMeetingArtifactRow) {
  return artifactDelivery(artifact)?.job_id
}

function actionItemDeliveryJobId(item: OfficeMeetingActionItemRow) {
  return actionItemDelivery(item)?.job_id
}

function sentBadgeClass() {
  return 'inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15'
}

function pendingBadgeClass() {
  return 'inline-flex items-center gap-1 rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-200/15'
}

function failedBadgeClass() {
  return 'inline-flex items-center gap-1 rounded-md bg-red-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-100 ring-1 ring-red-300/15'
}

function neutralBadgeClass() {
  return 'inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-white/55 ring-1 ring-white/[0.06]'
}

function artifactFollowUpBadgeClass(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  if (status === 'failed') return failedBadgeClass()
  if (status === 'cancelled') return neutralBadgeClass()
  return pendingBadgeClass()
}

function artifactFollowUpBadgeIcon(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  if (status === 'failed') return 'i-lucide-circle-alert'
  if (status === 'cancelled') return 'i-lucide-circle-slash'
  return 'i-lucide-clock-3'
}

function actionableBadgeClass(baseClass: string) {
  return `${baseClass} cursor-pointer transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-sky-300/30`
}

function artifactFollowUpJob(artifact: OfficeMeetingArtifactRow): FollowUpJob | null {
  const job = artifact.metadata?.follow_up_job
  if (!job || typeof job !== 'object') return null
  const record = job as Record<string, unknown>
  return {
    status: typeof record.status === 'string' ? record.status : undefined,
    job_id: typeof record.job_id === 'string' ? record.job_id : undefined,
    edited_at: typeof record.edited_at === 'string' ? record.edited_at : undefined,
    error: typeof record.error === 'string' ? record.error : undefined
  }
}

function actionItemFollowUpJob(item: OfficeMeetingActionItemRow): FollowUpJob | null {
  const job = item.metadata?.follow_up_job
  if (!job || typeof job !== 'object') return null
  const record = job as Record<string, unknown>
  return {
    status: typeof record.status === 'string' ? record.status : undefined,
    job_id: typeof record.job_id === 'string' ? record.job_id : undefined,
    edited_at: typeof record.edited_at === 'string' ? record.edited_at : undefined,
    error: typeof record.error === 'string' ? record.error : undefined
  }
}

function artifactFollowUpJobLabel(artifact: OfficeMeetingArtifactRow) {
  if (artifactDeliveryStatus(artifact) === 'sent') return ''
  const status = artifactFollowUpJob(artifact)?.status
  if (status === 'waiting_approval') return 'Ready to generate'
  if (status === 'queued') return 'Draft queued'
  if (status === 'running') return 'Generating draft'
  if (status === 'completed') return artifactFollowUpJob(artifact)?.edited_at ? 'Draft edited' : 'Draft ready'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'failed') return 'Failed'
  return ''
}

function artifactFollowUpJobTitle(artifact: OfficeMeetingArtifactRow) {
  const job = artifactFollowUpJob(artifact)
  if (job?.status === 'failed' && job.error) return `Follow-up failed: ${job.error}`
  if (job?.status === 'cancelled') return 'Follow-up job was cancelled.'
  if (job?.status === 'completed') return 'Open the assistant draft.'
  if (job?.status === 'waiting_approval') return 'Generate the follow-up draft in the assistant panel.'
  if (job?.status === 'queued' || job?.status === 'running') return 'Follow-up draft is being prepared.'
  return undefined
}

function artifactFollowUpJobId(artifact: OfficeMeetingArtifactRow) {
  return artifactFollowUpJob(artifact)?.job_id
}

function actionItemFollowUpJobId(item: OfficeMeetingActionItemRow) {
  return actionItemFollowUpJob(item)?.job_id
}

function actionItemFollowUpJobLabel(item: OfficeMeetingActionItemRow) {
  if (actionItemDeliveryStatus(item) === 'sent') return ''
  const status = actionItemFollowUpJob(item)?.status
  if (status === 'waiting_approval') return 'Assistant ready'
  if (status === 'queued') return 'Assistant queued'
  if (status === 'running') return 'Assistant working'
  if (status === 'completed') return actionItemFollowUpJob(item)?.edited_at ? 'Draft edited' : 'Draft ready'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'failed') return 'Failed'
  return ''
}

function actionItemHasActiveFollowUpJob(item: OfficeMeetingActionItemRow) {
  const status = actionItemFollowUpJob(item)?.status
  return status === 'waiting_approval' || status === 'queued' || status === 'running' || status === 'completed'
}

function artifactHasActiveFollowUpJob(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  return status === 'waiting_approval' || status === 'queued' || status === 'running' || status === 'completed'
}

function artifactFollowUpActionLabel(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  return status === 'failed' || status === 'cancelled' ? 'Retry follow-up' : 'Follow up'
}

function artifactFollowUpActionTitle(artifact: OfficeMeetingArtifactRow) {
  const job = artifactFollowUpJob(artifact)
  if (job?.status === 'failed' && job.error) return `Retry follow-up after failure: ${job.error}`
  if (job?.status === 'cancelled') return 'Create a new follow-up draft.'
  return 'Create a follow-up draft from these action items.'
}

function artifactFollowUpActionClass(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  if (status === 'failed') {
    return 'bg-red-400/10 text-red-100 ring-red-300/15 hover:bg-red-400/15'
  }
  if (status === 'cancelled') {
    return 'bg-white/[0.04] text-white/65 ring-white/[0.08] hover:bg-white/[0.08] hover:text-white/85'
  }
  return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
}

function artifactFollowUpActionIcon(artifact: OfficeMeetingArtifactRow) {
  const status = artifactFollowUpJob(artifact)?.status
  if (status === 'failed' || status === 'cancelled') return 'i-lucide-refresh-cw'
  return 'i-lucide-sparkles'
}

function artifactMetadataStatus(artifact: OfficeMeetingArtifactRow) {
  const status = artifact.metadata?.status
  return typeof status === 'string' ? status : ''
}

function artifactSystemEvent(artifact: OfficeMeetingArtifactRow) {
  const event = artifact.metadata?.system_event
  return typeof event === 'string' ? event : ''
}

function isSystemArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifactMetadataStatus(artifact) === 'system' || Boolean(artifactSystemEvent(artifact))
}

function isCloseoutArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifactSystemEvent(artifact) === 'meeting_closeout'
}

function isGuestIntakeArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifactSystemEvent(artifact) === 'guest_intake'
}

function artifactTypeLabel(artifact: OfficeMeetingArtifactRow) {
  if (isCloseoutArtifact(artifact)) return 'Closeout'
  if (isGuestIntakeArtifact(artifact)) return 'Guest intake'
  return artifactLabels[artifact.artifact_type] ?? artifact.artifact_type
}

function artifactNumberMetadata(artifact: OfficeMeetingArtifactRow, key: string) {
  const value = artifact.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function closeoutLifecycleLabel(artifact: OfficeMeetingArtifactRow) {
  const status = artifact.metadata?.lifecycle_status
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'ended') return 'Ended'
  return 'Closeout'
}

function closeoutAccessLabel(artifact: OfficeMeetingArtifactRow) {
  const count = artifactNumberMetadata(artifact, 'guest_access_expired')
  return `${count} pass${count === 1 ? '' : 'es'} closed`
}

function closeoutBadgeLabel(artifact: OfficeMeetingArtifactRow) {
  const count = artifactNumberMetadata(artifact, 'guest_badges_expired')
  return `${count} badge${count === 1 ? '' : 's'} expired`
}

function guestIntakeLabel(artifact: OfficeMeetingArtifactRow) {
  const guestName = artifact.metadata?.guest_name
  return typeof guestName === 'string' && guestName ? guestName : 'Guest'
}

function guestIntakeAnswerLabel(artifact: OfficeMeetingArtifactRow) {
  const count = artifactNumberMetadata(artifact, 'intake_count')
  return `${count} answer${count === 1 ? '' : 's'}`
}

function artifactStringMetadata(artifact: OfficeMeetingArtifactRow, key: string) {
  const value = artifact.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

function isRecordingArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifact.artifact_type === 'recording'
}

function recordingArtifactUrl(artifact: OfficeMeetingArtifactRow) {
  const token = artifactStringMetadata(artifact, 'share_token')
  return token ? `/recordings/${token}` : ''
}

function recordingArtifactStatusLabel(artifact: OfficeMeetingArtifactRow) {
  const status = artifactStringMetadata(artifact, 'recording_status')
  if (status === 'ready') return 'Ready'
  if (status === 'processing') return 'Processing'
  if (status === 'failed') return 'Failed'
  if (status === 'archived') return 'Archived'
  return status ? status.replaceAll('_', ' ') : ''
}

function recordingArtifactAccessLabel(artifact: OfficeMeetingArtifactRow) {
  const access = artifactStringMetadata(artifact, 'recording_access')
  if (access === 'public') return 'Public link'
  if (access === 'workspace') return 'Workspace'
  if (access === 'password') return 'Password'
  if (access === 'private') return 'Private'
  return recordingArtifactUrl(artifact) ? 'Shareable' : 'Restricted'
}

function recordingArtifactDurationLabel(artifact: OfficeMeetingArtifactRow) {
  const seconds = artifactNumberMetadata(artifact, 'duration_seconds')
  if (!seconds) return ''
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = totalSeconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const hourMinutes = minutes % 60
    return `${hours}h ${hourMinutes}m`
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function recordingArtifactSummary(artifact: OfficeMeetingArtifactRow) {
  return artifact.content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.toLowerCase().startsWith('shared link:'))
    .join('\n')
}

function isPlaceholderArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifactMetadataStatus(artifact) === 'placeholder'
}

function isPrepTemplateArtifact(artifact: OfficeMeetingArtifactRow) {
  return isPlaceholderArtifact(artifact)
    && (artifact.artifact_type === 'summary' || artifact.artifact_type === 'action_items')
    && artifact.content.includes('template:')
}

function isFollowUpChecklistArtifact(artifact: OfficeMeetingArtifactRow) {
  return artifact.artifact_type === 'action_items'
    && artifactMetadataStatus(artifact) === 'generated'
    && artifact.metadata?.generated_from === 'meeting_closeout'
}

function isChecklistArtifact(artifact: OfficeMeetingArtifactRow) {
  return isPrepTemplateArtifact(artifact) || isFollowUpChecklistArtifact(artifact)
}

function checklistHeading(artifact: OfficeMeetingArtifactRow) {
  if (isFollowUpChecklistArtifact(artifact)) return 'Follow-up checklist'
  return artifact.content
    .split('\n')
    .map(line => line.trim())
    .find(line => line.endsWith('template:'))
    ?.replace(/:$/, '')
    ?? 'Preparation template'
}

function checklistGeneratedLabel(artifact: OfficeMeetingArtifactRow) {
  if (!isFollowUpChecklistArtifact(artifact)) return ''
  const generatedAt = artifact.metadata?.generated_at
  return typeof generatedAt === 'string' ? formatDeliveryTime(generatedAt) : ''
}

function checklistItems(artifact: OfficeMeetingArtifactRow) {
  return artifact.content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^- /, ''))
}

function artifactStatusLabel(artifact: OfficeMeetingArtifactRow) {
  const status = artifactMetadataStatus(artifact)
  if (status === 'placeholder') return isPrepTemplateArtifact(artifact) ? 'Prep template' : 'Awaiting capture'
  if (isFollowUpChecklistArtifact(artifact)) return 'Follow-up ready'
  if (status === 'edited') return 'Edited'
  if (status === 'generated') return 'Generated'
  if (status === 'system') return 'System'
  return ''
}

function selectMeeting(meetingId: string) {
  selectedMeetingId.value = meetingId
  editingArtifactId.value = null
}

function scrollToMeetingDetail(selector: string) {
  if (typeof document === 'undefined') return
  nextTick(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function handleHostNextStep(meeting: MeetingWithZone, action: HostNextStepAction) {
  selectMeeting(meeting.id)
  if (action === 'assign_room') {
    startEditingMeetingDetails(meeting, true)
    return
  }
  if (action === 'send_invites') {
    void sendMeetingInvites(meeting)
    return
  }
  if (action === 'review_lobby') {
    scrollToMeetingDetail('[data-office-lobby-requests]')
    return
  }
  if (action === 'start_meeting') {
    void updateMeetingStatus('live', meeting)
    return
  }
  if (action === 'enter_room') {
    enterMeetingRoom(meeting)
    return
  }
  if (action === 'capture_notes') {
    scrollToMeetingDetail('[data-office-note-taker]')
    return
  }
  if (action === 'open_recordings') {
    emit('openOfficeRecordings', meeting.id)
    return
  }
  if (action === 'review_artifacts') {
    scrollToMeetingDetail('[data-office-artifacts-list]')
    return
  }
  if (action === 'closeout') {
    void updateMeetingStatus('ended', meeting)
  }
}

async function openMeetingThread(meeting: MeetingWithZone) {
  if (openingMeetingThreadId.value) return
  openingMeetingThreadId.value = meeting.id
  try {
    const channel = await $fetch<{ id: string }>(`/api/office/${props.officeId}/meetings/${meeting.id}/thread`, {
      method: 'POST'
    })
    await navigateTo({
      path: '/agency/chat',
      query: { channel: channel.id }
    })
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not open meeting thread',
      description: message || 'Try again from the chat panel.',
      icon: 'i-lucide-message-circle-warning',
      color: 'error'
    })
  } finally {
    openingMeetingThreadId.value = null
  }
}

function startEditingArtifact(artifact: OfficeMeetingArtifactRow) {
  editingArtifactId.value = artifact.id
  editingArtifactTitle.value = artifact.title
  editingArtifactContent.value = artifact.content
}

function defaultNoteArtifactTitle(type = noteArtifactType.value) {
  if (type === 'summary') return 'Meeting summary'
  if (type === 'action_items') return 'Action items'
  if (type === 'transcript') return 'Transcript notes'
  return 'Live notes'
}

function resetNoteComposer() {
  noteArtifactType.value = 'notes'
  noteArtifactTitle.value = ''
  noteArtifactContent.value = ''
}

async function createNoteArtifact() {
  if (!selectedMeeting.value) return
  if (!noteArtifactContent.value.trim()) {
    toast.add({
      title: 'Add note content first',
      description: 'Capture notes, decisions, action items, or a short summary before saving.',
      icon: 'i-lucide-notebook-pen',
      color: 'warning',
      duration: 2200
    })
    return
  }

  savingNoteArtifact.value = true
  try {
    const title = noteArtifactTitle.value.trim() || defaultNoteArtifactTitle()
    await $fetch(`/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/artifacts`, {
      method: 'POST',
      body: {
        artifact_type: noteArtifactType.value,
        title,
        content: noteArtifactContent.value.trim(),
        metadata: {
          status: 'captured',
          source: 'manual_note_taker',
          captured_at: new Date().toISOString()
        }
      }
    })
    toast.add({ title: 'Meeting artifact saved', icon: 'i-lucide-notebook-tabs', color: 'success', duration: 1400 })
    resetNoteComposer()
    await refreshMeetingState()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not save meeting artifact', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    savingNoteArtifact.value = false
  }
}

function cancelEditingArtifact() {
  editingArtifactId.value = null
  editingArtifactTitle.value = ''
  editingArtifactContent.value = ''
}

async function saveArtifact(artifact: OfficeMeetingArtifactRow) {
  if (!selectedMeeting.value) return
  savingArtifactId.value = artifact.id
  try {
    await $fetch(`/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/artifacts/${artifact.id}`, {
      method: 'PATCH',
      body: {
        title: editingArtifactTitle.value,
        content: editingArtifactContent.value,
        metadata: {
          ...(artifact.metadata ?? {}),
          status: 'edited'
        }
      }
    })
    toast.add({ title: 'Artifact saved', icon: 'i-lucide-save', color: 'success', duration: 1400 })
    cancelEditingArtifact()
    await refreshMeetingState()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not save artifact', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    savingArtifactId.value = null
  }
}

async function updateMeetingStatus(status: 'live' | 'ended' | 'cancelled', targetMeeting = selectedMeeting.value) {
  if (!targetMeeting) return
  const meeting = targetMeeting
  if (status === 'live' && !meeting.zone_id) {
    toast.add({
      title: 'Assign a room first',
      description: 'Live meetings need a room so hosts and guests have somewhere to join.',
      icon: 'i-lucide-map-pin-off',
      color: 'warning',
      duration: 2200
    })
    return
  }
  updatingMeetingStatus.value = status
  try {
    const result = await $fetch<{ guestAccessExpired?: number, guestBadgesExpired?: number }>(`/api/office/${props.officeId}/meetings/${meeting.id}`, {
      method: 'PATCH',
      body: { status }
    })
    const guestAccessExpired = result.guestAccessExpired ?? 0
    const guestBadgesExpired = result.guestBadgesExpired ?? 0
    if (status === 'live' && meeting.zone_id) emit('enterOfficeZone', meeting.zone_id)
    toast.add({
      title: status === 'live' ? 'Meeting started' : status === 'ended' ? 'Meeting ended' : 'Meeting cancelled',
      description: guestAccessExpired
        ? `${guestAccessExpired} guest access pass${guestAccessExpired === 1 ? '' : 'es'} ended${guestBadgesExpired ? `, ${guestBadgesExpired} badge${guestBadgesExpired === 1 ? '' : 's'} expired` : ''}.`
        : undefined,
      icon: status === 'live' ? 'i-lucide-play' : status === 'ended' ? 'i-lucide-check' : 'i-lucide-x',
      color: status === 'cancelled' ? 'warning' : 'success',
      duration: 1400
    })
    await refreshMeetingState()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not update meeting', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    updatingMeetingStatus.value = null
  }
}

async function createFollowUpJob(artifact: OfficeMeetingArtifactRow) {
  if (!selectedMeeting.value) return
  creatingFollowUpForArtifactId.value = artifact.id

  try {
    const response = await $fetch<{ job: { id: string } }>(`/api/office/${props.officeId}/assistant/jobs`, {
      method: 'POST',
      body: {
        job_type: 'send_follow_up',
        title: `Follow up: ${selectedMeeting.value.title}`,
        input: {
          source: 'meeting_artifact',
          meeting_id: selectedMeeting.value.id,
          artifact_id: artifact.id,
          artifact_type: artifact.artifact_type,
          meeting_title: selectedMeeting.value.title,
          meeting_status: selectedMeeting.value.status,
          room: selectedMeeting.value.zone_name,
          content: artifact.content,
          guest_emails: selectedMeeting.value.guest_emails ?? [],
          participant_handles: selectedMeeting.value.participant_handles ?? []
        },
        approval_required: true
      }
    })
    toast.add({
      title: 'Follow-up queued',
      description: 'Approve it in the assistant panel to generate the draft.',
      icon: 'i-lucide-sparkles',
      color: 'success',
      duration: 1800
    })
    await Promise.all([refreshArtifacts(), refreshActionItems()])
    emit('openOfficeAssistant', response.job.id)
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not queue follow-up', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    creatingFollowUpForArtifactId.value = null
  }
}

function actionItemStatusClass(status: OfficeMeetingActionItemStatus) {
  if (status === 'done') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (status === 'in_progress') return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  if (status === 'dismissed') return 'bg-white/[0.035] text-white/35 ring-white/[0.05]'
  return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
}

function actionItemStatusLabel(status: OfficeMeetingActionItemStatus) {
  return status.replace('_', ' ')
}

function actionItemAssigneeLabel(item: OfficeMeetingActionItemRow) {
  if (!item.assignee_user_id) return 'Unassigned'
  return officeMembersByUserId.value.get(item.assignee_user_id)?.name ?? 'Assigned'
}

function actionItemTaskUrl(item: OfficeMeetingActionItemRow) {
  return item.task_id ? `/agency/tasks/${item.task_id}` : ''
}

function dateTimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}

async function updateActionItem(item: OfficeMeetingActionItemRow, body: Partial<{
  content: string
  status: OfficeMeetingActionItemStatus
  assignee_user_id: string | null
  due_at: string | null
  metadata: Record<string, unknown>
}>) {
  if (!selectedMeeting.value) return
  updatingActionItemId.value = item.id
  try {
    await $fetch(`/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/action-items/${item.id}`, {
      method: 'PATCH',
      body: {
        ...body,
        metadata: {
          ...(body.metadata ?? {}),
          updated_from: 'meeting_artifacts_panel',
          updated_at: new Date().toISOString()
        }
      }
    })
    await refreshActionItems()
    toast.add({
      title: body.status === 'done' ? 'Action marked done' : body.status === 'open' ? 'Action reopened' : 'Action updated',
      icon: body.status === 'done' ? 'i-lucide-check' : 'i-lucide-list-checks',
      color: 'success',
      duration: 1200
    })
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not update action item', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    updatingActionItemId.value = null
  }
}

async function updateActionItemStatus(item: OfficeMeetingActionItemRow, status: OfficeMeetingActionItemStatus) {
  await updateActionItem(item, { status })
}

async function updateActionItemAssignee(item: OfficeMeetingActionItemRow, value: string) {
  await updateActionItem(item, {
    assignee_user_id: value || null
  })
}

async function updateActionItemDueAt(item: OfficeMeetingActionItemRow, value: string) {
  await updateActionItem(item, {
    due_at: fromDateTimeLocal(value)
  })
}

async function createTaskFromActionItem(item: OfficeMeetingActionItemRow) {
  if (!selectedMeeting.value) return
  creatingTaskForActionItemId.value = item.id
  try {
    const response = await $fetch<{ task?: { id: string }, created: boolean }>(
      `/api/office/${props.officeId}/meetings/${selectedMeeting.value.id}/action-items/${item.id}/task`,
      {
        method: 'POST',
        body: {
          priority: 'medium',
          department_id: actionItemTaskDepartmentId.value || undefined
        }
      }
    )
    await refreshActionItems()
    toast.add({
      title: response.created ? 'Task created' : 'Task already linked',
      description: response.task?.id ? `Task ${response.task.id}` : undefined,
      icon: 'i-lucide-list-plus',
      color: 'success',
      duration: 1600
    })
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create task', description: message || 'Choose an assignee or department first.', color: 'error' })
  } finally {
    creatingTaskForActionItemId.value = null
  }
}

async function createAssistantJobFromActionItem(item: OfficeMeetingActionItemRow) {
  if (!selectedMeeting.value) return
  creatingAssistantForActionItemId.value = item.id
  try {
    const response = await $fetch<{ job: { id: string } }>(`/api/office/${props.officeId}/assistant/jobs`, {
      method: 'POST',
      body: {
        job_type: 'send_follow_up',
        title: `Follow up: ${item.content.slice(0, 120)}`,
        input: {
          source: 'meeting_action_item',
          meeting_id: selectedMeeting.value.id,
          action_item_id: item.id,
          artifact_id: item.source_artifact_id,
          meeting_title: selectedMeeting.value.title,
          meeting_status: selectedMeeting.value.status,
          room: selectedMeeting.value.zone_name,
          content: `- ${item.content}`,
          guest_emails: selectedMeeting.value.guest_emails ?? [],
          participant_handles: selectedMeeting.value.participant_handles ?? []
        },
        approval_required: true
      }
    })
    await refreshActionItems()
    toast.add({
      title: 'Assistant follow-up queued',
      description: 'Approve it in the assistant panel to generate the draft.',
      icon: 'i-lucide-sparkles',
      color: 'success',
      duration: 1600
    })
    emit('openOfficeAssistant', response.job.id)
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not queue assistant follow-up', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    creatingAssistantForActionItemId.value = null
  }
}

function resetForm() {
  const preferredZoneId = props.initialZoneId && meetingZones.value.some(zone => zone.id === props.initialZoneId)
    ? props.initialZoneId
    : null
  zoneId.value = preferredZoneId ?? meetingZones.value[0]?.id ?? null
  const zone = meetingZones.value.find(item => item.id === zoneId.value)
  title.value = zone ? `${zone.name} meeting` : 'Office meeting'
  meetingType.value = 'general'
  context.value = ''
  intakePrompt.value = meetingTypeDefaults.general.intakePrompt
  intakePromptTouched.value = false
  guestEmails.value = ''
  guestEmailsTouched.value = false
  titleTouched.value = false
  scheduledStartAt.value = ''
  durationMinutes.value = 30
  durationTouched.value = false
  aiNotes.value = aiNotesAllowed.value
  recording.value = false
  retentionDays.value = settings.value?.default_meeting_retention_days ?? 90
  retentionTouched.value = false
}

async function createSession(startNow = false, sendInvitesAfterCreate = false) {
  if (!title.value.trim()) {
    titleTouched.value = true
    toast.add({ title: 'Meeting title required', color: 'error' })
    return
  }
  if ((startNow || sendInvitesAfterCreate) && !zoneId.value) {
    toast.add({
      title: 'Choose a room first',
      description: sendInvitesAfterCreate
        ? 'Guest invites need a room so guests know where they will be admitted.'
        : 'Live meetings need a room so the host can enter immediately.',
      icon: 'i-lucide-map-pin-off',
      color: 'warning',
      duration: 2200
    })
    return
  }
  if (sendInvitesAfterCreate && !parsedGuestEmails.value.length) {
    guestEmailsTouched.value = true
    toast.add({
      title: 'Add guests first',
      description: 'Email invites need at least one external guest.',
      icon: 'i-lucide-user-round-plus',
      color: 'warning',
      duration: 2200
    })
    return
  }
  durationTouched.value = true
  retentionTouched.value = true
  if (invalidGuestEmails.value.length) {
    guestEmailsTouched.value = true
    toast.add({
      title: 'Check guest emails',
      description: invalidGuestEmails.value.join(', '),
      color: 'error'
    })
    return
  }

  saving.value = true
  const draft = {
    zoneId: zoneId.value,
    title: title.value,
    scheduledStartAt: scheduledStartAt.value,
    durationMinutes: durationMinutes.value,
    guests: [...parsedGuestEmails.value],
    context: context.value
  }
  try {
    const result = await $fetch<{ session: OfficeMeetingSessionRow }>(`/api/office/${props.officeId}/meetings`, {
      method: 'POST',
      body: {
        zone_id: zoneId.value,
        source: scheduledStartAt.value ? 'scheduled' : 'drop_in',
        status: startNow ? 'live' : 'planned',
        title: title.value,
        meeting_type: meetingType.value,
        context: context.value,
        intake_prompt: intakePrompt.value || null,
        scheduled_start_at: scheduledStartAt.value ? new Date(scheduledStartAt.value).toISOString() : null,
        duration_minutes: durationMinutes.value,
        guest_emails: parsedGuestEmails.value,
        consent: {
          ai_notes: aiNotes.value,
          recording: recording.value,
          transcript: aiNotes.value || recording.value
        },
        retention_days: retentionDays.value,
        started_at: startNow ? new Date().toISOString() : null
      }
    })
    toast.add({
      title: startNow ? 'Meeting started' : 'Meeting set up',
      icon: startNow ? 'i-lucide-play' : 'i-lucide-calendar-plus',
      color: 'success',
      duration: 1600
    })
    const createdZoneId = zoneId.value
    resetForm()
    await refresh()
    selectedMeetingId.value = result.session.id
    lastCreatedMeetingId.value = result.session.id
    await Promise.all([refreshArtifacts(), refreshActionItems()])
    if (sendInvitesAfterCreate) {
      try {
        const response = await $fetch<{ invited: number, invitedAt: string }>(`/api/office/${props.officeId}/meetings/${result.session.id}/invite`, {
          method: 'POST',
          body: {
            invite_url: draftMeetingInviteUrl(result.session.id, draft),
            recipients: draft.guests,
            note: draft.context
          }
        })
        toast.add({
          title: 'Guest invites sent',
          description: `${response.invited} guest${response.invited === 1 ? '' : 's'} emailed.`,
          icon: 'i-lucide-mail-check',
          color: 'success',
          duration: 1600
        })
        await refresh()
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
          : undefined
        toast.add({
          title: 'Meeting set up, invites not sent',
          description: message || 'Open the meeting and send invites manually.',
          icon: 'i-lucide-mail-warning',
          color: 'warning',
          duration: 3600
        })
      }
    }
    if (startNow && createdZoneId) {
      emit('enterOfficeZone', createdZoneId)
    }
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create meeting session', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function refreshLobbyState() {
  await Promise.all([
    refreshPendingLobbyRequests(),
    refreshAcceptedLobbyRequests()
  ])
}

async function refreshMeetingState() {
  refreshingMeetingState.value = true
  try {
    await Promise.all([
      refresh(),
      refreshArtifacts(),
      refreshActionItems(),
      refreshLobbyState()
    ])
  } finally {
    refreshingMeetingState.value = false
  }
}

function stopLobbyStatePolling() {
  if (!lobbyStateTimer) return
  clearInterval(lobbyStateTimer)
  lobbyStateTimer = null
}

function startLobbyStatePolling() {
  if (lobbyStateTimer) return
  void refreshLobbyState()
  lobbyStateTimer = setInterval(() => {
    void refreshLobbyState()
  }, 15_000)
}

watch(open, (isOpen) => {
  if (isOpen && !zoneId.value) resetForm()
  if (isOpen) {
    startLobbyStatePolling()
  } else {
    stopLobbyStatePolling()
  }
}, { immediate: true })

watch(() => props.initialZoneId, (nextZoneId) => {
  if (!nextZoneId || !meetingZones.value.some(zone => zone.id === nextZoneId)) return
  zoneId.value = nextZoneId
  const zone = meetingZones.value.find(item => item.id === nextZoneId)
  if (zone && !titleTouched.value) title.value = `${zone.name} meeting`
})

watch(zoneId, (nextZoneId, previousZoneId) => {
  if (!nextZoneId || nextZoneId === previousZoneId || titleTouched.value) return
  const zone = meetingZones.value.find(item => item.id === nextZoneId)
  if (zone) title.value = `${zone.name} meeting`
})

watch(meetingType, (nextType) => {
  const defaults = meetingTypeDefaults[nextType]
  if (!durationTouched.value) durationMinutes.value = defaults.durationMinutes
  if (!intakePromptTouched.value) intakePrompt.value = defaults.intakePrompt
})

watch(noteArtifactType, (nextType) => {
  const previousDefaults = ['Live notes', 'Meeting summary', 'Action items', 'Transcript notes']
  if (!noteArtifactTitle.value || previousDefaults.includes(noteArtifactTitle.value)) {
    noteArtifactTitle.value = defaultNoteArtifactTitle(nextType)
  }
})

watch(settings, () => {
  if (!aiNotesAllowed.value) aiNotes.value = false
  if (!recordingAllowed.value) recording.value = false
  retentionDays.value = settings.value?.default_meeting_retention_days ?? retentionDays.value
})

watch(meetings, (rows) => {
  if (!selectedMeetingId.value && rows[0]) selectedMeetingId.value = rows[0].id
}, { immediate: true })

watch(() => props.refreshKey, async () => {
  await refresh()
  if (!props.targetMeetingId && meetings.value[0]) {
    selectedMeetingId.value = meetings.value[0].id
  }
  await Promise.all([refreshArtifacts(), refreshActionItems()])
})

watch(() => props.targetMeetingId, async (meetingId) => {
  if (!meetingId) return
  if (!meetings.value.some(meeting => meeting.id === meetingId)) {
    await refresh()
  }
  selectedMeetingId.value = meetingId
  await Promise.all([refreshArtifacts(), refreshActionItems()])
}, { immediate: true })

function isTargetArtifact(artifact: OfficeMeetingArtifactRow) {
  return Boolean(focusedArtifactId.value && artifact.id === focusedArtifactId.value)
}

function selectorEscape(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}

function scrollToArtifact(artifactId: string) {
  nextTick(() => {
    document.querySelector(`[data-office-artifact-id="${selectorEscape(artifactId)}"]`)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    })
  })
}

function scrollToActionItem(actionItemId: string) {
  nextTick(() => {
    document.querySelector(`[data-office-action-item-id="${selectorEscape(actionItemId)}"]`)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    })
  })
}

watch(() => [props.targetArtifactId, props.targetActionItemId, props.targetFocusKey] as const, ([artifactId, actionItemId, focusKey]) => {
  if (
    (artifactId || actionItemId)
    && artifactId === lastFocusedArtifactId.value
    && actionItemId === lastFocusedActionItemId.value
    && focusKey === lastHandledFocusKey.value
  ) return

  lastFocusedArtifactId.value = artifactId ?? null
  lastFocusedActionItemId.value = actionItemId ?? null
  lastHandledFocusKey.value = focusKey
  if (focusedArtifactTimer) clearTimeout(focusedArtifactTimer)
  focusedArtifactId.value = artifactId ?? null
  focusedActionItemId.value = actionItemId ?? null
  focusedArtifactScrolled.value = false
  if (actionItemId) {
    scrollToActionItem(actionItemId)
  } else if (artifactId) {
    scrollToArtifact(artifactId)
  }
  if (artifactId || actionItemId) {
    focusedArtifactTimer = setTimeout(() => {
      focusedArtifactId.value = null
      focusedActionItemId.value = null
      focusedArtifactScrolled.value = false
      focusedArtifactTimer = null
    }, 5000)
  }
}, { immediate: true })

watch(selectedArtifacts, (artifacts) => {
  if (
    focusedArtifactId.value
    && !focusedActionItemId.value
    && !focusedArtifactScrolled.value
    && artifacts.some(artifact => artifact.id === focusedArtifactId.value)
  ) {
    focusedArtifactScrolled.value = true
    scrollToArtifact(focusedArtifactId.value)
  }
})

watch(selectedActionItems, (items) => {
  if (
    focusedActionItemId.value
    && !focusedArtifactScrolled.value
    && items.some(item => item.id === focusedActionItemId.value)
  ) {
    focusedArtifactScrolled.value = true
    scrollToActionItem(focusedActionItemId.value)
  }
})

watch(
  () => acceptedLobbyRequests.value.length,
  (count) => {
    if (count > 0 && !accessClockTimer) {
      accessClockMs.value = Date.now()
      accessClockTimer = setInterval(() => {
        accessClockMs.value = Date.now()
      }, 30_000)
    } else if (count === 0 && accessClockTimer) {
      clearInterval(accessClockTimer)
      accessClockTimer = null
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (focusedArtifactTimer) clearTimeout(focusedArtifactTimer)
  if (accessClockTimer) clearInterval(accessClockTimer)
  stopLobbyStatePolling()
  focusedArtifactTimer = null
  accessClockTimer = null
  focusedArtifactId.value = null
  focusedActionItemId.value = null
  focusedArtifactScrolled.value = false
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
          <UIcon name="i-lucide-calendar-plus" class="size-3.5 text-sky-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Set up meeting</span>
          <span class="block truncate text-xs text-white/40">Create a room session, then attach notes and recordings</span>
        </span>
      </span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-white/45" />
    </button>

    <div
      v-if="open"
      class="grid gap-3 border-t border-white/[0.06] p-3 lg:grid-cols-[360px_minmax(0,1fr)]"
    >
      <form class="space-y-2" @submit.prevent="createSession(false)">
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Meeting title</label>
          <input
            v-model="title"
            placeholder="Client review meeting"
            class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            :class="titleError ? 'border-red-300/35' : 'border-white/[0.08]'"
            @blur="titleTouched = true"
          >
          <p
            v-if="titleError"
            class="mt-1 text-[11px] text-red-200/75"
          >
            {{ titleError }}
          </p>
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Meeting type</label>
          <select
            v-model="meetingType"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option
              v-for="option in meetingTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <div class="mt-2 rounded-md bg-white/[0.035] p-2 ring-1 ring-white/[0.05]">
            <div class="flex items-start gap-2">
              <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-400/10 ring-1 ring-sky-300/15">
                <UIcon :name="selectedMeetingTypeDefaults.icon" class="size-3.5 text-sky-200" />
              </span>
              <div class="min-w-0">
                <p class="text-[11px] font-medium leading-4 text-white/65">
                  {{ selectedMeetingTypeDefaults.detail }}
                </p>
                <p class="mt-1 text-[10px] text-white/35">
                  Preset duration {{ selectedMeetingTypeDefaults.durationMinutes }} min
                  <span v-if="selectedMeetingTypeDefaults.intakePrompt"> · guest intake ready</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Room</label>
          <select
            v-model="zoneId"
            class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option :value="null">
              No room
            </option>
            <option
              v-for="zone in meetingZones"
              :key="zone.id"
              :value="zone.id"
            >
              {{ zone.name }}
            </option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="mb-1 block text-[11px] font-medium text-white/45">Start time</label>
            <input
              v-model="scheduledStartAt"
              type="datetime-local"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            >
          </div>
          <div>
            <label class="mb-1 block text-[11px] font-medium text-white/45">Duration</label>
            <input
              v-model.number="durationMinutes"
              type="number"
              min="15"
              max="480"
              step="15"
              class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
              :class="durationError ? 'border-red-300/35' : 'border-white/[0.08]'"
              @blur="durationTouched = true"
            >
            <p
              v-if="durationError"
              class="mt-1 text-[11px] text-red-200/75"
            >
              {{ durationError }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 rounded-md bg-white/[0.035] px-2.5 py-2 text-xs text-white/65 ring-1 ring-white/[0.05]">
            <input
              v-model="aiNotes"
              type="checkbox"
              class="size-3.5 accent-sky-400"
              :disabled="!aiNotesAllowed"
            >
            AI notes
          </label>
          <label class="flex items-center gap-2 rounded-md bg-white/[0.035] px-2.5 py-2 text-xs text-white/65 ring-1 ring-white/[0.05]">
            <input
              v-model="recording"
              type="checkbox"
              class="size-3.5 accent-sky-400"
              :disabled="!recordingAllowed"
            >
            Recording
          </label>
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">External guests</label>
          <input
            v-model="guestEmails"
            placeholder="client@example.com, stakeholder@example.com"
            class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            :class="guestEmailsError ? 'border-red-300/35' : 'border-white/[0.08]'"
            @blur="guestEmailsTouched = true"
          >
          <p
            v-if="guestEmailsError"
            class="mt-1 text-[11px] text-red-200/75"
          >
            {{ guestEmailsError }}
          </p>
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Context</label>
          <textarea
            v-model="context"
            rows="3"
            :placeholder="selectedMeetingTypeDefaults.contextPlaceholder"
            class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          />
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Guest intake prompt</label>
          <textarea
            v-model="intakePrompt"
            rows="2"
            maxlength="280"
            placeholder="Question guests must answer before joining, e.g. What should we review first?"
            class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            @input="intakePromptTouched = true"
          />
          <p class="mt-1 text-[11px] text-white/35">
            Shown on the guest lobby form for this meeting invite.
          </p>
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-white/45">Retention days</label>
          <input
            v-model.number="retentionDays"
            type="number"
            min="1"
            max="3650"
            class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
            :class="retentionError ? 'border-red-300/35' : 'border-white/[0.08]'"
            placeholder="Retention days"
            @blur="retentionTouched = true"
          >
          <p
            v-if="retentionError"
            class="mt-1 text-[11px] text-red-200/75"
          >
            {{ retentionError }}
          </p>
        </div>
        <div class="rounded-lg bg-white/[0.025] p-2.5 ring-1 ring-white/[0.05]">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              <UIcon name="i-lucide-clipboard-check" class="size-3.5 text-sky-300/80" />
              Setup readiness
            </div>
            <span class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/40 ring-1 ring-white/[0.05]">
              {{ meetingTypeOptions.find(option => option.value === meetingType)?.label }}
            </span>
          </div>
          <div class="grid gap-1.5 sm:grid-cols-2">
            <div
              v-for="item in draftMeetingReadinessItems"
              :key="item.key"
              class="min-w-0 rounded-md px-2 py-1.5 ring-1"
              :class="readinessPillClass(item.state)"
            >
              <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                <span class="truncate">{{ item.label }}</span>
              </div>
              <p class="mt-0.5 truncate text-[10px] opacity-70">
                {{ item.detail }}
              </p>
            </div>
          </div>
        </div>
        <button
          type="submit"
          class="h-9 w-full rounded-md bg-sky-400/15 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
          :disabled="saving || !canCreateSession"
        >
          Set up meeting
        </button>
        <button
          type="button"
          class="h-9 w-full rounded-md bg-white/[0.04] text-xs font-semibold text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="saving || !canCreateSession || !zoneId || !parsedGuestEmails.length"
          @click="createSession(false, true)"
        >
          Set up and email guests
        </button>
        <button
          type="button"
          class="h-9 w-full rounded-md bg-emerald-400/12 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="saving || !canCreateSession || !zoneId"
          @click="createSession(true)"
        >
          Start now and enter room
        </button>
      </form>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
            Active and upcoming
          </h3>
          <div class="flex items-center gap-1.5 text-[11px] text-white/30">
            <span v-if="liveMeetingCount" class="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-emerald-100 ring-1 ring-emerald-300/15">
              {{ liveMeetingCount }} live
            </span>
            <span v-if="plannedMeetingCount" class="rounded-md bg-sky-400/10 px-1.5 py-0.5 text-sky-100 ring-1 ring-sky-300/15">
              {{ plannedMeetingCount }} planned
            </span>
            <span v-if="externalMeetingCount" class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-white/50 ring-1 ring-white/[0.05]">
              {{ externalMeetingCount }} external
            </span>
            <span>{{ meetings.length }} total</span>
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
                Could not load meetings
              </div>
              <div class="mt-1 text-xs text-red-50/55">
                Meeting setup and artifacts are temporarily unavailable.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
              @click="refresh"
            >
              Retry
            </button>
          </div>
        </div>
        <div
          v-else-if="!meetings.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-calendar-plus" class="mt-0.5 size-4 text-sky-300/80" />
            <div>
              <div class="font-medium text-white/70">
                No meeting sessions yet.
              </div>
              <p class="mt-1 text-xs leading-5 text-white/40">
                Set up a planned room session to generate notes, action items, guest links, and follow-up drafts.
              </p>
            </div>
          </div>
        </div>
        <div
          v-for="meeting in meetings.slice(0, 6)"
          :key="meeting.id"
          class="w-full rounded-lg px-3 py-2 text-left ring-1 transition"
          :class="selectedMeeting?.id === meeting.id
            ? 'bg-sky-400/10 ring-sky-300/20'
            : 'bg-white/[0.035] ring-white/[0.05] hover:bg-white/[0.055]'"
          role="button"
          tabindex="0"
          @click="selectMeeting(meeting.id)"
          @keydown.enter.prevent="selectMeeting(meeting.id)"
          @keydown.space.prevent="selectMeeting(meeting.id)"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="truncate text-sm font-medium">{{ meeting.title }}</span>
            <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] capitalize text-white/45">{{ meeting.status }}</span>
          </div>
          <div class="mt-0.5 truncate text-xs text-white/40">
            {{ meeting.zone_name || 'Office' }} · {{ setupLabel(meeting) }} · retention {{ meeting.retention_days || 'default' }} days
          </div>
          <div class="mt-1 flex items-center gap-1.5 text-[11px] text-white/35">
            <UIcon name="i-lucide-clock-3" class="size-3" />
            <span class="truncate">{{ setupScheduleLabel(meeting) }}</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5 text-[11px] text-white/35">
            <UIcon name="i-lucide-user-round-plus" class="size-3" />
            <span class="truncate">{{ attendeeLabel(meeting) }}</span>
          </div>
          <div
            v-if="inviteDeliveryLabel(meeting)"
            class="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-100/65"
            :title="inviteDeliveryTitle(meeting)"
          >
            <UIcon name="i-lucide-mail-check" class="size-3" />
            <span class="truncate">{{ inviteDeliveryLabel(meeting) }}</span>
          </div>
          <div
            v-if="pendingLobbyLabel(meeting)"
            class="mt-1 flex items-center gap-1.5 text-[11px] text-amber-100/75"
          >
            <UIcon name="i-lucide-user-round-check" class="size-3" />
            <span class="truncate">{{ pendingLobbyLabel(meeting) }}</span>
          </div>
          <div
            v-if="acceptedLobbyLabel(meeting)"
            class="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-100/70"
          >
            <UIcon name="i-lucide-door-open" class="size-3" />
            <span class="truncate">{{ acceptedLobbyLabel(meeting) }}</span>
          </div>
          <div
            v-if="meetingRecordingLabel(meeting)"
            class="mt-1 flex items-center gap-1.5 text-[11px]"
            :class="meeting.ready_recording_count ? 'text-emerald-100/70' : 'text-violet-100/65'"
          >
            <UIcon name="i-lucide-monitor-up" class="size-3" />
            <span class="truncate">{{ meetingRecordingLabel(meeting) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="label in artifactTypeLabels(meeting)"
              :key="label"
              class="rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-100 ring-1 ring-sky-300/15"
            >
              {{ label }}
            </span>
            <span
              v-if="!meeting.artifact_count"
              class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/35 ring-1 ring-white/[0.05]"
            >
              No artifacts yet
            </span>
          </div>
          <div
            v-if="meeting.status === 'planned'"
            class="mt-2 flex flex-wrap gap-1.5 border-t border-white/[0.05] pt-2"
          >
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
              :disabled="meetingGuestInviteNeedsRoom(meeting)"
              :title="meetingGuestInviteTitle(meeting, 'Copy meeting invite')"
              @click.stop="copyMeetingInvite(meeting)"
            >
              <UIcon name="i-lucide-link" class="size-3" />
              Invite
            </button>
            <button
              v-if="meeting.guest_emails?.length"
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-wait disabled:opacity-60"
              :disabled="sendingInvitesForMeetingId === meeting.id || !meeting.zone_id"
              :title="meeting.zone_id ? 'Email guest invites' : 'Assign a room before emailing guests'"
              @click.stop="sendMeetingInvites(meeting)"
            >
              <UIcon
                :name="sendingInvitesForMeetingId === meeting.id ? 'i-lucide-loader-2' : 'i-lucide-mail'"
                class="size-3"
                :class="sendingInvitesForMeetingId === meeting.id ? 'animate-spin' : ''"
              />
              Email
            </button>
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
              :disabled="meetingGuestInviteNeedsRoom(meeting)"
              :title="meetingGuestInviteTitle(meeting, 'Download calendar invite')"
              @click.stop="downloadCalendarInvite(meeting)"
            >
              <UIcon name="i-lucide-calendar-plus" class="size-3" />
              Calendar
            </button>
            <button
              v-if="meeting.zone_id"
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
              @click.stop="selectMeeting(meeting.id); enterMeetingRoom(meeting)"
            >
              <UIcon name="i-lucide-map-pin" class="size-3" />
              Enter
            </button>
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
              :disabled="updatingMeetingStatus === 'live' || !meeting.zone_id"
              :title="meeting.zone_id ? 'Start meeting' : 'Assign a room before starting'"
              @click.stop="selectMeeting(meeting.id); updateMeetingStatus('live', meeting)"
            >
              <UIcon name="i-lucide-play" class="size-3" />
              Start
            </button>
          </div>
        </div>

        <div
          v-if="selectedMeeting"
          class="mt-3 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.05]"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h4 class="truncate text-sm font-semibold text-white">
                {{ selectedMeeting.title }}
              </h4>
              <p class="mt-0.5 truncate text-xs text-white/40">
                {{ selectedMeeting.zone_name || 'Office' }} · {{ artifactTypeLabels(selectedMeeting).length }} artifact types
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium capitalize text-white/45 ring-1 ring-white/[0.05]">
                  <UIcon name="i-lucide-circle-dot" class="size-3" />
                  {{ statusLabel(selectedMeeting) }}
                </span>
                <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium capitalize text-white/45 ring-1 ring-white/[0.05]">
                  <UIcon name="i-lucide-tag" class="size-3" />
                  {{ setupLabel(selectedMeeting) }}
                </span>
                <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.05]">
                  <UIcon name="i-lucide-user-round-plus" class="size-3" />
                  {{ attendeeLabel(selectedMeeting) }}
                </span>
                <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.05]">
                  <UIcon name="i-lucide-clock-3" class="size-3" />
                  {{ setupScheduleLabel(selectedMeeting) }}
                </span>
                <span class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.05]">
                  <UIcon name="i-lucide-archive" class="size-3" />
                  {{ retentionLabel(selectedMeeting) }}
                </span>
                <span
                  v-if="inviteDeliveryLabel(selectedMeeting)"
                  class="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100/70 ring-1 ring-emerald-300/15"
                  :title="inviteDeliveryTitle(selectedMeeting)"
                >
                  <UIcon name="i-lucide-mail-check" class="size-3" />
                  {{ inviteDeliveryLabel(selectedMeeting) }}
                </span>
                <span
                  v-if="pendingLobbyLabel(selectedMeeting)"
                  class="inline-flex items-center gap-1 rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100/80 ring-1 ring-amber-200/15"
                >
                  <UIcon name="i-lucide-user-round-check" class="size-3" />
                  {{ pendingLobbyLabel(selectedMeeting) }}
                </span>
                <span
                  v-if="acceptedLobbyLabel(selectedMeeting)"
                  class="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100/75 ring-1 ring-emerald-300/15"
                >
                  <UIcon name="i-lucide-door-open" class="size-3" />
                  {{ acceptedLobbyLabel(selectedMeeting) }}
                </span>
                <span
                  v-if="meetingRecordingLabel(selectedMeeting)"
                  class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1"
                  :class="selectedMeeting.ready_recording_count
                    ? 'bg-emerald-400/10 text-emerald-100/75 ring-emerald-300/15'
                    : 'bg-violet-400/10 text-violet-100/70 ring-violet-300/15'"
                >
                  <UIcon name="i-lucide-monitor-up" class="size-3" />
                  {{ meetingRecordingLabel(selectedMeeting) }}
                </span>
              </div>
              <div
                v-if="inviteDeliveryRecipients(selectedMeeting).length"
                class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-white/40"
              >
                <UIcon name="i-lucide-mail-check" class="size-3 text-emerald-200/70" />
                <span>Sent to</span>
                <span
                  v-for="recipient in inviteDeliveryRecipients(selectedMeeting).slice(0, 4)"
                  :key="recipient"
                  class="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-white/55 ring-1 ring-white/[0.06]"
                >
                  {{ recipient }}
                </span>
                <span
                  v-if="inviteDeliveryRecipients(selectedMeeting).length > 4"
                  class="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-white/45 ring-1 ring-white/[0.06]"
                >
                  +{{ inviteDeliveryRecipients(selectedMeeting).length - 4 }} more
                </span>
              </div>
              <div
                v-if="hostNextSteps(selectedMeeting).length"
                class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
              >
                <button
                  v-for="step in hostNextSteps(selectedMeeting)"
                  :key="step.key"
                  type="button"
                  class="min-w-0 rounded-lg px-2.5 py-2 text-left ring-1 transition disabled:cursor-wait disabled:opacity-60"
                  :class="hostNextStepClass(step.tone)"
                  :disabled="(step.action === 'send_invites' && sendingInvitesForMeetingId === selectedMeeting.id) || (step.action === 'start_meeting' && updatingMeetingStatus === 'live') || (step.action === 'closeout' && updatingMeetingStatus === 'ended')"
                  @click="handleHostNextStep(selectedMeeting, step.action)"
                >
                  <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                    <UIcon
                      :name="step.action === 'send_invites' && sendingInvitesForMeetingId === selectedMeeting.id ? 'i-lucide-loader-2' : step.icon"
                      class="size-3.5 shrink-0"
                      :class="step.action === 'send_invites' && sendingInvitesForMeetingId === selectedMeeting.id ? 'animate-spin' : ''"
                    />
                    <span class="truncate">{{ step.label }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-[10px] leading-4 opacity-70">
                    {{ step.detail }}
                  </p>
                </button>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="!editingMeetingDetails && selectedMeeting.status === 'planned'"
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                @click="startEditingMeetingDetails(selectedMeeting)"
              >
                Edit
              </button>
              <button
                v-if="selectedMeeting.guest_emails?.length"
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                @click="copyGuestEmails(selectedMeeting)"
              >
                Guests
              </button>
              <button
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                :disabled="openingMeetingThreadId === selectedMeeting.id"
                @click="openMeetingThread(selectedMeeting)"
              >
                {{ openingMeetingThreadId === selectedMeeting.id ? 'Opening' : 'Thread' }}
              </button>
              <button
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                :disabled="meetingGuestInviteNeedsRoom(selectedMeeting)"
                :title="meetingGuestInviteTitle(selectedMeeting, 'Copy meeting invite')"
                @click="copyMeetingInvite(selectedMeeting)"
              >
                Invite
              </button>
              <button
                v-if="selectedMeeting.guest_emails?.length"
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75 disabled:cursor-wait disabled:opacity-60"
                :disabled="sendingInvitesForMeetingId === selectedMeeting.id || !selectedMeeting.zone_id"
                :title="selectedMeeting.zone_id ? 'Email guest invites' : 'Assign a room before emailing guests'"
                @click="sendMeetingInvites(selectedMeeting)"
              >
                {{ sendingInvitesForMeetingId === selectedMeeting.id ? 'Sending' : 'Email' }}
              </button>
              <button
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                :disabled="meetingGuestInviteNeedsRoom(selectedMeeting)"
                :title="meetingGuestInviteTitle(selectedMeeting, 'Download calendar invite')"
                @click="downloadCalendarInvite(selectedMeeting)"
              >
                Calendar
              </button>
              <button
                v-if="selectedMeeting.zone_id"
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                @click="enterMeetingRoom(selectedMeeting)"
              >
                Enter
              </button>
              <button
                v-if="selectedMeeting.status === 'planned'"
                type="button"
                class="rounded-md bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingMeetingStatus === 'live' || !selectedMeeting.zone_id"
                :title="selectedMeeting.zone_id ? 'Start meeting' : 'Assign a room before starting'"
                @click="updateMeetingStatus('live', selectedMeeting)"
              >
                Start
              </button>
              <button
                v-if="selectedMeeting.status === 'live'"
                type="button"
                class="rounded-md bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-sky-300/15 transition hover:bg-sky-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingMeetingStatus === 'ended'"
                @click="updateMeetingStatus('ended', selectedMeeting)"
              >
                {{ meetingCloseoutLabel(selectedMeeting, 'ended') }}
              </button>
              <button
                v-if="selectedMeeting.status === 'planned'"
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingMeetingStatus === 'cancelled'"
                @click="updateMeetingStatus('cancelled', selectedMeeting)"
              >
                {{ meetingCloseoutLabel(selectedMeeting, 'cancelled') }}
              </button>
              <button
                type="button"
                class="rounded-md bg-white/[0.04] p-1.5 text-white/45 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/75"
                aria-label="Refresh meeting state"
                :disabled="refreshingMeetingState"
                @click="refreshMeetingState()"
              >
                <UIcon name="i-lucide-refresh-cw" class="size-3.5" :class="artifactsPending || refreshingMeetingState ? 'animate-spin' : ''" />
              </button>
            </div>
          </div>

          <div
            v-if="selectedMeeting.status === 'planned' || selectedMeeting.id === lastCreatedMeetingId"
            class="mb-3 rounded-lg bg-white/[0.025] p-2.5 ring-1 ring-white/[0.05]"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-white/80">
                  Meeting readiness
                </div>
                <p class="mt-0.5 truncate text-[11px] text-white/38">
                  Confirm the room, guests, invite delivery, and capture settings before the session starts.
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  v-if="!selectedMeeting.zone_id && selectedMeeting.status === 'planned'"
                  type="button"
                  class="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-300/10 px-2 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-200/15 transition hover:bg-amber-300/15"
                  @click="startEditingMeetingDetails(selectedMeeting, true)"
                >
                  <UIcon name="i-lucide-map-pin-plus" class="size-3" />
                  Assign room
                </button>
                <button
                  v-if="selectedMeeting.id === lastCreatedMeetingId"
                  type="button"
                  class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/70"
                  aria-label="Dismiss meeting readiness highlight"
                  @click="lastCreatedMeetingId = null"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>
            </div>
            <div class="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
              <div
                v-for="item in meetingReadinessItems(selectedMeeting)"
                :key="item.key"
                class="min-w-0 rounded-md px-2 py-2 ring-1"
                :class="readinessPillClass(item.state)"
              >
                <div class="flex items-center gap-1.5">
                  <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                  <span class="truncate text-[11px] font-semibold">{{ item.label }}</span>
                </div>
                <p class="mt-1 line-clamp-2 text-[10px] leading-4 opacity-70">
                  {{ item.detail }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="selectedMeeting.guest_emails?.length"
            class="mb-3 flex flex-wrap gap-1.5 rounded-lg bg-white/[0.025] p-2 ring-1 ring-white/[0.05]"
          >
            <span
              v-for="guest in selectedMeeting.guest_emails"
              :key="guest"
              class="max-w-full truncate rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
            >
              {{ guest }}
            </span>
          </div>

          <div
            v-if="pendingLobbyGuests(selectedMeeting).length"
            data-office-lobby-requests
            class="mb-3 rounded-lg bg-amber-300/[0.045] p-2 ring-1 ring-amber-200/10"
          >
            <div class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100/55">
              <UIcon name="i-lucide-door-open" class="size-3.5" />
              Waiting in lobby
            </div>
            <div class="grid gap-2 md:grid-cols-2">
              <div
                v-for="request in pendingLobbyGuests(selectedMeeting)"
                :key="request.id"
                class="min-w-0 rounded-md bg-amber-200/10 p-2 text-[10px] font-medium text-amber-50/80 ring-1 ring-amber-100/10"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-semibold text-amber-50/90">
                      {{ request.guest_name }}
                    </div>
                    <div class="mt-0.5 truncate text-[11px] text-amber-50/45">
                      {{ request.guest_email }}
                    </div>
                    <span
                      v-if="lobbyRequestParsed(request).source === 'embed'"
                      class="mt-1 inline-flex items-center gap-1 rounded bg-amber-100/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-50/55 ring-1 ring-amber-100/10"
                    >
                      <UIcon name="i-lucide-code-2" class="size-3" />
                      Embed
                    </span>
                  </div>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <template v-if="canHandleLobbyRequests">
                      <button
                        type="button"
                        class="rounded bg-emerald-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 transition hover:bg-emerald-300/25 disabled:cursor-wait disabled:opacity-60"
                        :disabled="Boolean(handlingLobbyRequestId) || !selectedMeeting.zone_id"
                        :title="selectedMeeting.zone_id ? 'Accept guest and enter room' : 'Assign a room before accepting guests'"
                        @click="handleLobbyRequest(request, 'accepted')"
                      >
                        {{ handlingLobbyRequestId === request.id ? 'Accepting' : 'Accept & enter' }}
                      </button>
                      <button
                        v-if="!selectedMeeting.zone_id"
                        type="button"
                        class="rounded bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-300/15"
                        @click="startEditingMeetingDetails(selectedMeeting, true)"
                      >
                        Assign room
                      </button>
                      <button
                        type="button"
                        class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/[0.1] hover:text-white/75 disabled:cursor-wait disabled:opacity-60"
                        :disabled="Boolean(handlingLobbyRequestId)"
                        @click="handleLobbyRequest(request, 'declined')"
                      >
                        Decline
                      </button>
                    </template>
                  </div>
                </div>
                <p
                  v-if="lobbyRequestNote(request)"
                  class="mt-2 line-clamp-2 whitespace-pre-line text-[11px] leading-4 text-amber-50/55"
                >
                  {{ lobbyRequestNote(request) }}
                </p>
                <div
                  v-if="lobbyRequestIntakeAnswers(request).length"
                  class="mt-2 space-y-1 rounded bg-black/10 p-1.5 ring-1 ring-amber-100/10"
                >
                  <div
                    v-for="answer in lobbyRequestIntakeAnswers(request).slice(0, 2)"
                    :key="answer.label"
                  >
                    <div class="truncate text-[10px] text-amber-50/40">
                      {{ answer.label }}
                    </div>
                    <p class="mt-0.5 line-clamp-2 whitespace-pre-line text-[11px] leading-4 text-amber-50/75">
                      {{ answer.value || 'No answer' }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="acceptedLobbyGuests(selectedMeeting).length"
            class="mb-3 rounded-lg bg-emerald-300/[0.045] p-2 ring-1 ring-emerald-200/10"
          >
            <div class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100/55">
              <UIcon name="i-lucide-door-open" class="size-3.5" />
              Accepted guests
            </div>
            <div class="grid gap-2 md:grid-cols-2">
              <div
                v-for="request in acceptedLobbyGuests(selectedMeeting)"
                :key="request.id"
                class="min-w-0 rounded-md bg-emerald-200/10 p-2 text-[10px] font-medium text-emerald-50/80 ring-1 ring-emerald-100/10"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-semibold text-emerald-50/90">
                      {{ request.guest_name }}
                    </div>
                    <div class="mt-0.5 truncate text-[11px] text-emerald-50/45">
                      {{ request.guest_email }}
                    </div>
                    <span
                      v-if="lobbyRequestParsed(request).source === 'embed'"
                      class="mt-1 inline-flex items-center gap-1 rounded bg-emerald-100/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-50/55 ring-1 ring-emerald-100/10"
                    >
                      <UIcon name="i-lucide-code-2" class="size-3" />
                      Embed
                    </span>
                  </div>
                  <span class="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-emerald-50/45">
                    {{ acceptedAccessLabel(request) }}
                  </span>
                </div>
                <p
                  v-if="lobbyRequestNote(request)"
                  class="mt-2 line-clamp-2 whitespace-pre-line text-[11px] leading-4 text-emerald-50/55"
                >
                  {{ lobbyRequestNote(request) }}
                </p>
                <div
                  v-if="lobbyRequestIntakeAnswers(request).length"
                  class="mt-2 space-y-1 rounded bg-black/10 p-1.5 ring-1 ring-emerald-100/10"
                >
                  <div
                    v-for="answer in lobbyRequestIntakeAnswers(request).slice(0, 2)"
                    :key="answer.label"
                  >
                    <div class="truncate text-[10px] text-emerald-50/40">
                      {{ answer.label }}
                    </div>
                    <p class="mt-0.5 line-clamp-2 whitespace-pre-line text-[11px] leading-4 text-emerald-50/75">
                      {{ answer.value || 'No answer' }}
                    </p>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/60 transition hover:bg-white/[0.1] hover:text-white/80"
                    @click="copyGuestRoomLink(request)"
                  >
                    Copy room
                  </button>
                  <button
                    v-if="canHandleLobbyRequests"
                    type="button"
                    class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/[0.1] hover:text-white/75 disabled:cursor-wait disabled:opacity-60"
                    :disabled="Boolean(handlingLobbyRequestId)"
                    @click="handleLobbyRequest(request, 'expired')"
                  >
                    {{ handlingLobbyRequestId === request.id ? 'Ending' : 'End access' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="editingMeetingDetails"
            class="mb-3 grid gap-2 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.06] md:grid-cols-2"
          >
            <div class="md:col-span-2">
              <label class="mb-1 block text-[11px] font-medium text-white/45">Meeting title</label>
              <input
                v-model="editMeetingTitle"
                class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                :class="editTitleError ? 'border-red-300/35' : 'border-white/[0.08]'"
                @blur="editMeetingTitleTouched = true"
              >
              <p
                v-if="editTitleError"
                class="mt-1 text-[11px] text-red-200/75"
              >
                {{ editTitleError }}
              </p>
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-medium text-white/45">Meeting type</label>
              <select
                v-model="editMeetingType"
                class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
              >
                <option
                  v-for="option in meetingTypeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-medium text-white/45">Room</label>
              <select
                ref="editMeetingRoomSelect"
                v-model="editMeetingZoneId"
                class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
              >
                <option :value="null">
                  No room
                </option>
                <option
                  v-for="zone in meetingZones"
                  :key="zone.id"
                  :value="zone.id"
                >
                  {{ zone.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-medium text-white/45">Retention days</label>
              <input
                v-model.number="editMeetingRetentionDays"
                type="number"
                min="1"
                max="3650"
                class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                :class="editRetentionError ? 'border-red-300/35' : 'border-white/[0.08]'"
                @blur="editMeetingRetentionTouched = true"
              >
              <p
                v-if="editRetentionError"
                class="mt-1 text-[11px] text-red-200/75"
              >
                {{ editRetentionError }}
              </p>
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-medium text-white/45">Start time</label>
              <input
                v-model="editMeetingScheduledStartAt"
                type="datetime-local"
                class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
              >
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-medium text-white/45">Duration</label>
              <input
                v-model.number="editMeetingDurationMinutes"
                type="number"
                min="15"
                max="480"
                step="15"
                class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                :class="editDurationError ? 'border-red-300/35' : 'border-white/[0.08]'"
                @blur="editMeetingDurationTouched = true"
              >
              <p
                v-if="editDurationError"
                class="mt-1 text-[11px] text-red-200/75"
              >
                {{ editDurationError }}
              </p>
            </div>
            <div class="md:col-span-2">
              <label class="mb-1 block text-[11px] font-medium text-white/45">External guests</label>
              <input
                v-model="editMeetingGuestEmails"
                class="h-9 w-full rounded-md border bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                :class="editGuestEmailsError ? 'border-red-300/35' : 'border-white/[0.08]'"
                @blur="editMeetingGuestEmailsTouched = true"
              >
              <p
                v-if="editGuestEmailsError"
                class="mt-1 text-[11px] text-red-200/75"
              >
                {{ editGuestEmailsError }}
              </p>
              <p
                v-else
                class="mt-1 text-[11px] leading-4 text-white/35"
              >
                Meeting follow-ups can only be sent to guests listed here.
              </p>
            </div>
            <div class="md:col-span-2">
              <label class="mb-1 block text-[11px] font-medium text-white/45">Context</label>
              <textarea
                v-model="editMeetingContext"
                rows="3"
                class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white outline-none focus:border-white/25"
              />
            </div>
            <div class="md:col-span-2">
              <label class="mb-1 block text-[11px] font-medium text-white/45">Guest intake prompt</label>
              <textarea
                v-model="editMeetingIntakePrompt"
                rows="2"
                maxlength="280"
                class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white outline-none focus:border-white/25"
                placeholder="Question guests must answer before joining"
              />
              <p class="mt-1 text-[11px] text-white/35">
                Shown on the guest lobby form for this meeting invite.
              </p>
            </div>
            <div class="flex justify-end gap-2 md:col-span-2">
              <button
                type="button"
                class="h-8 rounded-md bg-white/[0.04] px-2.5 text-xs font-medium text-white/60 ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
                @click="cancelEditingMeetingDetails"
              >
                Cancel
              </button>
              <button
                type="button"
                class="h-8 rounded-md bg-sky-400/15 px-2.5 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
                :disabled="savingMeetingDetails || !canSaveMeetingDetails"
                @click="saveMeetingDetails"
              >
                Save details
              </button>
            </div>
          </div>

          <div class="mb-3 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.05]">
            <div data-office-note-taker />
            <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <UIcon name="i-lucide-notebook-pen" class="size-3.5 text-sky-300/80" />
                  Note taker
                </div>
                <p class="mt-0.5 text-[11px] leading-4 text-white/38">
                  Capture live notes, summaries, or action items into this meeting record.
                </p>
              </div>
              <span
                v-if="selectedMeeting.consent?.ai_notes === false"
                class="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100 ring-1 ring-amber-200/15"
              >
                AI notes off
              </span>
            </div>
            <div class="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)]">
              <select
                v-model="noteArtifactType"
                class="h-9 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
              >
                <option value="notes">
                  Notes
                </option>
                <option value="summary">
                  Summary
                </option>
                <option value="action_items">
                  Action items
                </option>
                <option value="transcript">
                  Transcript notes
                </option>
              </select>
              <input
                v-model="noteArtifactTitle"
                class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
                :placeholder="defaultNoteArtifactTitle()"
              >
              <textarea
                v-model="noteArtifactContent"
                rows="4"
                class="md:col-span-2 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                placeholder="Decisions, risks, links, commitments, next steps..."
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p class="text-[11px] leading-4 text-white/35">
                Saved artifacts can feed follow-up drafts and assistant jobs.
              </p>
              <button
                type="button"
                class="h-8 rounded-md bg-sky-400/15 px-2.5 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
                :disabled="savingNoteArtifact || !noteArtifactContent.trim()"
                @click="createNoteArtifact"
              >
                <UIcon
                  :name="savingNoteArtifact ? 'i-lucide-loader-2' : 'i-lucide-save'"
                  class="mr-1 inline size-3.5"
                  :class="savingNoteArtifact ? 'animate-spin' : ''"
                />
                Save artifact
              </button>
            </div>
          </div>

          <div class="mb-3 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.05]">
            <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <UIcon name="i-lucide-list-checks" class="size-3.5 text-emerald-300/80" />
                  Follow-up actions
                </div>
                <p class="mt-0.5 text-[11px] leading-4 text-white/38">
                  Structured actions extracted from saved action-item artifacts.
                </p>
              </div>
              <span class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.05]">
                {{ openActionItemCount }} open
              </span>
            </div>
            <div
              v-if="actionItemsPending"
              class="flex items-center justify-center rounded-md bg-white/[0.035] px-3 py-6"
            >
              <XfLoader size="sm" />
            </div>
            <div
              v-else-if="actionItemsError"
              class="rounded-md bg-red-400/[0.07] px-3 py-3 text-xs leading-5 text-red-50/75 ring-1 ring-red-300/15"
            >
              <div class="flex items-start justify-between gap-3">
                <span class="min-w-0">Could not load action items.</span>
                <button
                  type="button"
                  class="rounded-md bg-white/[0.06] px-2 py-1 font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
                  @click="refreshActionItems"
                >
                  Retry
                </button>
              </div>
            </div>
            <div
              v-else-if="!selectedActionItems.length"
              class="rounded-md bg-white/[0.035] px-3 py-2 text-xs leading-5 text-white/40"
            >
              Save an action-item artifact to create structured follow-ups for this meeting.
            </div>
            <div v-else class="space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/[0.025] px-2.5 py-2 ring-1 ring-white/[0.04]">
                <span class="text-[11px] leading-4 text-white/40">
                  Task conversion uses the assignee or your default department when available.
                </span>
                <select
                  v-model="actionItemTaskDepartmentId"
                  class="h-7 w-44 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white/65 outline-none transition focus:border-white/25"
                  title="Fallback department for task creation"
                >
                  <option value="">
                    Auto department
                  </option>
                  <option
                    v-for="department in departments"
                    :key="department.id"
                    :value="department.id"
                  >
                    {{ department.name }}
                  </option>
                </select>
              </div>
              <div
                v-for="item in selectedActionItems"
                :key="item.id"
                :data-office-action-item-id="item.id"
                class="flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2 ring-1 transition"
                :class="focusedActionItemId === item.id
                  ? 'bg-violet-400/10 ring-violet-300/40 shadow-[0_0_0_1px_rgba(196,181,253,0.12),0_12px_35px_rgba(124,58,237,0.16)]'
                  : 'bg-white/[0.035] ring-white/[0.05]'"
              >
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ring-1"
                  :class="actionItemStatusClass(item.status)"
                >
                  {{ actionItemStatusLabel(item.status) }}
                </span>
                <span
                  class="min-w-[180px] flex-1 text-xs leading-5 text-white/72"
                  :class="item.status === 'done' || item.status === 'dismissed' ? 'text-white/38 line-through decoration-white/20' : ''"
                >
                  {{ item.content }}
                </span>
                <select
                  class="h-7 w-36 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white/65 outline-none transition focus:border-white/25 disabled:cursor-wait disabled:opacity-60"
                  :value="item.assignee_user_id ?? ''"
                  :disabled="updatingActionItemId === item.id"
                  :title="`Assigned to ${actionItemAssigneeLabel(item)}`"
                  @change="updateActionItemAssignee(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">
                    Unassigned
                  </option>
                  <option
                    v-for="member in officeMembers"
                    :key="member.user_id!"
                    :value="member.user_id!"
                  >
                    {{ member.name || 'Team member' }}
                  </option>
                </select>
                <input
                  type="datetime-local"
                  class="h-7 w-40 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white/65 outline-none transition focus:border-white/25 disabled:cursor-wait disabled:opacity-60"
                  :value="dateTimeLocalValue(item.due_at)"
                  :disabled="updatingActionItemId === item.id"
                  @change="updateActionItemDueAt(item, ($event.target as HTMLInputElement).value)"
                >
                <span
                  v-if="item.task_id"
                  class="rounded-md bg-sky-400/10 px-2 py-1 text-[11px] font-medium text-sky-100 ring-1 ring-sky-300/15"
                  :title="item.task_id"
                >
                  Task linked
                </span>
                <NuxtLink
                  v-if="item.task_id"
                  :to="actionItemTaskUrl(item)"
                  class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
                >
                  Open
                </NuxtLink>
                <button
                  v-if="actionItemDeliveryStatus(item) === 'sent' && actionItemDeliveryJobId(item)"
                  type="button"
                  :class="actionableBadgeClass(sentBadgeClass())"
                  :title="actionItemDeliveryTitle(item)"
                  @click="emit('openOfficeAssistant', actionItemDeliveryJobId(item))"
                >
                  <UIcon name="i-lucide-send" class="size-3" />
                  {{ actionItemDeliveryLabel(item) }}
                </button>
                <span
                  v-else-if="actionItemDeliveryStatus(item) === 'sent'"
                  :class="sentBadgeClass()"
                  :title="actionItemDeliveryTitle(item)"
                >
                  <UIcon name="i-lucide-send" class="size-3" />
                  {{ actionItemDeliveryLabel(item) }}
                </span>
                <button
                  v-else-if="actionItemFollowUpJobLabel(item) && actionItemFollowUpJobId(item)"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md bg-amber-300/10 px-2 py-1 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-200/15 transition hover:bg-amber-300/15"
                  @click="emit('openOfficeAssistant', actionItemFollowUpJobId(item))"
                >
                  <UIcon name="i-lucide-sparkles" class="size-3" />
                  {{ actionItemFollowUpJobLabel(item) }}
                </button>
                <span
                  v-else-if="actionItemFollowUpJobLabel(item)"
                  class="inline-flex items-center gap-1 rounded-md bg-amber-300/10 px-2 py-1 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-200/15"
                >
                  <UIcon name="i-lucide-sparkles" class="size-3" />
                  {{ actionItemFollowUpJobLabel(item) }}
                </span>
                <button
                  v-else
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md bg-violet-400/10 px-2 py-1 text-[11px] font-semibold text-violet-100 ring-1 ring-violet-300/15 transition hover:bg-violet-400/15 disabled:cursor-wait disabled:opacity-60"
                  :disabled="creatingAssistantForActionItemId === item.id || actionItemHasActiveFollowUpJob(item)"
                  @click="createAssistantJobFromActionItem(item)"
                >
                  <UIcon
                    :name="creatingAssistantForActionItemId === item.id ? 'i-lucide-loader-2' : 'i-lucide-sparkles'"
                    class="size-3"
                    :class="creatingAssistantForActionItemId === item.id ? 'animate-spin' : ''"
                  />
                  {{ creatingAssistantForActionItemId === item.id ? 'Queuing' : 'Ask assistant' }}
                </button>
                <button
                  v-if="!item.task_id"
                  type="button"
                  class="rounded-md bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-sky-300/15 transition hover:bg-sky-400/15 disabled:cursor-wait disabled:opacity-60"
                  :disabled="creatingTaskForActionItemId === item.id"
                  @click="createTaskFromActionItem(item)"
                >
                  {{ creatingTaskForActionItemId === item.id ? 'Creating' : 'Create task' }}
                </button>
                <button
                  v-if="item.status !== 'done'"
                  type="button"
                  class="rounded-md bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                  :disabled="updatingActionItemId === item.id"
                  @click="updateActionItemStatus(item, 'done')"
                >
                  Done
                </button>
                <button
                  v-else
                  type="button"
                  class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/65 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                  :disabled="updatingActionItemId === item.id"
                  @click="updateActionItemStatus(item, 'open')"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="artifactsPending"
            data-office-artifacts-list
            class="flex items-center justify-center rounded-md bg-white/[0.035] px-3 py-8"
          >
            <XfLoader size="sm" />
          </div>
          <div
            v-else-if="artifactsError"
            data-office-artifacts-list
            class="rounded-md bg-red-400/[0.07] px-3 py-3 text-xs leading-5 text-red-50/75 ring-1 ring-red-300/15"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="min-w-0">Could not load meeting artifacts.</span>
              <button
                type="button"
                class="rounded-md bg-white/[0.06] px-2 py-1 font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
                @click="refreshArtifacts"
              >
                Retry
              </button>
            </div>
          </div>
          <div
            v-else-if="!selectedArtifacts.length"
            data-office-artifacts-list
            class="rounded-md bg-white/[0.035] px-3 py-3 text-xs text-white/40"
          >
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-file-stack" class="mt-0.5 size-4 text-sky-300/75" />
              <div>
                <div class="font-medium text-white/70">
                  No artifacts attached yet.
                </div>
                <p class="mt-1 leading-5 text-white/40">
                  Notes, summaries, action items, transcripts, and recordings will appear here as this session is captured.
                </p>
              </div>
            </div>
          </div>
          <div v-else class="space-y-2" data-office-artifacts-list>
            <div
              v-for="artifact in selectedArtifacts"
              :key="artifact.id"
              :data-office-artifact-id="artifact.id"
              class="rounded-md bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
              :class="isTargetArtifact(artifact) ? 'bg-sky-400/10 ring-sky-300/25' : ''"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-semibold text-white/85">{{ artifact.title }}</span>
                <span class="flex shrink-0 items-center gap-1.5">
                  <span class="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/40">
                    {{ artifactTypeLabel(artifact) }}
                  </span>
                  <span
                    v-if="isRecordingArtifact(artifact) && recordingArtifactStatusLabel(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-100 ring-1 ring-sky-300/15"
                  >
                    <UIcon name="i-lucide-video" class="size-3" />
                    {{ recordingArtifactStatusLabel(artifact) }}
                  </span>
                  <span
                    v-if="isRecordingArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-lock-keyhole" class="size-3" />
                    {{ recordingArtifactAccessLabel(artifact) }}
                  </span>
                  <span
                    v-if="isRecordingArtifact(artifact) && recordingArtifactDurationLabel(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-clock-3" class="size-3" />
                    {{ recordingArtifactDurationLabel(artifact) }}
                  </span>
                  <NuxtLink
                    v-if="isRecordingArtifact(artifact) && recordingArtifactUrl(artifact)"
                    :to="recordingArtifactUrl(artifact)"
                    target="_blank"
                    class="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-1 text-[10px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15"
                    :aria-label="`Open recording for ${artifact.title}`"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3" />
                    Open recording
                  </NuxtLink>
                  <span
                    v-if="artifactStatusLabel(artifact)"
                    class="rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1"
                    :class="isPlaceholderArtifact(artifact)
                      ? 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
                      : isSystemArtifact(artifact)
                        ? 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
                        : 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'"
                  >
                    {{ artifactStatusLabel(artifact) }}
                  </span>
                  <span
                    v-if="isCloseoutArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-flag" class="size-3" />
                    {{ closeoutLifecycleLabel(artifact) }}
                  </span>
                  <span
                    v-if="isCloseoutArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-door-closed" class="size-3" />
                    {{ closeoutAccessLabel(artifact) }}
                  </span>
                  <span
                    v-if="isCloseoutArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-badge-check" class="size-3" />
                    {{ closeoutBadgeLabel(artifact) }}
                  </span>
                  <span
                    v-if="isGuestIntakeArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-user-round" class="size-3" />
                    {{ guestIntakeLabel(artifact) }}
                  </span>
                  <span
                    v-if="isGuestIntakeArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/[0.05]"
                  >
                    <UIcon name="i-lucide-clipboard-list" class="size-3" />
                    {{ guestIntakeAnswerLabel(artifact) }}
                  </span>
                  <button
                    v-if="artifactDeliveryStatus(artifact) === 'sent' && artifactDeliveryJobId(artifact)"
                    type="button"
                    :class="actionableBadgeClass(sentBadgeClass())"
                    :aria-label="`Open sent assistant job for ${artifact.title}`"
                    :title="artifactDeliveryTitle(artifact)"
                    @click="emit('openOfficeAssistant', artifactDeliveryJobId(artifact))"
                  >
                    <UIcon name="i-lucide-send" class="size-3" />
                    {{ artifactDeliveryLabel(artifact) }}
                  </button>
                  <span
                    v-else-if="artifactDeliveryStatus(artifact) === 'sent'"
                    :class="sentBadgeClass()"
                    :title="artifactDeliveryTitle(artifact)"
                  >
                    <UIcon name="i-lucide-send" class="size-3" />
                    {{ artifactDeliveryLabel(artifact) }}
                  </span>
                  <button
                    v-else-if="artifactFollowUpJobLabel(artifact) && artifactFollowUpJobId(artifact)"
                    type="button"
                    :class="actionableBadgeClass(artifactFollowUpBadgeClass(artifact))"
                    :aria-label="`Open assistant job for ${artifact.title}`"
                    :title="artifactFollowUpJobTitle(artifact)"
                    @click="emit('openOfficeAssistant', artifactFollowUpJobId(artifact))"
                  >
                    <UIcon :name="artifactFollowUpBadgeIcon(artifact)" class="size-3" />
                    {{ artifactFollowUpJobLabel(artifact) }}
                  </button>
                  <span
                    v-else-if="artifactFollowUpJobLabel(artifact)"
                    :class="artifactFollowUpBadgeClass(artifact)"
                    :title="artifactFollowUpJobTitle(artifact)"
                  >
                    <UIcon :name="artifactFollowUpBadgeIcon(artifact)" class="size-3" />
                    {{ artifactFollowUpJobLabel(artifact) }}
                  </span>
                  <span
                    v-if="isTargetArtifact(artifact)"
                    class="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100 ring-1 ring-sky-300/15"
                  >
                    <UIcon name="i-lucide-crosshair" class="size-3" />
                    Source
                  </span>
                  <button
                    v-if="artifact.artifact_type === 'action_items' && !isSystemArtifact(artifact) && artifactDeliveryStatus(artifact) !== 'sent' && !artifactHasActiveFollowUpJob(artifact)"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold ring-1 transition disabled:cursor-wait disabled:opacity-60"
                    :class="artifactFollowUpActionClass(artifact)"
                    :disabled="creatingFollowUpForArtifactId === artifact.id || !artifact.content.trim() || isPlaceholderArtifact(artifact)"
                    :title="artifactFollowUpActionTitle(artifact)"
                    @click="createFollowUpJob(artifact)"
                  >
                    <UIcon
                      :name="creatingFollowUpForArtifactId === artifact.id ? 'i-lucide-loader-2' : artifactFollowUpActionIcon(artifact)"
                      class="size-3"
                      :class="creatingFollowUpForArtifactId === artifact.id ? 'animate-spin' : ''"
                    />
                    {{ artifactFollowUpActionLabel(artifact) }}
                  </button>
                  <button
                    v-if="!isSystemArtifact(artifact)"
                    type="button"
                    class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/75"
                    aria-label="Edit artifact"
                    @click="startEditingArtifact(artifact)"
                  >
                    <UIcon name="i-lucide-pencil" class="size-3.5" />
                  </button>
                </span>
              </div>
              <div v-if="editingArtifactId === artifact.id" class="mt-2 space-y-2">
                <input
                  v-model="editingArtifactTitle"
                  class="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                >
                <textarea
                  v-model="editingArtifactContent"
                  rows="5"
                  class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white outline-none focus:border-white/25"
                  placeholder="Add notes, summary, decisions, or action items"
                />
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="h-8 rounded-md bg-white/[0.04] px-2.5 text-xs font-medium text-white/60 ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
                    @click="cancelEditingArtifact"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="h-8 rounded-md bg-sky-400/15 px-2.5 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
                    :disabled="savingArtifactId === artifact.id"
                    @click="saveArtifact(artifact)"
                  >
                    Save
                  </button>
                </div>
              </div>
              <p
                v-else-if="!isChecklistArtifact(artifact) && !isRecordingArtifact(artifact)"
                class="mt-1 whitespace-pre-line text-xs leading-5 text-white/42"
                :class="isCloseoutArtifact(artifact) || isGuestIntakeArtifact(artifact) ? '' : 'line-clamp-3'"
              >
                {{ artifact.content || 'Ready for capture.' }}
              </p>
              <div
                v-else-if="isRecordingArtifact(artifact)"
                class="mt-2 rounded-md bg-sky-300/[0.045] p-2 ring-1 ring-sky-200/10"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 text-[11px] font-semibold text-sky-100/80">
                      <UIcon name="i-lucide-video" class="size-3.5" />
                      Meeting recording
                    </div>
                    <p class="mt-1 whitespace-pre-line text-xs leading-5 text-white/48">
                      {{ recordingArtifactSummary(artifact) || 'Recording is attached to this meeting session.' }}
                    </p>
                  </div>
                  <NuxtLink
                    v-if="recordingArtifactUrl(artifact)"
                    :to="recordingArtifactUrl(artifact)"
                    target="_blank"
                    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-400/12 px-2.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/18"
                  >
                    <UIcon name="i-lucide-play" class="size-3.5" />
                    Open
                  </NuxtLink>
                  <span
                    v-else
                    class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 text-xs font-medium text-white/45 ring-1 ring-white/[0.06]"
                  >
                    <UIcon name="i-lucide-building-2" class="size-3.5" />
                    Workspace only
                  </span>
                </div>
              </div>
              <div
                v-else
                class="mt-2 rounded-md p-2 ring-1"
                :class="isFollowUpChecklistArtifact(artifact)
                  ? 'bg-emerald-300/[0.055] ring-emerald-200/12'
                  : 'bg-amber-300/[0.045] ring-amber-200/10'"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div
                    class="flex items-center gap-1.5 text-[11px] font-semibold"
                    :class="isFollowUpChecklistArtifact(artifact) ? 'text-emerald-100/80' : 'text-amber-100/75'"
                  >
                    <UIcon
                      :name="isFollowUpChecklistArtifact(artifact) ? 'i-lucide-send-horizontal' : 'i-lucide-list-checks'"
                      class="size-3.5"
                    />
                    {{ checklistHeading(artifact) }}
                  </div>
                  <span
                    v-if="checklistGeneratedLabel(artifact)"
                    class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-emerald-100/50 ring-1 ring-white/[0.05]"
                  >
                    {{ checklistGeneratedLabel(artifact) }}
                  </span>
                </div>
                <ul class="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <li
                    v-for="item in checklistItems(artifact)"
                    :key="item"
                    class="flex min-w-0 items-start gap-1.5 rounded bg-black/10 px-2 py-1.5 text-[11px] leading-4 ring-1"
                    :class="isFollowUpChecklistArtifact(artifact)
                      ? 'text-emerald-50/72 ring-emerald-100/10'
                      : 'text-amber-50/68 ring-amber-100/10'"
                  >
                    <UIcon
                      name="i-lucide-dot"
                      class="mt-0.5 size-3 shrink-0"
                      :class="isFollowUpChecklistArtifact(artifact) ? 'text-emerald-100/50' : 'text-amber-100/50'"
                    />
                    <span class="min-w-0">{{ item }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
