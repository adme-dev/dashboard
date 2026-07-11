<script setup lang="ts">
import type { OfficeLobbyRequestRow } from '~~/app/types/office'
import { parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'

type LobbyRequest = OfficeLobbyRequestRow & {
  zone_name: string | null
  zone_slug: string | null
  handled_by_name: string | null
  pending_expires_at: string
  accepted_expires_at: string | null
}
type LobbyRequestPatchResponse = {
  request: LobbyRequest
  meetingSessionId?: string | null
}

const props = defineProps<{
  officeId: string
  myRole: string
}>()

const emit = defineEmits<{
  openOfficeArtifacts: [meetingId: string]
}>()

const toast = useToast()
const busyRequestId = ref<string | null>(null)
const lastSeenRequestIds = ref<Set<string>>(new Set())
const hasLoadedOnce = ref(false)
const showHistory = ref(false)
const historyStatus = ref<'accepted' | 'declined' | 'expired'>('accepted')
const nowMs = ref(Date.now())
const lastUpdatedAtMs = ref<number | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

const PENDING_EXPIRY_MINUTES = 30

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>
const data = ref<{ requests: LobbyRequest[] }>({ requests: [] })
const historyData = ref<{ requests: LobbyRequest[] }>({ requests: [] })
const pending = ref(false)
const historyPending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ requests: LobbyRequest[] }>(
      `/api/office/${props.officeId}/lobby-requests`,
      { query: { status: 'pending' } }
    )
  } catch {
    // Keep the previous queue visible during transient polling failures.
  } finally {
    pending.value = false
  }
}

async function refreshHistory() {
  historyPending.value = true
  try {
    historyData.value = await apiFetch<{ requests: LobbyRequest[] }>(
      `/api/office/${props.officeId}/lobby-requests`,
      { query: { status: historyStatus.value } }
    )
  } catch {
    // History is secondary UI; preserve the current list if a refresh fails.
  } finally {
    historyPending.value = false
  }
}

await refresh()

const requests = computed(() => data.value?.requests ?? [])
const historyRequests = computed(() => historyData.value?.requests ?? [])
const requestItems = computed(() =>
  requests.value.map(request => ({
    request,
    parsed: parseOfficeLobbyMessage(request.message)
  }))
)
const historyItems = computed(() =>
  historyRequests.value.slice(0, 6).map(request => ({
    request,
    parsed: parseOfficeLobbyMessage(request.message)
  }))
)
const canHandle = computed(() => props.myRole === 'admin')
const scheduledRequestCount = computed(() =>
  requests.value.filter(request => Boolean(request.scheduled_start_at)).length
)
const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAtMs.value) return 'Live'
  const seconds = Math.max(0, Math.floor((nowMs.value - lastUpdatedAtMs.value) / 1000))
  if (seconds < 5) return 'Refreshed now'
  if (seconds < 60) return `Refreshed ${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return 'Refreshed 1 min ago'
  return `Refreshed ${minutes} min ago`
})
const shouldShowQueue = computed(() =>
  pending.value || requests.value.length > 0 || canHandle.value || showHistory.value
)
const isCompact = computed(() =>
  canHandle.value && requests.value.length === 0 && !showHistory.value
)

function minutesUntil(timestamp: string) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return null
  return Math.ceil((time - nowMs.value) / 60_000)
}

function requestAge(createdAt: string) {
  const delta = nowMs.value - new Date(createdAt).getTime()
  const minutes = Math.max(0, Math.floor(delta / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`
}

function pendingExpiryLabel(expiresAt: string) {
  const minutes = minutesUntil(expiresAt)
  if (minutes === null) return 'Expiry pending'
  const remainingMinutes = Math.min(PENDING_EXPIRY_MINUTES, minutes)
  if (remainingMinutes <= 0) return 'Expires on refresh'
  if (remainingMinutes === 1) return 'Expires in 1 min'
  return `Expires in ${remainingMinutes} min`
}

function scheduledPendingLabel(startsAt: string | null) {
  if (!startsAt) return null
  const minutes = minutesUntil(startsAt)
  if (minutes === null) return 'Scheduled time pending'
  if (minutes <= 0) return 'Host response window is open'
  if (minutes === 1) return 'Scheduled in 1 min'
  if (minutes < 60) return `Scheduled in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (remaining === 0) return `Scheduled in ${hours} hr${hours === 1 ? '' : 's'}`
  return `Scheduled in ${hours} hr ${remaining} min`
}

function pendingExpiryPercent(createdAt: string, expiresAt: string) {
  const startedAt = new Date(createdAt).getTime()
  const expiresAtMs = new Date(expiresAt).getTime()
  const total = expiresAtMs - startedAt
  if (!Number.isFinite(startedAt) || !Number.isFinite(expiresAtMs) || total <= 0) return 0
  const remaining = expiresAtMs - nowMs.value
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
}

function acceptedExpiryLabel(expiresAt: string | null) {
  if (!expiresAt) return 'Access window unavailable'
  const remainingMinutes = minutesUntil(expiresAt)
  if (remainingMinutes === null) return 'Access expiry pending'
  if (remainingMinutes <= 0) return 'Access expires on refresh'
  if (remainingMinutes === 1) return 'Access expires in 1 min'
  if (remainingMinutes < 60) return `Access expires in ${remainingMinutes} min`
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (minutes === 0) return `Access expires in ${hours} hr${hours === 1 ? '' : 's'}`
  return `Access expires in ${hours} hr ${minutes} min`
}

function scheduledStartLabel(startsAt: string | null) {
  if (!startsAt) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(startsAt))
}

function officeRoomTarget(request: LobbyRequest) {
  return request.zone_slug
    ? { path: '/office', query: { room: request.zone_slug } }
    : { path: '/office' }
}

function guestRoomUrl(request: LobbyRequest) {
  const path = `/lobby-room/${props.officeId}/${request.id}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

function officeLobbyUrl() {
  const path = `/lobby/${props.officeId}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

async function copyOfficeLobbyLink() {
  const link = officeLobbyUrl()
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(link)
    toast.add({
      title: 'Lobby invite copied',
      description: 'Share this with external guests before a meeting.',
      color: 'success',
      icon: 'i-lucide-link',
      duration: 1800
    })
  } catch {
    toast.add({
      title: 'Lobby invite link',
      description: link,
      color: 'neutral',
      icon: 'i-lucide-link',
      duration: 5000
    })
  }
}

async function copyGuestRoomLink(request: LobbyRequest) {
  const link = guestRoomUrl(request)
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(link)
    toast.add({
      title: 'Guest room link copied',
      description: request.guest_name,
      color: 'success',
      icon: 'i-lucide-link',
      duration: 1800
    })
  } catch {
    toast.add({
      title: 'Guest room link',
      description: link,
      color: 'neutral',
      icon: 'i-lucide-link',
      duration: 5000
    })
  }
}

async function updateRequest(request: LobbyRequest, status: 'accepted' | 'declined' | 'expired') {
  if (!canHandle.value || busyRequestId.value) return

  busyRequestId.value = request.id
  try {
    const response = await apiFetch<LobbyRequestPatchResponse>(`/api/office/${props.officeId}/lobby-requests/${request.id}`, {
      method: 'PATCH',
      body: { status }
    })
    const labels = {
      accepted: 'Guest accepted',
      declined: 'Guest declined',
      expired: 'Guest access ended'
    }
    toast.add({
      title: labels[status],
      description: `${request.guest_name} · ${response.request.zone_name || request.zone_name || 'Office lobby'}`,
      color: status === 'accepted' ? 'success' : 'neutral',
      icon: status === 'accepted' ? 'i-lucide-check' : status === 'expired' ? 'i-lucide-lock' : 'i-lucide-x'
    })
    await refresh()
    if (status === 'accepted') {
      showHistory.value = true
      historyStatus.value = 'accepted'
      await refreshHistory()
      if (response.meetingSessionId) emit('openOfficeArtifacts', response.meetingSessionId)
    } else if (showHistory.value) {
      await refreshHistory()
    }
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not update request',
      description: message || 'Try again in a moment.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    busyRequestId.value = null
  }
}

async function refreshQuietly() {
  await refresh()
  if (showHistory.value) await refreshHistory()
  lastUpdatedAtMs.value = Date.now()
  nowMs.value = lastUpdatedAtMs.value
}

async function refreshNow() {
  await refreshQuietly()
}

async function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) await refreshHistory()
}

watch(
  requests,
  (nextRequests) => {
    const nextIds = new Set(nextRequests.map(request => request.id))
    if (hasLoadedOnce.value) {
      const newRequest = nextRequests.find(request => !lastSeenRequestIds.value.has(request.id))
      if (newRequest) {
        const parsed = parseOfficeLobbyMessage(newRequest.message)
        const description = [
          parsed.meetingTitle,
          newRequest.zone_name || 'Office lobby',
          scheduledPendingLabel(newRequest.scheduled_start_at)
        ].filter(Boolean).join(' · ')
        toast.add({
          title: `${newRequest.guest_name} is waiting`,
          description,
          color: 'primary',
          icon: newRequest.scheduled_start_at ? 'i-lucide-calendar-clock' : 'i-lucide-door-open',
          duration: 3500
        })
      }
    }

    lastSeenRequestIds.value = nextIds
    hasLoadedOnce.value = true
    if (!lastUpdatedAtMs.value) {
      lastUpdatedAtMs.value = Date.now()
      nowMs.value = lastUpdatedAtMs.value
    }
  },
  { immediate: true }
)

watch(
  () => props.officeId,
  () => {
    lastSeenRequestIds.value = new Set()
    hasLoadedOnce.value = false
    lastUpdatedAtMs.value = null
    void refresh()
    if (showHistory.value) void refreshHistory()
  }
)

watch(
  historyStatus,
  () => {
    if (showHistory.value) void refreshHistory()
  }
)

onMounted(() => {
  clockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
  pollTimer = setInterval(() => {
    if (!pending.value && !busyRequestId.value) {
      void refreshQuietly()
    }
  }, 7500)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <section
    v-if="shouldShowQueue"
    class="mb-4 overflow-hidden rounded-xl border border-emerald-400/15 bg-[#10151b] shadow-2xl transition-all"
    :class="isCompact ? 'shadow-none' : ''"
  >
    <div
      class="flex items-center justify-between px-3 py-2"
      :class="isCompact ? '' : 'border-b border-white/[0.06]'"
    >
      <div class="flex items-center gap-2">
        <span class="flex size-7 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/20">
          <UIcon name="i-lucide-door-open" class="size-3.5 text-emerald-300" />
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm font-semibold text-white">
            Lobby requests
            <UBadge
              v-if="requests.length"
              color="primary"
              variant="subtle"
              size="sm"
            >
              {{ requests.length }}
            </UBadge>
            <UBadge
              v-if="scheduledRequestCount"
              color="info"
              variant="subtle"
              size="sm"
              icon="i-lucide-calendar-clock"
            >
              {{ scheduledRequestCount }} scheduled
            </UBadge>
          </div>
          <div class="text-xs text-white/40">
            {{ isCompact ? 'No guests waiting' : 'External guests waiting to enter' }} · {{ lastUpdatedLabel }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          v-if="canHandle"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-user-plus"
          label="Invite"
          @click="copyOfficeLobbyLink"
        />
        <UButton
          v-if="isCompact"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-history"
          label="Recent"
          :loading="historyPending"
          @click="toggleHistory"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          aria-label="Refresh lobby requests"
          @click="refreshNow"
        />
      </div>
    </div>

    <div
      v-if="!isCompact && pending && !requests.length"
      class="flex gap-3 px-3 py-3"
    >
      <USkeleton class="h-14 flex-1" />
      <USkeleton class="h-14 flex-1" />
    </div>

    <div
      v-else-if="!isCompact"
      class="grid gap-2 p-3 lg:grid-cols-2"
    >
      <div
        v-if="!requests.length"
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-white/45 lg:col-span-2"
      >
        No guests waiting right now.
      </div>

      <article
        v-for="{ request, parsed } in requestItems"
        :key="request.id"
        class="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-white">
              {{ request.guest_name }}
            </div>
            <div class="mt-0.5 truncate text-xs text-white/45">
              {{ request.guest_email }}
            </div>
          </div>
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ requestAge(request.created_at) }}
          </UBadge>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/55">
          <span class="inline-flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0 text-white/35" />
            <span class="truncate">{{ request.zone_name || 'Office lobby' }}</span>
          </span>
          <UBadge
            v-if="parsed.source === 'embed'"
            color="primary"
            variant="subtle"
            size="sm"
            icon="i-lucide-code-2"
          >
            Embed
          </UBadge>
        </div>

        <div
          v-if="parsed.meetingTitle"
          class="mt-2 flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-xs text-white/65 ring-1 ring-white/[0.06]"
        >
          <UIcon name="i-lucide-calendar-check" class="size-3.5 text-emerald-200/80" />
          <span class="min-w-0 truncate">{{ parsed.meetingTitle }}</span>
        </div>

        <div
          v-if="!request.scheduled_start_at"
          class="mt-2 flex items-center gap-2 text-xs text-white/45"
        >
          <UIcon name="i-lucide-clock" class="size-3.5 text-white/30" />
          <span>{{ pendingExpiryLabel(request.pending_expires_at) }}</span>
        </div>

        <div
          v-if="request.scheduled_start_at"
          class="mt-2 flex items-center gap-2 rounded-md bg-sky-400/10 px-2 py-1.5 text-xs text-sky-100 ring-1 ring-sky-300/15"
        >
          <UIcon name="i-lucide-calendar-clock" class="size-3.5 text-sky-200/80" />
          <span>{{ scheduledPendingLabel(request.scheduled_start_at) }} · {{ scheduledStartLabel(request.scheduled_start_at) }}</span>
        </div>

        <div
          v-if="!request.scheduled_start_at"
          class="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]"
        >
          <div
            class="h-full rounded-full bg-emerald-300/60 transition-[width] duration-500"
            :style="{ width: pendingExpiryPercent(request.created_at, request.pending_expires_at) + '%' }"
          />
        </div>

        <template v-if="request.message">
          <div
            v-if="parsed.prejoin"
            class="mt-3 flex flex-wrap gap-1.5"
          >
            <UBadge
              size="sm"
              variant="subtle"
              :color="parsed.prejoin.micReady ? 'success' : 'neutral'"
              :icon="parsed.prejoin.micReady ? 'i-lucide-mic' : 'i-lucide-mic-off'"
            >
              {{ parsed.prejoin.micReady ? 'Mic ready' : 'Muted' }}
            </UBadge>
            <UBadge
              size="sm"
              variant="subtle"
              :color="parsed.prejoin.cameraOn ? 'success' : 'neutral'"
              :icon="parsed.prejoin.cameraOn ? 'i-lucide-video' : 'i-lucide-video-off'"
            >
              {{ parsed.prejoin.cameraOn ? 'Camera on' : 'Camera off' }}
            </UBadge>
            <UBadge
              size="sm"
              variant="subtle"
              :color="parsed.prejoin.notesApproved ? 'info' : 'neutral'"
              icon="i-lucide-notebook-pen"
            >
              {{ parsed.prejoin.notesApproved ? 'Notes ok' : 'No notes' }}
            </UBadge>
            <UBadge
              size="sm"
              variant="subtle"
              :color="parsed.prejoin.recordingApproved ? 'info' : 'neutral'"
              icon="i-lucide-radio"
            >
              {{ parsed.prejoin.recordingApproved ? 'Recording ok' : 'No recording' }}
            </UBadge>
          </div>

          <p
            v-if="parsed.note"
            class="mt-2 line-clamp-2 text-xs leading-5 text-white/45"
          >
            {{ parsed.note }}
          </p>

          <div
            v-if="parsed.intakeAnswers.length"
            class="mt-3 space-y-1.5 rounded-lg bg-white/[0.035] p-2 ring-1 ring-white/[0.05]"
          >
            <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
              <UIcon name="i-lucide-clipboard-list" class="size-3.5" />
              Intake
            </div>
            <div
              v-for="answer in parsed.intakeAnswers.slice(0, 3)"
              :key="answer.label"
              class="min-w-0"
            >
              <div class="truncate text-[11px] font-medium text-white/55">
                {{ answer.label }}
              </div>
              <p class="mt-0.5 line-clamp-2 whitespace-pre-line text-xs leading-5 text-white/75">
                {{ answer.value || 'No answer' }}
              </p>
            </div>
          </div>
        </template>

        <div class="mt-3 flex gap-2">
          <UButton
            size="xs"
            color="primary"
            variant="solid"
            icon="i-lucide-check"
            label="Accept"
            :disabled="!canHandle || busyRequestId !== null"
            :loading="busyRequestId === request.id"
            @click="updateRequest(request, 'accepted')"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-x"
            label="Decline"
            :disabled="!canHandle || busyRequestId !== null"
            @click="updateRequest(request, 'declined')"
          />
          <UButton
            v-if="request.zone_slug"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-up-right"
            label="Room"
            :to="{ path: '/office', query: { room: request.zone_slug } }"
          />
          <UButton
            v-if="parsed.meetingId"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-calendar-check"
            label="Meeting"
            @click="emit('openOfficeArtifacts', parsed.meetingId)"
          />
        </div>
      </article>
    </div>

    <div
      v-if="!isCompact"
      class="flex items-center gap-1 border-t border-white/[0.06] px-3 py-2"
    >
      <UButton
        v-if="canHandle"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-user-plus"
        label="Copy lobby invite"
        @click="copyOfficeLobbyLink"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="showHistory ? 'i-lucide-chevron-up' : 'i-lucide-history'"
        :label="showHistory ? 'Hide recent handled' : 'Recent handled'"
        :loading="historyPending"
        @click="toggleHistory"
      />
    </div>

    <div
      v-if="showHistory"
      class="border-t border-white/[0.06] p-3"
    >
      <div class="mb-3 inline-flex rounded-lg bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="historyStatus === 'accepted' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/75'"
          @click="historyStatus = 'accepted'"
        >
          Accepted
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="historyStatus === 'declined' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/75'"
          @click="historyStatus = 'declined'"
        >
          Declined
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="historyStatus === 'expired' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/75'"
          @click="historyStatus = 'expired'"
        >
          Ended
        </button>
      </div>

      <div
        v-if="historyPending && !historyRequests.length"
        class="space-y-2"
      >
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-full" />
      </div>

      <div
        v-else-if="!historyRequests.length"
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-white/45"
      >
        No {{ historyStatus }} guests yet.
      </div>

      <div
        v-else
        class="grid gap-2 lg:grid-cols-2"
      >
        <article
          v-for="{ request, parsed } in historyItems"
          :key="request.id"
          class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-white/80">
                {{ request.guest_name }}
              </div>
              <div class="mt-0.5 truncate text-[11px] text-white/40">
                {{ request.zone_name || 'Office lobby' }}
              </div>
              <UBadge
                v-if="parsed.source === 'embed'"
                color="primary"
                variant="subtle"
                size="sm"
                icon="i-lucide-code-2"
                class="mt-1"
              >
                Embed
              </UBadge>
              <div
                v-if="parsed.meetingTitle"
                class="mt-0.5 truncate text-[11px] text-emerald-200/65"
              >
                {{ parsed.meetingTitle }}
              </div>
              <div
                v-if="request.scheduled_start_at"
                class="mt-0.5 truncate text-[11px] text-sky-200/60"
              >
                {{ scheduledStartLabel(request.scheduled_start_at) }}
              </div>
            </div>
            <UBadge
              :color="request.status === 'accepted' ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ request.status === 'accepted' ? 'Accepted' : request.status === 'expired' ? 'Ended' : 'Declined' }}
            </UBadge>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <div class="min-w-0 truncate text-[11px] text-white/35">
              {{ request.handled_by_name ? `Handled by ${request.handled_by_name}` : 'Handled' }}
            </div>
            <div
              v-if="request.status === 'accepted'"
              class="flex shrink-0 items-center gap-1"
            >
              <template v-if="request.zone_slug">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-door-open"
                  label="Enter room"
                  :to="officeRoomTarget(request)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-link"
                  label="Guest link"
                  @click="copyGuestRoomLink(request)"
                />
                <UButton
                  v-if="parsed.meetingId"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-calendar-check"
                  label="Meeting"
                  @click="emit('openOfficeArtifacts', parsed.meetingId)"
                />
              </template>
              <UBadge
                v-else
                color="warning"
                variant="subtle"
                size="sm"
                icon="i-lucide-triangle-alert"
              >
                Needs new room approval
              </UBadge>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-lock"
                label="End access"
                :disabled="!canHandle || busyRequestId !== null"
                :loading="busyRequestId === request.id"
                @click="updateRequest(request, 'expired')"
              />
            </div>
          </div>
          <div
            v-if="request.status === 'accepted'"
            class="mt-2 flex items-center gap-1.5 text-[11px] text-white/35"
          >
            <UIcon name="i-lucide-clock" class="size-3 text-white/25" />
            <span>{{ acceptedExpiryLabel(request.accepted_expires_at) }}</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
