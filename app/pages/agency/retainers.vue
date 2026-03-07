<script setup lang="ts">
import { format, subMonths, addMonths } from 'date-fns'

definePageMeta({
  title: 'Retainer Management',
  middleware: ['role-finance']
})

const toast = useToast()

// Period selection
const currentDate = ref(new Date())
const selectedPeriod = computed(() => format(currentDate.value, 'yyyy-MM'))

const goToPreviousMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

const goToCurrentMonth = () => {
  currentDate.value = new Date()
}

// Fetch retainers
const { data: retainersData, pending, refresh } = await useFetch('/api/agency/retainers', {
  query: {
    period: selectedPeriod
  }
})

const retainers = computed(() => ((retainersData.value as any)?.retainers || []) as any[])
const summary = computed(() => (retainersData.value as any)?.summary || {
  totalMRR: 0, totalUsed: 0, totalRemaining: 0, avgUtilization: 0,
  clientsExceeded: 0, clientsAtRisk: 0, clientsOnTrack: 0, clientsUnderUtilized: 0, totalClients: 0
})

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatPeriodDisplay = (date: Date) => format(date, 'MMMM yyyy')

// Status colors
const getStatusColor = (status: string): 'error' | 'warning' | 'success' | 'info' => {
  switch (status) {
    case 'exceeded': return 'error'
    case 'at_risk': return 'warning'
    case 'on_track': return 'success'
    case 'under_utilized': return 'info'
    default: return 'info'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'exceeded': return 'Exceeded'
    case 'at_risk': return 'At Risk'
    case 'on_track': return 'On Track'
    case 'under_utilized': return 'Under-Utilized'
    default: return status
  }
}

const getUtilizationColor = (rate: number): 'error' | 'warning' | 'success' | 'info' => {
  if (rate >= 100) return 'error'
  if (rate >= 80) return 'warning'
  if (rate >= 50) return 'success'
  return 'info'
}

// Table columns
const columns = [
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'retainer', header: 'Monthly Retainer' },
  { accessorKey: 'used', header: 'Used' },
  { accessorKey: 'remaining', header: 'Remaining' },
  { accessorKey: 'utilization', header: 'Utilization' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

// Sort by utilization
const sortedRetainers = computed(() => {
  return [...retainers.value].sort((a, b) => b.utilizationRate - a.utilizationRate)
})

// Filter by status
const statusFilter = ref('all')
const filteredRetainers = computed(() => {
  if (statusFilter.value === 'all') return sortedRetainers.value
  return sortedRetainers.value.filter(r => r.status === statusFilter.value)
})

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Exceeded', value: 'exceeded' },
  { label: 'At Risk', value: 'at_risk' },
  { label: 'On Track', value: 'on_track' },
  { label: 'Under-Utilized', value: 'under_utilized' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Retainer Management">
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              icon="i-lucide-chevron-left"
              @click="goToPreviousMonth"
            />
            <UButton
              variant="outline"
              :label="formatPeriodDisplay(currentDate)"
              @click="goToCurrentMonth"
            />
            <UButton
              variant="ghost"
              icon="i-lucide-chevron-right"
              @click="goToNextMonth"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-indigo-500/10">
                <UIcon name="i-lucide-dollar-sign" class="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Total MRR</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalMRR) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Used This Month</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalUsed) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-piggy-bank" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Remaining</p>
                <p class="text-xl font-bold text-emerald-500">{{ formatCurrency(summary.totalRemaining) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-purple-500/10">
                <UIcon name="i-lucide-percent" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Avg Utilization</p>
                <p class="text-xl font-bold">{{ formatPercent(summary.avgUtilization) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-users" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Retainer Clients</p>
                <p class="text-xl font-bold">{{ summary.totalClients }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Status Overview -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <UCard
            class="cursor-pointer hover:ring-2 ring-primary-500 transition-all"
            :class="{ 'ring-2': statusFilter === 'exceeded' }"
            @click="statusFilter = statusFilter === 'exceeded' ? 'all' : 'exceeded'"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Exceeded</p>
                <p class="text-2xl font-bold text-red-500">{{ summary.clientsExceeded }}</p>
              </div>
              <UIcon name="i-lucide-alert-triangle" class="w-8 h-8 text-red-500/30" />
            </div>
          </UCard>

          <UCard
            class="cursor-pointer hover:ring-2 ring-primary-500 transition-all"
            :class="{ 'ring-2': statusFilter === 'at_risk' }"
            @click="statusFilter = statusFilter === 'at_risk' ? 'all' : 'at_risk'"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">At Risk (80%+)</p>
                <p class="text-2xl font-bold text-amber-500">{{ summary.clientsAtRisk }}</p>
              </div>
              <UIcon name="i-lucide-alert-circle" class="w-8 h-8 text-amber-500/30" />
            </div>
          </UCard>

          <UCard
            class="cursor-pointer hover:ring-2 ring-primary-500 transition-all"
            :class="{ 'ring-2': statusFilter === 'on_track' }"
            @click="statusFilter = statusFilter === 'on_track' ? 'all' : 'on_track'"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">On Track (50-80%)</p>
                <p class="text-2xl font-bold text-emerald-500">{{ summary.clientsOnTrack }}</p>
              </div>
              <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-emerald-500/30" />
            </div>
          </UCard>

          <UCard
            class="cursor-pointer hover:ring-2 ring-primary-500 transition-all"
            :class="{ 'ring-2': statusFilter === 'under_utilized' }"
            @click="statusFilter = statusFilter === 'under_utilized' ? 'all' : 'under_utilized'"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Under-Utilized (&lt;50%)</p>
                <p class="text-2xl font-bold text-blue-500">{{ summary.clientsUnderUtilized }}</p>
              </div>
              <UIcon name="i-lucide-info" class="w-8 h-8 text-blue-500/30" />
            </div>
          </UCard>
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Retainers Table -->
        <UCard v-else>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Retainer Usage</h3>
              <USelectMenu
                v-model="statusFilter"
                :items="statusOptions"
                value-key="value"
                class="w-40"
              />
            </div>
          </template>

          <UTable :data="filteredRetainers" :columns="columns">
            <template #client-cell="{ row: r }">
              <NuxtLink :to="`/agency/clients/${(r as any).clientId}`" class="hover:text-primary-500">
                <p class="font-medium">{{ (r as any).clientName }}</p>
                <p class="text-xs text-gray-500">{{ (r as any).projectsWithTime }} active projects</p>
              </NuxtLink>
            </template>

            <template #retainer-cell="{ row: r }">
              <span class="font-medium">{{ formatCurrency((r as any).retainerAmount) }}</span>
              <span class="text-gray-500">/mo</span>
            </template>

            <template #used-cell="{ row: r }">
              <div>
                <p class="font-medium">{{ formatCurrency((r as any).amountUsed) }}</p>
                <p class="text-xs text-gray-500">{{ (r as any).hoursUsed.toFixed(1) }}h logged</p>
              </div>
            </template>

            <template #remaining-cell="{ row: r }">
              <span :class="(r as any).remaining >= 0 ? 'text-emerald-500' : 'text-red-500'">
                {{ formatCurrency((r as any).remaining) }}
              </span>
            </template>

            <template #utilization-cell="{ row: r }">
              <div class="flex items-center gap-2">
                <UProgress
                  :value="Math.min((r as any).utilizationRate, 100)"
                  :color="getUtilizationColor((r as any).utilizationRate)"
                  size="sm"
                  class="w-20"
                />
                <span class="text-sm font-medium">{{ formatPercent((r as any).utilizationRate) }}</span>
              </div>
            </template>

            <template #status-cell="{ row: r }">
              <UBadge :color="getStatusColor((r as any).status)" variant="subtle">
                {{ getStatusLabel((r as any).status) }}
              </UBadge>
            </template>

            <template #actions-cell="{ row: r }">
              <UDropdownMenu
                :items="[[
                  { label: 'View Client', icon: 'i-lucide-eye', to: `/agency/clients/${(r as any).clientId}` },
                  { label: 'View Time Entries', icon: 'i-lucide-clock', to: `/agency/time?client=${(r as any).clientId}` }
                ]]"
              >
                <UButton variant="ghost" icon="i-lucide-more-vertical" size="xs" />
              </UDropdownMenu>
            </template>
          </UTable>

          <div v-if="filteredRetainers.length === 0" class="text-center text-gray-500 py-8">
            <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No retainer clients found</p>
            <p class="text-sm">Add retainer billing to clients to track their usage here</p>
          </div>
        </UCard>

        <!-- Tips Card -->
        <UCard class="mt-6">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-amber-500" />
              <h3 class="font-semibold">Retainer Management Tips</h3>
            </div>
          </template>
          <ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="w-4 h-4 mt-0.5 text-emerald-500" />
              <span><strong>Exceeded:</strong> Consider discussing scope expansion or additional billing with the client.</span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="w-4 h-4 mt-0.5 text-emerald-500" />
              <span><strong>At Risk:</strong> Review remaining tasks and prioritize to stay within budget.</span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="w-4 h-4 mt-0.5 text-emerald-500" />
              <span><strong>Under-Utilized:</strong> Proactively reach out to clients about using their remaining hours.</span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="w-4 h-4 mt-0.5 text-emerald-500" />
              <span><strong>Best Practice:</strong> Review retainer status weekly to avoid surprises at month end.</span>
            </li>
          </ul>
        </UCard>
      </div>
    </UDashboardPanel>
  </div>
</template>
