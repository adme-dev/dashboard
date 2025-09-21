<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/xero/reports/pnl-consolidated')

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Consolidated P&L"
      description="Aggregated Profit & Loss across connected organizations"
    >
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Loading consolidated P&L…</div>
    <div v-else-if="error">Failed to load consolidated P&L.</div>

    <UPageGrid v-else class="gap-4 sm:gap-6">
      <UPageCard title="Totals" variant="subtle">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div class="text-muted text-xs">Revenue</div>
            <div class="text-lg font-semibold">{{ formatCurrency(data?.totals?.revenueTotal) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Expenses</div>
            <div class="text-lg font-semibold">{{ formatCurrency(data?.totals?.expensesTotal) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Net Profit</div>
            <div class="text-lg font-semibold">{{ formatCurrency(data?.totals?.netProfit) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Profit Margin</div>
            <div class="text-lg font-semibold">{{ Math.round((data?.totals?.profitMargin || 0) * 100) }}%</div>
          </div>
        </div>
      </UPageCard>

      <UPageCard title="Per Organization" variant="subtle">
        <UTable :rows="data?.tenants || []" :columns="[
          { key: 'tenantName', label: 'Organization' },
          { key: 'revenueTotal', label: 'Revenue', class: 'text-right' },
          { key: 'expensesTotal', label: 'Expenses', class: 'text-right' },
          { key: 'netProfit', label: 'Net Profit', class: 'text-right' },
          { key: 'profitMargin', label: 'Margin', class: 'text-right' }
        ]">
          <template #revenueTotal-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.revenueTotal) }}</span>
          </template>
          <template #expensesTotal-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.expensesTotal) }}</span>
          </template>
          <template #netProfit-data="{ row }">
            <span class="text-right block">{{ formatCurrency(row.netProfit) }}</span>
          </template>
          <template #profitMargin-data="{ row }">
            <span class="text-right block">{{ Math.round((row.profitMargin || 0) * 100) }}%</span>
          </template>
        </UTable>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
