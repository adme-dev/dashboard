<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/xero/expenses')

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const categoryColumns = [
  { accessorKey: 'name', header: 'Category' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }: any) => formatCurrency(row.getValue('amount'))
  }
]

const vendorColumns = [
  { accessorKey: 'name', header: 'Vendor' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }: any) => formatCurrency(row.getValue('amount'))
  }
]
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
        <UTable :data="data?.categories || []" :columns="categoryColumns" />
      </UPageCard>

      <UPageCard title="Top Vendors" variant="subtle">
        <UTable :data="data?.vendors || []" :columns="vendorColumns" />
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
