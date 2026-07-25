<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()
const route = useRoute()
const router = useRouter()

const routeQueryString = (value: unknown) => Array.isArray(value) ? value[0] : value
const briefTabs = ['all', 'submitted', 'under_review', 'in_progress', 'completed', 'needs_info']
const initialStatus = routeQueryString(route.query.status)

const activeTab = ref(typeof initialStatus === 'string' && briefTabs.includes(initialStatus) ? initialStatus : 'all')
const statusFilter = computed(() => {
  if (activeTab.value === 'all') return undefined
  return activeTab.value
})
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

const data = ref<any | null>(null)
const pending = ref(false)

async function refreshBriefs() {
  pending.value = true
  try {
    data.value = await apiFetch<any>('/api/portal/briefs', {
      query: statusFilter.value ? { status: statusFilter.value } : {},
    })
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

watch(statusFilter, () => {
  refreshBriefs()
}, { immediate: true })

watch(activeTab, (tab) => {
  const query: Record<string, string> = {}
  if (tab !== 'all') query.status = tab

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(query).toString()
  if (current !== next) {
    router.replace({ query })
  }
})

watch(
  () => route.query.status,
  () => {
    const status = routeQueryString(route.query.status)
    activeTab.value = typeof status === 'string' && briefTabs.includes(status) ? status : 'all'
  }
)

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'In Review', value: 'under_review' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function deadlineLabel(date: string | null, status: string) {
  if (!date || ['completed', 'cancelled', 'rejected'].includes(status)) return date ? `Due ${formatDate(date)}` : null
  const due = new Date(date)
  const now = new Date()
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days <= 14) return `Due in ${days}d`
  return `Due ${formatDate(date)}`
}

function deadlineColor(date: string | null, status: string) {
  if (!date || ['completed', 'cancelled', 'rejected'].includes(status)) return 'neutral'
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'error'
  if (days <= 14) return 'warning'
  return 'neutral'
}

const statusColors: Record<string, string> = {
  draft: 'neutral',
  submitted: 'warning',
  under_review: 'info',
  needs_info: 'warning',
  approved: 'success',
  rejected: 'error',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'neutral'
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'In Review',
  needs_info: 'Needs Info',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

const priorityColors: Record<string, string> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'error'
}
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Briefs
      </h1>
      <div class="flex items-center gap-3">
        <div v-if="data?.summary" class="flex items-center gap-2 text-sm">
          <UBadge v-if="data.summary.submitted > 0" color="warning" variant="subtle">
            {{ data.summary.submitted }} awaiting review
          </UBadge>
          <UBadge v-if="data.summary.inProgress > 0" color="primary" variant="subtle">
            {{ data.summary.inProgress }} active
          </UBadge>
        </div>
        <UButton
          v-if="hasPermission('canSubmitRequests')"
          icon="i-lucide-plus"
          to="/portal/briefs/new"
        >
          Submit Brief
        </UButton>
      </div>
    </div>

    <!-- Summary cards -->
    <div v-if="data?.summary" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold">
          {{ data.summary.total }}
        </p>
        <p class="text-xs text-muted mt-1">
          Total Briefs
        </p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-warning">
          {{ data.summary.submitted }}
        </p>
        <p class="text-xs text-muted mt-1">
          Awaiting Review
        </p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-primary">
          {{ data.summary.inProgress }}
        </p>
        <p class="text-xs text-muted mt-1">
          In Progress
        </p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-success">
          {{ data.summary.completed }}
        </p>
        <p class="text-xs text-muted mt-1">
          Completed
        </p>
      </div>
    </div>

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-clipboard-list" class="text-primary" />
          <span class="font-semibold">Briefing Health</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'submitted'"
        >
          <p class="text-xs text-muted">
            New briefs 30d
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.submittedLast30 }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Recently submitted
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Needs info
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.needsInfo > 0 ? 'text-warning' : ''">
            {{ data.summary.needsInfo }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Waiting on clarification
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Deadline risk
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.overdue > 0 ? 'text-error' : data.summary.dueSoon > 0 ? 'text-warning' : ''">
            {{ data.summary.overdue }} overdue
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.dueSoon }} due soon
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'completed'"
        >
          <p class="text-xs text-muted">
            Avg completion
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.averageCompletionDays }}d
          </p>
          <p class="mt-1 text-xs text-muted">
            From submission to completion
          </p>
        </button>
      </div>
    </UCard>

    <UTabs v-model="activeTab" :items="tabs" />

    <!-- Loading state -->
    <div v-if="pending" class="space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-lg bg-elevated animate-pulse" />
    </div>

    <!-- Brief list -->
    <div v-else class="space-y-3">
      <NuxtLink
        v-for="brief in data?.briefs"
        :key="brief.id"
        :to="`/portal/briefs/${brief.id}`"
        class="block p-4 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all"
        :class="{ 'border-l-4 border-warning': brief.status === 'submitted' || brief.status === 'needs_info' }"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-medium">
                {{ brief.title }}
              </h3>
              <UBadge :color="(statusColors[brief.status] as any) || 'neutral'" variant="subtle" size="xs">
                {{ statusLabels[brief.status] || brief.status }}
              </UBadge>
              <UBadge :color="(priorityColors[brief.priority] as any) || 'neutral'" variant="outline" size="xs">
                {{ brief.priority }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <span v-if="brief.referenceNumber" class="font-mono">{{ brief.referenceNumber }}</span>
              <span v-if="brief.template">{{ brief.template.name }}</span>
              <span v-if="brief.category">· {{ brief.category.name }}</span>
              <span v-if="brief.commentCount > 0">· {{ brief.commentCount }} comment{{ brief.commentCount !== 1 ? 's' : '' }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge
                v-if="deadlineLabel(brief.requestedDeadline, brief.status)"
                :color="(deadlineColor(brief.requestedDeadline, brief.status) as any)"
                variant="subtle"
                size="xs"
              >
                {{ deadlineLabel(brief.requestedDeadline, brief.status) }}
              </UBadge>
              <UBadge
                v-if="brief.status === 'needs_info'"
                color="warning"
                variant="outline"
                size="xs"
              >
                Needs info
              </UBadge>
            </div>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <span class="text-xs text-muted block">{{ formatDate(brief.submittedAt || brief.createdAt) }}</span>
            <span v-if="brief.assigneeName" class="text-xs text-muted block">{{ brief.assigneeName }}</span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.briefs || data.briefs.length === 0)" class="text-center text-muted py-12">
      No briefs found. Click "Submit Brief" to create one.
    </p>
  </div>
</template>
