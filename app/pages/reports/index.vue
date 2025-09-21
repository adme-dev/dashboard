<script setup lang="ts">
const { data: pnl, pending: pnlPending, error: pnlError } = await useFetch('/api/xero/reports/pnl')
const { data: bs, pending: bsPending, error: bsError } = await useFetch('/api/xero/reports/balance-sheet')

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Financial Reports"
      description="Key figures from Profit & Loss and Balance Sheet"
    />

    <UPageGrid class="gap-4 sm:gap-6">
      <UPageCard title="Profit & Loss" variant="subtle">
        <div v-if="pnlPending">Loading P&L…</div>
        <div v-else-if="pnlError">Failed to load P&L.</div>
        <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div class="text-muted text-xs">Revenue</div>
            <div class="text-lg font-semibold">{{ formatCurrency(pnl?.revenueTotal) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Expenses</div>
            <div class="text-lg font-semibold">{{ formatCurrency(pnl?.expensesTotal) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Net Profit</div>
            <div class="text-lg font-semibold">{{ formatCurrency(pnl?.netProfit) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Profit Margin</div>
            <div class="text-lg font-semibold">{{ Math.round((pnl?.profitMargin || 0) * 100) }}%</div>
          </div>
        </div>
      </UPageCard>

      <UPageCard title="Balance Sheet" variant="subtle">
        <div v-if="bsPending">Loading Balance Sheet…</div>
        <div v-else-if="bsError">Failed to load Balance Sheet.</div>
        <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div class="text-muted text-xs">Total Assets</div>
            <div class="text-lg font-semibold">{{ formatCurrency(bs?.totalAssets) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Total Liabilities</div>
            <div class="text-lg font-semibold">{{ formatCurrency(bs?.totalLiabilities) }}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Total Equity</div>
            <div class="text-lg font-semibold">{{ formatCurrency(bs?.totalEquity) }}</div>
          </div>
        </div>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
