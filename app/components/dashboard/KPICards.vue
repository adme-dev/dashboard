<script setup lang="ts">
interface KPIData {
  revenue: {
    current: number
    growth: number
    trend: 'up' | 'down' | 'stable'
  }
  expenses: {
    current: number
    growth: number
    trend: 'up' | 'down' | 'stable'
  }
  profit: {
    current: number
    margin: number
    growth: number
    trend: 'up' | 'down' | 'stable'
  }
  cash: {
    current: number
    runway: number
    status: 'healthy' | 'warning' | 'critical'
  }
  ratios: {
    healthScore: number
  }
}

const props = defineProps<{
  data: KPIData | null
  loading: boolean
  connected: boolean
}>()

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'up': return 'i-lucide-trending-up'
    case 'down': return 'i-lucide-trending-down'
    default: return 'i-lucide-minus'
  }
}

const getTrendColor = (trend: string, isExpense = false) => {
  // For expenses, down trend is good (green), up trend is bad (red)
  if (isExpense) {
    switch (trend) {
      case 'up': return 'text-red-500'
      case 'down': return 'text-emerald-500'
      default: return 'text-neutral-500'
    }
  }
  
  // For revenue/profit, up trend is good (green), down trend is bad (red)
  switch (trend) {
    case 'up': return 'text-emerald-500'
    case 'down': return 'text-red-500'
    default: return 'text-neutral-500'
  }
}

const getCashStatusColor = (status: string) => {
  switch (status) {
    case 'healthy': return 'text-emerald-500'
    case 'warning': return 'text-amber-500'
    case 'critical': return 'text-red-500'
    default: return 'text-neutral-500'
  }
}

const getHealthScoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 60) return 'text-amber-500'
  return 'text-red-500'
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
    <!-- Revenue Card -->
    <UCard class="relative overflow-hidden">
      <template v-if="loading">
        <div class="space-y-3">
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-8 w-32" />
          <USkeleton class="h-4 w-24" />
        </div>
      </template>
      
      <template v-else>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs text-muted uppercase mb-2">
              Monthly Revenue
            </p>
            <p class="text-2xl font-bold text-highlighted">
              {{ data ? formatCurrency(data.revenue.current) : '$0' }}
            </p>
            <div class="flex items-center gap-1 mt-1">
              <UIcon 
                :name="getTrendIcon(data?.revenue.trend || 'stable')" 
                :class="getTrendColor(data?.revenue.trend || 'stable')"
                class="h-4 w-4"
              />
              <span 
                :class="getTrendColor(data?.revenue.trend || 'stable')"
                class="text-sm font-medium"
              >
                {{ data ? formatPercent(data.revenue.growth) : '0%' }}
              </span>
              <span class="text-xs text-muted ml-1">vs last month</span>
            </div>
          </div>
          <div class="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <UIcon name="i-lucide-dollar-sign" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </template>
    </UCard>

    <!-- Expenses Card -->
    <UCard class="relative overflow-hidden">
      <template v-if="loading">
        <div class="space-y-3">
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-8 w-32" />
          <USkeleton class="h-4 w-24" />
        </div>
      </template>
      
      <template v-else>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs text-muted uppercase mb-2">
              Monthly Expenses
            </p>
            <p class="text-2xl font-bold text-highlighted">
              {{ data ? formatCurrency(data.expenses.current) : '$0' }}
            </p>
            <div class="flex items-center gap-1 mt-1">
              <UIcon 
                :name="getTrendIcon(data?.expenses.trend || 'stable')" 
                :class="getTrendColor(data?.expenses.trend || 'stable', true)"
                class="h-4 w-4"
              />
              <span 
                :class="getTrendColor(data?.expenses.trend || 'stable', true)"
                class="text-sm font-medium"
              >
                {{ data ? formatPercent(data.expenses.growth) : '0%' }}
              </span>
              <span class="text-xs text-muted ml-1">vs last month</span>
            </div>
          </div>
          <div class="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
            <UIcon name="i-lucide-credit-card" class="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
        </div>
      </template>
    </UCard>

    <!-- Profit Card -->
    <UCard class="relative overflow-hidden">
      <template v-if="loading">
        <div class="space-y-3">
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-8 w-32" />
          <USkeleton class="h-4 w-24" />
        </div>
      </template>
      
      <template v-else>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs text-muted uppercase mb-2">
              Net Profit
            </p>
            <p class="text-2xl font-bold text-highlighted">
              {{ data ? formatCurrency(data.profit.current) : '$0' }}
            </p>
            <div class="flex items-center gap-1 mt-1">
              <UIcon 
                :name="getTrendIcon(data?.profit.trend || 'stable')" 
                :class="getTrendColor(data?.profit.trend || 'stable')"
                class="h-4 w-4"
              />
              <span 
                :class="getTrendColor(data?.profit.trend || 'stable')"
                class="text-sm font-medium"
              >
                {{ data ? formatPercent(data.profit.growth) : '0%' }}
              </span>
              <span class="text-xs text-muted ml-1">
                • {{ data ? data.profit.margin.toFixed(1) : '0' }}% margin
              </span>
            </div>
          </div>
          <div class="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg">
            <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </template>
    </UCard>

    <!-- Cash & Health Card -->
    <UCard class="relative overflow-hidden">
      <template v-if="loading">
        <div class="space-y-3">
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-8 w-32" />
          <USkeleton class="h-4 w-24" />
        </div>
      </template>
      
      <template v-else>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs text-muted uppercase mb-2">
              Cash Position
            </p>
            <p class="text-2xl font-bold text-highlighted">
              {{ data ? formatCurrency(data.cash.current) : '$0' }}
            </p>
            <div class="flex items-center justify-between mt-1">
              <div class="flex items-center gap-1">
                <span 
                  :class="getCashStatusColor(data?.cash.status || 'healthy')"
                  class="text-sm font-medium"
                >
                  {{ data ? Math.round(data.cash.runway) : 0 }} days runway
                </span>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-xs text-muted">Health:</span>
                <span 
                  :class="getHealthScoreColor(data?.ratios.healthScore || 0)"
                  class="text-sm font-bold"
                >
                  {{ data ? Math.round(data.ratios.healthScore) : 0 }}%
                </span>
              </div>
            </div>
          </div>
          <div class="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
            <UIcon name="i-lucide-piggy-bank" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>

<style scoped>
/* Add any custom animations or styles */
.card-shimmer {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
