<script setup lang="ts">
import { computed } from 'vue'
import type { FinancialReconciliation, FinancialSourceWarning } from '~/types'

const props = defineProps<{
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
}>()

const sourceLabels: Record<FinancialSourceWarning['source'], string> = {
  xero_invoices: 'Xero invoices',
  xero_revenue: 'Xero revenue',
  xero_supplier_cost: 'Xero supplier costs',
  media_spend: 'Media spend',
  time_entries: 'Time entries',
  project_expenses: 'Project expenses',
  activity: 'Activity',
  reconciliation: 'Financial reconciliation',
}

const warningTitles: Record<FinancialSourceWarning['code'], string> = {
  xero_not_linked: 'Client not linked',
  xero_lines_unavailable: 'Line data unavailable',
  media_not_connected: 'Account not connected',
  media_partial: 'Partial data',
  stale_allocation: 'Stale allocation',
  possible_duplicate: 'Possible duplicate',
  reconciliation_failed: 'Reconciliation needs attention',
  activity_truncated: 'Activity limited',
}

const warningActions: Partial<Record<FinancialSourceWarning['code'], string>> = {
  xero_not_linked: 'Link the Xero contact to include Xero financial data.',
  xero_lines_unavailable: 'Sync Xero invoice lines, then refresh this view.',
  media_not_connected: 'Connect a media account or add confirmed manual media data.',
  media_partial: 'Sync daily media data to complete this reporting period.',
  stale_allocation: 'Review the allocation before relying on project profitability.',
  possible_duplicate: 'Review the linked project expense before using the margin.',
  reconciliation_failed: 'Review source allocations before relying on coverage.',
  activity_truncated: 'Narrow the reporting period to review all time entries.',
}

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function warningSeverity(warning: FinancialSourceWarning): 'Warning' | 'Error' {
  return warning.code === 'reconciliation_failed' ? 'Error' : 'Warning'
}

function warningColor(warning: FinancialSourceWarning): 'warning' | 'error' {
  return warning.code === 'reconciliation_failed' ? 'error' : 'warning'
}

function formatDifference(cents: number): string {
  if (!Number.isFinite(cents)) return 'an unavailable amount'
  const dollars = cents / 100
  return `${dollars > 0 ? '+' : ''}${currency.format(dollars)}`
}

const reconciliationAlerts = computed(() => props.reconciliation
  .filter(item => Math.abs(item.differenceCents) > 1)
  .map(item => ({
    title: `Error: Financial reconciliation: ${item.source.replaceAll('_', ' ')}`,
    description: `Source totals differ by ${formatDifference(item.differenceCents)}. Review allocations before relying on coverage.`,
  })))
</script>

<template>
  <section v-if="warnings.length || reconciliationAlerts.length" aria-labelledby="financial-warnings-heading" class="space-y-3">
    <h3 id="financial-warnings-heading" class="text-base font-semibold text-highlighted">Financial data notices</h3>
    <UAlert
      v-for="warning in warnings"
      :key="`${warning.code}-${warning.source}-${warning.sourceId || ''}-${warning.projectId || ''}`"
      :title="`${warningSeverity(warning)}: ${sourceLabels[warning.source]}: ${warningTitles[warning.code]}`"
      :description="`${warning.message} ${warningActions[warning.code] || ''}`.trim()"
      :color="warningColor(warning)"
      variant="subtle"
      icon="i-lucide-triangle-alert"
    />
    <UAlert
      v-for="alert in reconciliationAlerts"
      :key="alert.title"
      :title="alert.title"
      :description="alert.description"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
    />
  </section>
</template>
