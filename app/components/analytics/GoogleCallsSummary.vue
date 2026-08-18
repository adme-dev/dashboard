<script setup lang="ts">
interface GoogleCallSummary {
  totalCalls: number
  answeredCalls: number
  missedCalls: number
  unknownCalls: number
  durationAvailableCalls: number
  totalDurationSeconds: number | null
  averageDurationSeconds: number | null
  longestDurationSeconds: number | null
  lastSyncedAt: string | null
}

interface GoogleCallCampaign {
  campaignId: string | null
  campaignName: string
  totalCalls: number
  answeredCalls: number
  missedCalls: number
  durationAvailableCalls: number
  averageDurationSeconds: number | null
}

interface GoogleCallResponse {
  summary: GoogleCallSummary
  health: {
    lastAttemptAt: string | null
    lastSuccessAt: string | null
    lastRowCount: number
    status: 'healthy' | 'error' | 'pending' | 'dormant'
    lastError: string | null
  }
  byCampaign: GoogleCallCampaign[]
  durationNote: string
}

const props = defineProps<{
  endpoint: string
  query: Record<string, string>
}>()

const data = ref<GoogleCallResponse | null>(null)
const status = ref<'pending' | 'success' | 'error'>('pending')

const columns = [
  { accessorKey: 'campaignName', header: 'Campaign' },
  { accessorKey: 'totalCalls', header: 'Calls' },
  { accessorKey: 'answeredCalls', header: 'Answered' },
  { accessorKey: 'missedCalls', header: 'Missed' },
  { accessorKey: 'averageDuration', header: 'Avg. duration' }
]

const tableRows = computed(() => (data.value?.byCampaign || []).map(campaign => ({
  ...campaign,
  averageDuration: formatDuration(campaign.averageDurationSeconds)
})))

const healthLabel = computed(() => {
  if (data.value?.health.status === 'healthy') return 'Synced'
  if (data.value?.health.status === 'error') return 'Sync needs attention'
  if (data.value?.health.status === 'pending') return 'Sync pending'
  return 'Not synced yet'
})

const healthColor = computed(() => {
  if (data.value?.health.status === 'healthy') return 'success'
  if (data.value?.health.status === 'error') return 'error'
  if (data.value?.health.status === 'pending') return 'warning'
  return 'neutral'
})

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'Unavailable'
  const rounded = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

async function loadCalls() {
  status.value = 'pending'
  try {
    data.value = await $fetch<GoogleCallResponse>(props.endpoint, { query: props.query })
    status.value = 'success'
  } catch {
    data.value = null
    status.value = 'error'
  }
}

watch(
  () => [props.endpoint, JSON.stringify(props.query)],
  () => { void loadCalls() },
  { immediate: true }
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-phone-call" class="size-5 text-primary" />
            <h2 class="text-base font-semibold text-default">
              Google Ads calls
            </h2>
          </div>
          <p class="mt-1 text-sm text-muted">
            Answered, missed and duration data reported directly by Google Ads.
          </p>
        </div>
        <UBadge
          v-if="data"
          :color="healthColor"
          variant="subtle"
          :label="healthLabel"
        />
      </div>
    </template>

    <div v-if="status === 'pending'" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-20 rounded-lg" />
    </div>

    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Google Ads calls could not be loaded"
      description="Try again shortly. If the issue continues, check the Google Ads connection."
    />

    <template v-else-if="data">
      <UAlert
        v-if="data.health.status === 'error'"
        class="mb-4"
        color="warning"
        variant="subtle"
        icon="i-lucide-refresh-cw-off"
        title="Sync needs attention"
        description="The last Google Ads call import did not complete. Existing call data remains visible."
      />

      <div v-if="data.summary.totalCalls === 0" class="py-8 text-center">
        <UIcon name="i-lucide-phone-off" class="mx-auto size-8 text-muted" />
        <p class="mt-3 text-sm font-medium text-default">
          No Google Ads calls in this period
        </p>
        <p class="mt-1 text-sm text-muted">
          Calls appear after Google Ads publishes call reporting for a connected account.
        </p>
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-lg border border-default bg-elevated/30 p-4">
            <p class="text-xs font-medium text-muted">Total calls</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-default">{{ data.summary.totalCalls }}</p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/30 p-4">
            <p class="text-xs font-medium text-muted">Answered</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-success">{{ data.summary.answeredCalls }}</p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/30 p-4">
            <p class="text-xs font-medium text-muted">Missed</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-warning">{{ data.summary.missedCalls }}</p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/30 p-4">
            <p class="text-xs font-medium text-muted">Average duration</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-default">
              {{ formatDuration(data.summary.averageDurationSeconds) }}
            </p>
          </div>
        </div>

        <UAlert
          v-if="data.summary.durationAvailableCalls === 0"
          class="mt-4"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          title="Duration unavailable from Google Ads"
          :description="data.durationNote"
        />

        <div v-if="tableRows.length" class="mt-5 overflow-x-auto">
          <UTable :data="tableRows" :columns="columns" />
        </div>
      </template>
    </template>
  </UCard>
</template>
