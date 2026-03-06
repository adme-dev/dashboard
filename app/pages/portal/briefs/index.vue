<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()

const activeTab = ref('all')
const statusFilter = computed(() => {
  if (activeTab.value === 'all') return undefined
  return activeTab.value
})

const { data, pending } = useFetch('/api/portal/briefs', {
  query: { status: statusFilter }
})

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
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Briefs</h1>
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
        <p class="text-2xl font-bold">{{ data.summary.total }}</p>
        <p class="text-xs text-muted mt-1">Total Briefs</p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-warning">{{ data.summary.submitted }}</p>
        <p class="text-xs text-muted mt-1">Awaiting Review</p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-primary">{{ data.summary.inProgress }}</p>
        <p class="text-xs text-muted mt-1">In Progress</p>
      </div>
      <div class="p-4 rounded-lg bg-elevated">
        <p class="text-2xl font-bold text-success">{{ data.summary.completed }}</p>
        <p class="text-xs text-muted mt-1">Completed</p>
      </div>
    </div>

    <UTabs :items="tabs" v-model="activeTab" />

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
              <h3 class="font-medium">{{ brief.title }}</h3>
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
