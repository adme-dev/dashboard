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
  { label: 'Rejected', value: 'rejected' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
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
      <h1 class="text-2xl font-bold">Approvals</h1>
      <div v-if="data?.summary" class="flex items-center gap-3 text-sm">
        <UBadge v-if="data.summary.pending > 0" color="warning" variant="subtle">
          {{ data.summary.pending }} pending
        </UBadge>
      </div>
    </div>

    <UTabs :items="tabs" v-model="activeTab" />

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
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <UBadge color="neutral" variant="subtle" size="xs">{{ approval.approvalType }}</UBadge>
              <span>{{ approval.projectName }}</span>
              <span v-if="approval.requestedByName">· by {{ approval.requestedByName }}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span v-if="approval.dueDate" class="text-xs text-muted">
              Due {{ formatDate(approval.dueDate) }}
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.approvals || data.approvals.length === 0)" class="text-center text-muted py-12">
      No approvals found
    </p>
  </div>
</template>
