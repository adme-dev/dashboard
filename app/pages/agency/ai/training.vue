<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const activeTab = ref('knowledge')

const tabs = [
  { label: 'Knowledge', value: 'knowledge', icon: 'i-lucide-book-open' },
  { label: 'Datasets', value: 'datasets', icon: 'i-lucide-database' },
  { label: 'Adapters', value: 'adapters', icon: 'i-lucide-cpu' },
  { label: 'Metrics', value: 'metrics', icon: 'i-lucide-bar-chart-3' },
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="AI Training Pipeline">
        <template #right>
          <span class="text-sm text-[var(--ui-text-muted)]">Manage training data, datasets, and LoRA adapters</span>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <UTabs v-model="activeTab" :items="tabs" class="w-full">
          <template #content="{ item }">
            <div class="pt-4">
              <AiTrainingKnowledgeManager v-if="item.value === 'knowledge'" />
              <AiTrainingDatasetTable v-else-if="item.value === 'datasets'" />
              <AiLoraAdapterTable v-else-if="item.value === 'adapters'" />
              <AiLoraMetricsPanel v-else-if="item.value === 'metrics'" />
            </div>
          </template>
        </UTabs>
      </div>
    </UDashboardPanel>
  </div>
</template>
