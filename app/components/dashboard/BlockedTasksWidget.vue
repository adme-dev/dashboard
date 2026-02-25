<script setup lang="ts">
import { differenceInDays, parseISO } from 'date-fns'

const { data, status } = await useFetch('/api/agency/tasks', {
  query: { excludeCompleted: 'true', limit: 30 },
})

const blockedTasks = computed(() => {
  const tasks = (data.value as any)?.tasks || []
  return tasks
    .filter((t: any) => t.isBlocked || t.status?.name?.toLowerCase() === 'stuck' || t.status?.name?.toLowerCase() === 'blocked')
    .map((t: any) => {
      const blockedSince = t.blockedSince || t.statusChangedAt || t.updatedAt
      const daysBlocked = blockedSince ? differenceInDays(new Date(), parseISO(blockedSince)) : 0
      return { ...t, daysBlocked }
    })
    .sort((a: any, b: any) => b.daysBlocked - a.daysBlocked)
    .slice(0, 10)
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-ban" class="w-4 h-4 text-red-500" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Blocked Tasks</h3>
          <UBadge v-if="blockedTasks.length" color="error" variant="subtle" size="xs">{{ blockedTasks.length }}</UBadge>
        </div>
        <UButton to="/agency/tasks" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Tasks
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-12 w-full rounded" />
    </div>
    <div v-else-if="!blockedTasks.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
      <p class="text-sm">No blocked tasks</p>
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="task in blockedTasks"
        :key="task.id"
        class="flex items-start gap-3 p-2.5 rounded-lg border-l-3 transition-colors"
        :class="task.daysBlocked > 3 ? 'border-red-500 bg-red-50/50 dark:bg-red-500/5' : 'border-amber-500 bg-amber-50/50 dark:bg-amber-500/5'"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
          <div class="flex items-center gap-2 mt-1">
            <UAvatar v-if="task.assignee" :alt="task.assignee.name || task.assignee" size="2xs" />
            <span class="text-xs text-[var(--ui-text-muted)]">{{ task.assignee?.name || task.department?.name || '' }}</span>
          </div>
        </div>
        <UBadge :color="task.daysBlocked > 3 ? 'error' : 'warning'" variant="subtle" size="xs">
          {{ task.daysBlocked }}d blocked
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
