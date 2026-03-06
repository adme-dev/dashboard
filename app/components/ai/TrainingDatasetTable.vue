<script setup lang="ts">
import type { AiTrainingDataset, TrainingDatasetType, TrainingDatasetStatus, TrainingPipelineStats } from '~/types'

const toast = useToast()

// Data fetching
const { data, pending, refresh } = useFetch('/api/agency/ai/training/datasets')
const datasets = computed(() => ((data.value as any)?.items || []) as AiTrainingDataset[])

// Pipeline stats for stale data indicator
const { data: statsData } = useFetch('/api/agency/ai/training/stats')
const stats = computed(() => statsData.value as TrainingPipelineStats | undefined)

const hasStaleData = computed(() => {
  if (!stats.value?.newDataSince) return false
  return stats.value.newDataSince.chat_qa.count > 100
    || stats.value.newDataSince.intent.count > 100
    || stats.value.newDataSince.knowledge.count > 100
})

// Extract buttons
const extractTypes: { label: string; type: TrainingDatasetType }[] = [
  { label: 'Chat QA', type: 'chat_qa' },
  { label: 'Intent', type: 'intent' },
  { label: 'RAG', type: 'rag' },
  { label: 'Knowledge', type: 'knowledge' },
  { label: 'Combined', type: 'combined' },
]

const extracting = ref<string | null>(null)

const extractDataset = async (type: TrainingDatasetType) => {
  extracting.value = type
  try {
    await $fetch('/api/agency/ai/training/extract', {
      method: 'POST',
      body: { type },
    })
    toast.add({ title: `${type} dataset extraction started`, color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Extraction failed',
      description: error.data?.statusMessage || error.message,
      color: 'error',
    })
  } finally {
    extracting.value = null
  }
}

// Table columns
const columns = [
  { accessorKey: 'datasetType', header: 'Type' },
  { accessorKey: 'version', header: 'Version' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'rowCount', header: 'Rows' },
  { accessorKey: 'fileSizeBytes', header: 'Size' },
  { accessorKey: 'createdAt', header: 'Created' },
]

const typeBadgeColor = (type: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
    chat_qa: 'primary',
    intent: 'warning',
    rag: 'success',
    knowledge: 'neutral',
    combined: 'neutral',
  }
  return colors[type] || 'neutral'
}

const statusBadgeColor = (status: TrainingDatasetStatus): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
    ready: 'success',
    extracting: 'warning',
    uploading: 'warning',
    failed: 'error',
    pending: 'neutral',
    archived: 'neutral',
  }
  return colors[status] || 'neutral'
}

const typeLabel = (type: string) => {
  const labels: Record<string, string> = {
    chat_qa: 'Chat QA',
    intent: 'Intent',
    rag: 'RAG',
    knowledge: 'Knowledge',
    combined: 'Combined',
  }
  return labels[type] || type
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Expanded row for quality metrics
const expandedRow = ref<string | null>(null)

const toggleExpand = (id: string) => {
  expandedRow.value = expandedRow.value === id ? null : id
}
</script>

<template>
  <div class="space-y-4">
    <!-- Stale Data Alert -->
    <UAlert
      v-if="hasStaleData"
      icon="i-lucide-alert-triangle"
      color="warning"
      title="New data available"
      description="Significant new data has been collected since the last extraction. Consider re-extracting datasets."
    />

    <!-- Export Buttons -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm font-medium text-[var(--ui-text-muted)] mr-2">Extract:</span>
      <UButton
        v-for="et in extractTypes"
        :key="et.type"
        :label="et.label"
        size="sm"
        variant="soft"
        :color="typeBadgeColor(et.type)"
        :loading="extracting === et.type"
        :disabled="extracting !== null && extracting !== et.type"
        @click="extractDataset(et.type)"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <XfLoader />
    </div>

    <!-- Table -->
    <UCard v-else>
      <UTable :data="datasets" :columns="columns">
        <template #datasetType-cell="{ row }">
          <UBadge :color="typeBadgeColor(row.original.datasetType)" variant="subtle">
            {{ typeLabel(row.original.datasetType) }}
          </UBadge>
        </template>

        <template #version-cell="{ row }">
          <span class="font-mono text-sm">v{{ row.original.version }}</span>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusBadgeColor(row.original.status)" variant="subtle">
            {{ row.original.status }}
          </UBadge>
        </template>

        <template #rowCount-cell="{ row }">
          <div>
            <span class="font-medium">{{ row.original.rowCount?.toLocaleString() || '—' }}</span>
            <span v-if="row.original.filteredCount && row.original.filteredCount !== row.original.rowCount" class="text-xs text-[var(--ui-text-muted)] ml-1">
              ({{ row.original.filteredCount?.toLocaleString() }} filtered)
            </span>
          </div>
        </template>

        <template #fileSizeBytes-cell="{ row }">
          <span class="text-sm">{{ formatFileSize(row.original.fileSizeBytes) }}</span>
        </template>

        <template #createdAt-cell="{ row }">
          <div class="flex items-center gap-2">
            <span class="text-sm text-[var(--ui-text-muted)]">
              {{ new Date(row.original.createdAt).toLocaleDateString() }}
            </span>
            <UButton
              icon="i-lucide-chevron-down"
              variant="ghost"
              color="neutral"
              size="xs"
              :class="{ 'rotate-180': expandedRow === row.original.id }"
              @click="toggleExpand(row.original.id)"
            />
          </div>
        </template>
      </UTable>

      <!-- Expanded Quality Metrics -->
      <div v-for="ds in datasets" :key="ds.id">
        <div
          v-if="expandedRow === ds.id && ds.qualityMetrics && Object.keys(ds.qualityMetrics).length > 0"
          class="px-4 py-3 border-t border-[var(--ui-border)] bg-[var(--ui-bg-elevated)]"
        >
          <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase mb-2">Quality Metrics</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="(value, key) in ds.qualityMetrics" :key="key" class="text-sm">
              <span class="text-[var(--ui-text-muted)]">{{ key }}:</span>
              <span class="ml-1 font-medium">{{ typeof value === 'number' ? value.toFixed(2) : value }}</span>
            </div>
          </div>
          <div v-if="ds.errorMessage" class="mt-2 text-sm text-red-500">
            Error: {{ ds.errorMessage }}
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
