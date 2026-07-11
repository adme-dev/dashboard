<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const router = useRouter()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

function tabFromQuery(query: typeof route.query) {
  const view = Array.isArray(query.view) ? query.view[0] : query.view
  const status = Array.isArray(query.status) ? query.status[0] : query.status

  if (view === 'upcoming' || view === 'history') return view
  if (['active', 'completed', 'on_hold'].includes(status || '')) return status as string
  return 'all'
}

const activeTab = ref(tabFromQuery(route.query))
const queryFilter = computed(() => {
  if (['upcoming', 'history'].includes(activeTab.value)) {
    return { view: activeTab.value }
  }

  if (activeTab.value !== 'all') {
    return { status: activeTab.value }
  }

  return {}
})

const data = ref<any | null>(null)
const pending = ref(false)

async function refreshProjects() {
  pending.value = true
  try {
    data.value = await apiFetch<any>('/api/portal/projects', { query: queryFilter.value })
  } finally {
    pending.value = false
  }
}

watch(queryFilter, () => {
  refreshProjects()
}, { immediate: true })

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Active', value: 'active' },
  { label: 'History', value: 'history' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on_hold' }
]

watch(activeTab, (tab) => {
  const query = { ...route.query }
  delete query.view
  delete query.status

  if (['upcoming', 'history'].includes(tab)) {
    query.view = tab
  } else if (tab !== 'all') {
    query.status = tab
  }

  router.replace({ query })
})

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount)
}

function daysUntil(date: string | null) {
  if (!date) return null
  const due = new Date(date)
  const now = new Date()
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function scheduleLabel(project: { dueDate: string | null, status: string }) {
  if (project.status === 'completed') return 'Completed'
  if (project.status === 'cancelled') return 'Cancelled'

  const days = daysUntil(project.dueDate)
  if (days == null) return 'No due date'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days <= 14) return `Due in ${days}d`
  return 'On schedule'
}

function scheduleColor(project: { dueDate: string | null, status: string }) {
  if (project.status === 'completed') return 'success'
  if (project.status === 'cancelled') return 'error'

  const days = daysUntil(project.dueDate)
  if (days == null) return 'neutral'
  if (days < 0) return 'error'
  if (days <= 14) return 'warning'
  return 'success'
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

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar-check" class="text-primary" />
          <span class="font-semibold">Job schedule health</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'upcoming'"
        >
          <p class="text-xs text-muted">
            Next due date
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatDate(data.summary.nextDueDate) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.upcoming }} upcoming job{{ data.summary.upcoming === 1 ? '' : 's' }}
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'upcoming'"
        >
          <p class="text-xs text-muted">
            Due soon
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.dueSoon > 0 ? 'text-warning' : ''">
            {{ data.summary.dueSoon }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Due within 14 days
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'upcoming'"
        >
          <p class="text-xs text-muted">
            Overdue jobs
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.overdue > 0 ? 'text-error' : ''">
            {{ data.summary.overdue }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Past planned date
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'history'"
        >
          <p class="text-xs text-muted">
            Completed last 30d
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.completedLast30 }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Recent job history
          </p>
        </button>
      </div>
    </UCard>

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-list-checks" class="text-primary" />
          <span class="font-semibold">Delivery workload</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Open tasks
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.openTasks }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.overdueTasks }} overdue
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'active'"
        >
          <p class="text-xs text-muted">
            Pending approvals
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.pendingApprovals > 0 ? 'text-warning' : ''">
            {{ data.summary.pendingApprovals }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Waiting on client decisions
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Visible deliverables
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.visibleDeliverables }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Files and work shared to the portal
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'upcoming'"
        >
          <p class="text-xs text-muted">
            Booked budget
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatCurrency(data.summary.bookedBudget) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ formatCurrency(data.summary.totalBudget) }} total visible work
          </p>
        </button>
      </div>
    </UCard>

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
                :color="(scheduleColor(project) as any)"
                variant="subtle"
                size="xs"
              >
                {{ scheduleLabel(project) }}
              </UBadge>
              <UBadge
                v-if="project.pendingApprovals > 0"
                color="warning"
                variant="subtle"
                size="xs"
              >
                {{ project.pendingApprovals }} approvals
              </UBadge>
              <UBadge
                v-if="project.overdueTasks > 0"
                color="error"
                variant="subtle"
                size="xs"
              >
                {{ project.overdueTasks }} overdue tasks
              </UBadge>
              <UBadge
                v-else-if="project.dueSoonTasks > 0"
                color="warning"
                variant="subtle"
                size="xs"
              >
                {{ project.dueSoonTasks }} tasks due soon
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
