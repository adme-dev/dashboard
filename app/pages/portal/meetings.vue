<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalMeeting {
  id: string
  officeName: string
  title: string
  status: string
  startedAt: string | null
  createdAt: string
  scheduledStartAt: string | null
  durationMinutes: number | null
  zoneName: string | null
  latestRecordingToken: string | null
}

interface PortalMeetingsDashboard {
  meetings: {
    stats: {
      totalVisible: number
      live: number
      planned: number
      recordings: number
    }
    upcoming: PortalMeeting[]
  }
}

const { data, pending } = useFetch<PortalMeetingsDashboard>('/api/portal/dashboard')

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
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <UCard>
          <p class="text-sm text-muted">
            Shared meetings
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.meetings?.stats?.totalVisible || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Live now
          </p>
          <p class="text-2xl font-bold text-success mt-2">
            {{ data?.meetings?.stats?.live || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Planned
          </p>
          <p class="text-2xl font-bold text-primary mt-2">
            {{ data?.meetings?.stats?.planned || 0 }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Recordings
          </p>
          <p class="text-2xl font-bold mt-2">
            {{ data?.meetings?.stats?.recordings || 0 }}
          </p>
        </UCard>
      </div>

      <div class="space-y-4">
        <UCard
          v-for="meeting in data?.meetings?.upcoming || []"
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
            </div>

            <div class="flex flex-wrap gap-2">
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

      <UCard v-if="!(data?.meetings?.upcoming || []).length">
        <div class="text-center py-12">
          <UIcon name="i-lucide-video" class="size-10 text-muted mx-auto mb-3" />
          <h2 class="font-semibold">
            No meetings shared yet
          </h2>
          <p class="text-sm text-muted mt-1">
            When your agency shares client reviews, live sessions, or recordings, they will appear here.
          </p>
        </div>
      </UCard>
    </template>
  </div>
</template>
