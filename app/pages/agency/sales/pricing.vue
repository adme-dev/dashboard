<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Job Pricing',
  middleware: ['sales']
})

// Filters
const activeFilter = ref<'all' | 'active' | 'inactive'>('active')
const typeFilter = ref<string>('all')

// Type options
const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Milestone', value: 'milestone' }
]

const activeOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
]

// Fetch job pricing
const { data: pricingData, pending, error } = await useFetch('/api/agency/pricing', {
  query: computed(() => ({
    isActive: activeFilter.value === 'all' ? undefined : activeFilter.value === 'active',
    pricingType: typeFilter.value === 'all' ? undefined : typeFilter.value
  }))
})

const pricing = computed(() => (pricingData.value?.pricing || []) as any[])

// Summary stats
const summary = computed(() => {
  if (!pricing.value.length) return { total: 0, active: 0, totalValue: 0, invoiced: 0, remaining: 0 }

  const active = pricing.value.filter(p => p.isActive).length
  const totalValue = pricing.value.reduce((sum, p) => sum + (p.agreedTotal || 0), 0)
  const invoiced = pricing.value.reduce((sum, p) => sum + (p.invoicedAmount || 0), 0)
  const remaining = pricing.value.reduce((sum, p) => sum + (p.remainingAmount || 0), 0)

  return {
    total: pricing.value.length,
    active,
    totalValue,
    invoiced,
    remaining
  }
})

// Format helpers
const formatCurrency = (value: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0
  }).format(value)
}

// Pricing type badge
const getPricingTypeColor = (type: string): 'primary' | 'warning' | 'secondary' | 'success' | 'neutral' => {
  switch (type) {
    case 'fixed': return 'primary'
    case 'hourly': return 'warning'
    case 'retainer': return 'secondary'
    case 'milestone': return 'success'
    default: return 'neutral'
  }
}

// Table columns
const columns: any[] = [
  { key: 'job', label: 'Job/Project' },
  { key: 'client', label: 'Client' },
  { key: 'type', label: 'Type' },
  { key: 'agreedTotal', label: 'Agreed Total', sortable: true },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'status', label: 'Status' },
  { key: 'approvedAt', label: 'Approved' },
  { key: 'actions', label: '' }
]

// Actions
const getActions = (item: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', onSelect: () => navigateTo(`/agency/sales/pricing/${item.id}`) },
    { label: 'View Quote', icon: 'i-lucide-file-text', onSelect: () => navigateTo(`/agency/sales/quotes/${item.quoteId}`), disabled: !item.quoteId },
    { label: 'View Brief', icon: 'i-lucide-clipboard', onSelect: () => navigateTo(`/agency/briefs/${item.briefId}`), disabled: !item.briefId }
  ],
  [
    { label: 'Create Invoice', icon: 'i-lucide-receipt' },
    { label: 'Record Payment', icon: 'i-lucide-credit-card' }
  ],
  [
    { label: item.isActive ? 'Deactivate' : 'Reactivate', icon: item.isActive ? 'i-lucide-pause' : 'i-lucide-play' }
  ]
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Job Pricing">
        <template #right>
          <UButton
            label="New Quote"
            icon="i-lucide-plus"
            color="primary"
            @click="navigateTo('/agency/sales/quotes/new')"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Error state -->
        <UCard v-if="error" class="mb-6 border-red-500/50">
          <div class="flex items-center gap-3 text-red-500">
            <UIcon name="i-lucide-alert-circle" class="w-5 h-5" />
            <div>
              <p class="font-medium">Access Denied</p>
              <p class="text-sm text-gray-500">You don't have permission to view job pricing. Contact your administrator.</p>
            </div>
          </div>
        </UCard>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Jobs</p>
                <p class="text-3xl font-bold">{{ summary.total }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Active</p>
                <p class="text-3xl font-bold text-emerald-500">{{ summary.active }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
                <p class="text-3xl font-bold">{{ formatCurrency(summary.totalValue) }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Invoiced</p>
                <p class="text-3xl font-bold text-blue-500">{{ formatCurrency(summary.invoiced) }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Remaining</p>
                <p class="text-3xl font-bold text-amber-500">{{ formatCurrency(summary.remaining) }}</p>
              </div>
            </UCard>
          </div>

          <!-- Filters -->
          <div class="flex flex-wrap gap-4 mb-6">
            <USelectMenu
              v-model="activeFilter"
              :options="activeOptions"
              placeholder="Status"
              class="w-32"
            />

            <USelectMenu
              v-model="typeFilter"
              :options="typeOptions"
              placeholder="Pricing Type"
              class="w-40"
            />
          </div>

          <!-- Pricing Table -->
          <UCard>
            <UTable
              :columns="columns"
              :rows="pricing"
              :loading="pending"
              :empty-state="{ icon: 'i-lucide-dollar-sign', label: 'No job pricing found' }"
            >
              <template #job-data="{ row: r }">
                <div>
                  <p class="font-medium">
                    {{ (r as any).brief?.title || (r as any).project?.name || (r as any).quote?.title || 'Untitled Job' }}
                  </p>
                  <p v-if="(r as any).brief?.referenceNumber" class="text-xs text-gray-500 font-mono">
                    {{ (r as any).brief.referenceNumber }}
                  </p>
                </div>
              </template>

              <template #client-data="{ row: r }">
                <div v-if="(r as any).client">
                  <p class="font-medium">{{ (r as any).client.name }}</p>
                </div>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #type-data="{ row: r }">
                <UBadge :color="getPricingTypeColor((r as any).pricingType)" variant="subtle">
                  {{ (r as any).pricingType }}
                </UBadge>
              </template>

              <template #agreedTotal-data="{ row: r }">
                <span class="font-medium">{{ formatCurrency((r as any).agreedTotal, (r as any).currency) }}</span>
              </template>

              <template #invoiced-data="{ row: r }">
                <span>{{ formatCurrency((r as any).invoicedAmount, (r as any).currency) }}</span>
              </template>

              <template #remaining-data="{ row: r }">
                <span :class="(r as any).remainingAmount > 0 ? 'text-amber-500' : 'text-emerald-500'">
                  {{ formatCurrency((r as any).remainingAmount, (r as any).currency) }}
                </span>
              </template>

              <template #status-data="{ row: r }">
                <UBadge :color="(r as any).isActive ? 'success' : 'neutral'" variant="subtle">
                  {{ (r as any).isActive ? 'Active' : 'Inactive' }}
                </UBadge>
              </template>

              <template #approvedAt-data="{ row: r }">
                <div v-if="(r as any).approvedAt">
                  <p>{{ format(new Date((r as any).approvedAt), 'MMM dd, yyyy') }}</p>
                  <p v-if="(r as any).approver" class="text-xs text-gray-500">by {{ (r as any).approver.name }}</p>
                </div>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #actions-data="{ row: r }">
                <UDropdownMenu :items="getActions(r as any)">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-more-horizontal"
                  />
                </UDropdownMenu>
              </template>
            </UTable>
          </UCard>
        </template>
      </div>
    </UDashboardPanel>
  </div>
</template>
