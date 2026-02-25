<script setup lang="ts">
interface NewDataEntry {
  count: number
  since: string | null
}

interface TrainingStats {
  totalDatasets: number
  totalKnowledgeEntries: number
  approvedKnowledgeEntries: number
  totalAdapters: number
  activeAdapters: number
  newDataSince: {
    chat_qa: NewDataEntry
    intent: NewDataEntry
    knowledge: NewDataEntry
  }
}

const { data, status } = await useFetch<TrainingStats>('/api/agency/ai/training/stats')

const stats = computed(() => data.value)

const hasStaleData = computed(() => {
  if (!stats.value) return false
  const { chat_qa, intent, knowledge } = stats.value.newDataSince
  return chat_qa.count > 100 || intent.count > 100 || knowledge.count > 100
})

const staleItems = computed(() => {
  if (!stats.value) return []
  const items: string[] = []
  const { chat_qa, intent, knowledge } = stats.value.newDataSince
  if (chat_qa.count > 100) items.push(`${chat_qa.count} chat`)
  if (intent.count > 100) items.push(`${intent.count} intent`)
  if (knowledge.count > 100) items.push(`${knowledge.count} knowledge`)
  return items
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-graduation-cap" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">AI Training</h3>
        </div>
        <UButton to="/agency/ai/training" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="status === 'pending'" class="space-y-3">
      <div class="grid grid-cols-3 gap-3">
        <USkeleton v-for="i in 3" :key="i" class="h-14 rounded" />
      </div>
      <USkeleton class="h-8 rounded" />
    </div>

    <!-- Empty / Error -->
    <div v-else-if="!stats" class="text-center py-6">
      <UIcon name="i-lucide-database" class="w-8 h-8 text-[var(--ui-text-dimmed)] mx-auto mb-2" />
      <p class="text-sm text-[var(--ui-text-muted)]">No training data yet</p>
    </div>

    <!-- Stats -->
    <div v-else class="space-y-3">
      <!-- Pipeline overview -->
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">{{ stats.totalDatasets }}</p>
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">Datasets</p>
        </div>
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">
            {{ stats.approvedKnowledgeEntries }}<span class="text-xs font-normal text-[var(--ui-text-muted)]">/{{ stats.totalKnowledgeEntries }}</span>
          </p>
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">Knowledge</p>
        </div>
        <div class="text-center p-2 rounded-lg bg-[var(--ui-bg-elevated)]">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">
            {{ stats.activeAdapters }}<span class="text-xs font-normal text-[var(--ui-text-muted)]">/{{ stats.totalAdapters }}</span>
          </p>
          <p class="text-[10px] text-[var(--ui-text-muted)] uppercase tracking-wide">Adapters</p>
        </div>
      </div>

      <!-- Stale data warning -->
      <div
        v-if="hasStaleData"
        class="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20"
      >
        <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p class="text-xs text-amber-700 dark:text-amber-400">
          New data available — {{ staleItems.join(', ') }} entries since last extraction
        </p>
      </div>
    </div>
  </UCard>
</template>
