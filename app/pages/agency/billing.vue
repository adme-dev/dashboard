<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const activeTab = ref(route.query.tab === 'eom' ? 'eom' : 'invoices')

const tabs = [
  { label: 'Invoices', value: 'invoices', icon: 'i-lucide-receipt' },
  { label: 'EOM Generation', value: 'eom', icon: 'i-lucide-file-spreadsheet' },
]

watch(activeTab, (val) => {
  navigateTo({ path: '/agency/billing', query: { tab: val } }, { replace: true })
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Billing</h1>
        <p class="text-sm text-muted mt-1">Invoices, EOM generation, and billing workflows</p>
      </div>

      <!-- Tabs -->
      <UTabs v-model="activeTab" :items="tabs" />

      <!-- Tab Content -->
      <BillingInvoicesTab v-if="activeTab === 'invoices'" />
      <BillingEomTab v-if="activeTab === 'eom'" />

    </div>
  </div>
</template>
