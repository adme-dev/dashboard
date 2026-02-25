<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/dashboard/workload')

const departments = computed(() => (data.value as any)?.departments || [])

const maxTasks = computed(() => {
  let max = 1
  for (const d of departments.value) {
    if (d.activeTasks > max) max = d.activeTasks
  }
  return max
})

const barWidth = (count: number) => `${Math.max(2, (count / maxTasks.value) * 100)}%`

const palette = ['#2563eb', '#14b8a6', '#f97316', '#a855f7', '#22c55e', '#eab308', '#6366f1', '#ef4444']
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bar-chart-horizontal" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Workload Overview</h3>
        </div>
        <UButton to="/agency/capacity" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-4">
      <div v-for="i in 4" :key="i" class="space-y-1.5">
        <USkeleton class="h-3 w-24" />
        <USkeleton class="h-5 rounded" :style="{ width: `${70 - i * 10}%` }" />
      </div>
    </div>

    <div v-else-if="!departments.length" class="text-center py-8">
      <p class="text-sm text-[var(--ui-text-muted)]">No department data</p>
    </div>

    <div v-else>
      <ClientOnly>
        <div class="space-y-3">
          <div v-for="(dept, i) in departments.slice(0, 8)" :key="dept.id" class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: dept.color || palette[i % palette.length] }" />
                <span class="text-[var(--ui-text)] truncate">{{ dept.name }}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0 text-xs text-[var(--ui-text-muted)]">
                <span v-if="dept.overdueTasks > 0" class="text-red-500 font-medium">{{ dept.overdueTasks }} overdue</span>
                <span class="font-medium text-[var(--ui-text-highlighted)]">{{ dept.activeTasks }}</span>
              </div>
            </div>
            <div class="h-5 bg-[var(--ui-bg-elevated)] rounded overflow-hidden flex">
              <!-- In-progress segment -->
              <div
                v-if="dept.inProgress > 0"
                class="h-full transition-all duration-500"
                :style="{ width: barWidth(dept.inProgress), backgroundColor: dept.color || palette[i % palette.length] }"
              />
              <!-- In-review segment (lighter) -->
              <div
                v-if="dept.inReview > 0"
                class="h-full transition-all duration-500 opacity-50"
                :style="{ width: barWidth(dept.inReview), backgroundColor: dept.color || palette[i % palette.length] }"
              />
              <!-- Remaining (unassigned etc, even lighter) -->
              <div
                v-if="dept.activeTasks - dept.inProgress - dept.inReview > 0"
                class="h-full transition-all duration-500 opacity-20"
                :style="{ width: barWidth(dept.activeTasks - dept.inProgress - dept.inReview), backgroundColor: dept.color || palette[i % palette.length] }"
              />
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-4 text-xs text-[var(--ui-text-muted)] mt-3 pt-3 border-t border-[var(--ui-border)]">
          <span class="flex items-center gap-1.5"><span class="w-3 h-2 rounded-sm bg-blue-500" /> In Progress</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-2 rounded-sm bg-blue-500/50" /> In Review</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-2 rounded-sm bg-blue-500/20" /> Other</span>
        </div>

        <template #fallback>
          <div class="space-y-4">
            <USkeleton v-for="i in 4" :key="i" class="h-7 rounded" :style="{ width: `${80 - i * 12}%` }" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </UCard>
</template>
