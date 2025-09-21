<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/cashflow')

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Cash Flow"
      description="Current position and 30/60/90 day projections"
    >
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Loading cash flow…</div>
    <div v-else-if="error">Failed to load cash flow.</div>

    <UPageGrid v-else class="gap-4 sm:gap-6">
      <UPageCard title="Current Bank Balance" variant="subtle">
        <div class="text-2xl font-semibold">{{ formatCurrency(data?.startingBalance) }}</div>
        <div class="text-muted text-xs mt-1">As of {{ data?.asOf }}</div>
      </UPageCard>

      <UPageCard title="Projections" variant="subtle">
        <UTable :rows="data?.buckets || []" :columns="[
          { key: 'label', label: 'Horizon' },
          { key: 'end', label: 'Until' },
          { key: 'inflow', label: 'Inflow', class: 'text-right' },
          { key: 'outflow', label: 'Outflow', class: 'text-right' },
          { key: 'projected', label: 'Projected', class: 'text-right' }
        ]">
          <template #inflow-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.inflow) }}</span>
          </template>
          <template #outflow-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.outflow) }}</span>
          </template>
          <template #projected-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.projected) }}</span>
          </template>
        </UTable>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
