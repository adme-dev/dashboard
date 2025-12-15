<script setup lang="ts">
import { format } from 'date-fns'
import type { Project, ProjectProfitability, ProjectStatus } from '~/types'

definePageMeta({
  title: 'Projects'
})

// Filters
const statusFilter = ref<ProjectStatus | 'all'>('all')
const clientFilter = ref<string | null>(null)
const searchQuery = ref('')

// Fetch projects with profitability data
const { data: projects, pending, refresh } = await useFetch('/api/agency/projects', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    clientId: clientFilter
  }
})

// Fetch clients for filter dropdown
const { data: clients } = await useFetch('/api/agency/clients')

// Status options
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' }
]

// Client options for dropdown
const clientOptions = computed(() => {
  const options = [{ label: 'All Clients', value: null }]
  if (clients.value) {
    clients.value.forEach(c => {
      options.push({ label: c.name, value: c.id })
    })
  }
  return options
})

// Filtered projects
const filteredProjects = computed(() => {
  if (!projects.value) return []

  let result = projects.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.clientName?.toLowerCase().includes(query)
    )
  }

  return result
})

// Summary stats
const summary = computed(() => {
  if (!projects.value) return { total: 0, totalBudget: 0, avgMargin: 0 }

  const active = projects.value.filter(p => p.status === 'active')
  const totalBudget = active.reduce((sum, p) => sum + p.budgetAmount, 0)
  const avgMargin = active.length > 0
    ? active.reduce((sum, p) => sum + (p.grossMargin || 0), 0) / active.length
    : 0

  return {
    total: projects.value.length,
    active: active.length,
    totalBudget,
    avgMargin
  }
})

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

// Status badge color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'draft': return 'neutral'
    case 'on_hold': return 'warning'
    case 'completed': return 'info'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

// Margin badge color
const getMarginColor = (margin: number) => {
  if (margin >= 30) return 'success'
  if (margin >= 15) return 'warning'
  return 'error'
}

// Table columns
const columns = [
  { key: 'name', label: 'Project', sortable: true },
  { key: 'clientName', label: 'Client', sortable: true },
  { key: 'budgetAmount', label: 'Budget', sortable: true },
  { key: 'totalCost', label: 'Spent', sortable: true },
  { key: 'grossMargin', label: 'Margin', sortable: true },
  { key: 'hoursWorked', label: 'Hours', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: '' }
]

// Actions dropdown items
const getActions = (project: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', click: () => navigateTo(`/agency/projects/${project.id}`) },
    { label: 'Edit Project', icon: 'i-lucide-pencil', click: () => navigateTo(`/agency/projects/${project.id}/edit`) },
    { label: 'Log Time', icon: 'i-lucide-clock', click: () => openTimeModal(project) }
  ],
  [
    { label: 'View in Xero', icon: 'i-simple-icons-xero', disabled: !project.xeroInvoiceId },
    { label: 'Generate Invoice', icon: 'i-lucide-file-text' }
  ]
]

// Time entry modal
const showTimeModal = ref(false)
const selectedProject = ref<any>(null)

const openTimeModal = (project: any) => {
  selectedProject.value = project
  showTimeModal.value = true
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Projects">
        <template #right>
          <UButton
            label="New Project"
            icon="i-lucide-plus"
            color="primary"
            to="/agency/projects/new"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Projects</p>
              <p class="text-3xl font-bold">{{ summary.total }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Active Projects</p>
              <p class="text-3xl font-bold text-emerald-500">{{ summary.active }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Budget</p>
              <p class="text-3xl font-bold">{{ formatCurrency(summary.totalBudget) }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Margin</p>
              <p
                class="text-3xl font-bold"
                :class="summary.avgMargin >= 30 ? 'text-emerald-500' : summary.avgMargin >= 15 ? 'text-amber-500' : 'text-red-500'"
              >
                {{ formatPercent(summary.avgMargin) }}
              </p>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search projects..."
            class="w-64"
          />

          <USelectMenu
            v-model="statusFilter"
            :options="statusOptions"
            placeholder="Status"
            class="w-40"
          />

          <USelectMenu
            v-model="clientFilter"
            :options="clientOptions"
            placeholder="Client"
            class="w-48"
          />

          <UButton
            v-if="statusFilter !== 'all' || clientFilter || searchQuery"
            label="Clear Filters"
            variant="ghost"
            icon="i-lucide-x"
            @click="statusFilter = 'all'; clientFilter = null; searchQuery = ''"
          />
        </div>

        <!-- Projects Table -->
        <UCard>
          <UTable
            :columns="columns"
            :rows="filteredProjects"
            :loading="pending"
            :empty-state="{ icon: 'i-lucide-folder-open', label: 'No projects found' }"
          >
            <template #name-data="{ row }">
              <NuxtLink
                :to="`/agency/projects/${row.id}`"
                class="font-medium hover:text-primary-500"
              >
                {{ row.name }}
              </NuxtLink>
              <p class="text-xs text-gray-500">
                {{ format(new Date(row.startDate), 'MMM d, yyyy') }}
                <span v-if="row.endDate">
                  - {{ format(new Date(row.endDate), 'MMM d, yyyy') }}
                </span>
              </p>
            </template>

            <template #budgetAmount-data="{ row }">
              {{ formatCurrency(row.budgetAmount) }}
            </template>

            <template #totalCost-data="{ row }">
              <div class="flex items-center gap-2">
                <span :class="row.totalCost > row.budgetAmount ? 'text-red-500 font-semibold' : ''">
                  {{ formatCurrency(row.totalCost || 0) }}
                </span>
                <UProgress
                  :value="((row.totalCost || 0) / row.budgetAmount) * 100"
                  :max="100"
                  :color="row.totalCost > row.budgetAmount ? 'error' : row.totalCost > row.budgetAmount * 0.8 ? 'warning' : 'success'"
                  size="xs"
                  class="w-16"
                />
              </div>
            </template>

            <template #grossMargin-data="{ row }">
              <UBadge :color="getMarginColor(row.grossMargin || 0)">
                {{ formatPercent(row.grossMargin || 0) }}
              </UBadge>
            </template>

            <template #hoursWorked-data="{ row }">
              {{ (row.hoursWorked || 0).toFixed(1) }}h
            </template>

            <template #status-data="{ row }">
              <UBadge :color="getStatusColor(row.status)" variant="subtle">
                {{ row.status.replace('_', ' ') }}
              </UBadge>
            </template>

            <template #actions-data="{ row }">
              <UDropdown :items="getActions(row)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-horizontal"
                />
              </UDropdown>
            </template>
          </UTable>
        </UCard>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
