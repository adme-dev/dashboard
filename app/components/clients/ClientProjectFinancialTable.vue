<script setup lang="ts">
import type { ClientProjectFinancialRow, FinancialAllocatableSourceType } from '~/types'

defineProps<{ projects: ClientProjectFinancialRow[]; pending?: boolean }>()

const columns = [
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'projectBudget', header: 'Project budget' },
  { accessorKey: 'xeroRevenue', header: 'Xero revenue' },
  { accessorKey: 'mediaSpend', header: 'Media spend' },
  { accessorKey: 'deliveryCost', header: 'Delivery cost' },
  { accessorKey: 'deliveryProfit', header: 'Delivery profit' },
  { accessorKey: 'deliveryMarginPct', header: 'Margin' },
  { accessorKey: 'coverage', header: 'Coverage' },
]

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function formatCurrency(value: number | null): string {
  return value !== null && Number.isFinite(value) ? currency.format(value) : '—'
}

function hasSource(row: ClientProjectFinancialRow, source: FinancialAllocatableSourceType): boolean {
  return row.coverage.sourceTypes.includes(source)
}

function mappedCurrency(row: ClientProjectFinancialRow, source: FinancialAllocatableSourceType, value: number): string {
  return hasSource(row, source) ? formatCurrency(value) : 'Unallocated'
}

function marginLabel(row: ClientProjectFinancialRow): string {
  if (row.deliveryMarginPct !== null) return `${row.deliveryMarginPct.toFixed(1)}%`
  if (row.marginReason === 'no_agi') return '— No AGI'
  if (row.marginReason === 'negative_agi') return '— Negative AGI'
  if (row.marginReason === 'source_conflict') return '— Source conflict'
  return '—'
}

function coverageLabel(row: ClientProjectFinancialRow): string {
  return row.coverage.mappedSourceCount === 0
    ? 'No financial sources mapped'
    : `${row.coverage.mappedSourceCount} source${row.coverage.mappedSourceCount === 1 ? '' : 's'} mapped`
}
</script>

<template>
  <section aria-labelledby="project-financials-heading">
    <h3 id="project-financials-heading" class="mb-3 text-base font-semibold text-highlighted">Project financials</h3>
    <div class="overflow-x-auto rounded-lg border border-default">
      <UTable :data="projects" :columns="columns" :loading="pending" class="min-w-[920px]">
        <template #projectName-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.projectName }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge color="neutral" variant="subtle" size="sm">{{ row.original.status }}</UBadge>
        </template>
        <template #projectBudget-cell="{ row }">
          <span class="tabular-nums text-muted">{{ formatCurrency(row.original.projectBudget) }}</span>
        </template>
        <template #xeroRevenue-cell="{ row }">
          <span class="tabular-nums">{{ mappedCurrency(row.original, 'xero_revenue', row.original.xeroRevenue) }}</span>
        </template>
        <template #mediaSpend-cell="{ row }">
          <span class="tabular-nums">{{ mappedCurrency(row.original, 'media_spend', row.original.mediaSpend) }}</span>
        </template>
        <template #deliveryCost-cell="{ row }">
          <span class="tabular-nums">{{ formatCurrency(row.original.deliveryCost) }}</span>
        </template>
        <template #deliveryProfit-cell="{ row }">
          <span class="tabular-nums" :class="row.original.deliveryProfit < 0 ? 'text-error' : 'text-success'">
            {{ formatCurrency(row.original.deliveryProfit) }}
          </span>
        </template>
        <template #deliveryMarginPct-cell="{ row }">
          <span class="tabular-nums" :class="row.original.deliveryMarginPct !== null && row.original.deliveryMarginPct < 0 ? 'text-error' : 'text-success'">
            {{ marginLabel(row.original) }}
          </span>
        </template>
        <template #coverage-cell="{ row }">
          <span class="text-sm text-muted">{{ coverageLabel(row.original) }}</span>
        </template>
      </UTable>
    </div>
  </section>
</template>
