<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()
const route = useRoute()
const router = useRouter()

const routeQueryString = (value: unknown) => Array.isArray(value) ? value[0] : value
const invoiceTabs = ['current', 'overdue', 'history', 'all']
const initialView = routeQueryString(route.query.view)
const initialStatus = routeQueryString(route.query.status)
type InvestmentPeriod = 'financial-year' | 'last-90-days' | 'all-time'

interface PortalInvoiceListItem {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string | null
  dueDate: string | null
  totalAmount: number
  amountDue: number
  projectName: string | null
  isOverdue: boolean
}

interface PortalInvoicesResponse {
  invoices: PortalInvoiceListItem[]
  summary: {
    aging: Record<string, { count: number, amount: number }>
  }
  paymentStatus: {
    outstanding: number
    openInvoiceCount: number
    overdueAmount: number
    overdueCount: number
    dueNext7Amount: number
    dueNext7Count: number
    lastPaymentDate: string | null
    financialYearCashPaid: number
    financialYearCreditsApplied: number
  }
  investment: {
    period: InvestmentPeriod
    periodStart: string | null
    periodEnd: string | null
    totalInvoiced: number
    mediaAndSuppliers: number
    agencyServices: number
    gst: number
    unclassifiedAndAdjustments: number
    allocationAvailable: boolean
    channels: Array<{ name: string, amount: number }>
  }
}

interface PortalInvoiceDetailResponse {
  invoice: {
    invoiceNumber: string
    projectName: string | null
    status: string
    isOverdue: boolean
    agingBucket: string
    daysOverdue: number
    issueDate: string | null
    dueDate: string | null
    paidDate: string | null
    paymentTerms: string | null
    subtotal: number
    discountAmount: number
    taxAmount: number
    taxRate: number
    totalAmount: number
    amountPaid: number
    amountCredited: number
    amountDue: number
    notes: string | null
  }
  lineItems: Array<{
    id: string
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

const investmentPeriod = ref<InvestmentPeriod>('financial-year')
const investmentPeriodOptions = [
  { label: 'This financial year', value: 'financial-year' },
  { label: 'Last 90 days', value: 'last-90-days' },
  { label: 'All time', value: 'all-time' }
]

const activeTab = ref(
  typeof initialView === 'string' && invoiceTabs.includes(initialView)
    ? initialView
    : initialStatus === 'overdue'
      ? 'overdue'
      : 'current'
)
const invoiceQuery = computed<Record<string, string>>(() => {
  const query = { period: investmentPeriod.value }
  if (activeTab.value === 'current' || activeTab.value === 'history') {
    return { ...query, view: activeTab.value }
  }
  if (activeTab.value === 'overdue') {
    return { ...query, status: 'overdue' }
  }
  return query
})

const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>
const data = ref<PortalInvoicesResponse | null>(null)
const pending = ref(false)

async function refreshInvoices() {
  pending.value = true
  try {
    data.value = await apiFetch<PortalInvoicesResponse>('/api/portal/invoices', { query: invoiceQuery.value })
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

watch(invoiceQuery, () => {
  refreshInvoices()
}, { immediate: true })

watch(activeTab, (tab) => {
  const query: Record<string, string> = {}
  if (tab === 'current' || tab === 'history') query.view = tab
  if (tab === 'overdue') query.status = 'overdue'

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(query).toString()
  if (current !== next) {
    router.replace({ query })
  }
})

watch(
  () => [route.query.view, route.query.status],
  () => {
    const view = routeQueryString(route.query.view)
    const status = routeQueryString(route.query.status)
    if (typeof view === 'string' && invoiceTabs.includes(view)) {
      activeTab.value = view
    } else if (status === 'overdue') {
      activeTab.value = 'overdue'
    } else {
      activeTab.value = 'current'
    }
  }
)

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

const investmentCategories = computed(() => {
  const investment = data.value?.investment
  const categories = [
    {
      label: 'Media & external suppliers',
      description: 'Advertising platforms and external delivery',
      amount: investment?.mediaAndSuppliers ?? 0,
      colorClass: 'bg-info'
    },
    {
      label: 'Agency services',
      description: 'Strategy, creative, management and delivery',
      amount: investment?.agencyServices ?? 0,
      colorClass: 'bg-primary'
    },
    {
      label: 'GST',
      description: 'Goods and services tax',
      amount: investment?.gst ?? 0,
      colorClass: 'bg-warning'
    },
    {
      label: 'Unclassified & adjustments',
      description: 'Unallocated lines or reconciliation differences',
      amount: investment?.unclassifiedAndAdjustments ?? 0,
      colorClass: 'bg-neutral-500'
    }
  ]

  return categories.filter(category => category.label !== 'Unclassified & adjustments' || category.amount !== 0)
})

function investmentShare(amount: number): number {
  const total = Math.abs(Number(data.value?.investment?.totalInvoiced ?? 0))
  return total > 0 ? Math.max(0, (amount / total) * 100) : 0
}

// Detail slideover
const selectedInvoiceId = ref<string | null>(null)
const showDetail = ref(false)

const detailData = ref<PortalInvoiceDetailResponse | null>(null)
const detailPending = ref(false)

async function refreshDetail() {
  if (!selectedInvoiceId.value) {
    detailData.value = null
    return
  }
  detailPending.value = true
  try {
    detailData.value = await apiFetch<PortalInvoiceDetailResponse>(`/api/portal/invoices/${selectedInvoiceId.value}`)
  } catch {
    detailData.value = null
  } finally {
    detailPending.value = false
  }
}

watch(selectedInvoiceId, () => {
  refreshDetail()
})

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

function formatTaxRate(rate: number) {
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(rate)
}

function daysOverdue(dueDate: string | null, status: string): number {
  if (!dueDate || status === 'paid') return 0
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
  <div class="w-full p-6 space-y-6">
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
      <div>
        <h1 class="text-2xl font-bold">
          Invoices &amp; marketing investment
        </h1>
        <p class="mt-1 text-sm text-muted">
          See what is due and how your invoiced investment is allocated.
        </p>
      </div>

      <UCard v-if="data?.paymentStatus">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] lg:items-stretch">
          <div class="flex min-h-40 flex-col justify-between rounded-lg border border-default bg-elevated p-5">
            <div class="flex items-center gap-2 text-sm font-medium text-muted">
              <UIcon name="i-lucide-wallet-cards" class="size-4" />
              Amount currently due
            </div>
            <div class="mt-6">
              <p class="text-3xl font-semibold tracking-tight sm:text-4xl">
                {{ formatCurrency(data.paymentStatus.outstanding) }}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="subtle">
                  {{ data.paymentStatus.openInvoiceCount }} open invoice{{ data.paymentStatus.openInvoiceCount === 1 ? '' : 's' }}
                </UBadge>
                <UBadge v-if="data.paymentStatus.overdueCount > 0" color="error" variant="subtle">
                  {{ data.paymentStatus.overdueCount }} overdue · {{ formatCurrency(data.paymentStatus.overdueAmount) }}
                </UBadge>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-default bg-default sm:grid-cols-3">
            <div class="bg-default p-4">
              <p class="text-xs font-medium text-muted">
                Due in the next 7 days
              </p>
              <p class="mt-2 text-lg font-semibold">
                {{ formatCurrency(data.paymentStatus.dueNext7Amount) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ data.paymentStatus.dueNext7Count }} invoice{{ data.paymentStatus.dueNext7Count === 1 ? '' : 's' }}
              </p>
            </div>
            <div class="border-t border-default bg-default p-4 sm:border-l sm:border-t-0">
              <p class="text-xs font-medium text-muted">
                Last settlement
              </p>
              <p class="mt-2 text-lg font-semibold">
                {{ formatDate(data.paymentStatus.lastPaymentDate) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Most recent Xero settlement
              </p>
            </div>
            <div class="border-t border-default bg-default p-4 sm:border-l sm:border-t-0">
              <p class="text-xs font-medium text-muted">
                Cash on invoices settled this financial year
              </p>
              <p class="mt-2 text-lg font-semibold">
                {{ formatCurrency(data.paymentStatus.financialYearCashPaid) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Cash component recorded in Xero
              </p>
              <p v-if="data.paymentStatus.financialYearCreditsApplied > 0" class="mt-2 text-xs text-primary">
                Plus {{ formatCurrency(data.paymentStatus.financialYearCreditsApplied) }} settled by Xero credits
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-if="data?.investment">
        <template #header>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-chart-pie" class="text-primary" />
                <h2 class="font-semibold">
                  Your marketing investment
                </h2>
              </div>
              <p class="mt-1 max-w-3xl text-sm text-muted">
                Charges associated with media platforms and external delivery are shown separately from agency services.
              </p>
            </div>
            <USelect
              v-model="investmentPeriod"
              :items="investmentPeriodOptions"
              value-key="value"
              aria-label="Investment period"
              class="w-full sm:w-48"
            />
          </div>
        </template>

        <div class="space-y-5">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Total invoiced, including GST
              </p>
              <p class="mt-1 text-2xl font-semibold tracking-tight">
                {{ formatCurrency(data.investment.totalInvoiced) }}
              </p>
            </div>
            <p v-if="data.investment.periodStart" class="text-xs text-muted">
              {{ formatDate(data.investment.periodStart) }} – {{ formatDate(data.investment.periodEnd) }}
            </p>
          </div>

          <div
            v-if="data.investment.totalInvoiced > 0"
            class="flex h-2.5 w-full overflow-hidden rounded-full bg-elevated"
            role="img"
            :aria-label="`Investment allocation for ${formatCurrency(data.investment.totalInvoiced)}`"
          >
            <div
              v-for="category in investmentCategories"
              :key="category.label"
              :class="category.colorClass"
              :style="{ width: `${investmentShare(category.amount)}%` }"
            />
          </div>

          <UAlert
            v-if="!data.investment.allocationAvailable && data.investment.totalInvoiced > 0"
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            title="Detailed allocation is not available for these invoices yet."
            description="The full unresolved value remains visible under Unclassified & adjustments."
          />

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="category in investmentCategories"
              :key="category.label"
              class="rounded-lg border border-default p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium">
                    {{ category.label }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ category.description }}
                  </p>
                </div>
                <span class="mt-1 size-2.5 shrink-0 rounded-full" :class="category.colorClass" />
              </div>
              <p class="mt-4 text-lg font-semibold">
                {{ formatCurrency(category.amount) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ investmentShare(category.amount).toFixed(1) }}% of invoiced total
              </p>
            </div>
          </div>

          <div v-if="data.investment.channels?.length" class="border-t border-default pt-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              Media &amp; supplier allocation
            </p>
            <div class="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="channel in data.investment.channels"
                :key="channel.name"
                class="flex items-center justify-between gap-3 text-sm"
              >
                <span class="text-muted">{{ channel.name }}</span>
                <span class="font-medium">{{ formatCurrency(channel.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-if="data?.summary">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-chart-no-axes-column-increasing" class="text-primary" />
            <h2 class="font-semibold">
              Receivables ageing
            </h2>
          </div>
        </template>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <UButton
            v-for="bucket in agingBuckets"
            :key="bucket.key"
            color="neutral"
            variant="outline"
            class="h-auto justify-start p-3 text-left"
            @click="activeTab = bucket.key === 'current' ? 'current' : 'overdue'"
          >
            <div class="w-full">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-muted">{{ bucket.label }}</span>
                <UBadge :color="(bucket.color as any)" variant="subtle" size="xs">
                  {{ bucket.count }}
                </UBadge>
              </div>
              <p class="mt-2 text-sm font-semibold text-highlighted">
                {{ formatCurrency(bucket.amount) }}
              </p>
            </div>
          </UButton>
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
              <div class="divide-y divide-default border-y border-default">
                <article
                  v-for="item in detailData.lineItems"
                  :key="item.id"
                  data-testid="invoice-line-item"
                  class="py-3"
                >
                  <p class="text-sm leading-5 break-words">
                    {{ item.description }}
                  </p>
                  <dl class="mt-3 grid grid-cols-3 gap-3">
                    <div class="min-w-0">
                      <dt class="text-[11px] font-medium uppercase tracking-wide text-muted">
                        Qty
                      </dt>
                      <dd class="mt-1 tabular-nums whitespace-nowrap">
                        {{ item.quantity }}
                      </dd>
                    </div>
                    <div class="min-w-0 text-right">
                      <dt class="text-[11px] font-medium uppercase tracking-wide text-muted">
                        Unit price
                      </dt>
                      <dd class="mt-1 text-muted tabular-nums whitespace-nowrap">
                        {{ formatCurrency(item.unitPrice) }}
                      </dd>
                    </div>
                    <div class="min-w-0 text-right">
                      <dt class="text-[11px] font-medium uppercase tracking-wide text-muted">
                        Amount
                      </dt>
                      <dd class="mt-1 font-medium tabular-nums whitespace-nowrap">
                        {{ formatCurrency(item.amount) }}
                      </dd>
                    </div>
                  </dl>
                </article>
              </div>
            </div>

            <!-- Totals -->
            <div class="border-t border-default pt-4 space-y-2 text-sm">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                <span class="text-muted">Subtotal</span>
                <span class="text-right tabular-nums whitespace-nowrap">{{ formatCurrency(detailData.invoice.subtotal) }}</span>
              </div>
              <div v-if="detailData.invoice.discountAmount > 0" class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                <span class="text-muted">Discount</span>
                <span class="text-right text-success tabular-nums whitespace-nowrap">-{{ formatCurrency(detailData.invoice.discountAmount) }}</span>
              </div>
              <div v-if="detailData.invoice.taxAmount > 0" class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                <span class="text-muted">Tax ({{ formatTaxRate(detailData.invoice.taxRate) }}%)</span>
                <span class="text-right tabular-nums whitespace-nowrap">{{ formatCurrency(detailData.invoice.taxAmount) }}</span>
              </div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 font-semibold text-base pt-2 border-t border-default">
                <span>Total</span>
                <span class="text-right tabular-nums whitespace-nowrap">{{ formatCurrency(detailData.invoice.totalAmount) }}</span>
              </div>
              <div v-if="detailData.invoice.amountPaid > 0" class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 text-success">
                <span>Paid</span>
                <span class="text-right tabular-nums whitespace-nowrap">-{{ formatCurrency(detailData.invoice.amountPaid) }}</span>
              </div>
              <div v-if="detailData.invoice.amountCredited > 0" class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 text-primary">
                <span>Credits applied</span>
                <span class="text-right tabular-nums whitespace-nowrap">-{{ formatCurrency(detailData.invoice.amountCredited) }}</span>
              </div>
              <div v-if="detailData.invoice.amountDue > 0" class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 font-semibold text-warning">
                <span>Amount Due</span>
                <span class="text-right tabular-nums whitespace-nowrap">{{ formatCurrency(detailData.invoice.amountDue) }}</span>
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
