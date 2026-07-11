<script setup lang="ts">
import type {
  OfficeAssistantJobRow,
  OfficeAssistantWatchRow,
  OfficeAssistantWatchType,
  OfficeMemberRow,
  OfficeZoneRow
} from '~~/app/types/office'

type OfficeMemberWithProfile = OfficeMemberRow & {
  name: string | null
  avatar_url: string | null
}

const props = defineProps<{
  officeId: string
  zones: OfficeZoneRow[]
  members: OfficeMemberWithProfile[]
  defaultOpen?: boolean
  targetJobId?: string | null
  targetFocusKey?: number
}>()

const emit = defineEmits<{
  officeArtifactsChanged: []
  openOfficeArtifacts: [meetingId?: string, artifactId?: string, actionItemId?: string]
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const open = ref(props.defaultOpen ?? false)
const saving = ref(false)
const evaluating = ref(false)
const actioningJobId = ref<string | null>(null)
const expandedJobId = ref<string | null>(null)
const copyingJobId = ref<string | null>(null)
const editingJobId = ref<string | null>(null)
const jobStatusFilter = ref<'all' | OfficeAssistantJobRow['status']>('all')
const editingJobRecipients = ref('')
const editingJobSubject = ref('')
const editingJobBody = ref('')
const focusedJobId = ref<string | null>(null)
const lastHandledJobFocusKey = ref<number | undefined>(undefined)
const lastMissingJobFocusKey = ref<number | undefined>(undefined)
let focusedJobTimer: ReturnType<typeof setTimeout> | null = null
const watchType = ref<OfficeAssistantWatchType>('person_available')
const targetUserId = ref<string | null>(null)
const targetSecondUserId = ref<string | null>(null)
const targetZoneId = ref<string | null>(null)
const label = ref('')

const watchesData = ref<{ watches: OfficeAssistantWatchRow[] }>({ watches: [] })
const jobsData = ref<{ jobs: OfficeAssistantJobRow[] }>({ jobs: [] })
const watchesPending = ref(false)
const jobsPending = ref(false)
const watchesError = ref<unknown>(null)
const jobsError = ref<unknown>(null)

async function refreshWatches() {
  watchesPending.value = true
  watchesError.value = null
  try {
    watchesData.value = await apiFetch<{ watches: OfficeAssistantWatchRow[] }>(`/api/office/${props.officeId}/assistant/watches`)
  } catch (error) {
    watchesError.value = error
  } finally {
    watchesPending.value = false
  }
}

async function refreshJobs() {
  jobsPending.value = true
  jobsError.value = null
  try {
    jobsData.value = await apiFetch<{ jobs: OfficeAssistantJobRow[] }>(`/api/office/${props.officeId}/assistant/jobs`)
  } catch (error) {
    jobsError.value = error
  } finally {
    jobsPending.value = false
  }
}

await Promise.all([refreshWatches(), refreshJobs()])
watch(() => props.officeId, () => {
  refreshWatches()
  refreshJobs()
})

const watches = computed(() => watchesData.value?.watches ?? [])
const jobs = computed(() => jobsData.value?.jobs ?? [])
const filteredJobs = computed(() =>
  jobStatusFilter.value === 'all'
    ? jobs.value
    : jobs.value.filter(job => job.status === jobStatusFilter.value)
)
const visibleJobs = computed(() => {
  const listedJobs = filteredJobs.value
  if (!props.targetJobId || listedJobs.some(job => job.id === props.targetJobId)) return listedJobs
  const targetJob = jobs.value.find(job => job.id === props.targetJobId)
  return targetJob ? [targetJob, ...listedJobs] : listedJobs
})
const jobFilters = computed(() => [
  { value: 'all' as const, label: 'All', count: jobs.value.length },
  { value: 'waiting_approval' as const, label: 'Approval', count: jobs.value.filter(job => job.status === 'waiting_approval').length },
  { value: 'queued' as const, label: 'Queued', count: jobs.value.filter(job => job.status === 'queued').length },
  { value: 'running' as const, label: 'Running', count: jobs.value.filter(job => job.status === 'running').length },
  { value: 'completed' as const, label: 'Done', count: jobs.value.filter(job => job.status === 'completed').length },
  { value: 'failed' as const, label: 'Failed', count: jobs.value.filter(job => job.status === 'failed').length }
])
const activeWatchCount = computed(() => watches.value.filter(watch => watch.status === 'active').length)
const waitingJobCount = computed(() => jobs.value.filter(job => job.status === 'waiting_approval').length)
const failedJobCount = computed(() => jobs.value.filter(job => job.status === 'failed').length)
const people = computed(() =>
  props.members
    .filter((member): member is OfficeMemberWithProfile & { user_id: string, name: string } => Boolean(member.user_id && member.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
)
const rooms = computed(() => props.zones.filter(zone => zone.zone_type !== 'desk'))
const editingRecipients = computed(() => parseRecipientInput(editingJobRecipients.value))
const editingInvalidRecipients = computed(() => invalidRecipients(editingJobRecipients.value))

function defaultLabel() {
  if (watchType.value === 'person_available') {
    const person = people.value.find(member => member.user_id === targetUserId.value)
    return person ? `Tell me when ${person.name} is available` : 'Tell me when a teammate is available'
  }
  if (watchType.value === 'room_occupied') {
    const room = rooms.value.find(zone => zone.id === targetZoneId.value)
    return room ? `Tell me when ${room.name} gets occupied` : 'Tell me when a room gets occupied'
  }
  if (watchType.value === 'co_presence') {
    const firstPerson = people.value.find(member => member.user_id === targetUserId.value)
    const secondPerson = people.value.find(member => member.user_id === targetSecondUserId.value)
    return firstPerson && secondPerson
      ? `Tell me when ${firstPerson.name} and ${secondPerson.name} are together`
      : 'Tell me when two people meet'
  }
  if (watchType.value === 'meeting_ended') return 'Tell me when a meeting ends'
  return 'Tell me when a lobby guest is waiting'
}

function resetForm() {
  targetUserId.value = people.value[0]?.user_id ?? null
  targetSecondUserId.value = people.value.find(member => member.user_id !== targetUserId.value)?.user_id ?? null
  targetZoneId.value = rooms.value[0]?.id ?? null
  label.value = defaultLabel()
}

function conditions() {
  if (watchType.value === 'person_available') return { userId: targetUserId.value }
  if (watchType.value === 'room_occupied') return { zoneId: targetZoneId.value }
  if (watchType.value === 'co_presence') {
    return {
      userIds: [targetUserId.value, targetSecondUserId.value].filter(Boolean)
    }
  }
  if (watchType.value === 'meeting_ended') return { zoneId: targetZoneId.value }
  return { officeId: props.officeId }
}

async function createWatch() {
  saving.value = true
  try {
    await apiFetch(`/api/office/${props.officeId}/assistant/watches`, {
      method: 'POST',
      body: {
        watch_type: watchType.value,
        label: label.value || defaultLabel(),
        conditions: conditions(),
        delivery: { notification: true, chat: false, email: false }
      }
    })
    toast.add({ title: 'Assistant watch created', icon: 'i-lucide-sparkles', color: 'success', duration: 1600 })
    resetForm()
    await Promise.all([refreshWatches(), refreshJobs()])
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create watch', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function evaluateWatches() {
  evaluating.value = true
  try {
    const result = await apiFetch<{ evaluated: number, triggered: OfficeAssistantJobRow[] }>(
      `/api/office/${props.officeId}/assistant/evaluate`,
      { method: 'POST' }
    )
    const triggeredCount = result.triggered.length
    toast.add({
      title: triggeredCount ? `${triggeredCount} watch triggered` : 'No watches triggered',
      icon: triggeredCount ? 'i-lucide-bell' : 'i-lucide-check',
      color: triggeredCount ? 'success' : 'neutral',
      duration: 1600
    })
    await Promise.all([refreshWatches(), refreshJobs()])
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not run assistant check', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    evaluating.value = false
  }
}

async function updateJob(job: OfficeAssistantJobRow, action: 'approve' | 'cancel' | 'send' | 'update_draft') {
  actioningJobId.value = `${action}:${job.id}`
  try {
    const response = await apiFetch<{ job: OfficeAssistantJobRow }>(`/api/office/${props.officeId}/assistant/jobs/${job.id}`, {
      method: 'PATCH',
      body: action === 'update_draft'
        ? {
            action,
            recipients: parseRecipientInput(editingJobRecipients.value),
            subject: editingJobSubject.value,
            body: editingJobBody.value
          }
        : { action }
    })
    toast.add({
      title: action === 'approve'
        ? 'Assistant job approved'
        : action === 'send'
          ? 'Follow-up sent'
          : action === 'update_draft'
            ? 'Draft updated'
            : 'Assistant job cancelled',
      icon: action === 'cancel' ? 'i-lucide-x' : 'i-lucide-check',
      color: action === 'cancel' ? 'warning' : 'success',
      duration: 1600
    })
    if (action === 'update_draft' || action === 'send') cancelEditingDraft()
    await refreshJobs()
    if (action === 'approve' && job.job_type === 'send_follow_up' && typeof response.job?.result?.body === 'string') {
      expandedJobId.value = job.id
      focusedJobId.value = job.id
      scrollToJob(job.id)
    }
    if (action === 'send') {
      expandedJobId.value = job.id
      focusedJobId.value = job.id
      scrollToJob(job.id)
    }
    emit('officeArtifactsChanged')
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not update assistant job', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    actioningJobId.value = null
  }
}

function jobStatusClass(status: OfficeAssistantJobRow['status']) {
  if (status === 'waiting_approval') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  if (status === 'queued' || status === 'running') return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  if (status === 'completed') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (status === 'failed') return 'bg-red-400/10 text-red-100 ring-red-300/15'
  return 'bg-white/[0.05] text-white/45 ring-white/[0.06]'
}

function jobResultSummary(job: OfficeAssistantJobRow) {
  if (job.job_type === 'send_follow_up' && typeof job.result?.subject === 'string') {
    const recipients = Array.isArray(job.result.recipients)
      ? job.result.recipients.filter((item): item is string => typeof item === 'string')
      : []
    return recipients.length
      ? `${job.result.subject} · ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`
      : job.result.subject
  }

  if (typeof job.result?.error === 'string') return job.result.error
  if (typeof job.result?.message === 'string') return job.result.message
  return null
}

function jobRecipients(job: OfficeAssistantJobRow) {
  return Array.isArray(job.result?.recipients)
    ? job.result.recipients.filter((item): item is string => typeof item === 'string')
    : []
}

function jobBody(job: OfficeAssistantJobRow) {
  return typeof job.result?.body === 'string' ? job.result.body : ''
}

function canExpandJob(job: OfficeAssistantJobRow) {
  return job.job_type === 'send_follow_up' && Boolean(jobBody(job))
}

function isFollowUpWaitingForDraft(job: OfficeAssistantJobRow) {
  return job.job_type === 'send_follow_up' && job.status === 'waiting_approval' && !jobBody(job)
}

function hasMeetingSource(job: OfficeAssistantJobRow) {
  return Boolean(sourceMeetingId(job))
}

function sourceMeetingId(job: OfficeAssistantJobRow) {
  if (typeof job.input?.meeting_id === 'string') return job.input.meeting_id
  if (
    typeof job.result?.source === 'object'
    && job.result.source
    && 'meetingId' in job.result.source
    && typeof (job.result.source as { meetingId?: unknown }).meetingId === 'string'
  ) {
    return (job.result.source as { meetingId: string }).meetingId
  }
  return undefined
}

function sourceArtifactId(job: OfficeAssistantJobRow) {
  if (typeof job.input?.artifact_id === 'string') return job.input.artifact_id
  if (
    typeof job.result?.source === 'object'
    && job.result.source
    && 'artifactId' in job.result.source
    && typeof (job.result.source as { artifactId?: unknown }).artifactId === 'string'
  ) {
    return (job.result.source as { artifactId: string }).artifactId
  }
  return undefined
}

function sourceActionItemId(job: OfficeAssistantJobRow) {
  if (typeof job.input?.action_item_id === 'string') return job.input.action_item_id
  if (
    typeof job.result?.source === 'object'
    && job.result.source
    && 'actionItemId' in job.result.source
    && typeof (job.result.source as { actionItemId?: unknown }).actionItemId === 'string'
  ) {
    return (job.result.source as { actionItemId: string }).actionItemId
  }
  return undefined
}

function sourceRecord(job: OfficeAssistantJobRow) {
  return typeof job.result?.source === 'object' && job.result.source && !Array.isArray(job.result.source)
    ? job.result.source as Record<string, unknown>
    : {}
}

function sourceMeetingTitle(job: OfficeAssistantJobRow) {
  if (typeof job.input?.meeting_title === 'string' && job.input.meeting_title.trim()) return job.input.meeting_title.trim()
  const source = sourceRecord(job)
  return typeof source.meetingTitle === 'string' && source.meetingTitle.trim() ? source.meetingTitle.trim() : ''
}

function sourceRoomLabel(job: OfficeAssistantJobRow) {
  if (typeof job.input?.room === 'string' && job.input.room.trim()) return job.input.room.trim()
  const source = sourceRecord(job)
  return typeof source.room === 'string' && source.room.trim() ? source.room.trim() : ''
}

function sourceStatusLabel(job: OfficeAssistantJobRow) {
  if (typeof job.input?.meeting_status === 'string' && job.input.meeting_status.trim()) {
    return job.input.meeting_status.trim().replaceAll('_', ' ')
  }
  const source = sourceRecord(job)
  return typeof source.status === 'string' && source.status.trim() ? source.status.trim().replaceAll('_', ' ') : ''
}

function deliveryStatus(job: OfficeAssistantJobRow) {
  return typeof job.result?.delivery === 'object' && job.result.delivery && 'status' in job.result.delivery
    ? String((job.result.delivery as { status?: unknown }).status ?? '')
    : ''
}

function formatDeliveryTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function deliverySentAt(job: OfficeAssistantJobRow) {
  return typeof job.result?.delivery === 'object'
    && job.result.delivery
    && 'sent_at' in job.result.delivery
    && typeof (job.result.delivery as { sent_at?: unknown }).sent_at === 'string'
    ? formatDeliveryTime((job.result.delivery as { sent_at: string }).sent_at)
    : ''
}

function deliveryLabel(job: OfficeAssistantJobRow) {
  const sentAt = deliverySentAt(job)
  return sentAt ? `Sent ${sentAt}` : 'Sent'
}

function selectorEscape(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}

function scrollToJob(jobId: string) {
  nextTick(() => {
    document.querySelector(`[data-office-assistant-job-id="${selectorEscape(jobId)}"]`)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    })
  })
}

function draftEdited(job: OfficeAssistantJobRow) {
  return typeof job.result?.edited_at === 'string'
}

function isInjectedTargetJob(job: OfficeAssistantJobRow) {
  return Boolean(
    props.targetJobId
    && job.id === props.targetJobId
    && !jobs.value.slice(0, 4).some(item => item.id === job.id)
  )
}

function toggleJob(job: OfficeAssistantJobRow) {
  if (!canExpandJob(job)) return
  expandedJobId.value = expandedJobId.value === job.id ? null : job.id
}

function startEditingDraft(job: OfficeAssistantJobRow) {
  editingJobId.value = job.id
  editingJobRecipients.value = jobRecipients(job).join(', ')
  editingJobSubject.value = typeof job.result?.subject === 'string' ? job.result.subject : job.title
  editingJobBody.value = jobBody(job)
}

function cancelEditingDraft() {
  editingJobId.value = null
  editingJobRecipients.value = ''
  editingJobSubject.value = ''
  editingJobBody.value = ''
}

function parseRecipientInput(value: string) {
  return value
    .split(/[\s,;]+/)
    .map(email => email.trim())
    .filter(Boolean)
}

function invalidRecipients(value: string) {
  return parseRecipientInput(value).filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

async function copyJobDraft(job: OfficeAssistantJobRow) {
  const body = editingJobId.value === job.id ? editingJobBody.value : jobBody(job)
  if (!body) return

  copyingJobId.value = job.id
  try {
    const recipients = editingJobId.value === job.id ? parseRecipientInput(editingJobRecipients.value) : jobRecipients(job)
    const subject = editingJobId.value === job.id
      ? editingJobSubject.value
      : typeof job.result?.subject === 'string'
        ? job.result.subject
        : job.title
    await navigator.clipboard.writeText([
      recipients.length ? `To: ${recipients.join(', ')}` : 'To: ',
      `Subject: ${subject}`,
      '',
      body
    ].join('\n'))
    toast.add({ title: 'Draft copied', icon: 'i-lucide-copy-check', color: 'success', duration: 1200 })
  } catch {
    toast.add({ title: 'Could not copy draft', description: 'Your browser blocked clipboard access.', color: 'error' })
  } finally {
    copyingJobId.value = null
  }
}

watch([watchType, targetUserId, targetSecondUserId, targetZoneId], () => {
  if (targetSecondUserId.value === targetUserId.value) {
    targetSecondUserId.value = people.value.find(member => member.user_id !== targetUserId.value)?.user_id ?? null
  }
  label.value = defaultLabel()
})

watch(open, (isOpen) => {
  if (isOpen && !label.value) resetForm()
})

watch(() => [props.targetJobId, props.targetFocusKey] as const, async ([jobId, focusKey]) => {
  if (!jobId) return
  if (jobId === focusedJobId.value && focusKey === lastHandledJobFocusKey.value) return

  lastHandledJobFocusKey.value = focusKey
  await refreshJobs()
  const targetJob = jobs.value.find(job => job.id === jobId)
  if (!targetJob) {
    if (focusedJobTimer) clearTimeout(focusedJobTimer)
    focusedJobTimer = null
    expandedJobId.value = null
    focusedJobId.value = null
    lastHandledJobFocusKey.value = undefined
    if (focusKey !== lastMissingJobFocusKey.value) {
      lastMissingJobFocusKey.value = focusKey
      toast.add({
        title: 'Assistant job unavailable',
        description: 'It may have been removed or you may not have access.',
        color: 'warning',
        duration: 1800
      })
    }
    return
  }

  lastMissingJobFocusKey.value = undefined
  expandedJobId.value = jobId
  focusedJobId.value = jobId
  scrollToJob(jobId)

  if (focusedJobTimer) clearTimeout(focusedJobTimer)
  focusedJobTimer = setTimeout(() => {
    focusedJobId.value = null
    lastHandledJobFocusKey.value = undefined
    focusedJobTimer = null
  }, 5000)
}, { immediate: true })

onBeforeUnmount(() => {
  if (focusedJobTimer) clearTimeout(focusedJobTimer)
  focusedJobTimer = null
  focusedJobId.value = null
  lastHandledJobFocusKey.value = undefined
  lastMissingJobFocusKey.value = undefined
})
</script>

<template>
  <section class="mb-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 text-white shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl">
    <div class="flex items-center justify-between gap-3 px-3 py-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        @click="open = !open"
      >
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
          <UIcon name="i-lucide-sparkles" class="size-3.5 text-amber-200" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Office assistant</span>
          <span class="block truncate text-xs text-white/40">{{ watches.length }} watches · {{ jobs.length }} jobs</span>
        </span>
      </button>
      <span class="flex items-center gap-2">
        <button
          v-if="open && watches.length"
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.06] px-2 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-60"
          :disabled="evaluating"
          @click.stop="evaluateWatches"
        >
          <UIcon name="i-lucide-radar" class="size-3.5" />
          Run check
        </button>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.06] hover:text-white/70"
          @click="open = !open"
        >
          <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
      </span>
    </div>

    <div
      v-if="open"
      class="grid gap-3 border-t border-white/[0.06] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div class="space-y-2">
        <div class="grid gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Watches
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ activeWatchCount }}/{{ watches.length }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Approval
            </div>
            <div
              class="mt-1 text-sm font-semibold"
              :class="waitingJobCount ? 'text-amber-100' : 'text-white/75'"
            >
              {{ waitingJobCount }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Failed
            </div>
            <div
              class="mt-1 text-sm font-semibold"
              :class="failedJobCount ? 'text-red-100' : 'text-white/75'"
            >
              {{ failedJobCount }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Jobs
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ jobs.length }}
            </div>
          </div>
        </div>
        <div
          v-if="watchesPending"
          class="flex items-center justify-center rounded-lg bg-white/[0.035] px-3 py-8 ring-1 ring-white/[0.05]"
        >
          <XfLoader size="sm" />
        </div>
        <div
          v-else-if="watchesError"
          class="rounded-lg bg-red-400/[0.07] px-3 py-3 text-sm text-red-50/80 ring-1 ring-red-300/15"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-red-50">
                Could not load assistant watches
              </div>
              <div class="mt-1 text-xs text-red-50/55">
                Office assistant jobs are temporarily unavailable.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
              @click="() => refreshWatches()"
            >
              Retry
            </button>
          </div>
        </div>
        <div
          v-else-if="!watches.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No assistant watches yet.
        </div>
        <div
          v-for="watchItem in watches"
          :key="watchItem.id"
          class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="truncate text-sm font-medium">{{ watchItem.label }}</span>
            <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] capitalize text-white/45">{{ watchItem.status }}</span>
          </div>
          <div class="mt-0.5 truncate text-xs text-white/40">
            {{ watchItem.watch_type.replaceAll('_', ' ') }}
          </div>
        </div>
        <div v-if="jobsPending || jobsError || jobs.length" class="space-y-2 pt-2">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Assistant jobs
            </h4>
            <button
              type="button"
              class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/70"
              aria-label="Refresh assistant jobs"
              @click="refreshJobs()"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
            </button>
          </div>
          <div
            v-if="jobsPending"
            class="flex items-center justify-center rounded-lg bg-white/[0.035] px-3 py-8 ring-1 ring-white/[0.05]"
          >
            <XfLoader size="sm" />
          </div>
          <div
            v-else-if="jobsError"
            class="rounded-lg bg-red-400/[0.07] px-3 py-3 text-sm text-red-50/80 ring-1 ring-red-300/15"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-medium text-red-50">
                  Could not load assistant jobs
                </div>
                <div class="mt-1 text-xs text-red-50/55">
                  Follow-up jobs and approvals are temporarily unavailable.
                </div>
              </div>
              <button
                type="button"
                class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
                @click="() => refreshJobs()"
              >
                Retry
              </button>
            </div>
          </div>
          <div v-else class="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
            <button
              v-for="filter in jobFilters"
              :key="filter.value"
              type="button"
              class="rounded-md px-2 py-1.5 text-left ring-1 transition"
              :class="jobStatusFilter === filter.value
                ? 'bg-amber-300/10 text-amber-100 ring-amber-200/20'
                : 'bg-white/[0.035] text-white/55 ring-white/[0.05] hover:bg-white/[0.055]'"
              @click="jobStatusFilter = filter.value"
            >
              <div class="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
                {{ filter.label }}
              </div>
              <div class="mt-0.5 text-sm font-semibold tabular-nums">
                {{ filter.count }}
              </div>
            </button>
          </div>
          <div
            v-if="!jobsPending && !jobsError && !visibleJobs.length"
            class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
          >
            No {{ jobStatusFilter }} assistant jobs.
          </div>
          <div
            v-for="job in visibleJobs"
            :key="job.id"
            :data-office-assistant-job-id="job.id"
            class="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.05]"
            :class="[
              canExpandJob(job) ? 'cursor-pointer transition hover:bg-white/[0.045]' : '',
              focusedJobId === job.id ? 'bg-sky-400/10 ring-sky-300/25' : ''
            ]"
            role="button"
            :tabindex="canExpandJob(job) ? 0 : -1"
            @click="toggleJob(job)"
            @keydown.enter.prevent="toggleJob(job)"
            @keydown.space.prevent="toggleJob(job)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-1.5">
                  <div class="truncate text-sm font-medium text-white/85">
                    {{ job.title }}
                  </div>
                  <UIcon
                    v-if="canExpandJob(job)"
                    :name="expandedJobId === job.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="size-3.5 shrink-0 text-white/30"
                  />
                </div>
                <div class="mt-0.5 truncate text-xs capitalize text-white/38">
                  {{ isInjectedTargetJob(job) ? 'Source follow-up' : job.job_type.replaceAll('_', ' ') }}
                </div>
              </div>
              <span
                class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ring-1"
                :class="jobStatusClass(job.status)"
              >
                {{ job.status.replaceAll('_', ' ') }}
              </span>
            </div>
            <div
              v-if="focusedJobId === job.id"
              class="mt-2"
            >
              <span class="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100 ring-1 ring-sky-300/15">
                <UIcon name="i-lucide-crosshair" class="size-3" />
                Source
              </span>
            </div>
            <div
              v-if="hasMeetingSource(job) && !canExpandJob(job)"
              class="mt-2 flex flex-wrap items-center gap-1"
            >
              <span
                v-if="sourceMeetingTitle(job)"
                class="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-100/75 ring-1 ring-sky-300/15"
              >
                <UIcon name="i-lucide-calendar-days" class="size-3" />
                {{ sourceMeetingTitle(job) }}
              </span>
              <span
                v-if="sourceRoomLabel(job)"
                class="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-white/[0.06]"
              >
                <UIcon name="i-lucide-map-pin" class="size-3" />
                {{ sourceRoomLabel(job) }}
              </span>
              <span
                v-if="sourceStatusLabel(job)"
                class="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium capitalize text-white/55 ring-1 ring-white/[0.06]"
              >
                <UIcon name="i-lucide-circle-dot" class="size-3" />
                {{ sourceStatusLabel(job) }}
              </span>
              <span
                v-if="sourceActionItemId(job)"
                class="inline-flex items-center gap-1 rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-100/75 ring-1 ring-violet-300/15"
                :title="sourceActionItemId(job)"
              >
                <UIcon name="i-lucide-list-checks" class="size-3" />
                Action item
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/60 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
                :aria-label="`Open source meeting for ${job.title}`"
                @click.stop="emit('openOfficeArtifacts', sourceMeetingId(job), sourceArtifactId(job), sourceActionItemId(job))"
              >
                <UIcon name="i-lucide-panel-right-open" class="size-3" />
                Open source
              </button>
            </div>
            <div
              v-if="job.status === 'waiting_approval'"
              class="mt-2 flex flex-wrap justify-end gap-1.5"
            >
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-wait disabled:opacity-60"
                :disabled="actioningJobId === `cancel:${job.id}`"
                @click="updateJob(job, 'cancel')"
              >
                <UIcon name="i-lucide-x" class="size-3" />
                Cancel
              </button>
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="actioningJobId === `approve:${job.id}`"
                @click="updateJob(job, 'approve')"
              >
                <UIcon name="i-lucide-check" class="size-3" />
                {{ isFollowUpWaitingForDraft(job) ? 'Generate draft' : 'Approve' }}
              </button>
            </div>
            <p
              v-if="isFollowUpWaitingForDraft(job)"
              class="mt-2 text-xs leading-5 text-white/40"
            >
              Review the source meeting, then generate a draft follow-up for approval before sending.
            </p>
            <p
              v-else-if="jobResultSummary(job)"
              class="mt-2 line-clamp-2 text-xs leading-5 text-white/40"
            >
              {{ jobResultSummary(job) }}
            </p>
            <div
              v-if="expandedJobId === job.id && canExpandJob(job)"
              class="mt-2 space-y-2 rounded-md bg-black/20 p-2 ring-1 ring-white/[0.05]"
              @click.stop
            >
              <div class="flex flex-wrap gap-1">
                <span
                  v-if="sourceMeetingTitle(job)"
                  class="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-100/75 ring-1 ring-sky-300/15"
                >
                  <UIcon name="i-lucide-calendar-days" class="size-3" />
                  {{ sourceMeetingTitle(job) }}
                </span>
                <span
                  v-if="sourceRoomLabel(job)"
                  class="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-white/[0.06]"
                >
                  <UIcon name="i-lucide-map-pin" class="size-3" />
                  {{ sourceRoomLabel(job) }}
                </span>
                <span
                  v-if="sourceStatusLabel(job)"
                  class="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium capitalize text-white/55 ring-1 ring-white/[0.06]"
                >
                  <UIcon name="i-lucide-circle-dot" class="size-3" />
                  {{ sourceStatusLabel(job) }}
                </span>
                <span
                  v-if="sourceActionItemId(job)"
                  class="inline-flex items-center gap-1 rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-100/75 ring-1 ring-violet-300/15"
                  :title="sourceActionItemId(job)"
                >
                  <UIcon name="i-lucide-list-checks" class="size-3" />
                  Action item
                </span>
                <span
                  v-if="draftEdited(job)"
                  class="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-200/15"
                >
                  Edited
                </span>
                <span
                  v-for="recipient in jobRecipients(job)"
                  :key="recipient"
                  class="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/50 ring-1 ring-white/[0.06]"
                >
                  {{ recipient }}
                </span>
                <span
                  v-if="!jobRecipients(job).length"
                  class="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/35 ring-1 ring-white/[0.06]"
                >
                  No external recipients
                </span>
              </div>
              <div v-if="editingJobId === job.id" class="space-y-2">
                <input
                  v-model="editingJobRecipients"
                  class="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                  placeholder="Recipients"
                >
                <p
                  v-if="editingInvalidRecipients.length"
                  class="text-[11px] leading-4 text-red-200/80"
                >
                  Invalid recipient: {{ editingInvalidRecipients.join(', ') }}
                </p>
                <p
                  v-if="hasMeetingSource(job)"
                  class="text-[11px] leading-4 text-white/38"
                >
                  Recipients must already be guests on the source meeting.
                </p>
                <input
                  v-model="editingJobSubject"
                  class="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
                  placeholder="Subject"
                >
                <textarea
                  v-model="editingJobBody"
                  rows="6"
                  class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white outline-none focus:border-white/25"
                  placeholder="Draft body"
                />
              </div>
              <pre
                v-else
                class="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-white/[0.025] p-2 text-[11px] leading-5 text-white/55"
              >{{ jobBody(job) }}</pre>
              <div class="flex flex-wrap justify-end gap-1.5">
                <button
                  v-if="hasMeetingSource(job)"
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
                  :aria-label="`Open source meeting for ${job.title}`"
                  @click="emit('openOfficeArtifacts', sourceMeetingId(job), sourceArtifactId(job), sourceActionItemId(job))"
                >
                  <UIcon :name="sourceActionItemId(job) ? 'i-lucide-list-checks' : 'i-lucide-calendar-days'" class="size-3" />
                  {{ sourceActionItemId(job) ? 'Action source' : 'Meeting' }}
                </button>
                <button
                  v-if="editingJobId !== job.id && deliveryStatus(job) !== 'sent'"
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
                  @click="startEditingDraft(job)"
                >
                  <UIcon name="i-lucide-pencil" class="size-3" />
                  Edit
                </button>
                <button
                  v-else
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80"
                  @click="cancelEditingDraft"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                  Cancel edit
                </button>
                <button
                  v-if="editingJobId === job.id"
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                  :disabled="actioningJobId === `update_draft:${job.id}` || !editingRecipients.length || editingInvalidRecipients.length > 0 || !editingJobSubject.trim() || !editingJobBody.trim()"
                  @click="updateJob(job, 'update_draft')"
                >
                  <UIcon name="i-lucide-save" class="size-3" />
                  Save draft
                </button>
                <button
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.04] px-2 text-[11px] font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white/80 disabled:cursor-wait disabled:opacity-60"
                  :disabled="copyingJobId === job.id"
                  @click="copyJobDraft(job)"
                >
                  <UIcon name="i-lucide-copy" class="size-3" />
                  Copy draft
                </button>
                <button
                  v-if="deliveryStatus(job) !== 'sent'"
                  type="button"
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-sky-400/10 px-2 text-[11px] font-semibold text-sky-100 ring-1 ring-sky-300/15 transition hover:bg-sky-400/15 disabled:cursor-wait disabled:opacity-60"
                  :disabled="actioningJobId === `send:${job.id}` || editingJobId === job.id || !jobRecipients(job).length"
                  @click="updateJob(job, 'send')"
                >
                  <UIcon name="i-lucide-send" class="size-3" />
                  Send email
                </button>
                <span
                  v-else
                  class="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15"
                >
                  <UIcon name="i-lucide-check" class="size-3" />
                  {{ deliveryLabel(job) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form class="space-y-2" @submit.prevent="createWatch">
        <select
          v-model="watchType"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
        >
          <option value="person_available">
            Person available
          </option>
          <option value="room_occupied">
            Room occupied
          </option>
          <option value="co_presence">
            Co-presence
          </option>
          <option value="meeting_ended">
            Meeting ended
          </option>
          <option value="lobby_guest_waiting">
            Lobby guest waiting
          </option>
        </select>
        <select
          v-if="watchType === 'person_available' || watchType === 'co_presence'"
          v-model="targetUserId"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
        >
          <option
            v-for="person in people"
            :key="person.user_id"
            :value="person.user_id"
          >
            {{ person.name }}
          </option>
        </select>
        <select
          v-if="watchType === 'co_presence'"
          v-model="targetSecondUserId"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
        >
          <option
            v-for="person in people.filter(item => item.user_id !== targetUserId)"
            :key="person.user_id"
            :value="person.user_id"
          >
            {{ person.name }}
          </option>
        </select>
        <select
          v-if="watchType === 'room_occupied' || watchType === 'meeting_ended'"
          v-model="targetZoneId"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
        >
          <option
            v-for="room in rooms"
            :key="room.id"
            :value="room.id"
          >
            {{ room.name }}
          </option>
        </select>
        <input
          v-model="label"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
        >
        <button
          type="submit"
          class="h-9 w-full rounded-md bg-amber-300/15 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/20 transition hover:bg-amber-300/20 disabled:cursor-wait disabled:opacity-60"
          :disabled="saving"
        >
          Create watch
        </button>
      </form>
    </div>
  </section>
</template>
