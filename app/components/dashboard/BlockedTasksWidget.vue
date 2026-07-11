<script setup lang="ts">
import { differenceInDays, parseISO } from 'date-fns'

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshBlockedTasks() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/tasks', {
      query: { excludeCompleted: 'true', limit: 30 },
    })
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load blocked tasks', error)
    status.value = 'error'
  }
}

await refreshBlockedTasks()

const CAP = 5
const allBlocked = computed(() => {
  const tasks = (data.value as any)?.tasks || []
  return tasks
    .filter((t: any) => t.isBlocked || t.status?.name?.toLowerCase() === 'stuck' || t.status?.name?.toLowerCase() === 'blocked')
    .map((t: any) => {
      const blockedSince = t.blockedSince || t.statusChangedAt || t.updatedAt
      const daysBlocked = blockedSince ? differenceInDays(new Date(), parseISO(blockedSince)) : 0
      return { ...t, daysBlocked }
    })
    .sort((a: any, b: any) => b.daysBlocked - a.daysBlocked)
})
const blockedTasks = computed(() => allBlocked.value.slice(0, CAP))
const badges = computed(() => {
  const stale = allBlocked.value.filter((t: any) => t.daysBlocked > 3).length
  const out: { label: string | number, color?: any }[] = [{ label: `${allBlocked.value.length} blocked`, color: 'error' }]
  if (stale) out.push({ label: `${stale} >3d`, color: 'error' })
  return out
})
</script>

<template>
  <DashboardWidgetShell
    title="Blocked Tasks"
    icon="i-lucide-ban"
    :badges="badges"
    to="/agency/tasks"
    view-all-label="All tasks"
    :loading="status === 'pending'"
    :is-empty="!blockedTasks.length"
    empty-text="No blocked tasks"
    empty-icon="i-lucide-check-circle"
    :more-count="Math.max(allBlocked.length - blockedTasks.length, 0)"
  >
    <div class="space-y-2">
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
  </DashboardWidgetShell>
</template>
