<script setup lang="ts">
import { format } from 'date-fns'
import type { AgencyClient, BillingType } from '~/types'

definePageMeta({
  title: 'Clients'
})

// Filters
const activeFilter = ref<'all' | 'active' | 'inactive'>('active')
const searchQuery = ref('')

// Fetch clients
const { data: clients, pending, refresh } = await useFetch('/api/agency/clients', {
  query: {
    active: computed(() => activeFilter.value === 'all' ? undefined : activeFilter.value === 'active')
  }
})

// Filter options
const activeOptions = [
  { label: 'All Clients', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
]

// Filtered clients
const filteredClients = computed(() => {
  if (!clients.value) return []

  let result = clients.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(c => c.name.toLowerCase().includes(query))
  }

  return result
})

// Summary stats
const summary = computed(() => {
  if (!clients.value) return { total: 0, active: 0, totalRevenue: 0, avgMargin: 0, totalMRR: 0 }

  const active = clients.value.filter(c => c.isActive)
  const totalRevenue = clients.value.reduce((sum, c) => sum + (c.totalRevenue || 0), 0)
  const avgMargin = clients.value.length > 0
    ? clients.value.reduce((sum, c) => sum + (c.grossMargin || 0), 0) / clients.value.length
    : 0
  const totalMRR = active
    .filter(c => c.retainerAmount)
    .reduce((sum, c) => sum + (c.retainerAmount || 0), 0)

  return {
    total: clients.value.length,
    active: active.length,
    totalRevenue,
    avgMargin,
    totalMRR
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

// Billing type badge
const getBillingTypeColor = (type: BillingType) => {
  switch (type) {
    case 'retainer': return 'violet'
    case 'project': return 'blue'
    case 'hybrid': return 'emerald'
    case 'commission': return 'amber'
    default: return 'neutral'
  }
}

const getBillingTypeLabel = (type: BillingType) => {
  switch (type) {
    case 'retainer': return 'Retainer'
    case 'project': return 'Project'
    case 'hybrid': return 'Hybrid'
    case 'commission': return 'Commission'
    default: return type
  }
}

// Table columns
const columns = [
  { key: 'name', label: 'Client', sortable: true },
  { key: 'billingType', label: 'Billing Type' },
  { key: 'retainerAmount', label: 'Retainer' },
  { key: 'totalRevenue', label: 'Total Revenue', sortable: true },
  { key: 'grossMargin', label: 'Margin', sortable: true },
  { key: 'activeProjects', label: 'Projects' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '' }
]

// Actions
const getActions = (client: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', click: () => navigateTo(`/agency/clients/${client.id}`) },
    { label: 'Edit Client', icon: 'i-lucide-pencil', click: () => navigateTo(`/agency/clients/${client.id}/edit`) },
    { label: 'New Project', icon: 'i-lucide-folder-plus', click: () => navigateTo(`/agency/projects/new?clientId=${client.id}`) }
  ],
  [
    { label: 'View in Xero', icon: 'i-simple-icons-xero', disabled: !client.xeroContactId },
    { label: 'Generate Invoice', icon: 'i-lucide-file-text' }
  ],
  [
    {
      label: client.isActive ? 'Deactivate' : 'Reactivate',
      icon: client.isActive ? 'i-lucide-user-minus' : 'i-lucide-user-plus',
      click: () => toggleClientStatus(client)
    }
  ]
]

const toggleClientStatus = async (client: any) => {
  // In production, call API to toggle status
  console.log('Toggle status for:', client.name)
}

// New client modal
const showNewClientModal = ref(false)
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Clients">
        <template #right>
          <UButton
            label="New Client"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewClientModal = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Clients</p>
              <p class="text-3xl font-bold">{{ summary.total }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Active Clients</p>
              <p class="text-3xl font-bold text-emerald-500">{{ summary.active }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
              <p class="text-3xl font-bold">{{ formatCurrency(summary.totalRevenue) }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Margin</p>
              <p
                class="text-3xl font-bold"
                :class="summary.avgMargin >= 30 ? 'text-emerald-500' : 'text-amber-500'"
              >
                {{ formatPercent(summary.avgMargin) }}
              </p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">Monthly MRR</p>
              <p class="text-3xl font-bold text-violet-500">{{ formatCurrency(summary.totalMRR) }}</p>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search clients..."
            class="w-64"
          />

          <USelectMenu
            v-model="activeFilter"
            :options="activeOptions"
            placeholder="Status"
            class="w-40"
          />
        </div>

        <!-- Clients Table -->
        <UCard>
          <UTable
            :columns="columns"
            :rows="filteredClients"
            :loading="pending"
            :empty-state="{ icon: 'i-lucide-users', label: 'No clients found' }"
          >
            <template #name-data="{ row }">
              <div class="flex items-center gap-3">
                <UAvatar
                  :text="row.name.charAt(0)"
                  size="sm"
                />
                <div>
                  <NuxtLink
                    :to="`/agency/clients/${row.id}`"
                    class="font-medium hover:text-primary-500"
                  >
                    {{ row.name }}
                  </NuxtLink>
                  <p class="text-xs text-gray-500">
                    Since {{ format(new Date(row.createdAt), 'MMM yyyy') }}
                  </p>
                </div>
              </div>
            </template>

            <template #billingType-data="{ row }">
              <UBadge :color="getBillingTypeColor(row.billingType)" variant="subtle">
                {{ getBillingTypeLabel(row.billingType) }}
              </UBadge>
            </template>

            <template #retainerAmount-data="{ row }">
              <span v-if="row.retainerAmount">
                {{ formatCurrency(row.retainerAmount) }}/mo
              </span>
              <span v-else class="text-gray-400">-</span>
            </template>

            <template #totalRevenue-data="{ row }">
              {{ formatCurrency(row.totalRevenue || 0) }}
            </template>

            <template #grossMargin-data="{ row }">
              <UBadge
                v-if="row.grossMargin"
                :color="row.grossMargin >= 30 ? 'success' : row.grossMargin >= 15 ? 'warning' : 'error'"
              >
                {{ formatPercent(row.grossMargin) }}
              </UBadge>
              <span v-else class="text-gray-400">-</span>
            </template>

            <template #activeProjects-data="{ row }">
              <div class="flex items-center gap-1">
                <span class="font-medium">{{ row.activeProjects || 0 }}</span>
                <span class="text-gray-400">/ {{ row.projectCount || 0 }}</span>
              </div>
            </template>

            <template #status-data="{ row }">
              <UBadge
                :color="row.isActive ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ row.isActive ? 'Active' : 'Inactive' }}
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

    <!-- New Client Modal -->
    <UModal v-model="showNewClientModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">New Client</h3>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="showNewClientModal = false"
            />
          </div>
        </template>

        <AgencyClientForm
          @submit="showNewClientModal = false; refresh()"
          @cancel="showNewClientModal = false"
        />
      </UCard>
    </UModal>
  </UDashboardPage>
</template>
