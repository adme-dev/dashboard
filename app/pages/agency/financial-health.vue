<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

const route = useRoute()
const activeTab = ref(route.query.tab === 'budget' ? 'budget' : 'profitability')

const tabs = [
  { label: 'Profitability', value: 'profitability', icon: 'i-lucide-trending-up' },
  { label: 'Budget Health', value: 'budget', icon: 'i-lucide-heart-pulse' },
]

watch(activeTab, (val) => {
  navigateTo({ path: '/agency/financial-health', query: { tab: val } }, { replace: true })
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Financial Health</h1>
        <p class="text-sm text-muted mt-1">Media spend profitability and budget health tracking</p>
      </div>

      <!-- Tabs -->
      <UTabs v-model="activeTab" :items="tabs" />

      <!-- Tab Content -->
      <FinancialProfitabilityTab v-if="activeTab === 'profitability'" />
      <FinancialBudgetHealthTab v-if="activeTab === 'budget'" />

    </div>
  </div>
</template>
