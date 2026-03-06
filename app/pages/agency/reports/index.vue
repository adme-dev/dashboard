<script setup lang="ts">
definePageMeta({})

const route = useRoute()
const router = useRouter()

// Date range state
const dateRange = ref({
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  to: new Date().toISOString().split('T')[0]
})

// Filters
const selectedDepartment = ref<string | undefined>(undefined)
const selectedProject = ref<string | undefined>(undefined)
const groupBy = ref<'day' | 'week' | 'month'>('week')

// Fetch departments for filter
const { data: departmentsData } = await useFetch('/api/agency/departments')
const departments = computed(() => (departmentsData.value as any)?.departments || [])

// Fetch projects for filter
const { data: projectsData } = await useFetch('/api/agency/projects')
const projects = computed(() => (projectsData.value as any)?.projects || [])

// Build query params
const queryParams = computed(() => ({
  dateFrom: dateRange.value.from,
  dateTo: dateRange.value.to,
  departmentId: selectedDepartment.value,
  projectId: selectedProject.value,
  groupBy: groupBy.value
}))

// Fetch report data
const { data: completionData, pending: completionPending } = await useFetch(
  '/api/agency/reports/task-completion',
  { query: queryParams }
)

const { data: trendsData, pending: trendsPending } = await useFetch(
  '/api/agency/reports/completion-trends',
  { query: computed(() => ({ ...queryParams.value, interval: groupBy.value })) }
)

const { data: workloadData, pending: workloadPending } = await useFetch(
  '/api/agency/reports/workload',
  { query: queryParams }
)

const { data: projectProgressData, pending: progressPending } = await useFetch(
  '/api/agency/reports/project-progress',
  { query: queryParams }
)

const completion = computed(() => completionData.value as any)
const trends = computed(() => trendsData.value as any)
const workload = computed(() => workloadData.value as any)
const projectProgress = computed(() => projectProgressData.value as any)

// Quick date presets
const datePresets = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This year', days: 365 }
]

const setDatePreset = (days: number) => {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  dateRange.value = {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0]
  }
}

// Status color helpers
const getHealthColor = (health: string) => {
  switch (health) {
    case 'healthy': return 'success'
    case 'at_risk': return 'warning'
    case 'critical': return 'error'
    default: return 'neutral'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'underutilized': return 'info'
    case 'optimal': return 'success'
    case 'overloaded': return 'error'
    default: return 'neutral'
  }
}

// Format helpers
const formatPercent = (value: number) => `${value}%`
const formatHours = (value: number) => `${value}h`
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Reports & Analytics">
        <template #leading>
          <UIcon name="i-lucide-bar-chart-3" class="h-5 w-5" />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <!-- Date Range -->
            <div class="flex items-center gap-2">
              <UInput
                v-model="dateRange.from"
                type="date"
                size="sm"
              />
              <span class="text-neutral-500">to</span>
              <UInput
                v-model="dateRange.to"
                type="date"
                size="sm"
              />
            </div>

            <!-- Quick Presets -->
            <UButtonGroup>
              <UButton
                v-for="preset in datePresets"
                :key="preset.days"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="setDatePreset(preset.days)"
              >
                {{ preset.label }}
              </UButton>
            </UButtonGroup>
          </div>
        </template>
      </UDashboardNavbar>

      <div class="p-6 space-y-6">
        <!-- Filters -->
        <div class="flex flex-wrap gap-4">
          <UFormField label="Department">
            <USelect
              v-model="selectedDepartment"
              :items="[{ label: 'All Departments', value: undefined }, ...departments.map((d: any) => ({ label: d.name, value: d.id }))]"
              value-key="value"
              class="w-48"
            />
          </UFormField>

          <UFormField label="Project">
            <USelect
              v-model="selectedProject"
              :items="[{ label: 'All Projects', value: undefined }, ...projects.map((p: any) => ({ label: p.name, value: p.id }))]"
              value-key="value"
              class="w-48"
            />
          </UFormField>

          <UFormField label="Group By">
            <USelect
              v-model="groupBy"
              :items="[
                { label: 'Day', value: 'day' },
                { label: 'Week', value: 'week' },
                { label: 'Month', value: 'month' }
              ]"
              value-key="value"
              class="w-32"
            />
          </UFormField>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-neutral-500">Tasks Completed</p>
                <p class="text-2xl font-bold">{{ completion?.totalCompleted || 0 }}</p>
              </div>
              <div class="p-3 bg-success-100 dark:bg-success-900/20 rounded-full">
                <UIcon name="i-lucide-check-circle" class="h-6 w-6 text-success-600" />
              </div>
            </div>
            <p class="text-sm text-neutral-500 mt-2">
              {{ formatPercent(completion?.completionRate || 0) }} completion rate
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-neutral-500">Avg Completion Time</p>
                <p class="text-2xl font-bold">{{ completion?.averageCompletionDays || 0 }} days</p>
              </div>
              <div class="p-3 bg-info-100 dark:bg-info-900/20 rounded-full">
                <UIcon name="i-lucide-clock" class="h-6 w-6 text-info-600" />
              </div>
            </div>
            <p class="text-sm text-neutral-500 mt-2">
              Trend: <span :class="trends?.summary?.trend === 'up' ? 'text-success-600' : trends?.summary?.trend === 'down' ? 'text-error-600' : ''">
                {{ trends?.summary?.trend === 'up' ? '↑' : trends?.summary?.trend === 'down' ? '↓' : '→' }}
                {{ trends?.summary?.trendPercentage || 0 }}%
              </span>
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-neutral-500">Team Utilization</p>
                <p class="text-2xl font-bold">{{ workload?.summary?.averageUtilization || 0 }}%</p>
              </div>
              <div class="p-3 bg-warning-100 dark:bg-warning-900/20 rounded-full">
                <UIcon name="i-lucide-users" class="h-6 w-6 text-warning-600" />
              </div>
            </div>
            <p class="text-sm text-neutral-500 mt-2">
              {{ workload?.summary?.overloaded || 0 }} overloaded, {{ workload?.summary?.underutilized || 0 }} underutilized
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-neutral-500">Projects On Track</p>
                <p class="text-2xl font-bold">{{ projectProgress?.summary?.onTrack || 0 }}</p>
              </div>
              <div class="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-full">
                <UIcon name="i-lucide-target" class="h-6 w-6 text-primary-600" />
              </div>
            </div>
            <p class="text-sm text-neutral-500 mt-2">
              {{ projectProgress?.summary?.atRisk || 0 }} at risk, {{ projectProgress?.summary?.critical || 0 }} critical
            </p>
          </UCard>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Completion Trends -->
          <UCard>
            <template #header>
              <h3 class="font-semibold flex items-center gap-2">
                <UIcon name="i-lucide-trending-up" class="h-4 w-4" />
                Completion Trends
              </h3>
            </template>

            <div v-if="trendsPending" class="h-64 flex items-center justify-center">
              <XfLoader />
            </div>
            <div v-else-if="trends?.trends?.length" class="space-y-2">
              <div
                v-for="trend in trends.trends.slice(-10)"
                :key="trend.period"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-neutral-500 w-24">{{ trend.period }}</span>
                <div class="flex-1 h-6 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                  <div
                    class="h-full bg-success-500"
                    :style="{ width: `${Math.min(100, (trend.completed / Math.max(trend.created, 1)) * 100)}%` }"
                  />
                </div>
                <span class="text-sm font-medium w-16 text-right">{{ trend.completed }} done</span>
              </div>
            </div>
            <div v-else class="h-64 flex items-center justify-center text-neutral-500">
              No data available
            </div>
          </UCard>

          <!-- By Department -->
          <UCard>
            <template #header>
              <h3 class="font-semibold flex items-center gap-2">
                <UIcon name="i-lucide-building-2" class="h-4 w-4" />
                Completion by Department
              </h3>
            </template>

            <div v-if="completionPending" class="h-64 flex items-center justify-center">
              <XfLoader />
            </div>
            <div v-else-if="completion?.byDepartment?.length" class="space-y-3">
              <div
                v-for="dept in completion.byDepartment"
                :key="dept.departmentId"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-sm">
                  <span>{{ dept.departmentName }}</span>
                  <span class="font-medium">{{ dept.completed }} tasks ({{ dept.completionRate }}%)</span>
                </div>
                <div class="h-2 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                  <div
                    class="h-full bg-primary-500"
                    :style="{ width: `${dept.completionRate}%` }"
                  />
                </div>
              </div>
            </div>
            <div v-else class="h-64 flex items-center justify-center text-neutral-500">
              No data available
            </div>
          </UCard>
        </div>

        <!-- Team Workload -->
        <UCard>
          <template #header>
            <h3 class="font-semibold flex items-center gap-2">
              <UIcon name="i-lucide-users" class="h-4 w-4" />
              Team Workload
            </h3>
          </template>

          <div v-if="workloadPending" class="h-48 flex items-center justify-center">
            <XfLoader />
          </div>
          <div v-else-if="workload?.members?.length" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-neutral-700">
                  <th class="text-left py-3 px-4">Team Member</th>
                  <th class="text-left py-3 px-4">Department</th>
                  <th class="text-center py-3 px-4">Active Tasks</th>
                  <th class="text-center py-3 px-4">Est. Hours</th>
                  <th class="text-center py-3 px-4">Utilization</th>
                  <th class="text-center py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in workload.members.slice(0, 10)"
                  :key="member.memberId"
                  class="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <UAvatar
                        :src="member.memberAvatar"
                        :alt="member.memberName"
                        size="sm"
                      />
                      <span>{{ member.memberName }}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-neutral-500">{{ member.departmentName || '-' }}</td>
                  <td class="py-3 px-4 text-center">
                    {{ member.activeTasks }}
                    <span v-if="member.overdueCount" class="text-error-500 ml-1">
                      ({{ member.overdueCount }} overdue)
                    </span>
                  </td>
                  <td class="py-3 px-4 text-center">{{ formatHours(member.estimatedHours) }}</td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                        <div
                          class="h-full"
                          :class="{
                            'bg-info-500': member.status === 'underutilized',
                            'bg-success-500': member.status === 'optimal',
                            'bg-error-500': member.status === 'overloaded'
                          }"
                          :style="{ width: `${Math.min(100, member.utilizationPercent)}%` }"
                        />
                      </div>
                      <span class="text-xs w-10">{{ member.utilizationPercent }}%</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-center">
                    <UBadge :color="getStatusColor(member.status)" size="sm">
                      {{ member.status }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="h-48 flex items-center justify-center text-neutral-500">
            No team members found
          </div>
        </UCard>

        <!-- Project Progress -->
        <UCard>
          <template #header>
            <h3 class="font-semibold flex items-center gap-2">
              <UIcon name="i-lucide-folder-kanban" class="h-4 w-4" />
              Project Progress
            </h3>
          </template>

          <div v-if="progressPending" class="h-48 flex items-center justify-center">
            <XfLoader />
          </div>
          <div v-else-if="projectProgress?.projects?.length" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-neutral-700">
                  <th class="text-left py-3 px-4">Project</th>
                  <th class="text-left py-3 px-4">Client</th>
                  <th class="text-center py-3 px-4">Progress</th>
                  <th class="text-center py-3 px-4">Tasks</th>
                  <th class="text-center py-3 px-4">Hours</th>
                  <th class="text-center py-3 px-4">Due</th>
                  <th class="text-center py-3 px-4">Health</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="project in projectProgress.projects.slice(0, 10)"
                  :key="project.projectId"
                  class="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td class="py-3 px-4 font-medium">{{ project.projectName }}</td>
                  <td class="py-3 px-4 text-neutral-500">{{ project.clientName || '-' }}</td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                        <div
                          class="h-full bg-primary-500"
                          :style="{ width: `${project.progressPercent}%` }"
                        />
                      </div>
                      <span class="text-xs w-10">{{ project.progressPercent }}%</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-center">
                    {{ project.completedTasks }}/{{ project.totalTasks }}
                    <span v-if="project.blockedTasks" class="text-warning-500 ml-1">
                      ({{ project.blockedTasks }} blocked)
                    </span>
                  </td>
                  <td class="py-3 px-4 text-center">
                    {{ formatHours(project.actualHours) }} / {{ formatHours(project.estimatedHours) }}
                  </td>
                  <td class="py-3 px-4 text-center">
                    <span v-if="project.dueDate" :class="{ 'text-error-500': project.isOverdue }">
                      {{ project.dueDate }}
                      <span v-if="project.daysRemaining !== null" class="text-xs">
                        ({{ project.daysRemaining > 0 ? `${project.daysRemaining}d left` : `${Math.abs(project.daysRemaining)}d overdue` }})
                      </span>
                    </span>
                    <span v-else class="text-neutral-400">-</span>
                  </td>
                  <td class="py-3 px-4 text-center">
                    <UBadge :color="getHealthColor(project.health)" size="sm">
                      {{ project.health }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="h-48 flex items-center justify-center text-neutral-500">
            No projects found
          </div>
        </UCard>

        <!-- Priority Breakdown -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UCard>
            <template #header>
              <h3 class="font-semibold flex items-center gap-2">
                <UIcon name="i-lucide-flag" class="h-4 w-4" />
                Completion by Priority
              </h3>
            </template>

            <div v-if="completion?.byPriority?.length" class="space-y-4">
              <div
                v-for="priority in completion.byPriority"
                :key="priority.priority"
                class="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800"
              >
                <div class="flex items-center gap-3">
                  <UBadge
                    :color="priority.priority === 'urgent' ? 'error' : priority.priority === 'high' ? 'warning' : priority.priority === 'medium' ? 'info' : 'neutral'"
                  >
                    {{ priority.priority || 'none' }}
                  </UBadge>
                </div>
                <div class="text-right">
                  <p class="font-medium">{{ priority.completed }} tasks</p>
                  <p class="text-xs text-neutral-500">Avg {{ priority.averageDays || 0 }} days</p>
                </div>
              </div>
            </div>
            <div v-else class="h-48 flex items-center justify-center text-neutral-500">
              No data available
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="font-semibold flex items-center gap-2">
                <UIcon name="i-lucide-user-check" class="h-4 w-4" />
                Top Performers
              </h3>
            </template>

            <div v-if="completion?.byAssignee?.length" class="space-y-3">
              <div
                v-for="(assignee, idx) in completion.byAssignee.slice(0, 5)"
                :key="assignee.assigneeId"
                class="flex items-center gap-3"
              >
                <span class="text-lg font-bold text-neutral-400 w-6">{{ idx + 1 }}</span>
                <div class="flex-1">
                  <p class="font-medium">{{ assignee.assigneeName }}</p>
                  <p class="text-xs text-neutral-500">
                    {{ assignee.onTime }} on time, {{ assignee.late }} late
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-bold text-primary-600">{{ assignee.completed }}</p>
                  <p class="text-xs text-neutral-500">completed</p>
                </div>
              </div>
            </div>
            <div v-else class="h-48 flex items-center justify-center text-neutral-500">
              No data available
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
