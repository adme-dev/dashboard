<script setup lang="ts">
import { formatDistanceToNow, parseISO } from 'date-fns'

const { data, status } = await useFetch('/api/agency/proofs')

const pendingProofs = computed(() => {
  const proofs = (data.value as any)?.proofs || []
  return proofs
    // Real creative_proofs statuses awaiting action (no 'pending_review' exists in the enum).
    .filter((p: any) => ['internal_review', 'client_review', 'changes_requested'].includes(p.status))
    .sort((a: any, b: any) => {
      if (a.isUrgent && !b.isUrgent) return -1
      if (!a.isUrgent && b.isUrgent) return 1
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      return 0
    })
    .slice(0, 8)
})

const statusColors: Record<string, string> = {
  internal_review: 'warning',
  client_review: 'info',
  changes_requested: 'error',
}
const statusLabels: Record<string, string> = {
  internal_review: 'Internal Review',
  client_review: 'Client Review',
  changes_requested: 'Changes Requested',
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-eye" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Proofs Pending</h3>
          <UBadge v-if="pendingProofs.length" color="warning" variant="subtle" size="xs">{{ pendingProofs.length }}</UBadge>
        </div>
        <UButton to="/agency/proofs" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Proofs
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!pendingProofs.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
      <p class="text-sm">All proofs reviewed</p>
    </div>
    <div v-else class="space-y-2">
      <div v-for="proof in pendingProofs" :key="proof.id" class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors">
        <div class="shrink-0 mt-0.5">
          <UIcon v-if="proof.isUrgent" name="i-lucide-alert-circle" class="w-4 h-4 text-red-500" />
          <UIcon v-else name="i-lucide-file-image" class="w-4 h-4 text-[var(--ui-text-muted)]" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ proof.title || proof.name || 'Untitled Proof' }}</p>
          <div class="flex items-center gap-2 mt-0.5">
            <UBadge :color="statusColors[proof.status] || 'neutral'" variant="subtle" size="xs">
              {{ statusLabels[proof.status] || proof.status }}
            </UBadge>
            <span v-if="proof.stats?.unresolvedComments" class="text-xs text-[var(--ui-text-muted)] flex items-center gap-0.5">
              <UIcon name="i-lucide-message-circle" class="w-3 h-3" />
              {{ proof.stats.unresolvedComments }}
            </span>
            <span v-if="proof.dueDate" class="text-xs text-[var(--ui-text-muted)]">
              Due {{ formatDistanceToNow(parseISO(proof.dueDate), { addSuffix: true }) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
