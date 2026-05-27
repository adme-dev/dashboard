<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()

const activeTab = ref('current')
const invoiceQuery = computed(() => {
  if (activeTab.value === 'current' || activeTab.value === 'history') {
    return { view: activeTab.value }
  }
  if (activeTab.value === 'overdue') {
    return { status: 'overdue' }
  }
  return {}
})

const { data, pending } = useFetch('/api/portal/invoices', {
  query: invoiceQuery
})

const tabs = [
  { label: 'Current billing', value: 'current' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Billing history', value: 'history' },
  { label: 'All', value: 'all' }
]

const agingBuckets = computed(() => {
  const aging = data.value?.summary?.aging
  return [
    { label: 'Current', key: 'current', count: aging?.current?.count ?? 0, amount: aging?.current?.amount ?? 0, color: 'neutral' },
    { label: '1-30 days', key: 'thirty', count: aging?.thirty?.count ?? 0, amount: aging?.thirty?.amount ?? 0, color: 'warning' },
    { label: '31-60 days', key: 'sixty', count: aging?.sixty?.count ?? 0, amount: aging?.sixty?.amount ?? 0, color: 'error' },
    { label: '60+ days', key: 'ninetyPlus', count: aging?.ninetyPlus?.count ?? 0, amount: aging?.ninetyPlus?.amount ?? 0, color: 'error' }
  ]
})

// Detail slideover
const selectedInvoiceId = ref<string | null>(null)
const showDetail = ref(false)

const { data: detailData, pending: detailPending } = useFetch(
  computed(() => selectedInvoiceId.value ? `/api/portal/invoices/${selectedInvoiceId.value}` : null),
  { watch: [selectedInvoiceId] }
)

function openDetail(invoiceId: string) {
  selectedInvoiceId.value = invoiceId
  showDetail.value = true
}

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(amount)
}

function daysOverdue(dueDate: string, status: string): number {
  if (status === 'paid') return 0
  const due = new Date(dueDate)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
}

const statusColors: Record<string, string> = {
  paid: 'success',
  sent: 'warning',
  overdue: 'error',
  draft: 'neutral'
}

const agingColors: Record<string, string> = {
  'current': 'neutral',
  '30d': 'warning',
  '60d': 'error',
  '90+': 'error'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div v-if="!hasPermission('canViewInvoices')" class="text-center py-20">
      <UIcon name="i-lucide-lock" class="w-12 h-12 text-muted mx-auto mb-4" />
      <h2 class="text-xl font-semibold">
        Access Restricted
      </h2>
      <p class="text-muted mt-1">
        You do not have permission to view invoices.
      </p>
    </div>

    <template v-else>
      <h1 class="text-2xl font-bold">
        Invoices
      </h1>

      <!-- Summary Cards -->
      <div v-if="data?.summary" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">
              Outstanding
            </p>
            <p class="text-2xl font-bold text-warning">
              {{ formatCurrency(data.summary.totalOutstanding) }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">
              Paid This Year
            </p>
            <p class="text-2xl font-bold text-success">
              {{ formatCurrency(data.summary.totalPaid) }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">
              Overdue
            </p>
            <p class="text-2xl font-bold" :class="data.summary.overdue > 0 ? 'text-error' : 'text-muted'">
              {{ data.summary.overdue }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">
              Total Billed
            </p>
            <p class="text-2xl font-bold">
              {{ formatCurrency(data.summary.totalBilled) }}
            </p>
          </div>
        </UCard>
      </div>

      <UCard v-if="data?.summary">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-chart-no-axes-column-increasing" class="text-primary" />
            <span class="font-semibold">Receivables aging</span>
          </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <button
            v-for="bucket in agingBuckets"
            :key="bucket.key"
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = bucket.key === 'current' ? 'current' : 'overdue'"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm text-muted">
                {{ bucket.label }}
              </p>
              <UBadge :color="(bucket.color as any)" variant="subtle" size="xs">
                {{ bucket.count }}
              </UBadge>
            </div>
            <p class="mt-2 text-lg font-semibold">
              {{ formatCurrency(bucket.amount) }}
            </p>
          </button>
        </div>
      </UCard>

      <UCard v-if="data?.summary">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-landmark" class="text-primary" />
            <span class="font-semibold">Commercial summary</span>
          </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'current'"
          >
            <p class="text-xs text-muted">
              Next due date
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ formatDate(data.summary.nextDueDate) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.summary.current }} current invoice{{ data.summary.current === 1 ? '' : 's' }}
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'overdue'"
          >
            <p class="text-xs text-muted">
              Overdue balance
            </p>
            <p class="mt-1 text-sm font-semibold" :class="data.summary.overdueAmount > 0 ? 'text-error' : ''">
              {{ formatCurrency(data.summary.overdueAmount) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.summary.overdue }} overdue invoice{{ data.summary.overdue === 1 ? '' : 's' }}
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'history'"
          >
            <p class="text-xs text-muted">
              Last paid
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ formatDate(data.summary.lastPaidDate) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.summary.history }} paid invoice{{ data.summary.history === 1 ? '' : 's' }}
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
            @click="activeTab = 'history'"
          >
            <p class="text-xs text-muted">
              Average paid invoice
            </p>
            <p class="mt-1 text-sm font-semibold">
              {{ formatCurrency(data.summary.averagePaidInvoice) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ formatCurrency(data.summary.totalPaid) }} paid total
            </p>
          </button>
        </div>
      </UCard>

      <UTabs v-model="activeTab" :items="tabs" />

      <div v-if="pending" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-16 rounded-lg bg-elevated animate-pulse" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default">
              <th class="text-left py-3 px-4 font-medium text-muted">
                Invoice
              </th>
              <th class="text-left py-3 px-4 font-medium text-muted">
                Date
              </th>
              <th class="text-left py-3 px-4 font-medium text-muted">
                Due
              </th>
              <th class="text-left py-3 px-4 font-medium text-muted">
                Project
              </th>
              <th class="text-right py-3 px-4 font-medium text-muted">
                Amount
              </th>
              <th class="text-right py-3 px-4 font-medium text-muted">
                Balance
              </th>
              <th class="text-center py-3 px-4 font-medium text-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in data?.invoices"
              :key="invoice.id"
              class="border-b border-default/50 hover:bg-elevated transition-colors cursor-pointer"
              @click="openDetail(invoice.id)"
            >
              <td class="py-3 px-4 font-medium">
                {{ invoice.invoiceNumber }}
              </td>
              <td class="py-3 px-4 text-muted">
                {{ formatDate(invoice.issueDate) }}
              </td>
              <td class="py-3 px-4" :class="invoice.isOverdue ? 'text-error font-medium' : 'text-muted'">
                {{ formatDate(invoice.dueDate) }}
              </td>
              <td class="py-3 px-4 text-muted">
                {{ invoice.projectName || '-' }}
              </td>
              <td class="py-3 px-4 text-right">
                {{ formatCurrency(invoice.totalAmount) }}
              </td>
              <td class="py-3 px-4 text-right font-medium">
                {{ invoice.amountDue > 0 ? formatCurrency(invoice.amountDue) : '-' }}
              </td>
              <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <UBadge :color="(statusColors[invoice.status] as any) || 'neutral'" variant="subtle" size="xs">
                    {{ invoice.status }}
                  </UBadge>
                  <UBadge
                    v-if="invoice.isOverdue && daysOverdue(invoice.dueDate, invoice.status) > 0"
                    color="error"
                    variant="outline"
                    size="xs"
                  >
                    {{ daysOverdue(invoice.dueDate, invoice.status) }}d overdue
                  </UBadge>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="!pending && (!data?.invoices || data.invoices.length === 0)" class="text-center text-muted py-12">
        No invoices found
      </p>
    </template>

    <!-- Invoice Detail Slideover -->
    <USlideover v-model:open="showDetail">
      <template #content>
        <div class="p-6 space-y-6">
          <div v-if="detailPending" class="space-y-4">
            <div class="h-8 w-48 bg-elevated animate-pulse rounded" />
            <div class="h-32 bg-elevated animate-pulse rounded-lg" />
          </div>

          <template v-else-if="detailData?.invoice">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {{ detailData.invoice.invoiceNumber }}
                </h2>
                <p v-if="detailData.invoice.projectName" class="text-sm text-muted">
                  {{ detailData.invoice.projectName }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge :color="(statusColors[detailData.invoice.status] as any) || 'neutral'" variant="subtle">
                  {{ detailData.invoice.status }}
                </UBadge>
                <UBadge
                  v-if="detailData.invoice.isOverdue"
                  :color="(agingColors[detailData.invoice.agingBucket] as any) || 'error'"
                  variant="outline"
                >
                  {{ detailData.invoice.daysOverdue }}d overdue
                </UBadge>
              </div>
            </div>

            <!-- Invoice Info -->
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-muted">
                  Issue Date
                </p>
                <p class="font-medium">
                  {{ formatDate(detailData.invoice.issueDate) }}
                </p>
              </div>
              <div>
                <p class="text-muted">
                  Due Date
                </p>
                <p class="font-medium" :class="detailData.invoice.isOverdue ? 'text-error' : ''">
                  {{ formatDate(detailData.invoice.dueDate) }}
                </p>
              </div>
              <div v-if="detailData.invoice.paidDate">
                <p class="text-muted">
                  Paid Date
                </p>
                <p class="font-medium text-success">
                  {{ formatDate(detailData.invoice.paidDate) }}
                </p>
              </div>
              <div v-if="detailData.invoice.paymentTerms">
                <p class="text-muted">
                  Payment Terms
                </p>
                <p class="font-medium">
                  {{ detailData.invoice.paymentTerms.replace('_', ' ') }}
                </p>
              </div>
            </div>

            <!-- Line Items -->
            <div v-if="detailData.lineItems.length">
              <h3 class="font-semibold text-sm mb-3">
                Line Items
              </h3>
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-default">
                    <th class="text-left py-2 font-medium text-muted">
                      Description
                    </th>
                    <th class="text-right py-2 font-medium text-muted">
                      Qty
                    </th>
                    <th class="text-right py-2 font-medium text-muted">
                      Price
                    </th>
                    <th class="text-right py-2 font-medium text-muted">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in detailData.lineItems" :key="item.id" class="border-b border-default/50">
                    <td class="py-2">
                      {{ item.description }}
                    </td>
                    <td class="py-2 text-right text-muted">
                      {{ item.quantity }}
                    </td>
                    <td class="py-2 text-right text-muted">
                      {{ formatCurrency(item.unitPrice) }}
                    </td>
                    <td class="py-2 text-right font-medium">
                      {{ formatCurrency(item.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Totals -->
            <div class="border-t border-default pt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">Subtotal</span>
                <span>{{ formatCurrency(detailData.invoice.subtotal) }}</span>
              </div>
              <div v-if="detailData.invoice.discountAmount > 0" class="flex justify-between">
                <span class="text-muted">Discount</span>
                <span class="text-success">-{{ formatCurrency(detailData.invoice.discountAmount) }}</span>
              </div>
              <div v-if="detailData.invoice.taxAmount > 0" class="flex justify-between">
                <span class="text-muted">Tax ({{ detailData.invoice.taxRate }}%)</span>
                <span>{{ formatCurrency(detailData.invoice.taxAmount) }}</span>
              </div>
              <div class="flex justify-between font-semibold text-base pt-2 border-t border-default">
                <span>Total</span>
                <span>{{ formatCurrency(detailData.invoice.totalAmount) }}</span>
              </div>
              <div v-if="detailData.invoice.amountPaid > 0" class="flex justify-between text-success">
                <span>Paid</span>
                <span>-{{ formatCurrency(detailData.invoice.amountPaid) }}</span>
              </div>
              <div v-if="detailData.invoice.amountDue > 0" class="flex justify-between font-semibold text-warning">
                <span>Amount Due</span>
                <span>{{ formatCurrency(detailData.invoice.amountDue) }}</span>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="detailData.invoice.notes" class="text-sm">
              <h3 class="font-semibold mb-1">
                Notes
              </h3>
              <p class="text-muted whitespace-pre-wrap">
                {{ detailData.invoice.notes }}
              </p>
            </div>
          </template>
        </div>
      </template>
    </USlideover>
  </div>
</template>
