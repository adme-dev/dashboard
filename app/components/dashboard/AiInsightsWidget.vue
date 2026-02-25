<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

const { data, status } = await useFetch('/api/agency/ai/agent/reports', {
  query: { limit: 1 }
})

const latestReport = computed(() => {
  const reports = (data.value as any)?.reports
  return reports?.length ? reports[0] : null
})

function relativeDate(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

// Extract quick stats from the report summary or sections
const stats = computed(() => {
  if (!latestReport.value) return null
  const sections = latestReport.value.sections || []
  let overdue = 0
  let blocked = 0
  let risks = 0

  for (const section of sections) {
    if (section.severity === 'critical') risks++
    if (section.severity === 'warning') blocked++
    // Try to extract numbers from content
    const overdueMatch = section.content?.match(/(\d+)\s*overdue/i)
    const blockedMatch = section.content?.match(/(\d+)\s*blocked/i)
    if (overdueMatch) overdue = parseInt(overdueMatch[1])
    if (blockedMatch) blocked = parseInt(blockedMatch[1])
  }

  return { overdue, blocked, risks }
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-brain" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">AI Insights</h3>
        </div>
        <UButton to="/agency/ai/reports" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Reports
        </UButton>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-5 w-48 rounded" />
      <USkeleton class="h-4 w-32 rounded" />
      <USkeleton class="h-10 w-full rounded" />
    </div>

    <!-- Has report -->
    <div v-else-if="latestReport" class="space-y-3">
      <!-- Latest report -->
      <NuxtLink
        :to="`/agency/ai/reports/${latestReport.id}`"
        class="block p-3 rounded-lg bg-[var(--ui-bg-elevated)] hover:bg-[var(--ui-bg-accented)] transition-colors"
      >
        <div class="flex items-start gap-2">
          <div
            v-if="!latestReport.isRead"
            class="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"
          />
          <div class="min-w-0">
            <p class="font-medium text-sm text-[var(--ui-text-highlighted)] truncate">
              {{ latestReport.title }}
            </p>
            <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
              {{ relativeDate(latestReport.createdAt) }}
            </p>
          </div>
        </div>
      </NuxtLink>

      <!-- Quick stats -->
      <div v-if="stats" class="grid grid-cols-3 gap-2">
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold" :class="stats.overdue > 0 ? 'text-red-500' : 'text-[var(--ui-text-highlighted)]'">
            {{ stats.overdue }}
          </p>
          <p class="text-[10px] text-[var(--ui-text-muted)]">Overdue</p>
        </div>
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold" :class="stats.blocked > 0 ? 'text-amber-500' : 'text-[var(--ui-text-highlighted)]'">
            {{ stats.blocked }}
          </p>
          <p class="text-[10px] text-[var(--ui-text-muted)]">Blocked</p>
        </div>
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold" :class="stats.risks > 0 ? 'text-red-500' : 'text-[var(--ui-text-highlighted)]'">
            {{ stats.risks }}
          </p>
          <p class="text-[10px] text-[var(--ui-text-muted)]">Risks</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2">
        <UButton
          to="/agency/ai/reports"
          variant="soft"
          color="primary"
          size="xs"
          icon="i-lucide-file-text"
          label="View Reports"
          class="flex-1 justify-center"
        />
        <UButton
          to="/chat"
          variant="soft"
          color="neutral"
          size="xs"
          icon="i-lucide-message-circle"
          label="Ask AI"
          class="flex-1 justify-center"
        />
      </div>
    </div>

    <!-- No reports -->
    <div v-else class="text-center py-4">
      <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-[var(--ui-text-dimmed)] mx-auto mb-2" />
      <p class="text-sm text-[var(--ui-text-muted)] mb-3">No reports yet</p>
      <div class="flex gap-2 justify-center">
        <UButton
          to="/agency/ai/settings"
          variant="soft"
          color="primary"
          size="xs"
          icon="i-lucide-settings-2"
          label="Configure"
        />
        <UButton
          to="/chat"
          variant="soft"
          color="neutral"
          size="xs"
          icon="i-lucide-message-circle"
          label="Ask AI"
        />
      </div>
    </div>
  </UCard>
</template>
