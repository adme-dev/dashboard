<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const { data, pending, error, lastUpdated, isLive, refresh } = useGetOutRealtime()

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val)

const isPositive = computed(() => (data.value?.difference ?? 0) >= 0)
const differenceColor = computed(() =>
  isPositive.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
)
const differenceBg = computed(() =>
  isPositive.value ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'
)

const breadcrumbs = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Get Out', to: '/xeroflow/get-out' },
])
</script>

<template>
  <UDashboardPanel id="get-out">
    <template #header>
      <UDashboardNavbar title="Get Out — Cashflow Target">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <div v-if="isLive" class="flex items-center gap-1.5 text-xs text-emerald-500">
              <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </div>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="pending"
              @click="refresh()"
            />
          </div>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-32" />
        <USkeleton class="h-64" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load Get Out data"
        :description="error.statusMessage || 'Please try refreshing.'"
      />

      <div v-else-if="data" class="space-y-6 max-w-3xl mx-auto">
        <!-- Period Header -->
        <div class="text-center">
          <h2 class="text-2xl font-bold">{{ data.period.monthName }} {{ data.period.year }}</h2>
          <p class="text-sm text-muted">Day {{ data.period.dayOfMonth }} of {{ data.period.daysInMonth }}</p>
        </div>

        <!-- Calculation Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Wages -->
          <UCard>
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-users" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-sm text-muted">Est. Monthly Wages</p>
                <p class="text-xl font-bold">{{ formatCurrency(data.wages) }}</p>
              </div>
            </div>
            <p class="text-xs text-muted">Based on 4 weeks payroll</p>
          </UCard>

          <!-- Expenses -->
          <UCard>
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-wallet" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p class="text-sm text-muted">Expenses (est.)</p>
                <p class="text-xl font-bold">{{ formatCurrency(data.expenses.estimated) }}</p>
              </div>
            </div>
            <p class="text-xs text-muted">Fixed operating costs</p>
          </UCard>
        </div>

        <!-- Extras Breakdown -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-alert-circle" class="h-4 w-4 text-muted" />
              <h3 class="font-semibold">Extras</h3>
            </div>
          </template>
          <div class="space-y-2">
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">ATO Repayment</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.atoRepayment) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan 1</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loan1) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan 2</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loan2) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan Interest</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loanInterest) }}</span>
            </div>
            <div class="flex items-center justify-between py-2">
              <span class="text-sm font-semibold">Extras Total</span>
              <span class="font-bold">{{ formatCurrency(data.expenses.extras.total) }}</span>
            </div>
          </div>
        </UCard>

        <!-- GET OUT Target -->
        <UCard :class="differenceBg">
          <div class="text-center py-4">
            <p class="text-sm text-muted mb-1">Updated Monthly GET OUT Target</p>
            <p class="text-4xl font-bold" :class="differenceColor">
              {{ formatCurrency(data.getOutTarget) }}
            </p>
            <p class="text-xs text-muted mt-2">
              Wages {{ formatCurrency(data.wages) }} + Expenses {{ formatCurrency(data.expenses.totalIncExtras) }}
            </p>
          </div>
        </UCard>

        <!-- Current Month Performance -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UCard>
            <p class="text-sm text-muted">Invoiced This Month</p>
            <p class="text-2xl font-bold">{{ formatCurrency(data.currentMonth.invoicedTotal) }}</p>
            <p class="text-xs text-muted mt-1">{{ data.currentMonth.invoicedCount }} invoices</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Pace Projection</p>
            <p class="text-2xl font-bold">{{ formatCurrency(data.currentMonth.paceProjection) }}</p>
            <p class="text-xs text-muted mt-1">If current rate continues</p>
          </UCard>
          <UCard :class="differenceBg">
            <p class="text-sm text-muted">Difference</p>
            <p class="text-2xl font-bold" :class="differenceColor">
              {{ isPositive ? '+' : '' }}{{ formatCurrency(data.difference) }}
            </p>
            <p class="text-xs text-muted mt-1">
              {{ isPositive ? 'Ahead of target' : 'Behind target' }}
            </p>
          </UCard>
        </div>

        <!-- Category Breakdown -->
        <UCard v-if="data.categoryBreakdown?.length">
          <template #header>
            <h3 class="font-semibold">This Month by Category</h3>
          </template>
          <div class="space-y-2">
            <div
              v-for="cat in data.categoryBreakdown"
              :key="cat.code"
              class="flex items-center justify-between py-2 border-b border-default/50 last:border-0"
            >
              <div class="flex items-center gap-2">
                <UBadge size="xs" variant="subtle">{{ cat.code }}</UBadge>
                <span class="text-sm">{{ cat.name }}</span>
              </div>
              <div class="text-right">
                <span class="font-medium">{{ formatCurrency(cat.total) }}</span>
                <span class="text-xs text-muted ml-2">({{ cat.count }} lines)</span>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
