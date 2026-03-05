<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const { data, status } = useFetch('/api/agency/rate-cards/variance')

const summary = computed(() => data.value?.summary || { totalInvoicesScanned: 0, totalFlagged: 0, totalPotentialLoss: 0, topOffenders: [] })
const flagged = computed(() => data.value?.flaggedInvoices || [])
const errorMsg = computed(() => (data.value as any)?.error || '')

// Sort state
const sortBy = ref<'variance' | 'loss' | 'date' | 'contact'>('variance')

const sortedFlagged = computed(() => {
  const items = [...flagged.value]
  switch (sortBy.value) {
    case 'variance':
      return items.sort((a: any, b: any) => a.variance - b.variance)
    case 'loss':
      return items.sort((a: any, b: any) => b.potentialLoss - a.potentialLoss)
    case 'date':
      return items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    case 'contact':
      return items.sort((a: any, b: any) => a.contact.localeCompare(b.contact))
    default:
      return items
  }
})

const sortOptions = [
  { label: 'Worst Variance', value: 'variance' },
  { label: 'Highest Loss', value: 'loss' },
  { label: 'Most Recent', value: 'date' },
  { label: 'Contact', value: 'contact' },
]

// Table columns
const columns = [
  { accessorKey: 'contact', header: 'Contact' },
  { accessorKey: 'lineItem', header: 'Line Item' },
  { accessorKey: 'charged', header: 'Charged' },
  { accessorKey: 'expected', header: 'Rate Card' },
  { accessorKey: 'variance', header: 'Variance' },
  { accessorKey: 'potentialLoss', header: 'Loss' },
  { accessorKey: 'confidence', header: 'Match' },
]

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val)
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
}

function varianceColor(variance: number) {
  if (variance <= -25) return 'error'
  if (variance <= -15) return 'warning'
  return 'info'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-default">
      <div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            size="sm"
            to="/agency/rate-cards"
          />
          <h1 class="text-xl font-semibold">Rate Card Variance</h1>
        </div>
        <p class="text-sm text-muted mt-0.5 ml-8">
          Compare Xero invoices against rate card prices to detect undercharging
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">Sort by</span>
        <USelectMenu
          v-model="sortBy"
          :items="sortOptions"
          value-key="value"
          class="w-40"
        />
      </div>
    </div>

    <div class="flex-1 overflow-auto px-6 py-4">
      <!-- Loading -->
      <div v-if="status === 'pending'" class="flex justify-center py-12">
        <div class="text-center">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted mb-3" />
          <p class="text-sm text-muted">Scanning Xero invoices against rate card...</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="errorMsg" class="max-w-lg mx-auto mt-12">
        <UAlert
          icon="i-lucide-info"
          color="info"
          :title="errorMsg"
          description="Import your rate card CSV first, then return to compare invoices."
        />
      </div>

      <template v-else>
        <!-- Summary Cards -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="p-4 rounded-lg bg-elevated border border-default">
            <p class="text-sm text-muted">Invoices Scanned</p>
            <p class="text-2xl font-bold mt-1">{{ summary.totalInvoicesScanned }}</p>
          </div>
          <div class="p-4 rounded-lg bg-elevated border border-default">
            <p class="text-sm text-muted">Flagged Items</p>
            <p class="text-2xl font-bold mt-1" :class="summary.totalFlagged > 0 ? 'text-warning' : ''">
              {{ summary.totalFlagged }}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-elevated border border-default">
            <p class="text-sm text-muted">Potential Revenue Lost</p>
            <p class="text-2xl font-bold mt-1 text-error">
              {{ formatCurrency(summary.totalPotentialLoss) }}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-elevated border border-default">
            <p class="text-sm text-muted">Top Offender</p>
            <p class="text-lg font-bold mt-1 truncate">
              {{ summary.topOffenders?.[0]?.contact || '-' }}
            </p>
            <p v-if="summary.topOffenders?.[0]" class="text-xs text-muted">
              {{ summary.topOffenders[0].flagCount }} items, {{ formatCurrency(summary.topOffenders[0].totalLoss) }}
            </p>
          </div>
        </div>

        <!-- Flagged Items Table -->
        <div v-if="flagged.length === 0" class="text-center py-12 text-muted">
          <UIcon name="i-lucide-check-circle" class="size-12 mx-auto mb-3 text-success opacity-50" />
          <p class="text-lg font-medium">No undercharging detected</p>
          <p class="text-sm mt-1">All scanned invoices are at or above rate card prices.</p>
        </div>

        <UTable v-else :data="sortedFlagged" :columns="columns">
          <template #contact-cell="{ row }">
            <div>
              <p class="font-medium">{{ row.original.contact }}</p>
              <p class="text-xs text-muted">
                {{ row.original.invoiceNumber }} &middot; {{ formatDate(row.original.date) }}
              </p>
            </div>
          </template>
          <template #lineItem-cell="{ row }">
            <div class="max-w-xs">
              <p class="text-sm truncate" :title="row.original.lineItem.description">
                {{ row.original.lineItem.description }}
              </p>
              <p class="text-xs text-muted mt-0.5">
                Rate card: {{ row.original.rateCardItem.serviceName }}
              </p>
            </div>
          </template>
          <template #charged-cell="{ row }">
            <span class="font-mono">{{ formatCurrency(row.original.lineItem.charged) }}</span>
          </template>
          <template #expected-cell="{ row }">
            <span class="font-mono text-muted">
              {{ formatCurrency(row.original.rateCardItem.price) }}
              <span class="text-xs">/{{ row.original.rateCardItem.unit }}</span>
            </span>
          </template>
          <template #variance-cell="{ row }">
            <UBadge :color="varianceColor(row.original.variance)" variant="subtle">
              {{ row.original.variance }}%
            </UBadge>
          </template>
          <template #potentialLoss-cell="{ row }">
            <span class="font-mono font-medium text-error">
              {{ formatCurrency(row.original.potentialLoss) }}
            </span>
          </template>
          <template #confidence-cell="{ row }">
            <span class="text-xs text-muted">
              {{ Math.round(row.original.rateCardItem.confidence * 100) }}%
            </span>
          </template>
        </UTable>

        <!-- Top Offenders -->
        <div v-if="summary.topOffenders?.length > 1" class="mt-8">
          <h3 class="text-sm font-semibold text-muted mb-3 uppercase tracking-wider">Top Offenders</h3>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="offender in summary.topOffenders"
              :key="offender.contact"
              class="p-3 rounded-lg border border-default"
            >
              <p class="font-medium truncate">{{ offender.contact }}</p>
              <div class="flex items-center justify-between mt-1">
                <span class="text-sm text-muted">{{ offender.flagCount }} items</span>
                <span class="text-sm font-mono text-error">{{ formatCurrency(offender.totalLoss) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
