<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Budget Health',
  middleware: ['auth']
})

const toast = useToast()

// Fetch budget health data
const { data: healthData, pending, refresh } = await useFetch('/api/agency/budget-alerts/health')

const summary = computed(() => ((healthData.value as any)?.summary || {
  totalBudget: 0,
  totalSpent: 0,
  totalRemaining: 0,
  overallUtilization: 0,
  projectCount: 0,
  overBudgetCount: 0,
  atRiskCount: 0,
  healthyCount: 0
}) as any)

const projects = computed(() => ((healthData.value as any)?.projects || []) as any[])
const recentAlerts = computed(() => ((healthData.value as any)?.recentAlerts || []) as any[])
const burnRateTrends = computed(() => ((healthData.value as any)?.burnRateTrends || []) as any[])

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(0)}%`

const formatDate = (date: string) => format(new Date(date), 'MMM d')

// Status colors
const getHealthColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'healthy': return 'success'
    case 'at_risk': return 'warning'
    case 'critical': return 'error'
    case 'over_budget': return 'error'
    default: return 'neutral'
  }
}

const getHealthLabel = (status: string): string => {
  switch (status) {
    case 'healthy': return 'Healthy'
    case 'at_risk': return 'At Risk'
    case 'critical': return 'Critical'
    case 'over_budget': return 'Over Budget'
    default: return status
  }
}

const getSeverityColor = (severity: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (severity) {
    case 'danger': return 'error'
    case 'critical': return 'error'
    case 'warning': return 'warning'
    default: return 'neutral'
  }
}

// Progress bar color
const getProgressColor = (percent: number): string => {
  if (percent > 100) return 'bg-red-500'
  if (percent > 90) return 'bg-red-400'
  if (percent > 75) return 'bg-amber-500'
  return 'bg-emerald-500'
}

// Alert actions
const acknowledgeAlert = async (alert: any) => {
  try {
    await $fetch(`/api/agency/budget-alerts/${alert.id}/acknowledge`, {
      method: 'POST'
    })
    toast.add({ title: 'Alert acknowledged', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to acknowledge', description: err.message, color: 'error' })
  }
}

// Table columns
const projectColumns: any[] = [
  { key: 'project', label: 'Project' },
  { key: 'budget', label: 'Budget' },
  { key: 'spent', label: 'Spent' },
  { key: 'progress', label: 'Progress' },
  { key: 'status', label: 'Status' }
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Budget Health">
        <template #right>
          <UButton
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="Refresh"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Budget</p>
                <p class="text-2xl font-bold">{{ formatCurrency(summary.totalBudget) }}</p>
                <p class="text-xs text-gray-400">{{ summary.projectCount }} active projects</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Spent</p>
                <p class="text-2xl font-bold text-blue-500">{{ formatCurrency(summary.totalSpent) }}</p>
                <p class="text-xs text-gray-400">{{ formatPercent(summary.overallUtilization) }} of budget</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Remaining</p>
                <p class="text-2xl font-bold text-emerald-500">{{ formatCurrency(summary.totalRemaining) }}</p>
                <p class="text-xs text-gray-400">Available budget</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Project Health</p>
                <div class="flex justify-center gap-4 mt-1">
                  <div>
                    <p class="text-xl font-bold text-emerald-500">{{ summary.healthyCount }}</p>
                    <p class="text-xs text-gray-400">Healthy</p>
                  </div>
                  <div>
                    <p class="text-xl font-bold text-amber-500">{{ summary.atRiskCount }}</p>
                    <p class="text-xs text-gray-400">At Risk</p>
                  </div>
                  <div>
                    <p class="text-xl font-bold text-red-500">{{ summary.overBudgetCount }}</p>
                    <p class="text-xs text-gray-400">Over</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Alerts Section -->
          <div v-if="recentAlerts.length > 0" class="mb-6">
            <h3 class="font-semibold mb-3">Active Alerts</h3>
            <div class="space-y-2">
              <UCard
                v-for="alert in recentAlerts"
                :key="alert.id"
                :class="{
                  'border-red-500/50 bg-red-50 dark:bg-red-900/20': alert.severity === 'danger' || alert.severity === 'critical',
                  'border-amber-500/50 bg-amber-50 dark:bg-amber-900/20': alert.severity === 'warning'
                }"
              >
                <div class="flex items-start justify-between">
                  <div class="flex items-start gap-3">
                    <UIcon
                      :name="alert.severity === 'danger' || alert.severity === 'critical' ? 'i-lucide-alert-triangle' : 'i-lucide-alert-circle'"
                      :class="{
                        'text-red-500': alert.severity === 'danger' || alert.severity === 'critical',
                        'text-amber-500': alert.severity === 'warning'
                      }"
                      class="w-5 h-5 mt-0.5"
                    />
                    <div>
                      <p class="font-semibold">{{ alert.title }}</p>
                      <p class="text-sm text-gray-600 dark:text-gray-300">{{ alert.message }}</p>
                      <p v-if="alert.projectName" class="text-xs text-gray-500 mt-1">
                        Project: {{ alert.projectName }}
                      </p>
                    </div>
                  </div>
                  <UButton
                    variant="ghost"
                    size="xs"
                    label="Acknowledge"
                    @click="acknowledgeAlert(alert)"
                  />
                </div>
              </UCard>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Project Budget Status -->
            <div class="lg:col-span-2">
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Project Budget Status</h3>
                </template>

                <div class="space-y-4">
                  <div
                    v-for="project in projects"
                    :key="project.id"
                    class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div>
                        <NuxtLink
                          :to="`/agency/projects/${project.id}`"
                          class="font-medium text-primary-500 hover:underline"
                        >
                          {{ project.projectName }}
                        </NuxtLink>
                        <p class="text-xs text-gray-500">{{ project.clientName }}</p>
                      </div>
                      <div class="flex items-center gap-3">
                        <div class="text-right">
                          <p class="text-sm font-semibold">
                            {{ formatCurrency(project.totalSpent) }} / {{ formatCurrency(project.budgetAmount) }}
                          </p>
                          <p class="text-xs text-gray-500">
                            {{ formatCurrency(project.remainingBudget) }} remaining
                          </p>
                        </div>
                        <UBadge :color="getHealthColor(project.healthStatus)" variant="subtle">
                          {{ getHealthLabel(project.healthStatus) }}
                        </UBadge>
                      </div>
                    </div>
                    <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        :class="getProgressColor(project.percentConsumed)"
                        class="h-full rounded-full transition-all"
                        :style="{ width: `${Math.min(project.percentConsumed, 100)}%` }"
                      />
                    </div>
                    <div class="flex justify-between mt-1 text-xs text-gray-500">
                      <span>0%</span>
                      <span>{{ formatPercent(project.percentConsumed) }}</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <p v-if="projects.length === 0" class="text-center text-gray-500 py-4">
                    No active projects with budgets
                  </p>
                </div>
              </UCard>
            </div>

            <!-- Burn Rate Trends -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Weekly Burn Rate</h3>
              </template>

              <div class="space-y-4">
                <div
                  v-for="week in burnRateTrends"
                  :key="week.weekStart"
                  class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-center justify-between mb-2">
                    <p class="font-medium text-sm">{{ formatDate(week.weekStart) }}</p>
                    <p class="font-semibold text-blue-500">{{ formatCurrency(week.totalSpend) }}</p>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p class="text-gray-500 text-xs">Labor</p>
                      <p class="font-medium">{{ formatCurrency(week.laborSpend) }}</p>
                    </div>
                    <div>
                      <p class="text-gray-500 text-xs">Expenses</p>
                      <p class="font-medium">{{ formatCurrency(week.expenseSpend) }}</p>
                    </div>
                  </div>
                </div>

                <p v-if="burnRateTrends.length === 0" class="text-center text-gray-500 py-4">
                  No spending data available
                </p>
              </div>
            </UCard>
          </div>

          <!-- Navigation -->
          <div class="flex gap-4">
            <UButton
              variant="outline"
              label="View All Alerts"
              icon="i-lucide-bell"
              @click="navigateTo('/agency/alerts')"
            />
            <UButton
              variant="outline"
              label="Expenses"
              icon="i-lucide-receipt"
              @click="navigateTo('/agency/expenses')"
            />
            <UButton
              variant="outline"
              label="Projects"
              icon="i-lucide-folder"
              @click="navigateTo('/agency/projects')"
            />
          </div>
        </template>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
