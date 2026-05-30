<script setup lang="ts">
import { format } from 'date-fns'
import type { AgencyClient, BillingType } from '~/types'

definePageMeta({
  title: 'Clients',
  middleware: ['role-clients']
})

// Filters
const activeFilter = ref<'all' | 'active' | 'inactive'>('active')
const searchQuery = ref('')

// Fetch clients
const { data: clientsData, pending, refresh } = await useFetch('/api/agency/clients', {
  query: {
    active: computed(() => activeFilter.value === 'all' ? undefined : activeFilter.value === 'active')
  }
})

// Cast clients to proper type
const clients = computed(() => (clientsData.value || []) as unknown as AgencyClient[])

// Filter options
const activeOptions = [
  { label: 'All Clients', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
]

// Filtered clients
const filteredClients = computed(() => {
  const clientsList = clients.value
  if (!clientsList) return []

  let result = clientsList

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((c: AgencyClient) => c.name?.toLowerCase().includes(query))
  }

  return result
})

// Summary stats
const summary = computed(() => {
  const clientsList = clients.value
  if (!clientsList) return { total: 0, active: 0, totalRevenue: 0, avgMargin: 0, totalMRR: 0 }

  const active = clientsList.filter((c: AgencyClient) => c.isActive)
  const totalRevenue = clientsList.reduce((sum: number, c: AgencyClient) => sum + (c.totalRevenue || 0), 0)
  const avgMargin = clientsList.length > 0
    ? clientsList.reduce((sum: number, c: AgencyClient) => sum + (c.grossMargin || 0), 0) / clientsList.length
    : 0
  const totalMRR = active
    .filter((c: AgencyClient) => c.retainerAmount)
    .reduce((sum: number, c: AgencyClient) => sum + (c.retainerAmount || 0), 0)

  return {
    total: clientsList.length,
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
const getBillingTypeColor = (type: BillingType): 'secondary' | 'info' | 'success' | 'warning' | 'neutral' => {
  switch (type) {
    case 'retainer': return 'secondary'
    case 'project': return 'info'
    case 'hybrid': return 'success'
    case 'commission': return 'warning'
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
  { accessorKey: 'name', header: 'Client', enableSorting: true },
  { accessorKey: 'billingType', header: 'Billing Type' },
  { accessorKey: 'retainerAmount', header: 'Retainer' },
  { accessorKey: 'totalRevenue', header: 'Total Revenue', enableSorting: true },
  { accessorKey: 'grossMargin', header: 'Margin', enableSorting: true },
  { accessorKey: 'activeProjects', header: 'Projects' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

// Actions
const toast = useToast()

const getActions = (client: any) => [
  { label: 'View Details', icon: 'i-lucide-eye', onSelect: () => navigateTo(`/agency/clients/${client.id}`) },
  { label: 'New Project', icon: 'i-lucide-folder-plus', onSelect: () => navigateTo(`/agency/projects/new?clientId=${client.id}`) },
  { type: 'separator' as const },
  { label: 'View in Xero', icon: 'i-lucide-external-link', disabled: !client.xeroContactId, onSelect: () => client.xeroContactId && window.open(`https://go.xero.com/Contacts/View/${client.xeroContactId}`, '_blank') },
  { label: 'Generate Invoice', icon: 'i-lucide-file-text' },
  { type: 'separator' as const },
  {
    label: client.isActive ? 'Deactivate' : 'Reactivate',
    icon: client.isActive ? 'i-lucide-user-minus' : 'i-lucide-user-plus',
    onSelect: () => toggleClientStatus(client)
  }
]

const toggleClientStatus = async (client: any) => {
  try {
    await $fetch(`/api/agency/clients/${client.id}`, {
      method: 'PUT',
      body: { isActive: !client.isActive }
    })
    toast.add({ title: `Client ${client.isActive ? 'deactivated' : 'reactivated'}`, color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update client', description: err.data?.message || err.message, color: 'error' })
  }
}

// Xero bulk match
const { isAdmin } = useAuth()
const matchingXero = ref(false)
const bulkMatchXero = async () => {
  matchingXero.value = true
  try {
    const result = await $fetch('/api/agency/clients/xero-match', { method: 'POST' }) as any
    const desc = result.unmatched.length > 0
      ? `${result.unmatched.length} unmatched: ${result.unmatched.slice(0, 5).join(', ')}${result.unmatched.length > 5 ? '...' : ''}`
      : 'All clients matched!'
    toast.add({
      title: `Matched ${result.matched} clients`,
      description: desc,
      color: result.matched > 0 ? 'success' : 'info'
    })
    if (result.matched > 0) refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to match clients', description: err.data?.message || err.message, color: 'error' })
  } finally {
    matchingXero.value = false
  }
}

// New client modal
const showNewClientModal = ref(false)
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar title="Clients">
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              to="/agency/clients/reconcile"
              label="Reconcile with Xero"
              icon="i-lucide-refresh-cw"
              variant="soft"
            />
            <UButton
              v-if="isAdmin"
              label="Link Xero"
              icon="i-lucide-link"
              variant="outline"
              :loading="matchingXero"
              @click="bulkMatchXero"
            />
            <UButton
              label="New Client"
              icon="i-lucide-plus"
              color="primary"
              @click="showNewClientModal = true"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
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
            :items="activeOptions"
            value-key="value"
            placeholder="Status"
            class="w-40"
          />
        </div>

        <!-- Clients Table -->
        <UCard>
          <UTable
            :columns="columns"
            :data="filteredClients"
            :loading="pending"
          >
            <template #name-cell="{ row }">
              <div class="flex items-center gap-3">
                <UAvatar
                  :text="row.original.name?.charAt(0) || '?'"
                  size="sm"
                />
                <div>
                  <div class="flex items-center gap-1.5">
                    <NuxtLink
                      :to="`/agency/clients/${row.original.id}`"
                      class="font-medium hover:text-primary-500"
                    >
                      {{ row.original.name }}
                    </NuxtLink>
                    <UTooltip v-if="row.original.xeroContactId" text="Linked to Xero">
                      <UIcon name="i-lucide-link" class="w-3.5 h-3.5 text-blue-500" />
                    </UTooltip>
                  </div>
                  <p class="text-xs text-gray-500">
                    Since {{ format(new Date(row.original.createdAt), 'MMM yyyy') }}
                  </p>
                </div>
              </div>
            </template>

            <template #billingType-cell="{ row }">
              <UBadge :color="getBillingTypeColor(row.original.billingType)" variant="subtle">
                {{ getBillingTypeLabel(row.original.billingType) }}
              </UBadge>
            </template>

            <template #retainerAmount-cell="{ row }">
              <span v-if="row.original.retainerAmount">
                {{ formatCurrency(row.original.retainerAmount) }}/mo
              </span>
              <span v-else class="text-gray-400">-</span>
            </template>

            <template #totalRevenue-cell="{ row }">
              {{ formatCurrency(row.original.totalRevenue || 0) }}
            </template>

            <template #grossMargin-cell="{ row }">
              <UBadge
                v-if="row.original.grossMargin"
                :color="row.original.grossMargin >= 30 ? 'success' : row.original.grossMargin >= 15 ? 'warning' : 'error'"
              >
                {{ formatPercent(row.original.grossMargin) }}
              </UBadge>
              <span v-else class="text-gray-400">-</span>
            </template>

            <template #activeProjects-cell="{ row }">
              <div class="flex items-center gap-1">
                <span class="font-medium">{{ row.original.activeProjects || 0 }}</span>
                <span class="text-gray-400">/ {{ row.original.projectCount || 0 }}</span>
              </div>
            </template>

            <template #status-cell="{ row }">
              <UBadge
                :color="row.original.isActive ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ row.original.isActive ? 'Active' : 'Inactive' }}
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

    <!-- New Client Modal -->
    <UModal v-model:open="showNewClientModal">
      <template #header>
        <h3 class="text-lg font-semibold">New Client</h3>
      </template>

      <template #body>
        <AgencyClientForm
          @submit="showNewClientModal = false; refresh()"
          @cancel="showNewClientModal = false"
        />
      </template>
    </UModal>
  </div>
</template>
