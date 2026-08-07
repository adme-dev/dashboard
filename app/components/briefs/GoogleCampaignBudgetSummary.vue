<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { computed } from 'vue'
import type { GoogleCampaignBudgetReconciliation } from '~/types'

const props = defineProps<{ reconciliation: GoogleCampaignBudgetReconciliation }>()
const contract = computed(() => props.reconciliation.contract)

function formatMoney(value: number, currency: string): string {
  const amount = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
  return `${currency}\u00a0${amount}`
}

function formatDate(value: string): string {
  return format(parseISO(value), 'd MMM yyyy')
}

function formatLegacyAmount(value: number): string {
  if (props.reconciliation.displayCurrency) {
    return formatMoney(value, props.reconciliation.displayCurrency)
  }
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}
</script>

<template>
  <UCard class="overflow-hidden" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <span
            class="flex size-9 items-center justify-center rounded-lg"
            :class="reconciliation.launchBlocked ? 'bg-error/10 text-error' : 'bg-success/10 text-success'"
          >
            <UIcon
              :name="reconciliation.launchBlocked ? 'i-lucide-shield-alert' : 'i-lucide-badge-check'"
              class="size-5"
            />
          </span>
          <div>
            <h3 class="font-semibold text-highlighted">
              Campaign budget contract
            </h3>
            <p class="text-xs text-muted">
              PMax Inventory · fixed-flight approval view
            </p>
          </div>
        </div>
        <UBadge :color="reconciliation.launchBlocked ? 'error' : 'success'" variant="subtle">
          {{ reconciliation.launchBlocked ? 'Launch blocked' : 'Budget reconciled' }}
        </UBadge>
      </div>
    </template>

    <div v-if="reconciliation.launchBlocked" role="alert" class="space-y-4 p-5 sm:p-6">
      <div>
        <p class="font-medium text-error">
          {{ reconciliation.status === 'legacy_ambiguous' ? 'Legacy budget needs review' : 'Budget contract is invalid' }}
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ reconciliation.remediation }}
        </p>
      </div>

      <div
        v-if="reconciliation.legacyDailyBudget !== null"
        class="rounded-lg border border-warning/30 bg-warning/5 p-4"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-warning">
          Legacy daily budget
        </p>
        <p class="mt-1 font-mono text-lg font-semibold text-highlighted">
          {{ formatLegacyAmount(reconciliation.legacyDailyBudget) }}
        </p>
        <p v-if="!reconciliation.displayCurrency" class="mt-1 text-xs font-medium text-warning">
          Currency not recorded
        </p>
        <p class="mt-1 text-xs text-muted">
          Visible for compatibility only; never converted into a provider total.
        </p>
      </div>
    </div>

    <div v-else-if="contract" class="divide-y divide-default">
      <div class="grid grid-cols-2 gap-px bg-default sm:grid-cols-4">
        <div class="bg-elevated p-4 sm:p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Approved total
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
            {{ formatMoney(contract.allocatedTotal, contract.currency) }}
          </p>
        </div>
        <div class="bg-elevated p-4 sm:p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Flight dates
          </p>
          <p class="mt-1 text-sm font-semibold text-highlighted">
            {{ formatDate(contract.startDate) }} – {{ formatDate(contract.endDate) }}
          </p>
        </div>
        <div class="bg-elevated p-4 sm:p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Duration
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
            {{ contract.campaignDays }} inclusive days
          </p>
        </div>
        <div class="bg-elevated p-4 sm:p-5">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Calculated pace
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
            {{ formatMoney(contract.calculatedDailyPace, contract.currency) }}/day
          </p>
        </div>
      </div>

      <div class="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-highlighted">
              Google provider mapping
            </p>
            <UBadge color="info" variant="subtle" size="xs">
              {{ contract.period }}
            </UBadge>
          </div>
          <p class="mt-2 break-all font-mono text-sm text-highlighted">
            totalAmountMicros = {{ contract.provider.totalAmountMicros }}
          </p>
          <p class="mt-1 text-xs text-muted">
            amountMicros remains unset. The calculated daily pace is display-only.
          </p>
        </div>
        <div class="rounded-lg border border-default bg-muted/30 px-3 py-2 text-xs text-muted">
          Account currency and timezone check pending preflight
        </div>
      </div>

      <div
        v-if="reconciliation.legacyDailyBudget !== null"
        class="bg-warning/5 px-5 py-3 text-xs text-warning sm:px-6"
      >
        Legacy daily budget retained for readability and ignored by this contract.
      </div>
    </div>
  </UCard>
</template>
