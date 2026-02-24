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
  const options: { label: string; value: string | null }[] = [{ label: 'All Clients', value: null }]
  if (clients.value) {
    (clients.value as any[]).forEach(c => {
      options.push({ label: c.name, value: c.id })
    })
  }
  return options
})

// Filtered projects
const filteredProjects = computed(() => {
  if (!projects.value) return []

  let result = projects.value as any[]

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
  if (!projects.value) return { total: 0, active: 0, totalBudget: 0, avgMargin: 0 }

  const projectsList = projects.value as any[]
  const active = projectsList.filter(p => p.status === 'active')
  const totalBudget = active.reduce((sum, p) => sum + p.budgetAmount, 0)
  const avgMargin = active.length > 0
    ? active.reduce((sum, p) => sum + (p.grossMargin || 0), 0) / active.length
    : 0

  return {
    total: projectsList.length,
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
  { accessorKey: 'name', header: 'Project', enableSorting: true },
  { accessorKey: 'clientName', header: 'Client', enableSorting: true },
  { accessorKey: 'budgetAmount', header: 'Budget', enableSorting: true },
  { accessorKey: 'totalCost', header: 'Spent', enableSorting: true },
  { accessorKey: 'grossMargin', header: 'Margin', enableSorting: true },
  { accessorKey: 'hoursWorked', header: 'Hours', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
  { accessorKey: 'actions', header: '' }
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
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
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

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
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
            :data="filteredProjects"
            :loading="pending"
          >
            <template #name-cell="{ row }">
              <NuxtLink
                :to="`/agency/projects/${(row.original as any).id}`"
                class="font-medium hover:text-primary-500"
              >
                {{ (row.original as any).name }}
              </NuxtLink>
              <p class="text-xs text-gray-500">
                {{ format(new Date((row.original as any).startDate), 'MMM d, yyyy') }}
                <span v-if="(row.original as any).endDate">
                  - {{ format(new Date((row.original as any).endDate), 'MMM d, yyyy') }}
                </span>
              </p>
            </template>

            <template #budgetAmount-cell="{ row }">
              {{ formatCurrency((row.original as any).budgetAmount) }}
            </template>

            <template #totalCost-cell="{ row }">
              <div class="flex items-center gap-2">
                <span :class="(row.original as any).totalCost > (row.original as any).budgetAmount ? 'text-red-500 font-semibold' : ''">
                  {{ formatCurrency((row.original as any).totalCost || 0) }}
                </span>
                <UProgress
                  :value="(((row.original as any).totalCost || 0) / (row.original as any).budgetAmount) * 100"
                  :max="100"
                  :color="(row.original as any).totalCost > (row.original as any).budgetAmount ? 'error' : (row.original as any).totalCost > (row.original as any).budgetAmount * 0.8 ? 'warning' : 'success'"
                  size="xs"
                  class="w-16"
                />
              </div>
            </template>

            <template #grossMargin-cell="{ row }">
              <UBadge :color="getMarginColor((row.original as any).grossMargin || 0)">
                {{ formatPercent((row.original as any).grossMargin || 0) }}
              </UBadge>
            </template>

            <template #hoursWorked-cell="{ row }">
              {{ ((row.original as any).hoursWorked || 0).toFixed(1) }}h
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="getStatusColor((row.original as any).status)" variant="subtle">
                {{ (row.original as any).status.replace('_', ' ') }}
              </UBadge>
            </template>

            <template #actions-cell="{ row }">
              <UDropdownMenu :items="getActions(row.original)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-horizontal"
                />
              </UDropdownMenu>
            </template>
          </UTable>
        </UCard>
      </div>
    </UDashboardPanel>
  </div>
</template>
