<script setup lang="ts">
definePageMeta({
  title: 'Sales',
  middleware: ['sales']
})

// Fetch summary data
const { data: quotesData } = await useFetch('/api/agency/quotes', {
  query: { limit: 5 }
})

const { data: pricingData } = await useFetch('/api/agency/pricing', {
  query: { limit: 5, isActive: true }
})

const recentQuotes = computed(() => (quotesData.value?.quotes || []) as any[])
const activePricing = computed(() => (pricingData.value?.pricing || []) as any[])

// Format helpers
const formatCurrency = (value: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0
  }).format(value)
}

// Quick stats
const stats = computed(() => {
  const quotesTotal = quotesData.value?.pagination?.total || 0
  const pricingTotal = pricingData.value?.pagination?.total || 0
  const pendingQuotes = recentQuotes.value.filter(q => ['pending', 'sent', 'draft'].includes(q.status)).length
  const totalPricingValue = activePricing.value.reduce((sum, p) => sum + (p.agreedTotal || 0), 0)

  return {
    quotesTotal,
    pricingTotal,
    pendingQuotes,
    totalPricingValue
  }
})

// Status badge
const getStatusColor = (status: string): 'neutral' | 'warning' | 'info' | 'success' | 'error' | 'primary' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'pending': return 'warning'
    case 'sent': return 'info'
    case 'accepted': return 'success'
    case 'rejected': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Sales Dashboard">
        <template #right>
          <UButton
            label="New Quote"
            icon="i-lucide-plus"
            color="primary"
            @click="navigateTo('/agency/sales/quotes/new')"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Quick Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <UCard>
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-file-text" class="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Quotes</p>
                <p class="text-2xl font-bold">{{ stats.quotesTotal }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                <p class="text-2xl font-bold">{{ stats.pendingQuotes }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Active Jobs</p>
                <p class="text-2xl font-bold">{{ stats.pricingTotal }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-lg bg-violet-500/10">
                <UIcon name="i-lucide-dollar-sign" class="w-6 h-6 text-violet-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Active Value</p>
                <p class="text-2xl font-bold">{{ formatCurrency(stats.totalPricingValue) }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Quick Links -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <UCard class="hover:ring-2 hover:ring-primary-500/50 transition cursor-pointer" @click="navigateTo('/agency/sales/quotes')">
            <div class="flex items-center gap-4">
              <UIcon name="i-lucide-file-text" class="w-8 h-8 text-primary-500" />
              <div>
                <h3 class="font-semibold">Quotes</h3>
                <p class="text-sm text-gray-500">Manage client proposals and quotes</p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 ml-auto text-gray-400" />
            </div>
          </UCard>

          <UCard class="hover:ring-2 hover:ring-primary-500/50 transition cursor-pointer" @click="navigateTo('/agency/sales/pricing')">
            <div class="flex items-center gap-4">
              <UIcon name="i-lucide-dollar-sign" class="w-8 h-8 text-emerald-500" />
              <div>
                <h3 class="font-semibold">Job Pricing</h3>
                <p class="text-sm text-gray-500">Track accepted jobs and billing</p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 ml-auto text-gray-400" />
            </div>
          </UCard>

          <UCard class="hover:ring-2 hover:ring-primary-500/50 transition cursor-pointer" @click="navigateTo('/agency/sales/templates')">
            <div class="flex items-center gap-4">
              <UIcon name="i-lucide-layout-template" class="w-8 h-8 text-amber-500" />
              <div>
                <h3 class="font-semibold">Price Templates</h3>
                <p class="text-sm text-gray-500">Reusable pricing items</p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 ml-auto text-gray-400" />
            </div>
          </UCard>
        </div>

        <!-- Recent Activity -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Recent Quotes -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Recent Quotes</h3>
                <UButton
                  variant="ghost"
                  color="primary"
                  size="sm"
                  label="View All"
                  trailing-icon="i-lucide-arrow-right"
                  @click="navigateTo('/agency/sales/quotes')"
                />
              </div>
            </template>

            <div class="space-y-4">
              <div
                v-for="quote in recentQuotes"
                :key="quote.id"
                class="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                @click="navigateTo(`/agency/sales/quotes/${quote.id}`)"
              >
                <div>
                  <p class="font-medium">{{ quote.title }}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs font-mono text-gray-500">{{ quote.quoteNumber }}</span>
                    <UBadge :color="getStatusColor(quote.status)" variant="subtle" size="xs">
                      {{ quote.status }}
                    </UBadge>
                  </div>
                </div>
                <span class="font-medium">{{ formatCurrency(quote.total) }}</span>
              </div>

              <p v-if="!recentQuotes.length" class="text-center text-gray-500 py-4">
                No quotes yet
              </p>
            </div>
          </UCard>

          <!-- Active Jobs -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Active Jobs</h3>
                <UButton
                  variant="ghost"
                  color="primary"
                  size="sm"
                  label="View All"
                  trailing-icon="i-lucide-arrow-right"
                  @click="navigateTo('/agency/sales/pricing')"
                />
              </div>
            </template>

            <div class="space-y-4">
              <div
                v-for="job in activePricing"
                :key="job.id"
                class="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                @click="navigateTo(`/agency/sales/pricing/${job.id}`)"
              >
                <div>
                  <p class="font-medium">{{ job.brief?.title || job.quote?.title || 'Untitled Job' }}</p>
                  <p class="text-xs text-gray-500">{{ job.client?.name || 'No client' }}</p>
                </div>
                <div class="text-right">
                  <p class="font-medium">{{ formatCurrency(job.agreedTotal) }}</p>
                  <p class="text-xs text-gray-500">{{ formatCurrency(job.remainingAmount) }} remaining</p>
                </div>
              </div>

              <p v-if="!activePricing.length" class="text-center text-gray-500 py-4">
                No active jobs
              </p>
            </div>
          </UCard>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
