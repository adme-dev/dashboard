<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Project Health Dashboard',
  middleware: ['role-management']
})

const toast = useToast()

// Filters
const statusFilter = ref<string>('all')
const trendFilter = ref<string>('all')
const searchQuery = ref('')

// Fetch health data
const { data: healthData, pending, refresh } = await useFetch('/api/agency/health/projects', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    trend: computed(() => trendFilter.value === 'all' ? undefined : trendFilter.value)
  }
})

const projects = computed(() => {
  let result = (healthData.value as any)?.projects || []
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((p: any) =>
      p.name.toLowerCase().includes(query) ||
      p.client?.name?.toLowerCase().includes(query)
    )
  }
  return result
})

const summary = computed(() => (healthData.value as any)?.summary || {
  totalProjects: 0,
  byStatus: { healthy: 0, warning: 0, critical: 0, unknown: 0 },
  averageScore: 0,
  byTrend: { improving: 0, stable: 0, declining: 0 }
})

// At risk projects
const { data: atRiskData } = await useFetch('/api/agency/health/at-risk')
const atRiskProjects = computed(() => (atRiskData.value as any)?.projects || [])

// Status options
const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' }
]

// Trend options
const trendOptions = [
  { label: 'All Trends', value: 'all' },
  { label: 'Improving', value: 'improving' },
  { label: 'Stable', value: 'stable' },
  { label: 'Declining', value: 'declining' }
]

// Status colors
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'healthy': return 'success'
    case 'warning': return 'warning'
    case 'critical': return 'error'
    default: return 'neutral'
  }
}

// Trend icons
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

// Score bar color
const getScoreColor = (score: number): string => {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

// Format score for display
const formatScore = (score: number) => {
  return score ? Math.round(score) : '—'
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// Calculate health
const calculatingHealth = ref<string | null>(null)
const calculateHealth = async (projectId: string) => {
  calculatingHealth.value = projectId
  try {
    await $fetch(`/api/agency/health/projects/${projectId}/calculate`, {
      method: 'POST'
    })
    toast.add({ title: 'Health calculated', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to calculate health', description: err.data?.message, color: 'error' })
  } finally {
    calculatingHealth.value = null
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Project Health Dashboard">
        <template #right>
          <UButton
            variant="outline"
            label="Refresh All"
            icon="i-lucide-refresh-cw"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Portfolio Health Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 mb-1">Average Health Score</p>
              <p class="text-4xl font-bold" :class="getScoreColor(summary.averageScore).replace('bg-', 'text-')">
                {{ formatScore(summary.averageScore) }}
              </p>
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
                <div
                  :class="getScoreColor(summary.averageScore)"
                  class="h-full rounded-full transition-all"
                  :style="{ width: `${summary.averageScore}%` }"
                />
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 mb-2">Health Distribution</p>
              <div class="flex items-center justify-center gap-4">
                <div>
                  <p class="text-2xl font-bold text-emerald-500">{{ summary.byStatus.healthy }}</p>
                  <p class="text-xs text-gray-500">Healthy</p>
                </div>
                <div>
                  <p class="text-2xl font-bold text-amber-500">{{ summary.byStatus.warning }}</p>
                  <p class="text-xs text-gray-500">Warning</p>
                </div>
                <div>
                  <p class="text-2xl font-bold text-red-500">{{ summary.byStatus.critical }}</p>
                  <p class="text-xs text-gray-500">Critical</p>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 mb-2">Trends</p>
              <div class="flex items-center justify-center gap-4">
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-emerald-500" />
                  <span class="font-bold">{{ summary.byTrend.improving }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-minus" class="w-5 h-5 text-gray-400" />
                  <span class="font-bold">{{ summary.byTrend.stable }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-trending-down" class="w-5 h-5 text-red-500" />
                  <span class="font-bold">{{ summary.byTrend.declining }}</span>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 mb-1">Total Active Projects</p>
              <p class="text-4xl font-bold">{{ summary.totalProjects }}</p>
              <p v-if="summary.byStatus.unknown > 0" class="text-xs text-gray-400 mt-2">
                {{ summary.byStatus.unknown }} without health data
              </p>
            </div>
          </UCard>
        </div>

        <!-- At Risk Alert -->
        <UCard v-if="atRiskProjects.length > 0" class="mb-6 border-red-500/50 bg-red-50 dark:bg-red-900/20">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p class="font-semibold text-red-700 dark:text-red-400">Projects At Risk</p>
              <p class="text-sm text-red-600 dark:text-red-300 mt-1">
                {{ atRiskProjects.length }} project(s) require immediate attention due to declining health or critical alerts.
              </p>
              <div class="flex flex-wrap gap-2 mt-2">
                <UButton
                  v-for="project in atRiskProjects.slice(0, 5)"
                  :key="project.id"
                  size="xs"
                  variant="soft"
                  color="error"
                  :label="project.name"
                  @click="navigateTo(`/agency/health/${project.id}`)"
                />
                <UButton
                  v-if="atRiskProjects.length > 5"
                  size="xs"
                  variant="ghost"
                  color="error"
                  :label="`+${atRiskProjects.length - 5} more`"
                />
              </div>
            </div>
          </div>
        </UCard>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search projects..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusOptions"
            placeholder="Status"
            value-key="value"
            class="w-36"
          />
          <USelectMenu
            v-model="trendFilter"
            :items="trendOptions"
            placeholder="Trend"
            value-key="value"
            class="w-36"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Projects Health Grid -->
        <div v-else class="space-y-3">
          <UCard
            v-for="project in projects"
            :key="project.id"
            class="hover:shadow-md transition-shadow"
          >
            <div class="flex items-center justify-between">
              <!-- Project Info -->
              <div class="flex items-center gap-4">
                <!-- Health Score Circle -->
                <div
                  class="w-16 h-16 rounded-full flex items-center justify-center border-4"
                  :class="{
                    'border-emerald-500 text-emerald-600': project.health.overallStatus === 'healthy',
                    'border-amber-500 text-amber-600': project.health.overallStatus === 'warning',
                    'border-red-500 text-red-600': project.health.overallStatus === 'critical',
                    'border-gray-300 text-gray-400': !project.health.overallStatus || project.health.overallStatus === 'unknown'
                  }"
                >
                  <span class="text-xl font-bold">{{ formatScore(project.health.overallScore) }}</span>
                </div>

                <!-- Details -->
                <div>
                  <div class="flex items-center gap-2">
                    <NuxtLink
                      :to="`/agency/projects/${project.id}`"
                      class="font-semibold text-lg hover:text-primary-500"
                    >
                      {{ project.name }}
                    </NuxtLink>
                    <UBadge :color="getStatusColor(project.health.overallStatus)" variant="subtle">
                      {{ project.health.overallStatus || 'Unknown' }}
                    </UBadge>
                    <UIcon
                      v-if="project.health.trend"
                      :name="getTrendIcon(project.health.trend)"
                      :class="['w-5 h-5', getTrendColor(project.health.trend)]"
                    />
                  </div>
                  <p v-if="project.client" class="text-sm text-gray-500">
                    {{ project.client.name }}
                    <span v-if="project.projectManager"> · PM: {{ project.projectManager.name }}</span>
                  </p>
                  <div v-if="project.alerts.active > 0" class="flex items-center gap-1 mt-1">
                    <UBadge
                      v-if="project.alerts.critical > 0"
                      color="error"
                      variant="subtle"
                      size="xs"
                    >
                      {{ project.alerts.critical }} critical
                    </UBadge>
                    <UBadge
                      v-if="project.alerts.active - project.alerts.critical > 0"
                      color="warning"
                      variant="subtle"
                      size="xs"
                    >
                      {{ project.alerts.active - project.alerts.critical }} alert(s)
                    </UBadge>
                  </div>
                </div>
              </div>

              <!-- Health Factors -->
              <div class="flex items-center gap-6">
                <div class="grid grid-cols-5 gap-4 text-center">
                  <div>
                    <p class="text-xs text-gray-400 mb-1">Schedule</p>
                    <p class="font-semibold" :class="{
                      'text-emerald-500': project.health.scheduleScore >= 80,
                      'text-amber-500': project.health.scheduleScore >= 60 && project.health.scheduleScore < 80,
                      'text-red-500': project.health.scheduleScore < 60 && project.health.scheduleScore,
                      'text-gray-400': !project.health.scheduleScore
                    }">
                      {{ formatScore(project.health.scheduleScore) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400 mb-1">Budget</p>
                    <p class="font-semibold" :class="{
                      'text-emerald-500': project.health.budgetScore >= 80,
                      'text-amber-500': project.health.budgetScore >= 60 && project.health.budgetScore < 80,
                      'text-red-500': project.health.budgetScore < 60 && project.health.budgetScore,
                      'text-gray-400': !project.health.budgetScore
                    }">
                      {{ formatScore(project.health.budgetScore) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400 mb-1">Scope</p>
                    <p class="font-semibold" :class="{
                      'text-emerald-500': project.health.scopeScore >= 80,
                      'text-amber-500': project.health.scopeScore >= 60 && project.health.scopeScore < 80,
                      'text-red-500': project.health.scopeScore < 60 && project.health.scopeScore,
                      'text-gray-400': !project.health.scopeScore
                    }">
                      {{ formatScore(project.health.scopeScore) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400 mb-1">Team</p>
                    <p class="font-semibold" :class="{
                      'text-emerald-500': project.health.teamScore >= 80,
                      'text-amber-500': project.health.teamScore >= 60 && project.health.teamScore < 80,
                      'text-red-500': project.health.teamScore < 60 && project.health.teamScore,
                      'text-gray-400': !project.health.teamScore
                    }">
                      {{ formatScore(project.health.teamScore) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400 mb-1">Quality</p>
                    <p class="font-semibold" :class="{
                      'text-emerald-500': project.health.qualityScore >= 80,
                      'text-amber-500': project.health.qualityScore >= 60 && project.health.qualityScore < 80,
                      'text-red-500': project.health.qualityScore < 60 && project.health.qualityScore,
                      'text-gray-400': !project.health.qualityScore
                    }">
                      {{ formatScore(project.health.qualityScore) }}
                    </p>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-refresh-cw"
                    :loading="calculatingHealth === project.id"
                    @click="calculateHealth(project.id)"
                  />
                  <UButton
                    variant="outline"
                    size="sm"
                    label="Details"
                    @click="navigateTo(`/agency/health/${project.id}`)"
                  />
                </div>
              </div>
            </div>

            <!-- Last Updated -->
            <div v-if="project.health.calculatedAt" class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between text-xs text-gray-400">
              <span>Last calculated: {{ formatDate(project.health.calculatedAt) }}</span>
              <span v-if="project.endDate">Due: {{ formatDate(project.endDate) }}</span>
            </div>
          </UCard>

          <div v-if="projects.length === 0" class="text-center py-12 text-gray-500">
            <UIcon name="i-lucide-activity" class="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No projects found. Health data will appear here once projects are active.</p>
          </div>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
