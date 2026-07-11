<script setup lang="ts">
import { format, parseISO } from 'date-fns'

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshBriefs() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/briefs')
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load briefs pipeline', error)
    status.value = 'error'
  }
}

await refreshBriefs()

const briefs = computed(() => (data.value as any)?.briefs || [])
// True per-status totals for the whole pipeline (not just the fetched page).
const statusCounts = computed<Record<string, number>>(() => (data.value as any)?.statusCounts || {})

// Display columns = the active pipeline, in lifecycle order.
const stages = ['draft', 'submitted', 'review', 'in_progress', 'complete'] as const
const stageLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  review: 'Review',
  in_progress: 'In Progress',
  complete: 'Complete',
}
const stageColors: Record<string, string> = {
  draft: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400',
  submitted: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  review: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400',
  in_progress: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  complete: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
}

// Map every real brief status onto a display column. Terminal-negative statuses
// (rejected, cancelled) are intentionally excluded from the active pipeline view.
const STAGE_FOR_STATUS: Record<string, typeof stages[number]> = {
  draft: 'draft',
  submitted: 'submitted',
  under_review: 'review',
  needs_info: 'review',
  approved: 'review',
  in_progress: 'in_progress',
  completed: 'complete',
}

const stageCounts = computed(() => {
  // Prefer server-provided totals; fall back to the fetched page if absent.
  const byStatus: Record<string, number> = { ...statusCounts.value }
  if (!Object.keys(byStatus).length) {
    for (const b of briefs.value) {
      const st = b.status || 'draft'
      byStatus[st] = (byStatus[st] || 0) + 1
    }
  }
  const counts: Record<string, number> = {}
  for (const s of stages) counts[s] = 0
  for (const [st, n] of Object.entries(byStatus)) {
    const stage = STAGE_FOR_STATUS[st]
    if (stage) counts[stage] += Number(n) || 0
  }
  return counts
})

const recentBriefs = computed(() =>
  [...briefs.value]
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 5)
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Briefs Pipeline</h3>
        </div>
        <UButton to="/agency/briefs" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Briefs
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-10 w-full rounded" />
      <USkeleton v-for="i in 3" :key="i" class="h-8 w-full rounded" />
    </div>
    <div v-else>
      <!-- Pipeline stages -->
      <div class="flex items-center gap-1 mb-4">
        <div v-for="stage in stages" :key="stage" class="flex-1 text-center">
          <div class="text-xs font-medium px-1.5 py-1 rounded" :class="stageColors[stage]">
            {{ stageCounts[stage] }}
          </div>
          <p class="text-[10px] text-[var(--ui-text-muted)] mt-1 truncate">{{ stageLabels[stage] }}</p>
        </div>
      </div>

      <!-- Recent briefs -->
      <div v-if="recentBriefs.length" class="border-t border-[var(--ui-border)] pt-3 space-y-2">
        <div v-for="brief in recentBriefs" :key="brief.id" class="flex items-center gap-2 text-sm">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="stageColors[STAGE_FOR_STATUS[brief.status]]?.split(' ')[0] || 'bg-neutral-300'" />
          <span class="truncate flex-1 text-[var(--ui-text-highlighted)]">{{ brief.title || brief.name || 'Untitled Brief' }}</span>
          <span v-if="brief.requestedDeadline" class="text-xs text-[var(--ui-text-muted)] shrink-0">
            {{ format(parseISO(brief.requestedDeadline), 'MMM d') }}
          </span>
        </div>
      </div>
      <div v-else class="text-center py-4 text-[var(--ui-text-muted)]">
        <p class="text-sm">No briefs yet</p>
      </div>
    </div>
  </UCard>
</template>
