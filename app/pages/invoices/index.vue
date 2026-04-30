<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const route = useRoute()
const router = useRouter()

const { data, pending, error, refresh } = await useFetch('/api/xero/invoices')

const search = ref('')
const validViews = ['all', 'outstanding', 'overdue', 'paid'] as const
type ViewType = typeof validViews[number]
const initialStatus = route.query.status as string
const selectedView = ref<ViewType>(
  validViews.includes(initialStatus as any) ? (initialStatus as ViewType) : 'all'
)
const outstandingAging = ref<'all' | 'due_7' | 'due_30'>('all')
const showAgingDetails = ref(false)

const recentPaymentsPage = ref(1)
const recentPaymentsPageSize = 5
const recentPayments = computed(() => (data.value as any)?.paidRecent ?? [])
const paginatedRecentPayments = computed(() => {
  const start = (recentPaymentsPage.value - 1) * recentPaymentsPageSize
  return recentPayments.value.slice(start, start + recentPaymentsPageSize)
})
const totalRecentPaymentsPages = computed(() => Math.max(1, Math.ceil(recentPayments.value.length / recentPaymentsPageSize)))

function formatCurrency(value?: number, currency?: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: currency || 'AUD', maximumFractionDigits: 0 })
}

function formatDate(value?: string) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const summary = computed(() => (data.value?.summary ?? null) as any)
const agingDetails = computed(() => (summary.value?.agingDetails ?? null) as any)

const pageSize = 20
const pageAll = ref(1)
const pageOutstanding = ref(1)
const pageOverdue = ref(1)
const pagePaid = ref(1)

const filteredOutstanding = computed(() => {
  const list = data.value?.outstanding ?? []
  if (!search.value && outstandingAging.value === 'all') return list

  return list.filter((inv: any) => {
    const matchesSearch = search.value
      ? (inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()))
      : true
    if (!matchesSearch) return false

    if (outstandingAging.value === 'due_7') {
      return typeof inv.daysUntilDue === 'number' && inv.daysUntilDue <= 7
    }
    if (outstandingAging.value === 'due_30') {
      return typeof inv.daysUntilDue === 'number' && inv.daysUntilDue <= 30
    }
    return true
  })
})

const filteredOverdue = computed(() => {
  const list = data.value?.overdue ?? []
  if (!search.value) return list
  return list.filter((inv: any) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()))
})

const filteredPaid = computed(() => {
  const list = (data.value as any)?.paid ?? []
  if (!search.value) return list
  return list.filter((inv: any) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()))
})

const filteredAll = computed(() => {
  const combined = (data.value as any)?.all ?? [
    ...(data.value?.outstanding ?? []),
    ...(data.value?.overdue ?? []),
    ...((data.value as any)?.paid ?? [])
  ]

  const list = Array.isArray(combined) ? [...combined] : []
  if (!search.value) return list
  return list.filter((inv: any) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()))
})

function paginate<T>(rows: T[], page: number) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

const totalPagesAll = computed(() => Math.max(1, Math.ceil(filteredAll.value.length / pageSize)))
const totalPagesOutstanding = computed(() => Math.max(1, Math.ceil(filteredOutstanding.value.length / pageSize)))
const totalPagesOverdue = computed(() => Math.max(1, Math.ceil(filteredOverdue.value.length / pageSize)))
const totalPagesPaid = computed(() => Math.max(1, Math.ceil(filteredPaid.value.length / pageSize)))

const paginatedAll = computed(() => paginate(filteredAll.value, pageAll.value))
const paginatedOutstanding = computed(() => paginate(filteredOutstanding.value, pageOutstanding.value))
const paginatedOverdue = computed(() => paginate(filteredOverdue.value, pageOverdue.value))
const paginatedPaid = computed(() => paginate(filteredPaid.value, pagePaid.value))

watch(filteredAll, () => {
  if (pageAll.value > totalPagesAll.value) pageAll.value = 1
})

watch(filteredOutstanding, () => {
  if (pageOutstanding.value > totalPagesOutstanding.value) pageOutstanding.value = 1
})

watch(filteredOverdue, () => {
  if (pageOverdue.value > totalPagesOverdue.value) pageOverdue.value = 1
})

watch(filteredPaid, () => {
  if (pagePaid.value > totalPagesPaid.value) pagePaid.value = 1
})

// Sync URL and reset pagination when view changes
watch(selectedView, (view) => {
  router.replace({ query: view === 'all' ? {} : { status: view } })
  pageAll.value = 1
  pageOutstanding.value = 1
  pageOverdue.value = 1
  pagePaid.value = 1
})

const topCustomers = computed(() => (summary.value as any)?.topCustomers ?? [])
const topCustomersPage = ref(1)
const topCustomersPageSize = 4
const paginatedTopCustomers = computed(() => {
  const start = (topCustomersPage.value - 1) * topCustomersPageSize
  return topCustomers.value.slice(start, start + topCustomersPageSize)
})
const totalTopCustomersPages = computed(() => Math.max(1, Math.ceil(topCustomers.value.length / topCustomersPageSize)))

const viewColumn = { accessorKey: 'view', header: '' }

const columnsOutstanding = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'contact', header: 'Customer' },
  { accessorKey: 'date', header: 'Issued' },
  { accessorKey: 'dueDate', header: 'Due' },
  { accessorKey: 'daysUntilDue', header: 'Days' },
  { accessorKey: 'amountDue', header: 'Amount Due' },
  viewColumn
]

const columnsOverdue = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'contact', header: 'Customer' },
  { accessorKey: 'date', header: 'Issued' },
  { accessorKey: 'dueDate', header: 'Due' },
  { accessorKey: 'daysOverdue', header: 'Days Overdue' },
  { accessorKey: 'amountDue', header: 'Amount Due' },
  viewColumn
]

const columnsPaid = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'contact', header: 'Customer' },
  { accessorKey: 'date', header: 'Issued' },
  { accessorKey: 'fullyPaidOnDate', header: 'Paid On' },
  { accessorKey: 'daysToPay', header: 'Days to Pay' },
  { accessorKey: 'total', header: 'Total' },
  viewColumn
]

const columnsAll = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'contact', header: 'Customer' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'date', header: 'Issued' },
  { accessorKey: 'dueDate', header: 'Due' },
  { accessorKey: 'amountDue', header: 'Balance' },
  viewColumn
]

// Invoice detail slideover
const selectedInvoiceId = ref<string | null>(null)
const showInvoiceDetail = ref(false)
const invoiceDetail = ref<any>(null)
const detailPending = ref(false)

async function openInvoice(id: string) {
  selectedInvoiceId.value = id
  invoiceDetail.value = null
  detailPending.value = true
  showInvoiceDetail.value = true
  try {
    invoiceDetail.value = await $fetch(`/api/xero/invoices/${id}`)
  } catch (e) {
    console.error('Failed to fetch invoice detail', e)
  } finally {
    detailPending.value = false
  }
}

// "Copy pay link" — fetches the customer-facing OnlineInvoiceUrl from
// Xero on demand and writes it to the clipboard. Cached briefly per
// invoice so a double-click doesn't double-fetch.
const toast = useToast()
const payLinkPending = ref<string | null>(null)
const payLinkCache = new Map<string, string>()

async function copyPayLink(invoiceId?: string) {
  if (!invoiceId) return
  payLinkPending.value = invoiceId
  try {
    let url = payLinkCache.get(invoiceId)
    if (!url) {
      const res = await $fetch<{ url: string }>(`/api/xero/invoices/${invoiceId}/online-url`)
      url = res.url
      payLinkCache.set(invoiceId, url)
    }
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Pay link copied', description: 'Paste into your reminder email.', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Could not copy pay link',
      description: err?.statusMessage || err?.message || 'Try again in a moment.',
      color: 'error'
    })
  } finally {
    payLinkPending.value = null
  }
}

function statusColor(status?: string): 'success' | 'error' | 'warning' | 'neutral' {
  if (!status) return 'neutral'
  const s = status.toUpperCase()
  if (s === 'PAID') return 'success'
  if (s === 'OVERDUE') return 'error'
  if (s === 'VOIDED' || s === 'DELETED') return 'neutral'
  return 'warning'
}

function statusLabel(status?: string): string {
  if (!status) return 'Unknown'
  const s = status.toUpperCase()
  if (s === 'AUTHORISED') return 'Outstanding'
  return s.charAt(0) + s.slice(1).toLowerCase()
}

const agingSections = [
  { key: 'current', title: 'Due in 30+ days', color: 'text-[var(--ui-text-muted)]', helper: 'Planned future billing' },
  { key: 'dueSoon', title: 'Due within 7 days', color: 'text-amber-600 dark:text-amber-400', helper: 'Reach out before due date' },
  { key: 'due30', title: 'Due in 8-30 days', color: 'text-[var(--ui-text-muted)]', helper: 'Plan follow-up next' },
  { key: 'overdue7', title: 'Overdue 1-7 days', color: 'text-red-500 dark:text-red-400', helper: 'Send gentle reminder' },
  { key: 'overdue14', title: 'Overdue 8-14 days', color: 'text-red-500 dark:text-red-400', helper: 'Escalate with account owner' },
  { key: 'overdue30', title: 'Overdue 15-30 days', color: 'text-red-600 dark:text-red-400', helper: 'Consider payment plan' },
  { key: 'overdue60', title: 'Overdue 30+ days', color: 'text-red-700 dark:text-red-400', helper: 'High risk — collections?' }
]
</script>

<template>
  <UDashboardPanel id="invoices">
    <template #header>
      <UDashboardNavbar title="Invoices" description="Track outstanding balances, overdue risk, and recent payments">
        <template #right>
          <UButton label="Refresh" color="neutral" icon="i-lucide-refresh-cw" @click="() => refresh()" :loading="pending" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput v-model="search" placeholder="Search invoices or customers" icon="i-lucide-search" clearable />
          <USelectMenu
            v-if="selectedView === 'outstanding'"
            v-model="outstandingAging"
            :options="[
              { label: 'All Upcoming', value: 'all' },
              { label: 'Due in 7 days', value: 'due_7' },
              { label: 'Due in 30 days', value: 'due_30' }
            ]"
            class="w-40"
          />
        </template>
        <template #right>
          <div class="inline-flex items-center gap-1">
            <UButton :variant="selectedView === 'all' ? 'solid' : 'ghost'" icon="i-lucide-layers" size="sm" @click="selectedView = 'all'">
              All
              <UBadge v-if="filteredAll.length" :label="String(filteredAll.length)" color="neutral" variant="subtle" size="sm" class="ml-1" />
            </UButton>
            <UButton :variant="selectedView === 'outstanding' ? 'solid' : 'ghost'" icon="i-lucide-calendar-clock" size="sm" @click="selectedView = 'outstanding'">
              Outstanding
              <UBadge v-if="filteredOutstanding.length" :label="String(filteredOutstanding.length)" color="warning" variant="subtle" size="sm" class="ml-1" />
            </UButton>
            <UButton :variant="selectedView === 'overdue' ? 'solid' : 'ghost'" icon="i-lucide-alarm-minus" color="error" size="sm" @click="selectedView = 'overdue'">
              Overdue
              <UBadge v-if="filteredOverdue.length" :label="String(filteredOverdue.length)" color="error" variant="subtle" size="sm" class="ml-1" />
            </UButton>
            <UButton :variant="selectedView === 'paid' ? 'solid' : 'ghost'" icon="i-lucide-badge-check" color="success" size="sm" @click="selectedView = 'paid'">
              Paid
              <UBadge v-if="filteredPaid.length" :label="String(filteredPaid.length)" color="success" variant="subtle" size="sm" class="ml-1" />
            </UButton>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-32" />
        <USkeleton class="h-80" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load invoices"
        :description="error.statusMessage || 'Please try refreshing.'"
      />

      <div v-else class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Outstanding Balance</p>
                <p class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.outstandingTotal) }}</p>
              </div>
              <div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-file-text" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mt-2">{{ summary?.outstandingCount || 0 }} invoices with open balances</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Overdue Balance</p>
                <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ formatCurrency((summary as any)?.overdueTotal) }}</p>
              </div>
              <div class="shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-alert-triangle" class="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mt-2">{{ summary?.overdueCount || 0 }} invoices past due</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Due in 7 days</p>
                <p class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ formatCurrency((summary as any)?.dueSoonTotal) }}</p>
              </div>
              <div class="shrink-0 w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-hourglass" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mt-2">Upcoming cash expected this week</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Paid Last 30 Days</p>
                <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(summary?.paidLast30Total) }}</p>
              </div>
              <div class="shrink-0 w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-badge-check" class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mt-2">{{ summary?.paidLast30Count || 0 }} invoices closed recently</p>
          </UCard>
        </div>

        <!-- "Not yet sent" alert — open invoices that were never emailed via Xero. -->
        <UAlert
          v-if="(summary?.notSentCount || 0) > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-mail-warning"
          :title="`${summary.notSentCount} invoice${summary.notSentCount === 1 ? '' : 's'} not yet sent — ${formatCurrency(summary.notSentTotal)}`"
          description="These invoices were created but never emailed to the client. Open them and hit Send in Xero before chasing payment."
        />

        <!-- Invoice Table (primary content) -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                {{ selectedView === 'all' ? 'All Invoices' : selectedView === 'outstanding' ? 'Outstanding Invoices' : selectedView === 'overdue' ? 'Overdue Invoices' : 'Paid Invoices' }}
              </h3>
              <UBadge v-if="selectedView === 'paid' && summary?.avgDaysToPay" color="neutral" variant="subtle">
                Avg days to pay: {{ summary?.avgDaysToPay }}
              </UBadge>
            </div>
          </template>

          <UTable
            v-if="selectedView === 'all'"
            :data="paginatedAll"
            :columns="columnsAll"
            @select="(_e: any, row: any) => openInvoice(row.original.id)"
          >
            <template #status-cell="{ row }">
              <UBadge
                :color="(row.original as any).status === 'PAID' ? 'success' : (row.original as any).status === 'OVERDUE' ? 'error' : 'warning'"
                variant="subtle"
              >
                {{ (row.original as any).status === 'PAID' ? 'Paid' : (row.original as any).status === 'OVERDUE' ? 'Overdue' : 'Outstanding' }}
              </UBadge>
            </template>
            <template #date-cell="{ row }">{{ formatDate((row.original as any).date) }}</template>
            <template #dueDate-cell="{ row }">{{ formatDate((row.original as any).dueDate) }}</template>
            <template #amountDue-cell="{ row }">
              <span class="text-right block font-medium" :class="(row.original as any).status === 'OVERDUE' ? 'text-red-600 dark:text-red-400' : ''">
                {{ (row.original as any).status === 'PAID' ? formatCurrency((row.original as any).total, (row.original as any).currency) : formatCurrency((row.original as any).amountDue, (row.original as any).currency) }}
              </span>
            </template>
            <template #view-cell>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-[var(--ui-text-dimmed)]" />
            </template>
          </UTable>

          <UTable
            v-else-if="selectedView === 'outstanding'"
            :data="paginatedOutstanding"
            :columns="columnsOutstanding"
            @select="(_e: any, row: any) => openInvoice(row.original.id)"
          >
            <template #date-cell="{ row }">{{ formatDate((row.original as any).date) }}</template>
            <template #dueDate-cell="{ row }">{{ formatDate((row.original as any).dueDate) }}</template>
            <template #daysUntilDue-cell="{ row }">
              <span :class="(row.original as any).daysUntilDue <= 3 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''">
                {{ (row.original as any).daysUntilDue != null ? (row.original as any).daysUntilDue : '-' }}
              </span>
            </template>
            <template #amountDue-cell="{ row }">
              <span class="text-right block font-medium">{{ formatCurrency((row.original as any).amountDue, (row.original as any).currency) }}</span>
            </template>
            <template #view-cell>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-[var(--ui-text-dimmed)]" />
            </template>
          </UTable>

          <UTable
            v-else-if="selectedView === 'overdue'"
            :data="paginatedOverdue"
            :columns="columnsOverdue"
            @select="(_e: any, row: any) => openInvoice(row.original.id)"
          >
            <template #date-cell="{ row }">{{ formatDate((row.original as any).date) }}</template>
            <template #dueDate-cell="{ row }">{{ formatDate((row.original as any).dueDate) }}</template>
            <template #daysOverdue-cell="{ row }">
              <span class="text-red-600 dark:text-red-400 font-medium">{{ (row.original as any).daysOverdue ?? '-' }}</span>
            </template>
            <template #amountDue-cell="{ row }">
              <span class="text-right block font-medium text-red-600 dark:text-red-400">{{ formatCurrency((row.original as any).amountDue, (row.original as any).currency) }}</span>
            </template>
            <template #view-cell>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-[var(--ui-text-dimmed)]" />
            </template>
          </UTable>

          <UTable
            v-else
            :data="paginatedPaid"
            :columns="columnsPaid"
            @select="(_e: any, row: any) => openInvoice(row.original.id)"
          >
            <template #date-cell="{ row }">{{ formatDate((row.original as any).date) }}</template>
            <template #fullyPaidOnDate-cell="{ row }">{{ formatDate((row.original as any).fullyPaidOnDate) }}</template>
            <template #daysToPay-cell="{ row }">{{ (row.original as any).daysToPay ?? '-' }}</template>
            <template #total-cell="{ row }">
              <span class="text-right block font-medium">{{ formatCurrency((row.original as any).total, (row.original as any).currency) }}</span>
            </template>
            <template #view-cell>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-[var(--ui-text-dimmed)]" />
            </template>
          </UTable>

          <!-- Empty state -->
          <div
            v-if="!pending && !error && (
              (selectedView === 'all' && !paginatedAll.length) ||
              (selectedView === 'outstanding' && !paginatedOutstanding.length) ||
              (selectedView === 'overdue' && !paginatedOverdue.length) ||
              (selectedView === 'paid' && !paginatedPaid.length)
            )"
            class="py-12 text-center"
          >
            <UIcon :name="selectedView === 'paid' ? 'i-lucide-badge-check' : 'i-lucide-inbox'" class="w-10 h-10 text-[var(--ui-text-dimmed)] mx-auto mb-3" />
            <p class="text-sm text-[var(--ui-text-muted)]">
              {{ search ? 'No invoices match your search.' : selectedView === 'overdue' ? 'No overdue invoices — great job!' : selectedView === 'paid' ? 'No paid invoices in this period.' : 'No invoices found.' }}
            </p>
          </div>

          <div v-if="(selectedView === 'all' ? filteredAll.length : selectedView === 'outstanding' ? filteredOutstanding.length : selectedView === 'overdue' ? filteredOverdue.length : filteredPaid.length) > pageSize" class="mt-4 flex justify-end">
            <UPagination
              v-if="selectedView === 'all'"
              v-model:page="pageAll"
              :page-count="totalPagesAll"
              size="sm"
            />
            <UPagination
              v-else-if="selectedView === 'outstanding'"
              v-model:page="pageOutstanding"
              :page-count="totalPagesOutstanding"
              size="sm"
            />
            <UPagination
              v-else-if="selectedView === 'overdue'"
              v-model:page="pageOverdue"
              :page-count="totalPagesOverdue"
              size="sm"
            />
            <UPagination
              v-else
              v-model:page="pagePaid"
              :page-count="totalPagesPaid"
              size="sm"
            />
          </div>
        </UCard>

        <!-- Analytics Row: Aging + Top Clients + Recent Payments -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <!-- Invoice Aging Overview -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">Invoice Aging</h3>
                <UButton
                  v-if="agingDetails"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :icon="showAgingDetails ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  @click="showAgingDetails = !showAgingDetails"
                >
                  {{ showAgingDetails ? 'Hide' : 'Details' }}
                </UButton>
              </div>
            </template>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Current</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ summary?.agingBuckets?.current ?? 0 }}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Due &lt;= 7d</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ summary?.agingBuckets?.dueSoon ?? 0 }}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Overdue &le; 7d</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any)?.agingBuckets?.overdue7 ?? 0 }}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Overdue 8-14d</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any)?.agingBuckets?.overdue14 ?? 0 }}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-red-100 dark:bg-red-950/50">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Overdue 15-30d</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any)?.agingBuckets?.overdue30 ?? 0 }}</p>
              </div>
              <div class="p-2.5 rounded-lg bg-red-200 dark:bg-red-900/60">
                <p class="text-[var(--ui-text-muted)] text-[10px] uppercase tracking-wide">Overdue 30d+</p>
                <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any)?.agingBuckets?.overdue60 ?? 0 }}</p>
              </div>
            </div>
          </UCard>

          <!-- Top Outstanding Clients -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">Top Outstanding</h3>
                <UBadge v-if="topCustomers.length" color="neutral" variant="subtle">{{ topCustomers.length }}</UBadge>
              </div>
            </template>
            <div class="space-y-3">
              <div v-for="client in paginatedTopCustomers" :key="client.name" class="p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)]">
                <div class="flex items-center justify-between">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate mr-2">{{ client.name }}</p>
                  <span class="text-xs text-[var(--ui-text-muted)] shrink-0">{{ client.count }} inv</span>
                </div>
                <div class="flex items-center justify-between text-sm mt-1">
                  <span class="text-[var(--ui-text-muted)]">Outstanding</span>
                  <span class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(client.outstanding) }}</span>
                </div>
                <div v-if="client.overdue" class="flex items-center justify-between text-xs text-red-500 dark:text-red-400">
                  <span>Overdue</span>
                  <span class="font-medium">{{ formatCurrency(client.overdue) }}</span>
                </div>
              </div>
              <p v-if="!topCustomers.length" class="text-sm text-[var(--ui-text-muted)] text-center py-4">No outstanding clients — nice work!</p>
            </div>
            <div v-if="topCustomers.length > topCustomersPageSize" class="mt-3 flex items-center justify-between border-t border-[var(--ui-border)] pt-3">
              <p class="text-xs text-[var(--ui-text-muted)]">{{ topCustomersPage }} of {{ totalTopCustomersPages }}</p>
              <div class="flex gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :disabled="topCustomersPage <= 1" @click="topCustomersPage--" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :disabled="topCustomersPage >= totalTopCustomersPages" @click="topCustomersPage++" />
              </div>
            </div>
          </UCard>

          <!-- Recent Payments -->
          <UCard v-if="recentPayments.length">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">Recent Payments</h3>
                <UBadge color="neutral" variant="subtle">{{ recentPayments.length }}</UBadge>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="invoice in paginatedRecentPayments"
                :key="invoice.id"
                class="flex items-center justify-between text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"
              >
                <div class="min-w-0 mr-2">
                  <p class="font-medium text-[var(--ui-text-highlighted)] truncate">{{ invoice.number }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)] truncate">{{ invoice.contact }} · {{ formatDate(invoice.fullyPaidOnDate) }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(invoice.total, invoice.currency) }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ invoice.daysToPay ?? '-' }}d</p>
                </div>
              </div>
            </div>
            <div v-if="recentPayments.length > recentPaymentsPageSize" class="mt-3 flex items-center justify-between border-t border-[var(--ui-border)] pt-3">
              <p class="text-xs text-[var(--ui-text-muted)]">{{ recentPaymentsPage }} of {{ totalRecentPaymentsPages }}</p>
              <div class="flex gap-1">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :disabled="recentPaymentsPage <= 1" @click="recentPaymentsPage--" />
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :disabled="recentPaymentsPage >= totalRecentPaymentsPages" @click="recentPaymentsPage++" />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Collapsible aging details (full width below the 3-col row) -->
        <UCard v-if="showAgingDetails && agingDetails">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">Aging Breakdown</h3>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="showAgingDetails = false" />
            </div>
          </template>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
            <template v-for="section in agingSections" :key="section.key">
              <div v-if="agingDetails?.[section.key]?.length">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <p class="font-semibold" :class="section.color">{{ section.title }}</p>
                    <p class="text-xs text-[var(--ui-text-muted)]">{{ section.helper }}</p>
                  </div>
                  <UBadge color="neutral" variant="subtle">{{ agingDetails?.[section.key]?.length }}</UBadge>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="inv in agingDetails?.[section.key] || []"
                    :key="inv.id"
                    class="flex items-start justify-between rounded border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] px-3 py-2"
                  >
                    <div>
                      <p class="font-medium text-[var(--ui-text-highlighted)]">{{ inv.number }}</p>
                      <p class="text-xs text-[var(--ui-text-muted)]">{{ inv.contact }} · Due {{ formatDate(inv.dueDate) }}</p>
                    </div>
                    <div class="text-right">
                      <p class="font-semibold" :class="section.key.includes('overdue') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                        {{ formatCurrency(inv.amountDue, inv.currency) }}
                      </p>
                      <p class="text-xs text-[var(--ui-text-muted)]">
                        {{ section.key.includes('overdue') ? `${inv.daysOverdue ?? 0}d overdue` : `${inv.daysUntilDue ?? 0}d` }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </UCard>

        <!-- Quick Links -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <NuxtLink to="/cashflow" class="group p-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-border-accented)] transition-colors">
            <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-trending-up" class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] group-hover:text-[var(--ui-primary)]">Cash Flow Forecast</p>
            <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">Projections & scenarios</p>
          </NuxtLink>
          <NuxtLink to="/profit-loss" class="group p-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-border-accented)] transition-colors">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-pie-chart" class="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] group-hover:text-[var(--ui-primary)]">Profit & Loss</p>
            <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">Revenue & expenses</p>
          </NuxtLink>
          <NuxtLink to="/customers" class="group p-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-border-accented)] transition-colors">
            <div class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-users" class="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] group-hover:text-[var(--ui-primary)]">Customer Accounts</p>
            <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">Contacts & balances</p>
          </NuxtLink>
          <NuxtLink to="/xeroflow" class="group p-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-border-accented)] transition-colors">
            <div class="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-layout-dashboard" class="w-4.5 h-4.5 text-purple-600 dark:text-purple-400" />
            </div>
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] group-hover:text-[var(--ui-primary)]">XeroFlow Dashboard</p>
            <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">KPIs & anomalies</p>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Invoice Detail Slideover -->
  <USlideover v-model:open="showInvoiceDetail" :title="detailPending ? 'Loading...' : ((invoiceDetail as any)?.number || 'Invoice')" :description="detailPending ? 'Fetching invoice details...' : ((invoiceDetail as any)?.contact?.name || 'Invoice details')">
    <template #title>
      <div class="min-w-0">
        <p class="font-semibold text-[var(--ui-text-highlighted)] truncate">
          {{ detailPending ? 'Loading...' : ((invoiceDetail as any)?.number || 'Invoice') }}
        </p>
        <p v-if="!detailPending && (invoiceDetail as any)?.reference" class="text-xs text-[var(--ui-text-muted)] truncate font-normal">
          Ref: {{ (invoiceDetail as any).reference }}
        </p>
      </div>
    </template>
    <template #actions>
      <UBadge v-if="!detailPending && invoiceDetail" :color="statusColor((invoiceDetail as any).status)" variant="subtle">
        {{ statusLabel((invoiceDetail as any).status) }}
      </UBadge>
      <UButton
        v-if="!detailPending && invoiceDetail && ((invoiceDetail as any)?.amountDue || 0) > 0"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-link"
        label="Copy pay link"
        :loading="payLinkPending === (invoiceDetail as any)?.id"
        @click="copyPayLink((invoiceDetail as any)?.id)"
      />
      <NuxtLink
        v-if="!detailPending && (invoiceDetail as any)?.url"
        :to="(invoiceDetail as any).url"
        target="_blank"
        external
      >
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" label="Xero" />
      </NuxtLink>
    </template>
    <template #body>
      <!-- Loading -->
      <div v-if="detailPending" class="space-y-4">
        <USkeleton class="h-8 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-32" />
        <USkeleton class="h-48" />
      </div>

      <div v-else-if="invoiceDetail" class="space-y-6">
        <!-- Contact -->
        <div v-if="(invoiceDetail as any).contact?.name" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Contact</h3>
          <div class="flex items-center gap-3">
            <UAvatar :label="((invoiceDetail as any).contact.name || '?').charAt(0)" size="sm" />
            <div class="min-w-0">
              <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ (invoiceDetail as any).contact.name }}</p>
              <p v-if="(invoiceDetail as any).contact.email" class="text-xs text-[var(--ui-text-muted)] truncate">{{ (invoiceDetail as any).contact.email }}</p>
            </div>
          </div>
          <div v-if="(invoiceDetail as any).contact.phone" class="flex items-center gap-2 text-xs text-[var(--ui-text-muted)]">
            <UIcon name="i-lucide-phone" class="size-3.5 shrink-0" />
            <span>{{ (invoiceDetail as any).contact.phone }}</span>
          </div>
          <div v-if="(invoiceDetail as any).contact.address" class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]">
            <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0 mt-0.5" />
            <span>{{ (invoiceDetail as any).contact.address }}</span>
          </div>
        </div>

        <!-- Dates -->
        <div class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Dates</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Issued</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatDate((invoiceDetail as any).date) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Due</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatDate((invoiceDetail as any).dueDate) }}</span>
            </div>
            <div v-if="(invoiceDetail as any).fullyPaidOnDate" class="flex justify-between col-span-2">
              <span class="text-[var(--ui-text-muted)]">Paid</span>
              <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ formatDate((invoiceDetail as any).fullyPaidOnDate) }}</span>
            </div>
            <div
              v-if="(invoiceDetail as any).status === 'AUTHORISED' && (invoiceDetail as any).dueDate"
              class="col-span-2"
            >
              <template v-if="new Date((invoiceDetail as any).dueDate) < new Date()">
                <span class="text-xs font-medium text-red-600 dark:text-red-400">
                  {{ Math.ceil((new Date().getTime() - new Date((invoiceDetail as any).dueDate).getTime()) / 86400000) }} days overdue
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Amounts -->
        <div class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Amounts</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-lg border border-[var(--ui-border)]">
              <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Subtotal</p>
              <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((invoiceDetail as any).subtotal, (invoiceDetail as any).currency) }}</p>
            </div>
            <div class="p-3 rounded-lg border border-[var(--ui-border)]">
              <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Tax</p>
              <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((invoiceDetail as any).totalTax, (invoiceDetail as any).currency) }}</p>
            </div>
            <div class="p-3 rounded-lg border border-[var(--ui-border)]">
              <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Total</p>
              <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((invoiceDetail as any).total, (invoiceDetail as any).currency) }}</p>
            </div>
            <div class="p-3 rounded-lg border border-[var(--ui-border)]" :class="(invoiceDetail as any).amountDue > 0 ? 'border-amber-300 dark:border-amber-700' : 'border-emerald-300 dark:border-emerald-700'">
              <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Balance Due</p>
              <p class="text-lg font-semibold" :class="(invoiceDetail as any).amountDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">
                {{ formatCurrency((invoiceDetail as any).amountDue, (invoiceDetail as any).currency) }}
              </p>
            </div>
          </div>
          <div v-if="(invoiceDetail as any).amountPaid > 0 || (invoiceDetail as any).amountCredited > 0" class="flex items-center gap-4 text-xs text-[var(--ui-text-muted)] pt-1">
            <span v-if="(invoiceDetail as any).amountPaid > 0">Paid: {{ formatCurrency((invoiceDetail as any).amountPaid, (invoiceDetail as any).currency) }}</span>
            <span v-if="(invoiceDetail as any).amountCredited > 0">Credited: {{ formatCurrency((invoiceDetail as any).amountCredited, (invoiceDetail as any).currency) }}</span>
          </div>
        </div>

        <!-- Line Items -->
        <div v-if="(invoiceDetail as any).lineItems?.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">
            Line Items
            <UBadge color="neutral" variant="subtle" size="xs" class="ml-1">{{ (invoiceDetail as any).lineItems.length }}</UBadge>
          </h3>
          <div class="space-y-2">
            <div
              v-for="(li, idx) in (invoiceDetail as any).lineItems"
              :key="idx"
              class="p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)]"
            >
              <p class="text-sm text-[var(--ui-text-highlighted)]">{{ li.description || '(No description)' }}</p>
              <div class="flex items-center justify-between mt-1.5 text-xs text-[var(--ui-text-muted)]">
                <span>{{ li.quantity }} x {{ formatCurrency(li.unitAmount, (invoiceDetail as any).currency) }}</span>
                <span class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(li.lineAmount, (invoiceDetail as any).currency) }}</span>
              </div>
              <div v-if="li.accountCode" class="text-[10px] text-[var(--ui-text-muted)] mt-1">
                Account: {{ li.accountCode }}
              </div>
            </div>
          </div>
        </div>

        <!-- Payments -->
        <div v-if="(invoiceDetail as any).payments?.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">
            Payments
            <UBadge color="success" variant="subtle" size="xs" class="ml-1">{{ (invoiceDetail as any).payments.length }}</UBadge>
          </h3>
          <div class="space-y-2">
            <div
              v-for="(p, idx) in (invoiceDetail as any).payments"
              :key="idx"
              class="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"
            >
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ formatDate(p.date) }}</p>
                <p v-if="p.reference" class="text-xs text-[var(--ui-text-muted)]">{{ p.reference }}</p>
              </div>
              <span class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(p.amount, (invoiceDetail as any).currency) }}</span>
            </div>
          </div>
        </div>

        <!-- Credit Notes -->
        <div v-if="(invoiceDetail as any).creditNotes?.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">
            Credit Notes
            <UBadge color="neutral" variant="subtle" size="xs" class="ml-1">{{ (invoiceDetail as any).creditNotes.length }}</UBadge>
          </h3>
          <div class="space-y-2">
            <div
              v-for="(cn, idx) in (invoiceDetail as any).creditNotes"
              :key="idx"
              class="flex items-center justify-between p-3 rounded-lg border border-[var(--ui-border)]"
            >
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ cn.number || 'Credit Note' }}</p>
                <p class="text-xs text-[var(--ui-text-muted)]">{{ formatDate(cn.date) }}</p>
              </div>
              <span class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(cn.total, (invoiceDetail as any).currency) }}</span>
            </div>
          </div>
        </div>

        <!-- Footer meta -->
        <div class="space-y-2 pt-3 border-t border-[var(--ui-border)]">
          <div class="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>Currency</span>
            <span class="font-medium">{{ (invoiceDetail as any).currency }}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>Type</span>
            <span class="font-medium">{{ (invoiceDetail as any).type === 'ACCREC' ? 'Accounts Receivable' : (invoiceDetail as any).type === 'ACCPAY' ? 'Accounts Payable' : (invoiceDetail as any).type }}</span>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
