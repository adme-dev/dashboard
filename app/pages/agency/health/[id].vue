<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Project Health Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const projectId = route.params.id as string

// Fetch project health details
const { data: healthData, pending: loading, refresh } = await useFetch(`/api/agency/health/projects/${projectId}`)
const project = computed(() => (healthData.value as any)?.project || null)
const health = computed(() => (healthData.value as any)?.health || null)
const alerts = computed(() => (healthData.value as any)?.alerts || [])
const history = computed(() => (healthData.value as any)?.history || [])
const factors = computed(() => (healthData.value as any)?.factors || {})

// Calculate health
const calculating = ref(false)
const calculateHealth = async () => {
  calculating.value = true
  try {
    await $fetch(`/api/agency/health/projects/${projectId}/calculate`, { method: 'POST' })
    toast.add({ title: 'Health recalculated', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to calculate health', description: err.data?.message, color: 'error' })
  } finally {
    calculating.value = false
  }
}

// Dismiss alert
const dismissAlert = async (alertId: string) => {
  try {
    await $fetch(`/api/agency/health/alerts/${alertId}/dismiss`, { method: 'POST' })
    toast.add({ title: 'Alert dismissed', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to dismiss alert', description: err.data?.message, color: 'error' })
  }
}

// Status colors
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'healthy': return 'text-emerald-500'
    case 'warning': return 'text-amber-500'
    case 'critical': return 'text-red-500'
    default: return 'text-gray-400'
  }
}

const getStatusBg = (status: string): string => {
  switch (status) {
    case 'healthy': return 'bg-emerald-500'
    case 'warning': return 'bg-amber-500'
    case 'critical': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

// Score bar color
const getScoreColor = (score: number): string => {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

// Trend icon
const getTrendIcon = (trend: string): string => {
  switch (trend) {
    case 'improving': return 'i-lucide-trending-up'
    case 'declining': return 'i-lucide-trending-down'
    default: return 'i-lucide-minus'
  }
}

const getTrendColor = (trend: string): string => {
  switch (trend) {
    case 'improving': return 'text-emerald-500'
    case 'declining': return 'text-red-500'
    default: return 'text-gray-400'
  }
}

// Alert severity color
const getAlertColor = (severity: string): 'error' | 'warning' | 'info' | 'neutral' => {
  switch (severity) {
    case 'critical': return 'error'
    case 'high': return 'error'
    case 'medium': return 'warning'
    case 'low': return 'info'
    default: return 'neutral'
  }
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Health factor descriptions
const factorDescriptions: Record<string, string> = {
  schedule: 'Based on task completion rate and milestone adherence',
  budget: 'Based on budget utilization and burn rate',
  scope: 'Based on scope changes and requirement stability',
  team: 'Based on team capacity and workload distribution',
  quality: 'Based on bug count, rework rate, and client feedback'
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="project?.name || 'Loading...'">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/health"
          />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              variant="outline"
              icon="i-lucide-refresh-cw"
              label="Recalculate"
              :loading="calculating"
              @click="calculateHealth"
            />
            <UButton
              variant="outline"
              icon="i-lucide-external-link"
              label="View Project"
              :to="`/agency/projects/${projectId}`"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-if="!loading && project">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Overall Health Card -->
            <UCard>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-6">
                  <!-- Health Score Circle -->
                  <div
                    class="w-24 h-24 rounded-full flex items-center justify-center border-4"
                    :class="{
                      'border-emerald-500': health?.overallStatus === 'healthy',
                      'border-amber-500': health?.overallStatus === 'warning',
                      'border-red-500': health?.overallStatus === 'critical',
                      'border-gray-300': !health?.overallStatus
                    }"
                  >
                    <span class="text-3xl font-bold" :class="getStatusColor(health?.overallStatus)">
                      {{ health?.overallScore ? Math.round(health.overallScore) : '—' }}
                    </span>
                  </div>

                  <div>
                    <div class="flex items-center gap-3 mb-1">
                      <h2 class="text-2xl font-bold">{{ project.name }}</h2>
                      <UBadge
                        :color="health?.overallStatus === 'healthy' ? 'success' : health?.overallStatus === 'warning' ? 'warning' : 'error'"
                        variant="subtle"
                        size="lg"
                      >
                        {{ health?.overallStatus || 'Unknown' }}
                      </UBadge>
                    </div>
                    <p v-if="project.client" class="text-gray-500">
                      {{ project.client.name }}
                    </p>
                    <div class="flex items-center gap-2 mt-2">
                      <UIcon :name="getTrendIcon(health?.trend)" :class="getTrendColor(health?.trend)" class="w-5 h-5" />
                      <span class="text-sm" :class="getTrendColor(health?.trend)">
                        {{ health?.trend === 'improving' ? 'Improving' : health?.trend === 'declining' ? 'Declining' : 'Stable' }}
                        over last 7 days
                      </span>
                    </div>
                  </div>
                </div>

                <div class="text-right text-sm text-gray-500">
                  <p>Last calculated</p>
                  <p class="font-medium">{{ formatDateTime(health?.calculatedAt) }}</p>
                </div>
              </div>
            </UCard>

            <!-- Health Factors -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Health Factors</h3>
              </template>

              <div class="space-y-6">
                <div
                  v-for="(factor, key) in { schedule: health?.scheduleScore, budget: health?.budgetScore, scope: health?.scopeScore, team: health?.teamScore, quality: health?.qualityScore }"
                  :key="key"
                >
                  <div class="flex items-center justify-between mb-2">
                    <div>
                      <h4 class="font-medium capitalize">{{ key }}</h4>
                      <p class="text-xs text-gray-500">{{ factorDescriptions[key] }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-lg font-bold"
                        :class="{
                          'text-emerald-500': (factor || 0) >= 80,
                          'text-amber-500': (factor || 0) >= 60 && (factor || 0) < 80,
                          'text-red-500': (factor || 0) < 60 && factor,
                          'text-gray-400': !factor
                        }"
                      >
                        {{ factor ? Math.round(factor) : '—' }}
                      </span>
                      <UIcon
                        v-if="factors[key]?.trend"
                        :name="getTrendIcon(factors[key]?.trend)"
                        :class="getTrendColor(factors[key]?.trend)"
                        class="w-4 h-4"
                      />
                    </div>
                  </div>
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      :class="getScoreColor(factor || 0)"
                      class="h-full rounded-full transition-all"
                      :style="{ width: `${factor || 0}%` }"
                    />
                  </div>
                  <div v-if="factors[key]?.issues?.length" class="mt-2">
                    <p class="text-xs text-gray-500 mb-1">Issues:</p>
                    <ul class="text-xs text-red-500 list-disc list-inside">
                      <li v-for="issue in factors[key].issues.slice(0, 3)" :key="issue">
                        {{ issue }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Health History Chart -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Health Trend (Last 30 Days)</h3>
              </template>

              <div v-if="history.length > 0" class="h-64">
                <!-- Simple line chart representation -->
                <div class="relative h-full flex items-end gap-1">
                  <div
                    v-for="(point, index) in history"
                    :key="index"
                    class="flex-1 flex flex-col items-center"
                  >
                    <div
                      class="w-full rounded-t transition-all"
                      :class="getScoreColor(point.score)"
                      :style="{ height: `${point.score}%` }"
                    />
                    <p v-if="index % 5 === 0" class="text-xs text-gray-400 mt-1 rotate-45 origin-left">
                      {{ format(new Date(point.date), 'M/d') }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="h-64 flex items-center justify-center text-gray-500">
                <p>No historical data available yet</p>
              </div>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Project Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Project Info</h3>
              </template>

              <dl class="space-y-3">
                <div>
                  <dt class="text-xs text-gray-400">Status</dt>
                  <dd class="font-medium">{{ project.status }}</dd>
                </div>
                <div v-if="project.projectManager">
                  <dt class="text-xs text-gray-400">Project Manager</dt>
                  <dd class="font-medium">{{ project.projectManager.name }}</dd>
                </div>
                <div v-if="project.startDate">
                  <dt class="text-xs text-gray-400">Start Date</dt>
                  <dd class="font-medium">{{ formatDate(project.startDate) }}</dd>
                </div>
                <div v-if="project.endDate">
                  <dt class="text-xs text-gray-400">Due Date</dt>
                  <dd class="font-medium">{{ formatDate(project.endDate) }}</dd>
                </div>
                <div v-if="project.budgetAmount">
                  <dt class="text-xs text-gray-400">Budget</dt>
                  <dd class="font-medium">
                    {{ new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(project.budgetAmount) }}
                  </dd>
                </div>
              </dl>
            </UCard>

            <!-- Active Alerts -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Active Alerts</h3>
                  <UBadge v-if="alerts.length > 0" color="error" variant="subtle">
                    {{ alerts.length }}
                  </UBadge>
                </div>
              </template>

              <div class="space-y-3">
                <div
                  v-for="alert in alerts"
                  :key="alert.id"
                  class="p-3 rounded-lg"
                  :class="{
                    'bg-red-50 dark:bg-red-900/20': alert.severity === 'critical' || alert.severity === 'high',
                    'bg-amber-50 dark:bg-amber-900/20': alert.severity === 'medium',
                    'bg-blue-50 dark:bg-blue-900/20': alert.severity === 'low'
                  }"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex items-start gap-2">
                      <UIcon
                        name="i-lucide-alert-triangle"
                        :class="{
                          'text-red-500': alert.severity === 'critical' || alert.severity === 'high',
                          'text-amber-500': alert.severity === 'medium',
                          'text-blue-500': alert.severity === 'low'
                        }"
                        class="w-5 h-5 mt-0.5"
                      />
                      <div>
                        <p class="font-medium text-sm">{{ alert.title }}</p>
                        <p class="text-xs text-gray-500 mt-1">{{ alert.message }}</p>
                      </div>
                    </div>
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-x"
                      @click="dismissAlert(alert.id)"
                    />
                  </div>
                  <div class="flex items-center justify-between mt-2 text-xs text-gray-400">
                    <UBadge :color="getAlertColor(alert.severity)" variant="subtle" size="xs">
                      {{ alert.severity }}
                    </UBadge>
                    <span>{{ formatDate(alert.createdAt) }}</span>
                  </div>
                </div>

                <div v-if="alerts.length === 0" class="text-center py-6 text-gray-500">
                  <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p class="text-sm">No active alerts</p>
                </div>
              </div>
            </UCard>

            <!-- Quick Stats -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Quick Stats</h3>
              </template>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-gray-400">Tasks</p>
                  <p class="text-lg font-bold">{{ project.taskCount || 0 }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Completed</p>
                  <p class="text-lg font-bold text-emerald-500">{{ project.completedTasks || 0 }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Overdue</p>
                  <p class="text-lg font-bold text-red-500">{{ project.overdueTasks || 0 }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Team Size</p>
                  <p class="text-lg font-bold">{{ project.teamSize || 0 }}</p>
                </div>
              </div>
            </UCard>

            <!-- Recommendations -->
            <UCard v-if="health?.recommendations?.length">
              <template #header>
                <h3 class="font-semibold">Recommendations</h3>
              </template>

              <div class="space-y-3">
                <div
                  v-for="(rec, index) in health.recommendations"
                  :key="index"
                  class="flex items-start gap-2"
                >
                  <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-amber-500 mt-0.5" />
                  <p class="text-sm">{{ rec }}</p>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-else>
        <div class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
