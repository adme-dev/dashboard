<script setup lang="ts">
import { formatDistanceToNow, parseISO } from 'date-fns'

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshProofsPending() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/proofs')
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load pending proofs', error)
    status.value = 'error'
  }
}

await refreshProofsPending()

const CAP = 5
const allPending = computed(() => {
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
})
const pendingProofs = computed(() => allPending.value.slice(0, CAP))
const badges = computed(() => {
  const changes = allPending.value.filter((p: any) => p.status === 'changes_requested').length
  const out: { label: string | number, color?: any }[] = [{ label: `${allPending.value.length} pending`, color: 'warning' }]
  if (changes) out.push({ label: `${changes} changes`, color: 'error' })
  return out
})

type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

const statusColors: Record<string, UiColor> = {
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
  <DashboardWidgetShell
    title="Proofs Pending"
    icon="i-lucide-eye"
    :badges="badges"
    to="/agency/proofs"
    view-all-label="All proofs"
    :loading="status === 'pending'"
    :is-empty="!pendingProofs.length"
    empty-text="All proofs reviewed"
    empty-icon="i-lucide-check-circle"
    :more-count="Math.max(allPending.length - pendingProofs.length, 0)"
  >
    <div class="space-y-2">
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
  </DashboardWidgetShell>
</template>
