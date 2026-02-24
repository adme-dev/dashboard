<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Quotes',
  middleware: ['sales']
})

// Filters
const statusFilter = ref<string>('all')
const searchQuery = ref('')

// Status options
const statusOptions = [
  { label: 'All Quotes', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending' },
  { label: 'Sent', value: 'sent' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Expired', value: 'expired' }
]

// Fetch quotes
const { data: quotesData, pending, refresh, error } = await useFetch('/api/agency/quotes', {
  query: computed(() => ({
    status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    search: searchQuery.value || undefined
  }))
})

const quotes = computed(() => (quotesData.value?.quotes || []) as any[])

// Summary stats
const summary = computed(() => {
  if (!quotes.value.length) return { total: 0, draft: 0, pending: 0, accepted: 0, totalValue: 0 }

  const draft = quotes.value.filter(q => q.status === 'draft').length
  const pending = quotes.value.filter(q => ['pending', 'sent'].includes(q.status)).length
  const accepted = quotes.value.filter(q => q.status === 'accepted').length
  const totalValue = quotes.value.reduce((sum, q) => sum + (q.total || 0), 0)

  return {
    total: quotes.value.length,
    draft,
    pending,
    accepted,
    totalValue
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

// Status badge
const getStatusColor = (status: string): 'neutral' | 'warning' | 'primary' | 'info' | 'success' | 'error' | 'secondary' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'pending': return 'warning'
    case 'sent': return 'primary'
    case 'viewed': return 'info'
    case 'accepted': return 'success'
    case 'rejected': return 'error'
    case 'expired': return 'neutral'
    case 'revised': return 'secondary'
    default: return 'neutral'
  }
}

// Table columns
const columns: any[] = [
  { key: 'quoteNumber', label: 'Quote #', sortable: true },
  { key: 'title', label: 'Title' },
  { key: 'client', label: 'Client' },
  { key: 'total', label: 'Total', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'validUntil', label: 'Valid Until' },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'actions', label: '' }
]

// Actions
const getActions = (quote: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', click: () => navigateTo(`/agency/sales/quotes/${quote.id}`) },
    { label: 'Edit Quote', icon: 'i-lucide-pencil', click: () => navigateTo(`/agency/sales/quotes/${quote.id}/edit`), disabled: quote.status === 'accepted' },
    { label: 'Duplicate', icon: 'i-lucide-copy', click: () => duplicateQuote(quote) }
  ],
  [
    { label: 'Send to Client', icon: 'i-lucide-send', click: () => sendQuote(quote), disabled: ['accepted', 'rejected', 'sent'].includes(quote.status) },
    { label: 'Mark as Accepted', icon: 'i-lucide-check-circle', click: () => acceptQuote(quote), disabled: quote.status === 'accepted' },
    { label: 'Mark as Rejected', icon: 'i-lucide-x-circle', click: () => rejectQuote(quote), disabled: quote.status === 'rejected' }
  ],
  [
    { label: 'Download PDF', icon: 'i-lucide-download' }
  ]
]

// Quote actions
const duplicateQuote = async (quote: any) => {
  // TODO: Implement duplicate
  console.log('Duplicate quote:', quote.quoteNumber)
}

const sendQuote = async (quote: any) => {
  try {
    await $fetch(`/api/agency/quotes/${quote.id}`, {
      method: 'PUT',
      body: { status: 'sent' }
    })
    refresh()
  } catch (err) {
    console.error('Failed to send quote:', err)
  }
}

const acceptQuote = async (quote: any) => {
  try {
    await $fetch(`/api/agency/quotes/${quote.id}/accept`, {
      method: 'POST'
    })
    refresh()
  } catch (err) {
    console.error('Failed to accept quote:', err)
  }
}

const rejectQuote = async (quote: any) => {
  try {
    await $fetch(`/api/agency/quotes/${quote.id}`, {
      method: 'PUT',
      body: { status: 'rejected' }
    })
    refresh()
  } catch (err) {
    console.error('Failed to reject quote:', err)
  }
}

// New quote modal
const showNewQuoteModal = ref(false)
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Quotes">
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
              <p class="text-sm text-gray-500">You don't have permission to view quotes. Contact your administrator.</p>
            </div>
          </div>
        </UCard>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Quotes</p>
                <p class="text-3xl font-bold">{{ summary.total }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Draft</p>
                <p class="text-3xl font-bold text-gray-500">{{ summary.draft }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Pending/Sent</p>
                <p class="text-3xl font-bold text-amber-500">{{ summary.pending }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Accepted</p>
                <p class="text-3xl font-bold text-emerald-500">{{ summary.accepted }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
                <p class="text-3xl font-bold text-primary-500">{{ formatCurrency(summary.totalValue) }}</p>
              </div>
            </UCard>
          </div>

          <!-- Filters -->
          <div class="flex flex-wrap gap-4 mb-6">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Search quotes..."
              class="w-64"
            />

            <USelectMenu
              v-model="statusFilter"
              :options="statusOptions"
              placeholder="Status"
              class="w-40"
            />
          </div>

          <!-- Quotes Table -->
          <UCard>
            <UTable
              :columns="columns"
              :rows="quotes"
              :loading="pending"
              :empty-state="{ icon: 'i-lucide-file-text', label: 'No quotes found' }"
            >
              <template #quoteNumber-data="{ row: r }">
                <NuxtLink
                  :to="`/agency/sales/quotes/${(r as any).id}`"
                  class="font-mono font-medium text-primary-500 hover:underline"
                >
                  {{ (r as any).quoteNumber }}
                </NuxtLink>
              </template>

              <template #title-data="{ row: r }">
                <div class="max-w-xs truncate">
                  {{ (r as any).title }}
                </div>
              </template>

              <template #client-data="{ row: r }">
                <div v-if="(r as any).client">
                  <p class="font-medium">{{ (r as any).client.name }}</p>
                  <p class="text-xs text-gray-500">{{ (r as any).client.email }}</p>
                </div>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #total-data="{ row: r }">
                <span class="font-medium">{{ formatCurrency((r as any).total, (r as any).currency) }}</span>
              </template>

              <template #status-data="{ row: r }">
                <UBadge :color="getStatusColor((r as any).status)" variant="subtle">
                  {{ (r as any).status }}
                </UBadge>
              </template>

              <template #validUntil-data="{ row: r }">
                <span v-if="(r as any).validUntil">
                  {{ format(new Date((r as any).validUntil), 'MMM dd, yyyy') }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #createdAt-data="{ row: r }">
                {{ format(new Date((r as any).createdAt), 'MMM dd, yyyy') }}
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
