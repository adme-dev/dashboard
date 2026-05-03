<script setup lang="ts">
/**
 * Get Out Cashflow Panel — XeroFlow Sidebar Widget
 *
 * Displays the monthly cashflow target calculation with LIVE tracking:
 *   Wages + Expenses + Extras = GET OUT target
 *   vs Current month invoicing total
 *
 * Auto-refreshes every 30s via SSE + polling fallback.
 * Styled to match the original ADME "Get Out" spreadsheet.
 */

const { data, pending, lastUpdated, isLive, refresh } = useGetOutRealtime()

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val)

const isPositive = computed(() => (data.value?.difference ?? 0) >= 0)
const differenceColor = computed(() =>
  isPositive.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
)
const differenceBg = computed(() =>
  isPositive.value ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'
)

// Expand/collapse for sidebar real-estate
const expanded = ref(false)

// Format last updated time
const timeAgo = computed(() => {
  if (!lastUpdated.value) return ''
  const diffMs = Date.now() - lastUpdated.value.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  return lastUpdated.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div class="border border-default rounded-xl overflow-hidden">
    <!-- Header -->
    <button
      class="w-full flex items-center justify-between px-4 py-3 bg-elevated/50 hover:bg-elevated transition-colors"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <div class="relative">
          <UIcon name="i-lucide-target" class="h-4 w-4 text-primary" />
          <span
            v-if="isLive"
            class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"
          />
        </div>
        <span class="text-sm font-semibold">Get Out</span>
        <span v-if="isLive" class="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Live</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="data" :class="['text-xs font-bold', differenceColor]">
          {{ isPositive ? '+' : '' }}{{ formatCurrency(data.difference) }}
        </span>
        <UIcon
          :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="h-4 w-4 text-muted"
        />
      </div>
    </button>

    <!-- Compact view (always visible) -->
    <div v-if="!expanded" class="px-4 py-3 space-y-2">
      <div v-if="pending && !data" class="space-y-2">
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-3/4" />
      </div>

      <template v-else-if="data">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">Target</span>
          <span class="text-sm font-bold">{{ formatCurrency(data.getOutTarget) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">Invoiced</span>
          <span class="text-sm font-semibold">{{ formatCurrency(data.currentMonth.invoicedTotal) }}</span>
        </div>
        <div
          class="mt-2 rounded-lg px-3 py-2 text-center"
          :class="differenceBg"
        >
          <span :class="['text-sm font-bold', differenceColor]">
            {{ isPositive ? 'Surplus' : 'Shortfall' }} {{ formatCurrency(Math.abs(data.difference)) }}
          </span>
        </div>
        <div class="flex items-center justify-between text-[10px] text-dimmed">
          <span>Updated {{ timeAgo }}</span>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            class="px-1"
            @click.stop="refresh()"
          />
        </div>
      </template>

      <div v-else class="text-xs text-muted text-center py-2">
        Connect Xero to see Get Out
      </div>
    </div>

    <!-- Expanded view -->
    <div v-else class="px-4 py-3 space-y-3">
      <div v-if="pending && !data" class="space-y-2">
        <USkeleton class="h-4 w-full" v-for="i in 6" :key="i" />
      </div>

      <template v-else-if="data">
        <!-- Wages -->
        <div class="flex items-center justify-between py-1 border-b border-default/50">
          <span class="text-xs text-muted">Est. Monthly Wages (4× Wks)</span>
          <span class="text-sm font-medium">{{ formatCurrency(data.wages) }}</span>
        </div>

        <!-- Expenses -->
        <div class="flex items-center justify-between py-1 border-b border-default/50">
          <span class="text-xs text-muted">Expenses only Total</span>
          <span class="text-sm font-medium">{{ formatCurrency(data.expenses.estimated) }}</span>
        </div>

        <!-- Extras -->
        <div class="space-y-1">
          <div class="flex items-center justify-between py-1">
            <span class="text-xs text-muted">Extras</span>
            <span class="text-xs font-medium">{{ formatCurrency(data.expenses.extras.total) }}</span>
          </div>
          <div class="pl-3 space-y-0.5">
            <div class="flex items-center justify-between text-xs text-dimmed">
              <span>ATO Repayment</span>
              <span>{{ formatCurrency(data.expenses.extras.detail.atoRepayment) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs text-dimmed">
              <span>Loan 1</span>
              <span>{{ formatCurrency(data.expenses.extras.detail.loan1) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs text-dimmed">
              <span>Loan 2</span>
              <span>{{ formatCurrency(data.expenses.extras.detail.loan2) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs text-dimmed">
              <span>Loan Interest</span>
              <span>{{ formatCurrency(data.expenses.extras.detail.loanInterest) }}</span>
            </div>
          </div>
        </div>

        <!-- Total Expenses -->
        <div class="flex items-center justify-between py-1 border-b border-default/50">
          <span class="text-xs font-medium">Expenses inc Extras</span>
          <span class="text-sm font-medium">{{ formatCurrency(data.expenses.totalIncExtras) }}</span>
        </div>

        <!-- GET OUT Target -->
        <div class="rounded-lg px-3 py-2 text-center" :class="differenceBg">
          <div class="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">
            Updated monthly GET OUT
          </div>
          <div class="text-lg font-bold" :class="differenceColor">
            {{ formatCurrency(data.getOutTarget) }}
          </div>
        </div>

        <!-- Current Month -->
        <div class="space-y-1">
          <div class="flex items-center justify-between py-1 border-b border-default/50">
            <span class="text-xs text-muted">Current Month Invoicing</span>
            <span class="text-sm font-semibold">{{ formatCurrency(data.currentMonth.invoicedTotal) }}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-dimmed">
            <span>Invoices</span>
            <span>{{ data.currentMonth.invoicedCount }}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-dimmed">
            <span>Pace Projection</span>
            <span>{{ formatCurrency(data.currentMonth.paceProjection) }}</span>
          </div>
        </div>

        <!-- Difference -->
        <div
          class="rounded-lg px-3 py-2 text-center border-2"
          :class="isPositive ? 'border-emerald-500/30' : 'border-red-500/30'"
        >
          <div class="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5">
            Difference
          </div>
          <div class="text-xl font-bold" :class="differenceColor">
            {{ isPositive ? '+' : '' }}{{ formatCurrency(data.difference) }}
          </div>
        </div>

        <!-- Category Breakdown -->
        <div v-if="data.categoryBreakdown?.length" class="pt-2 border-t border-default/50">
          <div class="text-[10px] uppercase tracking-wide text-muted font-semibold mb-1.5">
            This Month by Category
          </div>
          <div class="space-y-1">
            <div
              v-for="cat in data.categoryBreakdown.slice(0, 5)"
              :key="cat.code"
              class="flex items-center justify-between text-xs"
            >
              <span class="text-muted truncate max-w-[120px]">{{ cat.name }}</span>
              <span class="font-medium">{{ formatCurrency(cat.total) }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] text-dimmed">Updated {{ timeAgo }}</span>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="refresh()"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <div v-else class="text-xs text-muted text-center py-4">
        Connect Xero to see Get Out details
      </div>
    </div>
  </div>
</template>
