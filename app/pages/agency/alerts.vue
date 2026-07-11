<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Budget Alerts</h1>
        <p class="text-gray-500">Monitor project budgets and spending alerts</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          icon="i-lucide-loader-2"
          :loading="refreshing"
          @click="refreshAll"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-error-50 rounded-lg">
            <UIcon name="i-lucide-triangle-alert" class="w-6 h-6 text-error-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500">Active Alerts</p>
            <p class="text-2xl font-bold">{{ health?.summary?.overBudgetCount || 0 }}</p>
            <p class="text-xs text-gray-400">Over budget projects</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-warning-50 rounded-lg">
            <UIcon name="i-lucide-alert-circle" class="w-6 h-6 text-warning-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500">At Risk</p>
            <p class="text-2xl font-bold">{{ health?.summary?.atRiskCount || 0 }}</p>
            <p class="text-xs text-gray-400">75-100% consumed</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-success-50 rounded-lg">
            <UIcon name="i-lucide-check-circle" class="w-6 h-6 text-success-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500">Healthy</p>
            <p class="text-2xl font-bold">{{ health?.summary?.healthyCount || 0 }}</p>
            <p class="text-xs text-gray-400">On track projects</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-primary-50 rounded-lg">
            <UIcon name="i-lucide-dollar-sign" class="w-6 h-6 text-primary-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500">Total Budget</p>
            <p class="text-2xl font-bold">{{ formatCurrency(health?.summary?.totalBudget || 0) }}</p>
            <p class="text-xs text-gray-400">{{ health?.summary?.overallUtilization || 0 }}% utilized</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Alerts List -->
      <div class="lg:col-span-2 space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Active Alerts</h3>
              <div class="flex items-center gap-2">
                <USelectMenu
                  v-model="selectedStatus"
                  :items="statusOptions"
                  value-key="value"
                  placeholder="Status"
                  class="w-32"
                />
                <USelectMenu
                  v-model="selectedSeverity"
                  :items="severityOptions"
                  value-key="value"
                  placeholder="Severity"
                  class="w-32"
                />
              </div>
            </div>
          </template>

          <div v-if="alertsPending" class="flex justify-center py-8">
            <XfLoader size="sm" />
          </div>

          <div v-else-if="!alerts?.alerts?.length" class="text-center py-8">
            <UIcon name="i-lucide-check-circle" class="w-12 h-12 text-success-400 mx-auto mb-2" />
            <p class="text-gray-500">No active alerts</p>
            <p class="text-sm text-gray-400">All projects are within budget</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="alert in alerts.alerts"
              :key="alert.id"
              class="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
              @click="viewAlertDetails(alert)"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-start gap-3">
                  <div :class="[
                    'p-2 rounded-lg',
                    getSeverityBgClass(alert.severity)
                  ]">
                    <UIcon :name="getSeverityIcon(alert.severity)" :class="[
                      'w-5 h-5',
                      getSeverityTextClass(alert.severity)
                    ]" />
                  </div>
                  <div>
                    <h4 class="font-medium">{{ alert.title }}</h4>
                    <p class="text-sm text-gray-500">{{ alert.message }}</p>
                    <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <span v-if="alert.projectName">{{ alert.projectName }}</span>
                      <span v-if="alert.clientName">• {{ alert.clientName }}</span>
                      <span>• {{ formatTimeAgo(alert.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <UBadge :color="getSeverityColor(alert.severity)" size="sm">
                    {{ alert.severity }}
                  </UBadge>
                  <div v-if="alert.percentConsumed" class="text-right">
                    <span class="text-lg font-bold" :class="getPercentColor(alert.percentConsumed)">
                      {{ alert.percentConsumed }}%
                    </span>
                    <p class="text-xs text-gray-400">consumed</p>
                  </div>
                </div>
              </div>

              <!-- Progress bar -->
              <div v-if="alert.budgetAmount" class="mt-3">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{{ formatCurrency(alert.currentValue) }} spent</span>
                  <span>{{ formatCurrency(alert.budgetAmount) }} budget</span>
                </div>
                <UProgress
                  :value="Math.min(alert.percentConsumed, 100)"
                  :color="getProgressColor(alert.percentConsumed)"
                  size="sm"
                />
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 mt-3 pt-3 border-t">
                <UButton
                  v-if="alert.status === 'active'"
                  size="xs"
                  variant="outline"
                  @click.stop="acknowledgeAlert(alert.id)"
                >
                  Acknowledge
                </UButton>
                <UButton
                  v-if="alert.status === 'active' || alert.status === 'acknowledged'"
                  size="xs"
                  variant="outline"
                  color="success"
                  @click.stop="openResolveModal(alert)"
                >
                  Resolve
                </UButton>
                <UButton
                  v-if="alert.projectId"
                  size="xs"
                  variant="ghost"
                  :to="`/agency/projects/${alert.projectId}`"
                  @click.stop
                >
                  View Project
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Alert Summary Stats -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Alert Summary</h3>
          </template>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-error-500">{{ alerts?.summary?.dangerCount || 0 }}</p>
              <p class="text-sm text-gray-500">Danger</p>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-warning-500">{{ alerts?.summary?.criticalCount || 0 }}</p>
              <p class="text-sm text-gray-500">Critical</p>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-warning-400">{{ alerts?.summary?.warningCount || 0 }}</p>
              <p class="text-sm text-gray-500">Warning</p>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-success-500">{{ alerts?.summary?.resolvedCount || 0 }}</p>
              <p class="text-sm text-gray-500">Resolved</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <!-- Projects Health -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Project Health</h3>
          </template>

          <div v-if="healthPending" class="flex justify-center py-4">
            <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-gray-400" />
          </div>

          <div v-else-if="!health?.projects?.length" class="text-center py-4 text-gray-500">
            No active projects
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="project in health.projects.slice(0, 10)"
              :key="project.id"
              class="flex items-center justify-between p-2 rounded hover:bg-gray-50"
            >
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm truncate">{{ project.projectName }}</p>
                <p class="text-xs text-gray-500 truncate">{{ project.clientName }}</p>
              </div>
              <div class="flex items-center gap-2 ml-2">
                <UBadge :color="getHealthColor(project.healthStatus)" size="xs">
                  {{ project.percentConsumed }}%
                </UBadge>
                <div v-if="project.activeAlerts > 0" class="relative">
                  <UIcon name="i-lucide-bell-ring" class="w-4 h-4 text-error-500" />
                  <span class="absolute -top-1 -right-1 w-3 h-3 bg-error-500 text-white text-[8px] rounded-full flex items-center justify-center">
                    {{ project.activeAlerts }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <template v-if="(health?.projects?.length || 0) > 10" #footer>
            <UButton variant="ghost" block to="/agency/projects">
              View all {{ health?.projects?.length || 0 }} projects
            </UButton>
          </template>
        </UCard>

        <!-- Budget Overview -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Budget Overview</h3>
          </template>

          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-500">Total Spent</span>
                <span class="font-medium">{{ formatCurrency(health?.summary?.totalSpent || 0) }}</span>
              </div>
              <UProgress
                :value="health?.summary?.overallUtilization || 0"
                :color="getProgressColor(health?.summary?.overallUtilization || 0)"
                size="md"
              />
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="p-3 bg-gray-50 rounded-lg">
                <p class="text-gray-500">Total Budget</p>
                <p class="font-semibold">{{ formatCurrency(health?.summary?.totalBudget || 0) }}</p>
              </div>
              <div class="p-3 bg-gray-50 rounded-lg">
                <p class="text-gray-500">Remaining</p>
                <p class="font-semibold">{{ formatCurrency(health?.summary?.totalRemaining || 0) }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Burn Rate Trends -->
        <UCard v-if="health?.burnRateTrends?.length">
          <template #header>
            <h3 class="font-semibold">Weekly Burn Rate</h3>
          </template>

          <div class="space-y-2">
            <div
              v-for="(week, index) in health.burnRateTrends"
              :key="index"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-gray-500">{{ formatWeekDate(week.weekStart) }}</span>
              <span class="font-medium">{{ formatCurrency(week.totalSpend) }}</span>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Resolve Alert Modal -->
    <UModal v-model:open="resolveModalOpen">
      <template #header>
        <h3 class="font-semibold">Resolve Alert</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            You are resolving: <span class="font-medium">{{ selectedAlert?.title }}</span>
          </p>
          <UFormField label="Resolution Notes">
            <UTextarea
              v-model="resolutionNotes"
              placeholder="Describe how this alert was resolved..."
              :rows="4"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="resolveModalOpen = false">
            Cancel
          </UButton>
          <UButton
            color="success"
            :loading="resolving"
            @click="resolveAlert"
          >
            Resolve Alert
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Alert Details Modal -->
    <UModal v-model:open="detailsModalOpen" class="max-w-2xl">
      <template #header>
        <div class="flex items-center gap-3">
          <div :class="[
            'p-2 rounded-lg',
            getSeverityBgClass(selectedAlert?.severity || '')
          ]">
            <UIcon :name="getSeverityIcon(selectedAlert?.severity || '')" :class="[
              'w-5 h-5',
              getSeverityTextClass(selectedAlert?.severity || '')
            ]" />
          </div>
          <div>
            <h3 class="font-semibold">{{ selectedAlert?.title }}</h3>
            <p class="text-sm text-gray-500">{{ selectedAlert?.alertType }}</p>
          </div>
        </div>
      </template>

      <template #body>
        <div v-if="selectedAlert" class="space-y-4">
          <p class="text-gray-600">{{ selectedAlert.message }}</p>

          <div class="grid grid-cols-2 gap-4">
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm text-gray-500">Current Spend</p>
              <p class="text-lg font-semibold">{{ formatCurrency(selectedAlert.currentValue) }}</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm text-gray-500">Budget Amount</p>
              <p class="text-lg font-semibold">{{ formatCurrency(selectedAlert.budgetAmount) }}</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm text-gray-500">Percent Consumed</p>
              <p class="text-lg font-semibold" :class="getPercentColor(selectedAlert.percentConsumed)">
                {{ selectedAlert.percentConsumed }}%
              </p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm text-gray-500">Threshold</p>
              <p class="text-lg font-semibold">{{ selectedAlert.thresholdValue }}%</p>
            </div>
          </div>

          <div v-if="selectedAlert.projectedTotal || selectedAlert.daysToExhaustion" class="border-t pt-4">
            <h4 class="font-medium mb-2">Projections</h4>
            <div class="grid grid-cols-2 gap-4">
              <div v-if="selectedAlert.projectedTotal" class="p-3 bg-gray-50 rounded-lg">
                <p class="text-sm text-gray-500">Projected Total</p>
                <p class="text-lg font-semibold text-error-500">{{ formatCurrency(selectedAlert.projectedTotal) }}</p>
              </div>
              <div v-if="selectedAlert.daysToExhaustion" class="p-3 bg-gray-50 rounded-lg">
                <p class="text-sm text-gray-500">Days to Exhaustion</p>
                <p class="text-lg font-semibold text-warning-500">{{ selectedAlert.daysToExhaustion }} days</p>
              </div>
              <div v-if="selectedAlert.burnRateDaily" class="p-3 bg-gray-50 rounded-lg">
                <p class="text-sm text-gray-500">Daily Burn Rate</p>
                <p class="text-lg font-semibold">{{ formatCurrency(selectedAlert.burnRateDaily) }}/day</p>
              </div>
            </div>
          </div>

          <div class="border-t pt-4">
            <h4 class="font-medium mb-2">Details</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <p class="text-gray-500">Project</p>
              <p>{{ selectedAlert.projectName || '-' }}</p>
              <p class="text-gray-500">Client</p>
              <p>{{ selectedAlert.clientName || '-' }}</p>
              <p class="text-gray-500">Status</p>
              <p><UBadge :color="getStatusBadgeColor(selectedAlert.status)">{{ selectedAlert.status }}</UBadge></p>
              <p class="text-gray-500">Created</p>
              <p>{{ formatDate(selectedAlert.createdAt) }}</p>
              <p v-if="selectedAlert.acknowledgedAt" class="text-gray-500">Acknowledged</p>
              <p v-if="selectedAlert.acknowledgedAt">
                {{ formatDate(selectedAlert.acknowledgedAt) }}
                <span v-if="selectedAlert.acknowledgedByName" class="text-gray-400">by {{ selectedAlert.acknowledgedByName }}</span>
              </p>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-between">
          <UButton
            v-if="selectedAlert?.projectId"
            variant="outline"
            :to="`/agency/projects/${selectedAlert.projectId}`"
          >
            View Project
          </UButton>
          <div class="flex gap-2">
            <UButton
              v-if="selectedAlert?.status === 'active'"
              variant="outline"
              @click="acknowledgeAlert(selectedAlert.id)"
            >
              Acknowledge
            </UButton>
            <UButton
              v-if="selectedAlert?.status !== 'resolved'"
              color="success"
              @click="openResolveModal(selectedAlert!)"
            >
              Resolve
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({})

const toast = useToast()

interface BudgetAlert {
  id: string
  alertType: string
  severity: string
  title: string
  message: string
  currentValue: number
  thresholdValue: number
  budgetAmount: number
  percentConsumed: number
  projectedTotal: number | null
  daysToExhaustion: number | null
  burnRateDaily: number | null
  status: string
  acknowledgedAt: string | null
  acknowledgedByName: string | null
  resolvedAt: string | null
  resolutionNotes: string | null
  createdAt: string
  projectId: string | null
  projectName: string | null
  clientId: string | null
  clientName: string | null
}

interface AlertsResponse {
  alerts: BudgetAlert[]
  summary: {
    activeCount: number
    dangerCount: number
    criticalCount: number
    warningCount: number
    acknowledgedCount: number
    resolvedCount: number
  }
}

interface ProjectHealth {
  id: string
  projectName: string
  clientName: string
  status: string
  budgetAmount: number
  laborCost: number
  expenseCost: number
  totalSpent: number
  percentConsumed: number
  remainingBudget: number
  activeAlerts: number
  healthStatus: string
}

interface HealthResponse {
  summary: {
    totalBudget: number
    totalSpent: number
    totalRemaining: number
    overallUtilization: number
    projectCount: number
    overBudgetCount: number
    atRiskCount: number
    healthyCount: number
  }
  projects: ProjectHealth[]
  recentAlerts: Array<{
    id: string
    alertType: string
    severity: string
    title: string
    message: string
    percentConsumed: number
    projectName: string
    createdAt: string
  }>
  burnRateTrends: Array<{
    weekStart: string
    laborSpend: number
    expenseSpend: number
    totalSpend: number
  }>
}

// Filters
const selectedStatus = ref('active')
const selectedSeverity = ref('all')

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'All', value: 'all' }
]

const severityOptions = [
  { label: 'All', value: 'all' },
  { label: 'Danger', value: 'danger' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' }
]

// Data fetching
const alertsQuery = computed(() => ({
  status: selectedStatus.value,
  severity: selectedSeverity.value
}))

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
) => Promise<T>
const alerts = ref<AlertsResponse | null>(null)
const alertsPending = ref(false)
const health = ref<HealthResponse | null>(null)
const healthPending = ref(false)

async function refreshAlerts() {
  alertsPending.value = true
  try {
    alerts.value = await apiFetch<AlertsResponse>('/api/agency/budget-alerts', { query: alertsQuery.value })
  } finally {
    alertsPending.value = false
  }
}

async function refreshHealth() {
  healthPending.value = true
  try {
    health.value = await apiFetch<HealthResponse>('/api/agency/budget-alerts/health')
  } finally {
    healthPending.value = false
  }
}

onMounted(() => {
  void refreshAll()
})

watch(alertsQuery, () => {
  void refreshAlerts()
})

const refreshing = ref(false)

const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([refreshAlerts(), refreshHealth()])
  refreshing.value = false
}

// Modals
const resolveModalOpen = ref(false)
const detailsModalOpen = ref(false)
const selectedAlert = ref<BudgetAlert | null>(null)
const resolutionNotes = ref('')
const resolving = ref(false)

const viewAlertDetails = (alert: BudgetAlert) => {
  selectedAlert.value = alert
  detailsModalOpen.value = true
}

const openResolveModal = (alert: BudgetAlert) => {
  selectedAlert.value = alert
  resolutionNotes.value = ''
  detailsModalOpen.value = false
  resolveModalOpen.value = true
}

const acknowledgeAlert = async (alertId: string) => {
  try {
    await apiFetch(`/api/agency/budget-alerts/${alertId}/acknowledge`, {
      method: 'POST'
    })
    toast.add({
      title: 'Alert acknowledged',
      color: 'success'
    })
    await refreshAlerts()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to acknowledge alert',
      color: 'error'
    })
  }
}

const resolveAlert = async () => {
  if (!selectedAlert.value) return

  resolving.value = true
  try {
    await apiFetch(`/api/agency/budget-alerts/${selectedAlert.value.id}/resolve`, {
      method: 'POST',
      body: {
        resolutionNotes: resolutionNotes.value
      }
    })
    toast.add({
      title: 'Alert resolved',
      color: 'success'
    })
    resolveModalOpen.value = false
    detailsModalOpen.value = false
    await refreshAlerts()
    await refreshHealth()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to resolve alert',
      color: 'error'
    })
  } finally {
    resolving.value = false
  }
}

// Formatting
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatTimeAgo = (date: string): string => {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

const formatWeekDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

// Styling helpers
const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'neutral' => {
  const colors: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
    danger: 'error',
    critical: 'warning',
    warning: 'warning',
    info: 'info'
  }
  return colors[severity] || 'neutral'
}

const getSeverityIcon = (severity: string): string => {
  const icons: Record<string, string> = {
    danger: 'i-lucide-triangle-alert',
    critical: 'i-lucide-alert-circle',
    warning: 'i-lucide-alert-circle',
    info: 'i-lucide-info'
  }
  return icons[severity] || 'i-lucide-bell'
}

const getSeverityBgClass = (severity: string): string => {
  const classes: Record<string, string> = {
    danger: 'bg-error-50',
    critical: 'bg-warning-50',
    warning: 'bg-warning-50',
    info: 'bg-info-50'
  }
  return classes[severity] || 'bg-gray-50'
}

const getSeverityTextClass = (severity: string): string => {
  const classes: Record<string, string> = {
    danger: 'text-error-500',
    critical: 'text-warning-500',
    warning: 'text-warning-400',
    info: 'text-info-500'
  }
  return classes[severity] || 'text-gray-500'
}

const getProgressColor = (percent: number): 'error' | 'warning' | 'success' => {
  if (percent > 100) return 'error'
  if (percent > 75) return 'warning'
  return 'success'
}

const getPercentColor = (percent: number): string => {
  if (percent > 100) return 'text-error-500'
  if (percent > 90) return 'text-error-400'
  if (percent > 75) return 'text-warning-500'
  return 'text-gray-700'
}

const getHealthColor = (status: string): 'error' | 'warning' | 'success' => {
  const colors: Record<string, 'error' | 'warning' | 'success'> = {
    over_budget: 'error',
    critical: 'error',
    at_risk: 'warning',
    healthy: 'success'
  }
  return colors[status] || 'success'
}

const getStatusBadgeColor = (status: string): 'error' | 'warning' | 'success' | 'neutral' => {
  const colors: Record<string, 'error' | 'warning' | 'success' | 'neutral'> = {
    active: 'error',
    acknowledged: 'warning',
    resolved: 'success',
    dismissed: 'neutral'
  }
  return colors[status] || 'neutral'
}
</script>
