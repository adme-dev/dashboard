<script setup lang="ts">
import { format, parseISO } from 'date-fns'

const { data, status } = await useFetch('/api/agency/tasks', {
  // Fetch a wider window than we show so the unassigned count/badge is honest.
  query: { excludeCompleted: 'true', limit: 50 },
})

const CAP = 5
const allUnassigned = computed(() => {
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
})
const unassignedTasks = computed(() => allUnassigned.value.slice(0, CAP))
const badges = computed(() => {
  const urgent = allUnassigned.value.filter((t: any) => t.priority === 'urgent' || t.priority === 'high').length
  const out: { label: string | number, color?: any }[] = [{ label: `${allUnassigned.value.length} unassigned`, color: 'warning' }]
  if (urgent) out.push({ label: `${urgent} urgent`, color: 'error' })
  return out
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
  <DashboardWidgetShell
    title="Unassigned Work"
    icon="i-lucide-inbox"
    :badges="badges"
    to="/agency/tasks"
    view-all-label="All tasks"
    :loading="status === 'pending'"
    :is-empty="!unassignedTasks.length"
    empty-text="All tasks assigned"
    empty-icon="i-lucide-check-circle"
    :more-count="Math.max(allUnassigned.length - unassignedTasks.length, 0)"
  >
    <div class="space-y-1">
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
  </DashboardWidgetShell>
</template>
