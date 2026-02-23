<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p class="text-gray-600">Welcome back, {{ user?.name }}. Here's what's happening with your Xero implementations.</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <DashboardStatCard
        title="Active Implementations"
        :value="stats.activeImplementations"
        icon="i-lucide-briefcase"
        color="blue"
      />
      <DashboardStatCard
        title="Completed This Month"
        :value="stats.completedThisMonth"
        icon="i-lucide-check-circle"
        color="green"
      />
      <DashboardStatCard
        title="Avg. Completion Time"
        :value="`${stats.averageCompletionTime} days`"
        icon="i-lucide-clock"
        color="yellow"
      />
      <DashboardStatCard
        title="Hours Logged"
        :value="stats.totalHoursLogged"
        icon="i-lucide-timer"
        color="purple"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Main Column -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Active Implementations -->
        <div class="bg-white rounded-lg border border-gray-200">
          <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Active Implementations</h2>
            <NuxtLink 
              to="/dashboard/implementations" 
              class="text-sm text-[#13B5EA] hover:underline"
            >
              View all
            </NuxtLink>
          </div>
          
          <div v-if="isLoading" class="p-8 text-center text-gray-500">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading...
          </div>
          
          <div v-else-if="implementations.length === 0" class="p-8 text-center text-gray-500">
            No active implementations
          </div>
          
          <div v-else class="divide-y divide-gray-200">
            <div 
              v-for="impl in recentImplementations" 
              :key="impl.id"
              class="px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-medium text-gray-900">{{ impl.client_name }}</h3>
                <Badge :color="getStatusColor(impl.status)">
                  {{ formatStatus(impl.status) }}
                </Badge>
              </div>
              
              <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <span class="flex items-center gap-1">
                  <UIcon name="i-lucide-calendar" class="w-4 h-4" />
                  Target: {{ formatDate(impl.target_date) }}
                </span>
                <span class="flex items-center gap-1">
                  <UIcon name="i-lucide-user" class="w-4 h-4" />
                  {{ impl.project_manager_name }}
                </span>
              </div>
              
              <!-- Progress Bar -->
              <div class="flex items-center gap-3">
                <div class="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    class="bg-[#13B5EA] h-2 rounded-full transition-all"
                    :style="{ width: `${impl.progress_percent || 0}%` }"
                  />
                </div>
                <span class="text-sm text-gray-600 min-w-[3rem] text-right">
                  {{ impl.progress_percent || 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Team Workload -->
        <div class="bg-white rounded-lg border border-gray-200">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">Team Workload</h2>
          </div>
          <div class="p-6">
            <div class="space-y-4">
              <div 
                v-for="member in teamWorkload" 
                :key="member.id"
                class="flex items-center justify-between"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <span class="text-sm font-medium text-gray-700">
                      {{ getInitials(member.name) }}
                    </span>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ member.name }}</p>
                    <p class="text-sm text-gray-500">
                      {{ member.active_implementations }} implementations
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-sm">
                  <span class="text-gray-600">
                    {{ member.pending_tasks }} tasks
                  </span>
                  <span 
                    v-if="member.overdue_tasks > 0"
                    class="text-red-600 font-medium"
                  >
                    {{ member.overdue_tasks }} overdue
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div class="space-y-2">
            <UButton 
              to="/dashboard/implementations/new"
              color="primary"
              variant="solid"
              block
              icon="i-lucide-plus"
            >
              New Implementation
            </UButton>
            <UButton 
              to="/dashboard/templates"
              color="gray"
              variant="soft"
              block
              icon="i-lucide-copy"
            >
              Browse Templates
            </UButton>
          </div>
        </div>

        <!-- Overdue Tasks -->
        <div class="bg-white rounded-lg border border-gray-200">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">Overdue Tasks</h2>
          </div>
          <div v-if="overdueTasks.length === 0" class="p-6 text-center text-gray-500">
            No overdue tasks 🎉
          </div>
          <div v-else class="divide-y divide-gray-200">
            <div 
              v-for="task in overdueTasks.slice(0, 5)" 
              :key="task.id"
              class="px-6 py-3 hover:bg-gray-50"
            >
              <p class="font-medium text-gray-900 text-sm">{{ task.name }}</p>
              <p class="text-xs text-gray-500">{{ task.client_name }}</p>
              <p class="text-xs text-red-600 mt-1">
                Due {{ formatDate(task.due_date) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})

const { user } = useAuth()
const { implementations, isLoading, fetchImplementations, getStatusColor } = useImplementations()

// Fetch data on mount
onMounted(() => {
  fetchImplementations({ status: 'active' })
})

// Computed
const recentImplementations = computed(() => {
  return implementations.value.slice(0, 5)
})

// Mock stats (replace with API call)
const stats = ref({
  activeImplementations: 12,
  completedThisMonth: 8,
  averageCompletionTime: 10,
  totalHoursLogged: 246
})

// Mock team workload (replace with API call)
const teamWorkload = ref([
  { id: '1', name: 'Sarah Chen', active_implementations: 4, pending_tasks: 12, overdue_tasks: 1 },
  { id: '2', name: 'Marcus Thompson', active_implementations: 3, pending_tasks: 8, overdue_tasks: 0 },
  { id: '3', name: 'Jessica Wong', active_implementations: 5, pending_tasks: 15, overdue_tasks: 2 }
])

// Mock overdue tasks (replace with API call)
const overdueTasks = ref([
  { id: '1', name: 'Bank Feed Connection', client_name: 'ABC Services', due_date: '2024-01-15' },
  { id: '2', name: 'Opening Balances Entry', client_name: 'XYZ Retail', due_date: '2024-01-14' }
])

// Helpers
const formatStatus = (status) => {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const formatDate = (date) => {
  if (!date) return 'Not set'
  return new Date(date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  })
}

const getInitials = (name) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase()
}
</script>
