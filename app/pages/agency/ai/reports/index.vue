<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'agency' })

const { reports, loading, fetchReports, triggerRun } = useAiAgent()
const { isAdmin } = useAuth()

const selectedType = ref('all')
const triggering = ref(false)

const typeOptions = [
  { label: 'All Reports', value: 'all' },
  { label: 'Daily Digest', value: 'daily_digest' },
  { label: 'Weekly Report', value: 'weekly_report' },
  { label: 'Anomaly Scan', value: 'anomaly_scan' },
]

const reportTypeColors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  daily_digest: 'primary',
  weekly_report: 'success',
  anomaly_scan: 'warning',
  manual: 'info',
}

function reportTypeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function relativeDate(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

async function handleTrigger() {
  triggering.value = true
  await triggerRun('manual')
  // Refresh reports after a short delay to allow run to process
  setTimeout(async () => {
    await fetchReports(selectedType.value)
    triggering.value = false
  }, 2000)
}

watch(selectedType, (val) => {
  fetchReports(val)
})

onMounted(() => {
  fetchReports(selectedType.value)
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="AI Reports">
        <template #right>
          <UButton
            v-if="isAdmin"
            color="primary"
            icon="i-lucide-sparkles"
            label="Trigger Report"
            :loading="triggering"
            @click="handleTrigger"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Header -->
        <div class="mb-6">
          <p class="text-sm text-[var(--ui-text-muted)]">
            Automated insights and analysis from your AI agent
          </p>
        </div>

        <!-- Filter bar -->
        <div class="flex items-center gap-3 mb-6">
          <USelect
            v-model="selectedType"
            :items="typeOptions"
            value-key="value"
            class="w-48"
          />
        </div>

        <!-- Loading -->
        <div v-if="loading" class="space-y-3">
          <div v-for="i in 4" :key="i" class="rounded-lg border border-[var(--ui-border)] p-4">
            <div class="flex items-center gap-3">
              <USkeleton class="h-5 w-48 rounded" />
              <USkeleton class="h-5 w-24 rounded" />
            </div>
            <USkeleton class="h-4 w-32 rounded mt-2" />
          </div>
        </div>

        <!-- Reports list -->
        <div v-else-if="reports.length" class="space-y-3">
          <NuxtLink
            v-for="report in reports"
            :key="report.id"
            :to="`/agency/ai/reports/${report.id}`"
            class="block rounded-lg border border-[var(--ui-border)] p-4 hover:bg-[var(--ui-bg-elevated)] transition-colors cursor-pointer"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <!-- Unread indicator -->
                <div class="pt-1.5 shrink-0">
                  <div
                    v-if="!report.isRead"
                    class="w-2.5 h-2.5 rounded-full bg-blue-500"
                  />
                  <div v-else class="w-2.5 h-2.5" />
                </div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)] truncate">
                    {{ report.title }}
                  </h3>
                  <p class="text-sm text-[var(--ui-text-muted)] mt-0.5">
                    {{ relativeDate(report.createdAt) }}
                  </p>
                </div>
              </div>
              <UBadge
                :color="reportTypeColors[report.reportType] || 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ reportTypeLabel(report.reportType) }}
              </UBadge>
            </div>
          </NuxtLink>
        </div>

        <!-- Empty state -->
        <div v-else class="text-center py-16">
          <UIcon name="i-lucide-brain" class="w-12 h-12 text-[var(--ui-text-dimmed)] mx-auto mb-3" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)] mb-1">No reports yet</h3>
          <p class="text-sm text-[var(--ui-text-muted)] max-w-sm mx-auto">
            Your AI agent will generate reports based on your schedule. Check your
            <NuxtLink to="/agency/ai/settings" class="text-[var(--ui-color-primary)] hover:underline">
              AI settings
            </NuxtLink>
            to configure report delivery.
          </p>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
