<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/xero/expenses')

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Expense Analytics"
      :description="data ? `Last 90 days (${data?.range.from} → ${data?.range.to})` : 'Last 90 days'"
    >
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Loading expenses…</div>
    <div v-else-if="error">Failed to load expenses.</div>

    <UPageGrid v-else class="gap-4 sm:gap-6">
      <UPageCard title="Top Categories" variant="subtle">
        <UTable :rows="data?.categories || []" :columns="[
          { key: 'name', label: 'Category' },
          { key: 'amount', label: 'Amount', class: 'text-right' }
        ]">
          <template #amount-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.amount) }}</span>
          </template>
        </UTable>
      </UPageCard>

      <UPageCard title="Top Vendors" variant="subtle">
        <UTable :rows="data?.vendors || []" :columns="[
          { key: 'name', label: 'Vendor' },
          { key: 'amount', label: 'Amount', class: 'text-right' }
        ]">
          <template #amount-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.amount) }}</span>
          </template>
        </UTable>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
