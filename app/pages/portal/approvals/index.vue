<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const activeTab = ref('all')
const statusFilter = computed(() => activeTab.value === 'all' ? undefined : activeTab.value)

const { data, pending } = useFetch('/api/portal/approvals', {
  query: { status: statusFilter }
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Revisions', value: 'revision_requested' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatResponseTime(hours: number | null | undefined) {
  if (!hours) return '-'
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function dueLabel(date: string | null, status: string) {
  if (!date || status !== 'pending') return date ? `Due ${formatDate(date)}` : null
  const due = new Date(date)
  const now = new Date()
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days <= 7) return `Due in ${days}d`
  return `Due ${formatDate(date)}`
}

function dueColor(date: string | null, status: string) {
  if (!date || status !== 'pending') return 'neutral'
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'error'
  if (days <= 7) return 'warning'
  return 'neutral'
}

const statusColors: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  revision_requested: 'info'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Approvals
      </h1>
      <div v-if="data?.summary" class="flex items-center gap-3 text-sm">
        <UBadge v-if="data.summary.pending > 0" color="warning" variant="subtle">
          {{ data.summary.pending }} pending
        </UBadge>
      </div>
    </div>

    <UTabs v-model="activeTab" :items="tabs" />

    <div v-if="data?.summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'pending'"
      >
        <p class="text-xs text-muted">
          Pending decisions
        </p>
        <p class="mt-1 text-lg font-semibold">
          {{ data.summary.pending }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'pending'"
      >
        <p class="text-xs text-muted">
          Overdue
        </p>
        <p class="mt-1 text-lg font-semibold" :class="data.summary.overdue > 0 ? 'text-error' : ''">
          {{ data.summary.overdue }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'pending'"
      >
        <p class="text-xs text-muted">
          Due soon
        </p>
        <p class="mt-1 text-lg font-semibold" :class="data.summary.dueSoon > 0 ? 'text-warning' : ''">
          {{ data.summary.dueSoon }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeTab = 'revision_requested'"
      >
        <p class="text-xs text-muted">
          Revisions requested
        </p>
        <p class="mt-1 text-lg font-semibold">
          {{ data.summary.revisionRequested }}
        </p>
      </button>
    </div>

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-gauge" class="text-primary" />
          <span class="font-semibold">Decision health</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Decisions total
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.totalDecisions }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Approved, rejected, or revised
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Responded last 30d
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.respondedLast30 }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Recent approval decisions
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'all'"
        >
          <p class="text-xs text-muted">
            Avg response
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatResponseTime(data.summary.averageResponseHours) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Time from request to response
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'revision_requested'"
        >
          <p class="text-xs text-muted">
            Revision rate
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.totalDecisions > 0 ? Math.round((data.summary.revisionRequested / data.summary.totalDecisions) * 100) : 0 }}%
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.revisionRequested }} revision request{{ data.summary.revisionRequested === 1 ? '' : 's' }}
          </p>
        </button>
      </div>
    </UCard>

    <div v-if="pending" class="space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="space-y-3">
      <NuxtLink
        v-for="approval in data?.approvals"
        :key="approval.id"
        :to="`/portal/approvals/${approval.id}`"
        class="block p-4 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all"
        :class="{ 'border-l-4 border-warning': approval.status === 'pending' }"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="font-medium">{{ approval.title }}</h3>
              <UBadge :color="(statusColors[approval.status] as any) || 'neutral'" variant="subtle" size="xs">
                {{ approval.status.replace('_', ' ') }}
              </UBadge>
              <UBadge
                v-if="approval.responseNotes"
                color="neutral"
                variant="outline"
                size="xs"
              >
                Notes
              </UBadge>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <UBadge color="neutral" variant="subtle" size="xs">{{ approval.approvalType }}</UBadge>
              <span>{{ approval.projectName }}</span>
              <span v-if="approval.requestedByName">· by {{ approval.requestedByName }}</span>
            </div>
            <p v-if="approval.taskTitle" class="text-xs text-muted mt-2">
              Task: {{ approval.taskTitle }}
            </p>
          </div>
          <div class="text-right shrink-0">
            <UBadge
              v-if="dueLabel(approval.dueDate, approval.status)"
              :color="(dueColor(approval.dueDate, approval.status) as any)"
              variant="subtle"
              size="xs"
            >
              {{ dueLabel(approval.dueDate, approval.status) }}
            </UBadge>
          </div>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.approvals || data.approvals.length === 0)" class="text-center text-muted py-12">
      No approvals found
    </p>
  </div>
</template>
