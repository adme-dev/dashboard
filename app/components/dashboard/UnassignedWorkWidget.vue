<script setup lang="ts">
import { format, parseISO } from 'date-fns'

const { data, status } = await useFetch('/api/agency/tasks', {
  query: { excludeCompleted: 'true', limit: 10 },
})

const unassignedTasks = computed(() => {
  const tasks = (data.value as any)?.tasks || []
  return tasks
    .filter((t: any) => !t.assigneeId && !t.assignee)
    .sort((a: any, b: any) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
      const pa = priorityOrder[a.priority] ?? 4
      const pb = priorityOrder[b.priority] ?? 4
      if (pa !== pb) return pa - pb
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      return 0
    })
    .slice(0, 10)
})

const priorityColors: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-blue-600 dark:text-blue-400',
  low: 'text-neutral-500',
}
const priorityIcons: Record<string, string> = {
  urgent: 'i-lucide-alert-circle',
  high: 'i-lucide-arrow-up',
  medium: 'i-lucide-minus',
  low: 'i-lucide-arrow-down',
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-inbox" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Unassigned Work</h3>
          <UBadge v-if="unassignedTasks.length" color="warning" variant="subtle" size="xs">{{ unassignedTasks.length }}</UBadge>
        </div>
        <UButton to="/agency/tasks" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Tasks
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!unassignedTasks.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
      <p class="text-sm">All tasks assigned</p>
    </div>
    <div v-else class="space-y-1">
      <div v-for="task in unassignedTasks" :key="task.id" class="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors">
        <UIcon :name="priorityIcons[task.priority] || 'i-lucide-minus'" class="w-4 h-4 shrink-0" :class="priorityColors[task.priority]" />
        <div class="flex-1 min-w-0">
          <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">
            {{ task.department?.name || 'No department' }}
            <span v-if="task.dueDate"> &middot; Due {{ format(parseISO(task.dueDate), 'MMM d') }}</span>
          </p>
        </div>
        <UBadge v-if="task.department?.name" variant="subtle" color="neutral" size="xs">{{ task.department.name }}</UBadge>
      </div>
    </div>
  </UCard>
</template>
