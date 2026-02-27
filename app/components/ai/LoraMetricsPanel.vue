<script setup lang="ts">
import type { TrainingPipelineStats, LoraMetricsComparison, AiLoraAdapter } from '~/types'

// Pipeline stats
const { data: statsData, pending: statsPending } = useFetch('/api/agency/ai/training/stats')
const stats = computed(() => statsData.value as TrainingPipelineStats | undefined)

// Adapters for selector
const { data: adaptersData } = useFetch('/api/agency/ai/training/adapters')
const adapters = computed(() => {
  const list = (Array.isArray(adaptersData.value) ? adaptersData.value : []) as AiLoraAdapter[]
  return list.map(a => ({ label: a.displayName || a.name, value: a.id }))
})

// Selected adapter metrics
const selectedAdapterId = ref('')
const { data: metricsData, pending: metricsPending, refresh: refreshMetrics } = useFetch(
  () => selectedAdapterId.value ? `/api/agency/ai/training/adapters/${selectedAdapterId.value}/metrics` : null as any,
  { immediate: false, watch: [selectedAdapterId] }
)
const metrics = computed(() => metricsData.value as LoraMetricsComparison | undefined)

watch(selectedAdapterId, (val) => {
  if (val) refreshMetrics()
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="statsPending" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
    </div>

    <template v-else-if="stats">
      <!-- Pipeline Overview Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-500/10">
              <UIcon name="i-lucide-database" class="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Datasets</p>
              <p class="text-xl font-bold">{{ stats.totalDatasets }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-emerald-500/10">
              <UIcon name="i-lucide-book-open" class="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Knowledge</p>
              <p class="text-xl font-bold">{{ stats.totalKnowledgeEntries }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">{{ stats.approvedKnowledgeEntries }} approved</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-purple-500/10">
              <UIcon name="i-lucide-cpu" class="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">Adapters</p>
              <p class="text-xl font-bold">{{ stats.totalAdapters }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">{{ stats.activeAdapters }} active</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-amber-500/10">
              <UIcon name="i-lucide-message-square" class="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">New Chat QA</p>
              <p class="text-xl font-bold">{{ stats.newDataSince.chat_qa.count }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">since {{ formatDate(stats.newDataSince.chat_qa.since) }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-cyan-500/10">
              <UIcon name="i-lucide-target" class="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <p class="text-sm text-[var(--ui-text-muted)]">New Intents</p>
              <p class="text-xl font-bold">{{ stats.newDataSince.intent.count }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">since {{ formatDate(stats.newDataSince.intent.since) }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Adapter A/B Comparison -->
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">A/B Metrics Comparison</h3>
          <USelectMenu
            v-model="selectedAdapterId"
            :items="adapters"
            value-key="value"
            placeholder="Select adapter"
            class="w-64"
          />
        </div>

        <div v-if="!selectedAdapterId" class="text-center py-8 text-[var(--ui-text-muted)]">
          <UIcon name="i-lucide-bar-chart-3" class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Select an adapter to view its A/B test metrics</p>
        </div>

        <div v-else-if="metricsPending" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary-500" />
        </div>

        <div v-else-if="metrics" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UCard>
            <div class="text-center">
              <div class="flex items-center justify-center gap-2 mb-4">
                <UIcon name="i-lucide-cpu" class="w-5 h-5 text-purple-500" />
                <p class="text-sm font-semibold text-[var(--ui-text-highlighted)] uppercase">LoRA Adapter</p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Avg Latency</p>
                  <p class="text-2xl font-bold">{{ metrics.lora.avgLatencyMs.toFixed(0) }}<span class="text-sm font-normal text-[var(--ui-text-muted)]">ms</span></p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Avg Rating</p>
                  <p class="text-2xl font-bold">{{ metrics.lora.avgRating.toFixed(2) }}</p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Error Rate</p>
                  <p class="text-2xl font-bold">{{ (metrics.lora.errorRate * 100).toFixed(1) }}<span class="text-sm font-normal text-[var(--ui-text-muted)]">%</span></p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Samples</p>
                  <p class="text-2xl font-bold">{{ metrics.lora.sampleCount.toLocaleString() }}</p>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="text-center">
              <div class="flex items-center justify-center gap-2 mb-4">
                <UIcon name="i-lucide-box" class="w-5 h-5 text-neutral-500" />
                <p class="text-sm font-semibold text-[var(--ui-text-highlighted)] uppercase">Base Model</p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Avg Latency</p>
                  <p class="text-2xl font-bold">{{ metrics.base.avgLatencyMs.toFixed(0) }}<span class="text-sm font-normal text-[var(--ui-text-muted)]">ms</span></p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Avg Rating</p>
                  <p class="text-2xl font-bold">{{ metrics.base.avgRating.toFixed(2) }}</p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Error Rate</p>
                  <p class="text-2xl font-bold">{{ (metrics.base.errorRate * 100).toFixed(1) }}<span class="text-sm font-normal text-[var(--ui-text-muted)]">%</span></p>
                </div>
                <div class="p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                  <p class="text-xs text-[var(--ui-text-muted)]">Samples</p>
                  <p class="text-2xl font-bold">{{ metrics.base.sampleCount.toLocaleString() }}</p>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div v-else-if="selectedAdapterId" class="text-center py-8 text-[var(--ui-text-muted)]">
          <p>No metrics data available for this adapter yet.</p>
        </div>
      </div>
    </template>
  </div>
</template>
