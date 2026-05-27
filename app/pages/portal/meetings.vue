<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalMeeting {
  id: string
  officeName: string
  title: string
  joinPath: string
  status: string
  startedAt: string | null
  createdAt: string
  scheduledStartAt: string | null
  durationMinutes: number | null
  zoneName: string | null
  readyRecordingCount?: number
  latestRecordingToken: string | null
  artifacts?: {
    summaries: number
    actionItems: number
    notes: number
    transcripts: number
  }
}

interface PortalMeetingsDashboard {
  stats: {
    totalVisible: number
    live: number
    planned: number
    ended: number
    recordings: number
    summaries: number
    actionItems: number
    notes: number
    transcripts: number
    recordingsLast30: number
    completedLast30: number
    missingFollowUp: number
    nextMeetingAt: string | null
  }
  meetings: PortalMeeting[]
}

interface PortalMeetingArtifact {
  id: string
  type: string
  title: string
  content: string
  createdAt: string
}

const activeTab = ref('upcoming')
const meetingQuery = computed(() => activeTab.value === 'all' ? {} : { view: activeTab.value })

const { data, pending } = useFetch<PortalMeetingsDashboard>('/api/portal/meetings', {
  query: meetingQuery
})

const tabs = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'History', value: 'history' },
  { label: 'All', value: 'all' }
]

const selectedMeeting = ref<PortalMeeting | null>(null)
const showArtifacts = ref(false)
const artifactsUrl = computed(() => selectedMeeting.value ? `/api/portal/meetings/${selectedMeeting.value.id}/artifacts` : null)
const { data: artifactData, pending: artifactsPending } = useFetch<{ artifacts: PortalMeetingArtifact[] }>(artifactsUrl)

function formatMeetingDate(date: string | null | undefined) {
  if (!date) return '-'
  return new Date(date).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function meetingWhen(meeting: { scheduledStartAt?: string | null, startedAt?: string | null, createdAt: string }) {
  return formatMeetingDate(meeting.scheduledStartAt || meeting.startedAt || meeting.createdAt)
}

function statusColor(status: string) {
  if (status === 'live') return 'success'
  if (status === 'planned') return 'primary'
  if (status === 'ended') return 'neutral'
  return 'warning'
}

function emptyLabel() {
  if (activeTab.value === 'history') return 'No meeting history shared yet'
  if (activeTab.value === 'all') return 'No meetings shared yet'
  return 'No upcoming meetings shared yet'
}

function artifactIcon(type: string) {
  if (type === 'summary') return 'i-lucide-file-text'
  if (type === 'action_items') return 'i-lucide-list-checks'
  if (type === 'transcript') return 'i-lucide-scroll-text'
  return 'i-lucide-notebook-text'
}

function openArtifacts(meeting: PortalMeeting) {
  selectedMeeting.value = meeting
  showArtifacts.value = true
}

function artifactCount(meeting: PortalMeeting) {
  const artifacts = meeting.artifacts
  if (!artifacts) return 0
  return artifacts.summaries + artifacts.actionItems + artifacts.notes + artifacts.transcripts
}

function formatCompactDate(date: string | null | undefined) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-6xl mx-auto">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Meetings
        </h1>
        <p class="text-muted mt-1">
          Upcoming client reviews, live sessions, and shared recordings from your agency.
        </p>
      </div>
      <UButton
        to="/portal/requests"
        icon="i-lucide-message-square-plus"
        color="neutral"
        variant="outline"
      >
        Request a meeting
      </UButton>
    </div>

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="i in 4" :key="i" class="h-44 rounded-lg bg-elevated animate-pulse" />
    </div>

    <template v-else>
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <UCard>
          <p class="text-sm text-muted">
            Shared meetings
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.stats?.totalVisible || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Live now
          </p>
          <p class="text-2xl font-bold text-success mt-2">
            {{ data?.stats?.live || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Planned
          </p>
          <p class="text-2xl font-bold text-primary mt-2">
            {{ data?.stats?.planned || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Recordings
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.stats?.recordings || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Summaries
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.stats?.summaries || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Action items
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.stats?.actionItems || 0 }}
          </p>
        </UCard>
      </div>

      <UCard v-if="data?.stats">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-gauge" class="text-primary" />
            <span class="font-semibold">Meeting readiness</span>
          </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'upcoming'"
          >
            <p class="text-xs text-muted">
              Next meeting
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ formatCompactDate(data.stats.nextMeetingAt) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.stats.live }} live, {{ data.stats.planned }} planned
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'history'"
          >
            <p class="text-xs text-muted">
              Completed last 30d
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ data.stats.completedLast30 }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Recent client sessions
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'history'"
          >
            <p class="text-xs text-muted">
              New recordings
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ data.stats.recordingsLast30 }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Ready in the last 30 days
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'history'"
          >
            <p class="text-xs text-muted">
              Missing follow-up
            </p>
            <p class="mt-1 text-sm font-semibold" :class="data.stats.missingFollowUp > 0 ? 'text-warning' : ''">
              {{ data.stats.missingFollowUp }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Ended sessions without notes
            </p>
          </button>
        </div>
      </UCard>

      <UTabs v-model="activeTab" :items="tabs" />

      <div class="space-y-4">
        <UCard
          v-for="meeting in data?.meetings || []"
          :key="meeting.id"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-semibold truncate">
                  {{ meeting.title }}
                </h2>
                <UBadge :color="statusColor(meeting.status)" variant="subtle">
                  {{ meeting.status }}
                </UBadge>
              </div>
              <div class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-calendar-clock" class="size-4" />
                  <span>{{ meetingWhen(meeting) }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-door-open" class="size-4" />
                  <span>{{ meeting.zoneName || meeting.officeName }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-clock" class="size-4" />
                  <span>{{ meeting.durationMinutes ? `${meeting.durationMinutes} min` : 'Duration pending' }}</span>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-1">
                <UBadge
                  v-if="meeting.artifacts?.summaries"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  Summary
                </UBadge>
                <UBadge
                  v-if="meeting.artifacts?.actionItems"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  Actions
                </UBadge>
                <UBadge
                  v-if="meeting.artifacts?.notes"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  Notes
                </UBadge>
                <UBadge
                  v-if="meeting.artifacts?.transcripts"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  Transcript
                </UBadge>
                <UBadge
                  v-if="meeting.readyRecordingCount"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ meeting.readyRecordingCount }} recording{{ meeting.readyRecordingCount === 1 ? '' : 's' }}
                </UBadge>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="meeting.status === 'live' || meeting.status === 'planned'"
                :to="meeting.joinPath"
                icon="i-lucide-video"
                color="primary"
              >
                Join meeting
              </UButton>
              <UButton
                v-if="meeting.latestRecordingToken"
                :to="`/recordings/${meeting.latestRecordingToken}`"
                icon="i-lucide-play"
                color="primary"
                variant="outline"
              >
                Watch recording
              </UButton>
              <UButton
                v-if="meeting.status !== 'live'"
                icon="i-lucide-file-text"
                color="neutral"
                variant="outline"
                @click="openArtifacts(meeting)"
              >
                {{ artifactCount(meeting) ? `${artifactCount(meeting)} note${artifactCount(meeting) === 1 ? '' : 's'}` : 'Notes' }}
              </UButton>
              <UButton
                to="/portal/requests"
                icon="i-lucide-message-square"
                color="neutral"
                variant="ghost"
              >
                Message agency
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <UCard v-if="!(data?.meetings || []).length">
        <div class="text-center py-12">
          <UIcon name="i-lucide-video" class="size-10 text-muted mx-auto mb-3" />
          <h2 class="font-semibold">
            {{ emptyLabel() }}
          </h2>
          <p class="text-sm text-muted mt-1">
            When your agency shares client reviews, live sessions, or recordings, they will appear here.
          </p>
        </div>
      </UCard>
    </template>

    <USlideover v-model:open="showArtifacts">
      <template #content>
        <div class="p-6 space-y-5">
          <div>
            <h2 class="text-lg font-semibold">
              {{ selectedMeeting?.title || 'Meeting notes' }}
            </h2>
            <p class="text-sm text-muted mt-1">
              {{ selectedMeeting ? meetingWhen(selectedMeeting) : '' }}
            </p>
          </div>

          <div v-if="artifactsPending" class="space-y-3">
            <div v-for="i in 3" :key="i" class="h-24 rounded-lg bg-elevated animate-pulse" />
          </div>

          <div v-else class="space-y-3">
            <UCard
              v-for="artifact in artifactData?.artifacts || []"
              :key="artifact.id"
            >
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon :name="artifactIcon(artifact.type)" class="text-primary" />
                  <span class="font-semibold text-sm">{{ artifact.title }}</span>
                </div>
              </template>
              <p class="text-sm whitespace-pre-wrap line-clamp-[12]">
                {{ artifact.content }}
              </p>
            </UCard>

            <p v-if="!(artifactData?.artifacts || []).length" class="text-sm text-muted text-center py-8">
              No notes, summary, or transcript have been shared for this meeting yet.
            </p>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
