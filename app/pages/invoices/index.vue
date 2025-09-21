<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/xero/invoices')

function formatCurrency(value?: number, currency?: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 })
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Invoices"
      description="Track outstanding, overdue, and paid invoices"
    >
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Loading invoices…</div>
    <div v-else-if="error">Failed to load invoices.</div>

    <UTabs v-else :items="['Outstanding', 'Overdue', 'Paid']" class="mt-4">
      <template #item="{ item }">
        <div v-if="item === 'Outstanding'">
          <UTable :rows="data?.outstanding || []" :columns="[
            { key: 'number', label: 'Invoice #' },
            { key: 'contact', label: 'Customer' },
            { key: 'date', label: 'Date' },
            { key: 'dueDate', label: 'Due' },
            { key: 'amountDue', label: 'Amount Due', class: 'text-right' }
          ]">
            <template #amountDue-data="{ row }">
              <span class="text-right block">{{ formatCurrency(row.amountDue, row.currency) }}</span>
            </template>
          </UTable>
        </div>

        <div v-else-if="item === 'Overdue'">
          <UTable :rows="data?.overdue || []" :columns="[
            { key: 'number', label: 'Invoice #' },
            { key: 'contact', label: 'Customer' },
            { key: 'date', label: 'Date' },
            { key: 'dueDate', label: 'Due' },
            { key: 'amountDue', label: 'Amount Due', class: 'text-right' }
          ]">
            <template #amountDue-data="{ row }">
              <span class="text-right block">{{ formatCurrency(row.amountDue, row.currency) }}</span>
            </template>
          </UTable>
        </div>

        <div v-else>
          <UTable :rows="data?.paid || []" :columns="[
            { key: 'number', label: 'Invoice #' },
            { key: 'contact', label: 'Customer' },
            { key: 'date', label: 'Date' },
            { key: 'amountPaid', label: 'Paid', class: 'text-right' },
            { key: 'total', label: 'Total', class: 'text-right' }
          ]">
            <template #amountPaid-data="{ row }">
              <span class="text-right block">{{ formatCurrency(row.amountPaid, row.currency) }}</span>
            </template>
            <template #total-data="{ row }">
              <span class="text-right block">{{ formatCurrency(row.total, row.currency) }}</span>
            </template>
          </UTable>
        </div>
      </template>
    </UTabs>
  </UPage>
</template>
