<script setup lang="ts">
import { format, parseISO, isToday, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'

const { data, status } = await useFetch('/api/agency/tasks', {
  query: { excludeCompleted: 'true', limit: 50 },
})

const allTasks = computed(() => (data.value as any)?.tasks || [])

const now = new Date()
const weekStart = startOfWeek(now, { weekStartsOn: 1 })
const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).slice(0, 5) // Mon-Fri

const tasksByDay = computed(() => {
  return weekDays.map(day => ({
    date: day,
    label: format(day, 'EEE'),
    fullLabel: format(day, 'EEEE, MMM d'),
    isToday: isToday(day),
    tasks: allTasks.value.filter((t: any) => {
      if (!t.dueDate) return false
      return isSameDay(parseISO(t.dueDate), day)
    }),
  }))
})

const totalDueThisWeek = computed(() =>
  tasksByDay.value.reduce((sum, day) => sum + day.tasks.length, 0)
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar-clock" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Due This Week</h3>
          <UBadge v-if="totalDueThisWeek" color="info" variant="subtle" size="xs">{{ totalDueThisWeek }}</UBadge>
        </div>
        <UButton to="/agency/tasks" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Tasks
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!totalDueThisWeek" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-calendar-check" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
      <p class="text-sm">Nothing due this week</p>
    </div>
    <div v-else class="space-y-3">
      <div v-for="day in tasksByDay" :key="day.label">
        <div v-if="day.tasks.length" class="space-y-1">
          <p
            class="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
            :class="day.isToday ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--ui-text-muted)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="day.isToday ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-600'" />
            {{ day.fullLabel }}
            <UBadge v-if="day.isToday" color="info" variant="subtle" size="xs">Today</UBadge>
          </p>
          <div v-for="task in day.tasks.slice(0, 4)" :key="task.id" class="flex items-center gap-2 py-1.5 pl-4">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
            </div>
            <UAvatar v-if="task.assignee" :alt="task.assignee.name || task.assignee" size="2xs" />
            <UBadge v-if="task.status" :style="{ backgroundColor: (task.status.color || '#6b7280') + '20', color: task.status.color || '#6b7280' }" variant="subtle" size="xs">
              {{ task.status.name }}
            </UBadge>
          </div>
          <p v-if="day.tasks.length > 4" class="text-xs text-[var(--ui-text-muted)] pl-4">
            +{{ day.tasks.length - 4 }} more
          </p>
        </div>
      </div>
    </div>
  </UCard>
</template>
