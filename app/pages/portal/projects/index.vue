<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const activeTab = ref('all')
const queryFilter = computed(() => {
  if (['upcoming', 'history'].includes(activeTab.value)) {
    return { view: activeTab.value }
  }

  if (activeTab.value !== 'all') {
    return { status: activeTab.value }
  }

  return {}
})

const { data, pending } = useFetch('/api/portal/projects', {
  query: queryFilter
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Active', value: 'active' },
  { label: 'History', value: 'history' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on_hold' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const statusColors: Record<string, string> = {
  draft: 'neutral',
  active: 'success',
  completed: 'neutral',
  on_hold: 'warning',
  cancelled: 'error'
}

function emptyStateLabel() {
  if (activeTab.value === 'upcoming') return 'No upcoming jobs booked'
  if (activeTab.value === 'history') return 'No completed job history yet'
  if (activeTab.value === 'active') return 'No active jobs'
  if (activeTab.value === 'completed') return 'No completed jobs'
  return 'No jobs found'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Jobs & Projects
      </h1>
      <div v-if="data?.summary" class="flex items-center gap-2 text-sm text-muted">
        <span>{{ data.summary.total }} total</span>
      </div>
    </div>

    <div v-if="data?.summary" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-4 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'upcoming'"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-calendar-clock" class="size-4" />
          Upcoming jobs
        </div>
        <p class="text-2xl font-bold mt-2">
          {{ data.summary.upcoming }}
        </p>
      </button>

      <button
        type="button"
        class="rounded-lg border border-default bg-default p-4 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'active'"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4" />
          Active jobs
        </div>
        <p class="text-2xl font-bold mt-2">
          {{ data.summary.active }}
        </p>
      </button>

      <button
        type="button"
        class="rounded-lg border border-default bg-default p-4 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'history'"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-history" class="size-4" />
          Job history
        </div>
        <p class="text-2xl font-bold mt-2">
          {{ data.summary.history }}
        </p>
      </button>

      <button
        type="button"
        class="rounded-lg border border-default bg-default p-4 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'completed'"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-check-check" class="size-4" />
          Completed
        </div>
        <p class="text-2xl font-bold mt-2">
          {{ data.summary.completed }}
        </p>
      </button>
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabs"
    />

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="h-48 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="project in data?.projects"
        :key="project.id"
        :to="`/portal/projects/${project.id}`"
        class="block"
      >
        <UCard class="hover:ring-primary/50 hover:ring-1 transition-all h-full">
          <div class="space-y-3">
            <div class="flex items-start justify-between">
              <h3 class="font-semibold truncate pr-2">{{ project.name }}</h3>
              <UBadge
                :color="(statusColors[project.status] as any) || 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ project.status.replace('_', ' ') }}
              </UBadge>
            </div>

            <div>
              <div class="flex items-center justify-between text-xs text-muted mb-1">
                <span>Progress</span>
                <span>{{ project.tasks.progressPercent }}%</span>
              </div>
              <div class="w-full bg-muted/20 rounded-full h-1.5">
                <div
                  class="bg-primary rounded-full h-1.5 transition-all"
                  :style="{ width: `${project.tasks.progressPercent}%` }"
                />
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-muted">
              <span>{{ project.tasks.completed }}/{{ project.tasks.total }} tasks</span>
              <span v-if="project.dueDate">Due {{ formatDate(project.dueDate) }}</span>
              <span v-else-if="project.startDate">Starts {{ formatDate(project.startDate) }}</span>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <UBadge
                v-if="project.pendingApprovals > 0"
                color="warning"
                variant="subtle"
                size="xs"
              >
                {{ project.pendingApprovals }} approvals
              </UBadge>
              <UBadge
                v-if="project.deliverableCount > 0"
                color="primary"
                variant="subtle"
                size="xs"
              >
                {{ project.deliverableCount }} deliverables
              </UBadge>
            </div>

            <div v-if="project.projectManagerName" class="text-xs text-muted">
              PM: {{ project.projectManagerName }}
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.projects || data.projects.length === 0)" class="text-center text-muted py-12">
      {{ emptyStateLabel() }}
    </p>
  </div>
</template>
