<script setup lang="ts">
import { format } from 'date-fns'

// Period filter
const now = new Date()
const selectedMonth = ref(now.getMonth() + 1)
const selectedYear = ref(now.getFullYear())

const monthOptions = [
  { label: 'January', value: 1 }, { label: 'February', value: 2 },
  { label: 'March', value: 3 }, { label: 'April', value: 4 },
  { label: 'May', value: 5 }, { label: 'June', value: 6 },
  { label: 'July', value: 7 }, { label: 'August', value: 8 },
  { label: 'September', value: 9 }, { label: 'October', value: 10 },
  { label: 'November', value: 11 }, { label: 'December', value: 12 }
]

const yearOptions = Array.from({ length: 3 }, (_, i) => {
  const y = now.getFullYear() - i
  return { label: String(y), value: y }
})

// Fetch budget health data
const { data: healthData, pending, refresh } = useFetch('/api/agency/budget-alerts/health', {
  query: { month: selectedMonth, year: selectedYear }
})

const summary = computed(() => (healthData.value as any)?.summary || {
  totalBudget: 0, totalSpent: 0, totalRemaining: 0, overallUtilization: 0,
  clientCount: 0, overBudgetCount: 0, atRiskCount: 0, underspendCount: 0, healthyCount: 0, noBudgetCount: 0
})

const monthProgress = computed(() => (healthData.value as any)?.monthProgress || 0)
const clients = computed(() => ((healthData.value as any)?.clients || []) as any[])
const burnRateTrends = computed(() => ((healthData.value as any)?.burnRateTrends || []) as any[])

// Derived: only those with budget assigned
const hasBudgets = computed(() => summary.value.clientCount > 0)
const clientsWithBudget = computed(() => clients.value.filter(c => c.budget > 0))
const clientsNoBudget = computed(() => clients.value.filter(c => c.budget === 0))

// Format helpers
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)

const formatPercent = (value: number) => `${value.toFixed(0)}%`
const formatDate = (date: string) => format(new Date(date), 'MMM d')

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const periodLabel = computed(() => `${months[selectedMonth.value - 1]} ${selectedYear.value}`)

// Status colors
const getHealthColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'healthy': return 'success'
    case 'underspend': return 'neutral'
    case 'at_risk': return 'warning'
    case 'critical': return 'error'
    case 'over_budget': return 'error'
    case 'no_budget': return 'neutral'
    default: return 'neutral'
  }
}

const getHealthLabel = (status: string): string => {
  switch (status) {
    case 'healthy': return 'On Track'
    case 'underspend': return 'Underspend'
    case 'at_risk': return 'At Risk'
    case 'critical': return 'Critical'
    case 'over_budget': return 'Over Budget'
    case 'no_budget': return 'No Budget'
    default: return status
  }
}

const getProgressColor = (status: string): string => {
  switch (status) {
    case 'over_budget': return 'bg-red-500'
    case 'critical': return 'bg-red-400'
    case 'at_risk': return 'bg-amber-500'
    case 'underspend': return 'bg-blue-500'
    default: return 'bg-emerald-500'
  }
}

const platformLabel = (p: string) => {
  if (p === 'meta') return 'Meta'
  if (p === 'google_ads') return 'Google Ads'
  return p
}

const platformIcon = (p: string) => {
  if (p === 'meta') return 'i-lucide-facebook'
  if (p === 'google_ads') return 'i-lucide-chrome'
  return 'i-lucide-globe'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Period Filter + Refresh -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <USelect
          v-model="selectedMonth"
          :items="monthOptions"
          value-key="value"
          class="w-36"
        />
        <USelect
          v-model="selectedYear"
          :items="yearOptions"
          value-key="value"
          class="w-28"
        />
      </div>
      <UButton variant="outline" icon="i-lucide-refresh-cw" label="Refresh" @click="refresh()" />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else>
      <!-- No-budgets banner -->
      <div v-if="!hasBudgets && clients.length > 0" class="border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 flex items-start gap-3">
        <UIcon name="i-lucide-alert-circle" class="size-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p class="font-medium text-sm">No budgets configured for {{ periodLabel }}</p>
          <p class="text-xs text-muted mt-1">
            {{ clients.length }} client{{ clients.length > 1 ? 's have' : ' has' }} active ad spend ({{ formatCurrency(summary.totalSpent) }} total) but no monthly budgets set.
            Set budgets in Ad Spend to enable pacing alerts and health tracking.
          </p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Budget or Spend depending on state -->
        <UCard>
          <div class="text-center">
            <template v-if="hasBudgets">
              <p class="text-sm text-muted mb-1">Total Budget</p>
              <p class="text-2xl font-bold">{{ formatCurrency(summary.totalBudget) }}</p>
              <p class="text-xs text-muted">{{ summary.clientCount }} client{{ summary.clientCount !== 1 ? 's' : '' }} with budgets</p>
            </template>
            <template v-else>
              <p class="text-sm text-muted mb-1">Total Ad Spend</p>
              <p class="text-2xl font-bold text-blue-500">{{ formatCurrency(summary.totalSpent) }}</p>
              <p class="text-xs text-muted">{{ clients.length }} client{{ clients.length !== 1 ? 's' : '' }} active</p>
            </template>
          </div>
        </UCard>

        <!-- Card 2: Spent (with budget context) or Period progress -->
        <UCard>
          <div class="text-center">
            <template v-if="hasBudgets">
              <p class="text-sm text-muted mb-1">Total Spent</p>
              <p class="text-2xl font-bold text-blue-500">{{ formatCurrency(summary.totalSpent) }}</p>
              <p class="text-xs text-muted">{{ formatPercent(summary.overallUtilization) }} of budget</p>
            </template>
            <template v-else>
              <p class="text-sm text-muted mb-1">Month Progress</p>
              <p class="text-2xl font-bold">{{ formatPercent(monthProgress) }}</p>
              <p class="text-xs text-muted">of {{ periodLabel }}</p>
            </template>
          </div>
        </UCard>

        <!-- Card 3: Remaining or Platform split -->
        <UCard>
          <div class="text-center">
            <template v-if="hasBudgets">
              <p class="text-sm text-muted mb-1">Remaining</p>
              <p class="text-2xl font-bold" :class="summary.totalRemaining >= 0 ? 'text-emerald-500' : 'text-red-500'">
                {{ formatCurrency(summary.totalRemaining) }}
              </p>
              <p class="text-xs text-muted">{{ formatPercent(monthProgress) }} through month</p>
            </template>
            <template v-else>
              <p class="text-sm text-muted mb-1">Platforms</p>
              <div class="flex justify-center gap-4 mt-1">
                <div v-for="p in ['meta', 'google_ads']" :key="p">
                  <p class="text-lg font-bold">
                    {{ formatCurrency(clients.filter(c => c.platform === p).reduce((s: number, c: any) => s + c.spend, 0)) }}
                  </p>
                  <p class="text-[10px] text-muted">{{ platformLabel(p) }}</p>
                </div>
              </div>
            </template>
          </div>
        </UCard>

        <!-- Card 4: Health overview -->
        <UCard>
          <div class="text-center">
            <template v-if="hasBudgets">
              <p class="text-sm text-muted mb-1">Health Overview</p>
              <div class="flex justify-center gap-3 mt-1">
                <div>
                  <p class="text-xl font-bold text-emerald-500">{{ summary.healthyCount }}</p>
                  <p class="text-[10px] text-muted">OK</p>
                </div>
                <div>
                  <p class="text-xl font-bold text-amber-500">{{ summary.atRiskCount }}</p>
                  <p class="text-[10px] text-muted">Risk</p>
                </div>
                <div>
                  <p class="text-xl font-bold text-red-500">{{ summary.overBudgetCount }}</p>
                  <p class="text-[10px] text-muted">Over</p>
                </div>
                <div>
                  <p class="text-xl font-bold text-blue-500">{{ summary.underspendCount }}</p>
                  <p class="text-[10px] text-muted">Under</p>
                </div>
              </div>
            </template>
            <template v-else>
              <p class="text-sm text-muted mb-1">Budget Status</p>
              <div class="flex items-center justify-center gap-2 mt-2">
                <UIcon name="i-lucide-circle-off" class="size-5 text-muted" />
                <span class="text-sm text-muted">No budgets set</span>
              </div>
              <p class="text-[10px] text-muted mt-1">{{ summary.noBudgetCount }} untracked</p>
            </template>
          </div>
        </UCard>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Client Budget Status (with budget) -->
        <div class="lg:col-span-2">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">
                  {{ hasBudgets ? 'Budget Status by Client / Platform' : 'Ad Spend by Client / Platform' }}
                </h3>
                <UBadge v-if="clientsNoBudget.length > 0 && hasBudgets" color="warning" variant="subtle" size="xs">
                  {{ clientsNoBudget.length }} untracked
                </UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <!-- Clients with budgets -->
              <div
                v-for="client in clientsWithBudget"
                :key="`${client.clientId}-${client.platform}`"
                class="p-3 rounded-lg bg-elevated"
              >
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <p class="font-medium">{{ client.clientName }}</p>
                      <div class="flex items-center gap-1 text-muted">
                        <UIcon :name="platformIcon(client.platform)" class="size-3.5" />
                        <span class="text-xs">{{ platformLabel(client.platform) }}</span>
                      </div>
                      <UIcon v-if="client.rolling" name="i-lucide-repeat" class="size-3 text-primary" />
                    </div>
                    <p class="text-xs text-muted">{{ client.campaignCount }} campaign{{ client.campaignCount !== 1 ? 's' : '' }}</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right">
                      <p class="text-sm font-semibold">
                        {{ formatCurrency(client.spend) }} / {{ formatCurrency(client.budget) }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ client.remaining >= 0 ? formatCurrency(client.remaining) + ' remaining' : formatCurrency(Math.abs(client.remaining)) + ' over' }}
                      </p>
                    </div>
                    <UBadge :color="getHealthColor(client.healthStatus)" variant="subtle">
                      {{ getHealthLabel(client.healthStatus) }}
                    </UBadge>
                  </div>
                </div>
                <!-- Progress bar with month progress marker -->
                <div class="h-2 bg-default rounded-full overflow-hidden relative">
                  <div
                    class="absolute inset-y-0 left-0 bg-muted/20 rounded-full"
                    :style="{ width: `${monthProgress}%` }"
                  />
                  <div
                    :class="getProgressColor(client.healthStatus)"
                    class="absolute inset-y-0 left-0 rounded-full transition-all"
                    :style="{ width: `${Math.min(client.percentConsumed, 100)}%` }"
                  />
                </div>
                <div class="flex justify-between mt-1 text-[10px] text-muted">
                  <span>0%</span>
                  <span>{{ formatPercent(client.percentConsumed) }} spent ({{ client.pacingRatio }}x pacing)</span>
                  <span>100%</span>
                </div>
              </div>

              <p v-if="clientsWithBudget.length === 0 && clientsNoBudget.length === 0" class="text-center text-muted py-4">
                No ad spend data for this period
              </p>
            </div>

            <!-- No-budget section -->
            <div v-if="clientsNoBudget.length > 0" class="mt-6 pt-4 border-t border-default">
              <h4 class="text-sm font-medium text-muted mb-3">
                {{ hasBudgets ? 'No Budget Set' : 'Active Spend' }} ({{ clientsNoBudget.length }})
              </h4>
              <div class="space-y-2">
                <div
                  v-for="client in clientsNoBudget"
                  :key="`${client.clientId}-${client.platform}-nb`"
                  class="flex items-center justify-between p-2 rounded-lg bg-elevated/50"
                >
                  <div class="flex items-center gap-2">
                    <UIcon :name="platformIcon(client.platform)" class="size-4 text-muted" />
                    <span class="text-sm">{{ client.clientName }}</span>
                    <span class="text-xs text-muted">{{ platformLabel(client.platform) }}</span>
                  </div>
                  <span class="text-sm font-medium">{{ formatCurrency(client.spend) }} spent</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Weekly Burn Rate -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Weekly Burn Rate</h3>
          </template>

          <div class="space-y-4">
            <div
              v-for="week in burnRateTrends"
              :key="week.weekStart"
              class="p-3 rounded-lg bg-elevated"
            >
              <div class="flex items-center justify-between mb-2">
                <p class="font-medium text-sm">{{ formatDate(week.weekStart) }}</p>
                <p class="font-semibold text-blue-500">{{ formatCurrency(week.totalSpend) }}</p>
              </div>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p class="text-muted text-xs">Impressions</p>
                  <p class="font-medium">{{ week.impressions.toLocaleString() }}</p>
                </div>
                <div>
                  <p class="text-muted text-xs">Clicks</p>
                  <p class="font-medium">{{ week.clicks.toLocaleString() }}</p>
                </div>
              </div>
            </div>

            <p v-if="burnRateTrends.length === 0" class="text-center text-muted py-4">
              No daily spend data for this period
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
