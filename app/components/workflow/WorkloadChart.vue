<script setup lang="ts">
const props = defineProps<{
  departmentId?: string
}>()

// Fetch workload data
const { data: workloadData, pending: loading } = await useFetch('/api/agency/dashboard/workload', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

const workload = computed(() => workloadData.value || { members: [], summary: {} })

// Calculate bar widths
const getBarWidth = (tasks: number, maxTasks: number) => {
  if (maxTasks === 0) return 0
  return Math.min((tasks / maxTasks) * 100, 100)
}

const maxTasks = computed(() => {
  const members = workload.value.members || []
  return Math.max(...members.map((m: any) => m.activeTasks || 0), 10)
})

// Workload status
const getWorkloadStatus = (tasks: number) => {
  if (tasks === 0) return { label: 'Available', color: 'text-emerald-500', bg: 'bg-emerald-500' }
  if (tasks <= 3) return { label: 'Light', color: 'text-blue-500', bg: 'bg-blue-500' }
  if (tasks <= 6) return { label: 'Moderate', color: 'text-amber-500', bg: 'bg-amber-500' }
  if (tasks <= 9) return { label: 'Heavy', color: 'text-orange-500', bg: 'bg-orange-500' }
  return { label: 'Overloaded', color: 'text-red-500', bg: 'bg-red-500' }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-users" class="h-5 w-5 text-muted" />
          <h3 class="font-semibold">Team Workload</h3>
        </div>
        <UBadge
          v-if="workload.summary?.totalMembers"
          :label="`${workload.summary.totalMembers} members`"
          color="neutral"
          variant="subtle"
        />
      </div>
    </template>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="space-y-4">
        <div v-for="i in 4" :key="i" class="flex items-center gap-3">
          <USkeleton class="h-8 w-8 rounded-full" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-1/3" />
            <USkeleton class="h-2 w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- Workload list -->
    <template v-else>
      <div class="space-y-4">
        <div
          v-for="member in workload.members"
          :key="member.id"
          class="group"
        >
          <div class="flex items-center gap-3 mb-2">
            <UAvatar
              :alt="member.name"
              size="sm"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="font-medium text-sm truncate">{{ member.name }}</span>
                <span
                  class="text-xs font-medium"
                  :class="getWorkloadStatus(member.activeTasks).color"
                >
                  {{ getWorkloadStatus(member.activeTasks).label }}
                </span>
              </div>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="getWorkloadStatus(member.activeTasks).bg"
                :style="{ width: `${getBarWidth(member.activeTasks, maxTasks)}%` }"
              />
            </div>
            <span class="text-xs text-muted w-16 text-right">
              {{ member.activeTasks }} tasks
            </span>
          </div>

          <!-- Task breakdown tooltip/details on hover -->
          <div class="mt-1 flex items-center gap-3 text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            <span v-if="member.overdueTasks">
              <span class="text-red-500">{{ member.overdueTasks }}</span> overdue
            </span>
            <span v-if="member.dueTodayTasks">
              <span class="text-amber-500">{{ member.dueTodayTasks }}</span> due today
            </span>
            <span v-if="member.inProgressTasks">
              <span class="text-blue-500">{{ member.inProgressTasks }}</span> in progress
            </span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!workload.members?.length" class="text-center py-8">
          <UIcon name="i-lucide-users" class="h-8 w-8 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted">No team members assigned</p>
        </div>
      </div>

      <!-- Summary stats -->
      <div v-if="workload.summary" class="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700 grid grid-cols-3 gap-4 text-center">
        <div>
          <p class="text-2xl font-bold text-highlighted">{{ workload.summary.totalTasks || 0 }}</p>
          <p class="text-xs text-muted">Total Tasks</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-amber-500">{{ workload.summary.overdueTasks || 0 }}</p>
          <p class="text-xs text-muted">Overdue</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-emerald-500">{{ workload.summary.unassignedTasks || 0 }}</p>
          <p class="text-xs text-muted">Unassigned</p>
        </div>
      </div>
    </template>
  </UCard>
</template>
