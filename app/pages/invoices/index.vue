<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const route = useRoute()
const router = useRouter()

const { data, pending, error, refresh } = await useFetch('/api/xero/invoices')

// Forward-looking pipeline (quotes not yet invoiced). Loaded in parallel
// — failure here must NOT block the AR view, so errors are swallowed.
const { data: quotesSummary } = await useFetch<{ total: number; count: number; byStatus: { draft: { count: number; total: number }; sent: { count: number; total: number }; accepted: { count: number; total: number } } }>(
  '/api/xero/quotes-summary',
  { default: () => null as any }
)

// Recurring revenue (active retainers / subscriptions). Same parallel-
// fetch contract — must not block AR.
const { data: recurringSummary } = await useFetch<{ summary: { mrr: number; arr: number; activeCount: number; clientCount: number; netRecurring: number; recurringMonthlyCosts: number } }>(
  '/api/xero/repeating-invoices',
  { default: () => null as any }
)

// Outstanding sales credit notes — money owed back to customers /
// available to apply. Lets us compute a "Net AR" view alongside gross.
const { data: creditNotesSummary } = await useFetch<{ total: number; count: number; byContact: Array<{ name: string; total: number; count: number }>; notes: Array<{ id: string; number: string; contact: string; date: string | null; remainingCredit: number; currency: string }> }>(
  '/api/xero/credit-notes-summary',
  { default: () => null as any }
)

// AI-generated owner briefing. Loads after the page renders so it never
// blocks the (much more important) numeric data. Server caches 1 hour
// per tenant — manual refresh is the escape hatch for fresh tokens.
type AiBriefing = {
  headline: string
  narrative: string
  actions: Array<{ label: string; why?: string }>
  riskLevel: 'low' | 'moderate' | 'high'
  generatedAt: string
  cached: boolean
}
const aiBriefing = ref<AiBriefing | null>(null)
const aiBriefingPending = ref(false)
const aiBriefingError = ref<string | null>(null)
async function loadAiBriefing(force = false) {
  aiBriefingPending.value = true
  aiBriefingError.value = null
  try {
    const res = await $fetch<AiBriefing>(
      `/api/xero/invoices/ai-briefing${force ? '?refresh=1' : ''}`
    )
    aiBriefing.value = res
  } catch (err: any) {
    aiBriefingError.value = err?.statusMessage || err?.message || 'Could not load briefing'
  } finally {
    aiBriefingPending.value = false
  }
}
onMounted(() => loadAiBriefing(false))

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

// Bulk send dunning reminders — kicks off /bulk-reminder with the
// supplied invoice IDs, surfaces a tally toast on completion. Server
// dedups silently (skipped reasons returned per-invoice).
const bulkReminderPending = ref(false)
async function sendBulkReminders(invoiceIds: string[]) {
  if (!invoiceIds.length) return
  if (typeof window !== 'undefined' && !window.confirm(`Send a reminder email to ${invoiceIds.length} customer${invoiceIds.length === 1 ? '' : 's'}? Recently-reminded invoices will be skipped.`)) return
  bulkReminderPending.value = true
  try {
    const res = await $fetch<{ ok: true; tally: { sent: number; skipped: number; failed: number }; results: Array<{ invoiceId: string; status: string; reason?: string }> }>(
      '/api/xero/invoices/bulk-reminder',
      { method: 'POST', body: { invoiceIds } }
    )
    const parts: string[] = []
    if (res.tally.sent) parts.push(`${res.tally.sent} sent`)
    if (res.tally.skipped) parts.push(`${res.tally.skipped} skipped`)
    if (res.tally.failed) parts.push(`${res.tally.failed} failed`)
    toast.add({
      title: 'Bulk reminders complete',
      description: parts.join(' · ') || 'Nothing to do',
      color: res.tally.failed > 0 ? 'warning' : 'success',
    })
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Bulk reminder failed',
      description: err?.statusMessage || err?.data?.statusMessage || err?.message || 'Try again in a moment.',
      color: 'error',
    })
  } finally {
    bulkReminderPending.value = false
  }
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

// Surface lastReminderAt for the currently-open invoice in the slideover.
// The single-invoice detail endpoint doesn't include reminder history,
// but the list response does — look it up there by id.
const lastReminderForOpenInvoice = computed<string | null>(() => {
  const id = (invoiceDetail.value as any)?.id
  if (!id) return null
  const lists = [
    (data.value as any)?.outstanding,
    (data.value as any)?.overdue,
    (data.value as any)?.paid,
    (data.value as any)?.all,
  ]
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    const hit = list.find((inv: any) => inv?.id === id)
    if (hit?.lastReminderAt) return hit.lastReminderAt
  }
  return null
})

// Send dunning reminder — fires the email to the contact on file with
// a one-click pay link. Server enforces a 3-day dedup guard (returns
// 409 "lastSentAt"); we surface a confirm modal in that case.
const reminderPending = ref<string | null>(null)
async function sendReminder(invoiceId?: string, force = false) {
  if (!invoiceId) return
  reminderPending.value = invoiceId
  try {
    const res = await $fetch<{ ok: true; sentTo: string; daysOverdue: number }>(
      `/api/xero/invoices/${invoiceId}/send-reminder`,
      { method: 'POST', body: { force } }
    )
    toast.add({
      title: 'Reminder sent',
      description: `${res.sentTo}${res.daysOverdue > 0 ? ` · ${res.daysOverdue}d overdue` : ''}`,
      color: 'success',
    })
  } catch (err: any) {
    if (err?.statusCode === 409) {
      // Recently sent — ask the user if they want to send again.
      const lastSent = err?.data?.data?.lastSentAt || err?.data?.lastSentAt
      const lastSentLabel = lastSent ? new Date(lastSent).toLocaleString() : 'recently'
      if (typeof window !== 'undefined' && window.confirm(`A reminder was already sent on ${lastSentLabel}. Send another anyway?`)) {
        await sendReminder(invoiceId, true)
      }
    } else {
      toast.add({
        title: 'Could not send reminder',
        description: err?.statusMessage || err?.data?.statusMessage || err?.message || 'Try again in a moment.',
        color: 'error',
      })
    }
  } finally {
    reminderPending.value = null
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

// "This month" drill-down slideover. Lists every invoice issued this
// calendar month (paid or unpaid) so the user can see what got billed.
const showMonthDetail = ref(false)
const monthInvoices = computed<any[]>(() => {
  const ids = ((summary.value as any)?.monthInvoiceIds ?? []) as string[]
  if (!ids.length) return []
  const idSet = new Set(ids)
  const merged = [
    ...((data.value as any)?.outstanding ?? []),
    ...((data.value as any)?.overdue ?? []),
    ...((data.value as any)?.paid ?? []),
  ]
  return merged
    .filter((inv: any) => idSet.has(inv?.id))
    .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
})

// "Not yet sent" drill-down slideover. Lists every open invoice with
// sentToContact === false so the user can chase them through Xero.
const showNotSentDetail = ref(false)
const notSentInvoices = computed<any[]>(() => {
  const open = [...((data.value as any)?.outstanding ?? []), ...((data.value as any)?.overdue ?? [])]
  return open
    .filter((inv: any) => inv.sentToContact === false)
    .sort((a: any, b: any) => (a.dueDate || '').localeCompare(b.dueDate || ''))
})

// Customer drill-down slideover. Click a row in "Top Outstanding" to
// see every invoice we have for that customer with KPIs computed from
// the invoices already in scope (no extra Xero call).
const showCustomerDetail = ref(false)
const selectedCustomer = ref<{ name: string; outstanding: number; overdue: number; count: number } | null>(null)

function openCustomer(client: any) {
  selectedCustomer.value = {
    name: client.name,
    outstanding: client.outstanding ?? 0,
    overdue: client.overdue ?? 0,
    count: client.count ?? 0,
  }
  showCustomerDetail.value = true
}

const customerOpen = computed<any[]>(() => {
  if (!selectedCustomer.value) return []
  const name = selectedCustomer.value.name
  const open = [...((data.value as any)?.outstanding ?? []), ...((data.value as any)?.overdue ?? [])]
  return open
    .filter((inv: any) => inv.contact === name)
    .sort((a: any, b: any) => (a.dueDate || '').localeCompare(b.dueDate || ''))
})
const customerPaid = computed<any[]>(() => {
  if (!selectedCustomer.value) return []
  const name = selectedCustomer.value.name
  const paid = (data.value as any)?.paid ?? []
  return paid
    .filter((inv: any) => inv.contact === name)
    .sort((a: any, b: any) => (b.fullyPaidOnDate || '').localeCompare(a.fullyPaidOnDate || ''))
    .slice(0, 10)
})
const customerKpis = computed(() => {
  if (!selectedCustomer.value) return null
  const open = customerOpen.value
  const paid = customerPaid.value
  const lifetimeBilled = paid.reduce((s, inv) => s + (inv.total || 0), 0) + open.reduce((s, inv) => s + (inv.total || 0), 0)
  const daysToPayValues = paid.map((inv) => inv.daysToPay).filter((n) => typeof n === 'number' && Number.isFinite(n))
  const avgDaysToPay = daysToPayValues.length
    ? Math.round(daysToPayValues.reduce((s: number, n: number) => s + n, 0) / daysToPayValues.length)
    : null
  const oldestOverdue = open
    .filter((inv) => inv.status === 'OVERDUE')
    .reduce((max: number, inv: any) => Math.max(max, inv.daysOverdue || 0), 0)
  const earliestRelationship = paid.reduce((earliest: string | null, inv: any) => {
    if (!inv.date) return earliest
    if (!earliest || inv.date < earliest) return inv.date
    return earliest
  }, null as string | null)
  return {
    lifetimeBilled,
    avgDaysToPay,
    oldestOverdueDays: oldestOverdue,
    earliestInvoiceDate: earliestRelationship,
    paidCount: paid.length,
    openCount: open.length,
  }
})

function focusCustomerInTable() {
  if (!selectedCustomer.value) return
  search.value = selectedCustomer.value.name
  selectedView.value = 'all'
  showCustomerDetail.value = false
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
        <!-- AI Owner Briefing — generated narrative + 1-2 actions. Loads
             after the page so it never blocks the numeric cards. -->
        <UCard
          class="border-l-4"
          :class="{
            'border-l-emerald-500': aiBriefing?.riskLevel === 'low',
            'border-l-amber-500': aiBriefing?.riskLevel === 'moderate',
            'border-l-red-500': aiBriefing?.riskLevel === 'high',
            'border-l-[var(--ui-border)]': !aiBriefing,
          }"
        >
          <div class="flex items-start gap-3">
            <div class="shrink-0 w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mt-0.5">
              <UIcon name="i-lucide-sparkles" class="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-3 mb-1">
                <p class="text-[10px] uppercase tracking-wide text-[var(--ui-text-muted)] font-semibold">Owner briefing · AI</p>
                <div class="flex items-center gap-2">
                  <span v-if="aiBriefing?.cached" class="text-[10px] text-[var(--ui-text-muted)]">cached</span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-refresh-cw"
                    :loading="aiBriefingPending"
                    @click="loadAiBriefing(true)"
                  >
                    Refresh
                  </UButton>
                </div>
              </div>

              <!-- Loading skeleton -->
              <div v-if="aiBriefingPending && !aiBriefing" class="space-y-2">
                <USkeleton class="h-5 w-1/2" />
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
              </div>

              <!-- Error state -->
              <p v-else-if="aiBriefingError && !aiBriefing" class="text-sm text-[var(--ui-text-muted)]">
                {{ aiBriefingError }}
              </p>

              <!-- Loaded -->
              <template v-else-if="aiBriefing">
                <p class="text-base font-semibold text-[var(--ui-text-highlighted)] mb-1">{{ aiBriefing.headline }}</p>
                <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed mb-3">{{ aiBriefing.narrative }}</p>
                <ul v-if="aiBriefing.actions?.length" class="space-y-1.5">
                  <li
                    v-for="(action, idx) in aiBriefing.actions"
                    :key="idx"
                    class="flex items-start gap-2 text-sm"
                  >
                    <UIcon name="i-lucide-arrow-right" class="h-4 w-4 mt-0.5 text-violet-600 dark:text-violet-400 shrink-0" />
                    <div>
                      <span class="font-medium text-[var(--ui-text-highlighted)]">{{ action.label }}</span>
                      <span v-if="action.why" class="text-[var(--ui-text-muted)]"> — {{ action.why }}</span>
                    </div>
                  </li>
                </ul>
                <p class="text-[10px] text-[var(--ui-text-muted)] mt-2 italic">
                  AI-generated — verify against the data below before acting.
                </p>
              </template>
            </div>
          </div>
        </UCard>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <UTooltip text="Days Sales Outstanding (30-day): how long, on average, it takes to collect a dollar of AR. Computed as (Outstanding AR / Sales last 30 days) × 30. Lower is better; >45 days starts being a cash-flow warning.">
                  <p class="text-sm text-[var(--ui-text-muted)] flex items-center gap-1">
                    DSO (30d)
                    <UIcon name="i-lucide-info" class="h-3 w-3" />
                  </p>
                </UTooltip>
                <p
                  class="text-2xl font-bold"
                  :class="{
                    'text-emerald-600 dark:text-emerald-400': (summary?.dso30 ?? 0) > 0 && summary.dso30 <= 30,
                    'text-amber-600 dark:text-amber-400': (summary?.dso30 ?? 0) > 30 && summary.dso30 <= 45,
                    'text-red-600 dark:text-red-400': (summary?.dso30 ?? 0) > 45,
                    'text-[var(--ui-text-highlighted)]': summary?.dso30 == null,
                  }"
                >
                  {{ summary?.dso30 != null ? `${summary.dso30}d` : '—' }}
                </p>
              </div>
              <div class="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-timer" class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mt-2">
              <span v-if="summary?.dso30 == null">No invoices issued in last 30 days</span>
              <span v-else-if="summary.dso30 <= 30">Healthy — collecting on time</span>
              <span v-else-if="summary.dso30 <= 45">Watch — collections slowing</span>
              <span v-else>Cash-flow risk — chase aged AR</span>
            </p>
          </UCard>
        </div>

        <!-- Warning banners — truncation + not-yet-sent in a single row. -->
        <div
          v-if="(summary as any)?.truncated?.open || (summary as any)?.truncated?.paid || (summary?.notSentCount || 0) > 0"
          class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
        >
          <!-- Pagination cap-hit warning — surfaces silently-truncated data. -->
          <UAlert
            v-if="(summary as any)?.truncated?.open || (summary as any)?.truncated?.paid"
            color="warning"
            variant="outline"
            icon="i-lucide-database"
            :title="'Truncated AR data'"
            :description="`We fetched the most-relevant ${(summary as any)?.truncated?.open ? (summary as any).truncated.openLimit + ' open' : ''}${(summary as any)?.truncated?.open && (summary as any)?.truncated?.paid ? ' and ' : ''}${(summary as any)?.truncated?.paid ? (summary as any).truncated.paidLimit + ' most-recent paid' : ''} invoices, but Xero has more. Cards and aging buckets reflect only what we fetched. Raise the limit if you regularly hit this.`"
            class="h-full"
          />

          <!-- "Not yet sent" alert — clickable; opens slideover listing the unsent open invoices. -->
          <button
            v-if="(summary?.notSentCount || 0) > 0"
            type="button"
            class="block w-full text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 h-full"
            @click="showNotSentDetail = true"
          >
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-lucide-mail-warning"
              :title="`${summary.notSentCount} invoice${summary.notSentCount === 1 ? '' : 's'} not yet sent — ${formatCurrency(summary.notSentTotal)}`"
              description="Click to review them. They were created but never emailed via Xero — send before chasing payment."
              class="cursor-pointer hover:ring-1 hover:ring-amber-400 transition h-full"
            />
          </button>
        </div>

        <!-- Revenue context row — forward pipeline, recurring, this-month
             billed, GST collected, credit notes outstanding. Each card is
             independently conditional and wrapped in a flex grid so absent
             cards collapse and the row stays balanced. -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <!-- This Month Invoiced — running total billed this calendar month.
               Click → slideover with the per-invoice list. -->
          <button
            v-if="((summary as any)?.monthToDateInvoicedCount || 0) > 0"
            type="button"
            class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            @click="showMonthDetail = true"
          >
            <UCard class="hover:border-blue-500 dark:hover:border-blue-400 transition-colors h-full">
              <div class="flex items-center gap-3 mb-2">
                <div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <UIcon name="i-lucide-calendar-clock" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-[var(--ui-text-muted)] truncate">This Month Invoiced</p>
                  <p class="text-xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.monthToDateInvoicedTotal) }}</p>
                </div>
              </div>
              <p class="text-xs text-[var(--ui-text-muted)] mb-2">
                {{ (summary as any)?.monthToDateInvoicedCount }} invoice{{ (summary as any)?.monthToDateInvoicedCount === 1 ? '' : 's' }} · day {{ (summary as any)?.monthDayOfMonth }}/{{ (summary as any)?.monthDaysInMonth }}
              </p>
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  v-if="(summary as any)?.monthVsLastMonthPct != null"
                  size="sm"
                  variant="subtle"
                  :color="(summary as any).monthVsLastMonthPct >= 0 ? 'success' : 'error'"
                >
                  {{ (summary as any).monthVsLastMonthPct >= 0 ? '+' : '' }}{{ (summary as any).monthVsLastMonthPct }}% vs last
                </UBadge>
                <UBadge
                  v-if="(summary as any)?.monthPaceProjection > (summary as any)?.monthToDateInvoicedTotal"
                  size="sm"
                  variant="subtle"
                  color="info"
                >
                  Pace: {{ formatCurrency((summary as any)?.monthPaceProjection) }}
                </UBadge>
              </div>
            </UCard>
          </button>

          <!-- Forward pipeline — quotes won/sent/drafted but not yet invoiced. -->
          <UCard v-if="(quotesSummary?.count || 0) > 0">
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-file-search" class="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-[var(--ui-text-muted)] truncate">Forward Pipeline</p>
                <p class="text-xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency(quotesSummary?.total) }}</p>
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mb-2">{{ quotesSummary?.count }} active quote{{ (quotesSummary?.count ?? 0) === 1 ? '' : 's' }} not yet invoiced</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge v-if="(quotesSummary?.byStatus.accepted.count || 0) > 0" color="success" variant="subtle" size="sm">
                Accepted: {{ formatCurrency(quotesSummary?.byStatus.accepted.total) }}
              </UBadge>
              <UBadge v-if="(quotesSummary?.byStatus.sent.count || 0) > 0" color="info" variant="subtle" size="sm">
                Sent: {{ formatCurrency(quotesSummary?.byStatus.sent.total) }}
              </UBadge>
              <UBadge v-if="(quotesSummary?.byStatus.draft.count || 0) > 0" color="neutral" variant="subtle" size="sm">
                Draft: {{ formatCurrency(quotesSummary?.byStatus.draft.total) }}
              </UBadge>
            </div>
          </UCard>

          <!-- Recurring revenue — active retainers / subscriptions normalised to MRR. -->
          <UCard v-if="(recurringSummary?.summary?.activeCount || 0) > 0">
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-repeat" class="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-[var(--ui-text-muted)] truncate">Recurring Revenue (MRR)</p>
                <p class="text-xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency(recurringSummary?.summary?.mrr) }}</p>
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mb-2">
              {{ recurringSummary?.summary?.activeCount }} schedule{{ (recurringSummary?.summary?.activeCount ?? 0) === 1 ? '' : 's' }} · {{ recurringSummary?.summary?.clientCount }} client{{ (recurringSummary?.summary?.clientCount ?? 0) === 1 ? '' : 's' }}
            </p>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge color="info" variant="subtle" size="sm">
                ARR: {{ formatCurrency(recurringSummary?.summary?.arr) }}
              </UBadge>
              <UBadge
                v-if="(recurringSummary?.summary?.recurringMonthlyCosts || 0) > 0"
                :color="(recurringSummary?.summary?.netRecurring ?? 0) >= 0 ? 'success' : 'error'"
                variant="subtle"
                size="sm"
              >
                Net: {{ formatCurrency(recurringSummary?.summary?.netRecurring) }}/mo
              </UBadge>
            </div>
          </UCard>

          <!-- GST / Tax collected — sum of totalTax on issued invoices over rolling windows. -->
          <UCard v-if="((summary as any)?.taxSummary?.last90 ?? 0) > 0">
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-percent" class="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div class="min-w-0">
                <UTooltip text="GST/VAT collected on sales invoices. The headline is FY-to-date which maps to BAS box 1A — always reconcile against Xero's official BAS report before lodging.">
                  <p class="text-sm text-[var(--ui-text-muted)] flex items-center gap-1 truncate">
                    GST Collected
                    <UIcon name="i-lucide-info" class="h-3 w-3" />
                  </p>
                </UTooltip>
                <p class="text-xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.taxSummary?.fyToDate) }}</p>
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mb-2">FY-to-date · since {{ formatDate((summary as any)?.taxSummary?.fyStart) }}</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge color="neutral" variant="subtle" size="sm">30d: {{ formatCurrency((summary as any)?.taxSummary?.last30) }}</UBadge>
              <UBadge color="neutral" variant="subtle" size="sm">90d: {{ formatCurrency((summary as any)?.taxSummary?.last90) }}</UBadge>
            </div>
          </UCard>

          <!-- Credit notes outstanding — money owed back to customers / unapplied credits. -->
          <UCard v-if="(creditNotesSummary?.count || 0) > 0">
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-receipt" class="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div class="min-w-0">
                <UTooltip text="Active sales credit notes with an unapplied balance. Money owed back to the customer or available to apply against future invoices.">
                  <p class="text-sm text-[var(--ui-text-muted)] flex items-center gap-1 truncate">
                    Credit Notes
                    <UIcon name="i-lucide-info" class="h-3 w-3" />
                  </p>
                </UTooltip>
                <p class="text-xl font-bold text-rose-600 dark:text-rose-400">{{ formatCurrency(creditNotesSummary?.total) }}</p>
              </div>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)] mb-2">
              {{ creditNotesSummary?.count }} active · Net AR {{ formatCurrency(((summary as any)?.outstandingTotal ?? 0) - (creditNotesSummary?.total ?? 0)) }}
            </p>
            <div v-if="creditNotesSummary?.byContact?.[0]" class="flex flex-wrap items-center gap-1.5">
              <UBadge color="warning" variant="subtle" size="sm">
                Largest: {{ creditNotesSummary.byContact[0].name }} · {{ formatCurrency(creditNotesSummary.byContact[0].total) }}
              </UBadge>
            </div>
          </UCard>
        </div>

        <!-- Cash collection forecast — projected inflows from open AR. -->
        <UCard v-if="((summary as any)?.cashForecast?.buckets || []).some((b: any) => b.count > 0)">
          <template #header>
            <div class="flex items-center justify-between flex-wrap gap-2">
              <UTooltip text="Projected cash inflow from every open invoice, bucketed by due date. Overdue amounts are assumed collectible ASAP. Does not factor in customer payment-on-time history.">
                <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)] flex items-center gap-1">
                  Cash Collection Forecast
                  <UIcon name="i-lucide-info" class="h-4 w-4 text-[var(--ui-text-muted)]" />
                </h3>
              </UTooltip>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-[var(--ui-text-muted)]">Next 30 days expected:</span>
                <span class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.cashForecast?.next30Total) }}</span>
                <span class="text-[var(--ui-text-muted)]">·</span>
                <span class="text-[var(--ui-text-muted)]">{{ (summary as any)?.cashForecast?.next30Count }} invoice{{ ((summary as any)?.cashForecast?.next30Count ?? 0) === 1 ? '' : 's' }}</span>
              </div>
            </div>
          </template>
          <div class="space-y-2">
            <template v-for="bucket in (summary as any)?.cashForecast?.buckets ?? []" :key="bucket.key">
              <div v-if="bucket.count > 0" class="flex items-center gap-3">
                <div class="w-44 shrink-0">
                  <p
                    class="text-sm font-medium"
                    :class="bucket.key === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-[var(--ui-text-highlighted)]'"
                  >
                    {{ bucket.label }}
                  </p>
                  <p class="text-[11px] text-[var(--ui-text-muted)]">{{ bucket.count }} invoice{{ bucket.count === 1 ? '' : 's' }}</p>
                </div>
                <div class="flex-1 h-6 rounded-md bg-[var(--ui-bg-elevated)] overflow-hidden relative">
                  <div
                    class="h-full"
                    :class="{
                      'bg-red-500/70 dark:bg-red-500/40': bucket.key === 'overdue',
                      'bg-amber-500/70 dark:bg-amber-500/40': bucket.key === 'thisWeek',
                      'bg-amber-400/60 dark:bg-amber-400/30': bucket.key === 'nextWeek',
                      'bg-emerald-500/70 dark:bg-emerald-500/40': bucket.key === 'rest30',
                      'bg-blue-400/60 dark:bg-blue-400/30': bucket.key === 'beyond',
                    }"
                    :style="{ width: `${Math.max(2, ((bucket.total / Math.max(...((summary as any)?.cashForecast?.buckets ?? []).map((b: any) => b.total))) * 100) || 0)}%` }"
                  ></div>
                </div>
                <div class="w-32 text-right shrink-0">
                  <p class="text-sm font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(bucket.total) }}</p>
                </div>
              </div>
            </template>
          </div>
        </UCard>

        <!-- Invoice Table (primary content) -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                {{ selectedView === 'all' ? 'All Invoices' : selectedView === 'outstanding' ? 'Outstanding Invoices' : selectedView === 'overdue' ? 'Overdue Invoices' : 'Paid Invoices' }}
              </h3>
              <div class="flex items-center gap-2">
                <UBadge v-if="selectedView === 'paid' && summary?.avgDaysToPay" color="neutral" variant="subtle">
                  Avg days to pay: {{ summary?.avgDaysToPay }}
                </UBadge>
                <UButton
                  v-if="selectedView === 'overdue' && filteredOverdue.length > 0"
                  size="xs"
                  color="primary"
                  icon="i-lucide-send"
                  :loading="bulkReminderPending"
                  @click="sendBulkReminders(filteredOverdue.map((i: any) => i.id))"
                >
                  Send reminders to {{ filteredOverdue.length }} overdue
                </UButton>
              </div>
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
              <!-- Customer concentration risk indicator -->
              <div v-if="(summary as any)?.concentration?.customerCount" class="mt-3 p-2.5 rounded-md bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)]">
                <div class="flex items-center justify-between mb-1.5">
                  <UTooltip text="What share of total open AR sits with your biggest 1, 3, 5 clients. High concentration = if your top client doesn't pay, the hole is huge.">
                    <p class="text-[10px] uppercase tracking-wide text-[var(--ui-text-muted)] flex items-center gap-1 font-semibold">
                      Concentration
                      <UIcon name="i-lucide-info" class="h-3 w-3" />
                    </p>
                  </UTooltip>
                  <UBadge
                    size="sm"
                    :color="(summary as any).concentration.riskLevel === 'high' ? 'error' : (summary as any).concentration.riskLevel === 'moderate' ? 'warning' : 'success'"
                    variant="subtle"
                  >
                    {{ (summary as any).concentration.riskLevel === 'high' ? 'High risk' : (summary as any).concentration.riskLevel === 'moderate' ? 'Moderate' : 'Low risk' }}
                  </UBadge>
                </div>
                <div class="grid grid-cols-3 gap-1.5 text-center">
                  <div>
                    <p class="text-[10px] text-[var(--ui-text-muted)]">Top 1</p>
                    <p class="text-sm font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any).concentration.top1Pct }}%</p>
                  </div>
                  <div>
                    <p class="text-[10px] text-[var(--ui-text-muted)]">Top 3</p>
                    <p class="text-sm font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any).concentration.top3Pct }}%</p>
                  </div>
                  <div>
                    <p class="text-[10px] text-[var(--ui-text-muted)]">Top 5</p>
                    <p class="text-sm font-semibold text-[var(--ui-text-highlighted)]">{{ (summary as any).concentration.top5Pct }}%</p>
                  </div>
                </div>
                <p class="text-[10px] text-[var(--ui-text-muted)] mt-1.5 text-center">
                  Across {{ (summary as any).concentration.customerCount }} client{{ (summary as any).concentration.customerCount === 1 ? '' : 's' }}
                </p>
              </div>
            </template>
            <div class="space-y-3">
              <button
                v-for="client in paginatedTopCustomers"
                :key="client.name"
                type="button"
                class="w-full text-left p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-primary)] hover:bg-[var(--ui-bg-accented)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-primary)] transition-colors"
                @click="openCustomer(client)"
              >
                <div class="flex items-center justify-between">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate mr-2">{{ client.name }}</p>
                  <span class="text-xs text-[var(--ui-text-muted)] shrink-0">{{ client.count }} inv</span>
                </div>
                <div class="flex items-center justify-between text-sm mt-1">
                  <span class="text-[var(--ui-text-muted)]">Outstanding</span>
                  <div class="flex items-center gap-2">
                    <span v-if="client.pctOfAr" class="text-[10px] text-[var(--ui-text-muted)]">{{ client.pctOfAr }}% of AR</span>
                    <span class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(client.outstanding) }}</span>
                  </div>
                </div>
                <div v-if="client.overdue" class="flex items-center justify-between text-xs text-red-500 dark:text-red-400">
                  <span>Overdue</span>
                  <span class="font-medium">{{ formatCurrency(client.overdue) }}</span>
                </div>
              </button>
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

          <!-- Chronic late payers — customers whose average days-to-pay
               is highest. Click to drill into that customer. Hidden if
               we don't have enough paid-invoice history (≥3 invoices/customer). -->
          <UCard v-if="((summary as any)?.latePayers || []).length" class="lg:col-span-3">
            <template #header>
              <div class="flex items-center justify-between">
                <UTooltip text="Customers ranked by average days-to-pay across paid invoices in scope (min 3 invoices each). High numbers = chronic late payers worth renegotiating terms with.">
                  <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)] flex items-center gap-1">
                    Chronic Late Payers
                    <UIcon name="i-lucide-info" class="h-4 w-4 text-[var(--ui-text-muted)]" />
                  </h3>
                </UTooltip>
                <UBadge color="neutral" variant="subtle">{{ (summary as any)?.latePayers?.length ?? 0 }}</UBadge>
              </div>
            </template>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <button
                v-for="payer in (summary as any)?.latePayers ?? []"
                :key="payer.name"
                type="button"
                class="text-left p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-red-400 hover:bg-red-50/30 dark:hover:bg-red-950/20 transition-colors"
                @click="openCustomer({ name: payer.name, outstanding: payer.openOverdue, overdue: payer.openOverdue, count: 0 })"
              >
                <div class="flex items-start justify-between gap-2 mb-1">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ payer.name }}</p>
                  <UBadge
                    size="sm"
                    :color="payer.avgDaysToPay > 60 ? 'error' : payer.avgDaysToPay > 30 ? 'warning' : 'neutral'"
                    variant="subtle"
                  >
                    {{ payer.avgDaysToPay }}d avg
                  </UBadge>
                </div>
                <div class="grid grid-cols-2 gap-1 text-[11px] text-[var(--ui-text-muted)]">
                  <span>Worst: <span class="font-medium text-[var(--ui-text-highlighted)]">{{ payer.maxDaysToPay }}d</span></span>
                  <span>Paid: <span class="font-medium text-[var(--ui-text-highlighted)]">{{ payer.paidCount }} inv</span></span>
                  <span>Billed: <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency(payer.totalBilled) }}</span></span>
                  <span v-if="payer.openOverdue > 0" class="text-red-500 dark:text-red-400">Overdue: <span class="font-medium">{{ formatCurrency(payer.openOverdue) }}</span></span>
                </div>
              </button>
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
      <UButton
        v-if="!detailPending && invoiceDetail && ((invoiceDetail as any)?.amountDue || 0) > 0"
        size="xs"
        variant="solid"
        color="primary"
        icon="i-lucide-send"
        label="Send reminder"
        :loading="reminderPending === (invoiceDetail as any)?.id"
        @click="sendReminder((invoiceDetail as any)?.id)"
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
            <UTooltip
              v-if="(invoiceDetail as any).updatedDate"
              text="Xero only exposes the last-update timestamp. For an unedited invoice this matches the original creation; if the invoice has been edited, this is the latest edit."
              class="col-span-2"
            >
              <div class="flex justify-between">
                <span class="text-[var(--ui-text-muted)]">Last updated in Xero</span>
                <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatDate((invoiceDetail as any).updatedDate) }}</span>
              </div>
            </UTooltip>
            <div
              v-if="lastReminderForOpenInvoice"
              class="col-span-2 flex justify-between"
            >
              <span class="text-[var(--ui-text-muted)]">Last reminder sent</span>
              <span class="font-medium text-amber-600 dark:text-amber-400">
                {{ daysSince(lastReminderForOpenInvoice) }}d ago
              </span>
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

  <!-- Customer drill-down: opens from "Top Outstanding" rows. -->
  <USlideover v-model:open="showCustomerDetail" :title="selectedCustomer?.name || 'Customer'" :description="`${selectedCustomer?.count ?? 0} open invoice${(selectedCustomer?.count ?? 0) === 1 ? '' : 's'}`">
    <template #title>
      <div class="min-w-0">
        <p class="font-semibold text-[var(--ui-text-highlighted)] truncate">{{ selectedCustomer?.name || 'Customer' }}</p>
        <p class="text-xs text-[var(--ui-text-muted)] truncate font-normal">
          {{ selectedCustomer?.count ?? 0 }} open invoice{{ (selectedCustomer?.count ?? 0) === 1 ? '' : 's' }}
        </p>
      </div>
    </template>
    <template #actions>
      <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-list-filter" label="Show in table" @click="focusCustomerInTable" />
    </template>
    <template #body>
      <div v-if="selectedCustomer" class="space-y-6">
        <!-- Headline numbers -->
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-lg border border-[var(--ui-border)]">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Outstanding</p>
            <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(selectedCustomer.outstanding) }}</p>
          </div>
          <div class="p-3 rounded-lg border" :class="selectedCustomer.overdue > 0 ? 'border-red-300 dark:border-red-700' : 'border-[var(--ui-border)]'">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Overdue</p>
            <p class="text-lg font-semibold" :class="selectedCustomer.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--ui-text-highlighted)]'">
              {{ formatCurrency(selectedCustomer.overdue) }}
            </p>
          </div>
        </div>

        <!-- Relationship KPIs -->
        <div v-if="customerKpis" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Relationship</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Lifetime billed (visible)</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency(customerKpis.lifetimeBilled) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Avg days to pay</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ customerKpis.avgDaysToPay ?? '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Open invoices</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ customerKpis.openCount }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Recent payments</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ customerKpis.paidCount }}</span>
            </div>
            <div v-if="customerKpis.oldestOverdueDays > 0" class="flex justify-between col-span-2">
              <span class="text-[var(--ui-text-muted)]">Oldest overdue</span>
              <span class="font-medium text-red-600 dark:text-red-400">{{ customerKpis.oldestOverdueDays }} days</span>
            </div>
            <div v-if="customerKpis.earliestInvoiceDate" class="flex justify-between col-span-2">
              <span class="text-[var(--ui-text-muted)]">Earliest invoice we can see</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatDate(customerKpis.earliestInvoiceDate) }}</span>
            </div>
          </div>
          <p class="text-[10px] text-[var(--ui-text-muted)] mt-1 italic">
            Numbers limited to invoices fetched on this page (up to 1000 open + 300 most-recent paid).
          </p>
        </div>

        <!-- Open invoices -->
        <div v-if="customerOpen.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Open invoices</h3>
          <div class="space-y-2">
            <button
              v-for="inv in customerOpen"
              :key="inv.id"
              type="button"
              class="w-full text-left p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-primary)] transition-colors"
              @click="openInvoice(inv.id); showCustomerDetail = false"
            >
              <div class="flex items-center justify-between">
                <div class="min-w-0 mr-2">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ inv.number }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)] truncate">
                    Issued {{ formatDate(inv.date) }} · Due {{ formatDate(inv.dueDate) }}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(inv.amountDue, inv.currency) }}</p>
                  <UBadge
                    v-if="inv.status === 'OVERDUE'"
                    color="error"
                    variant="subtle"
                    size="sm"
                  >
                    {{ inv.daysOverdue }}d overdue
                  </UBadge>
                  <UBadge
                    v-else
                    color="warning"
                    variant="subtle"
                    size="sm"
                  >
                    Due in {{ inv.daysUntilDue }}d
                  </UBadge>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Recent payments -->
        <div v-if="customerPaid.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Recent payments</h3>
          <div class="space-y-2">
            <button
              v-for="inv in customerPaid"
              :key="inv.id"
              type="button"
              class="w-full text-left p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 hover:ring-2 hover:ring-emerald-300 dark:hover:ring-emerald-700 transition"
              @click="openInvoice(inv.id); showCustomerDetail = false"
            >
              <div class="flex items-center justify-between">
                <div class="min-w-0 mr-2">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ inv.number }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)] truncate">Paid {{ formatDate(inv.fullyPaidOnDate) }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCurrency(inv.total, inv.currency) }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ inv.daysToPay ?? '—' }}d to pay</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </USlideover>

  <!-- "Not yet sent" drill-down: every open invoice that was never emailed via Xero. -->
  <USlideover v-model:open="showNotSentDetail" :title="`${notSentInvoices.length} not yet sent`" :description="formatCurrency(summary?.notSentTotal) + ' total'">
    <template #title>
      <div class="min-w-0">
        <p class="font-semibold text-[var(--ui-text-highlighted)] truncate">{{ notSentInvoices.length }} invoice{{ notSentInvoices.length === 1 ? '' : 's' }} not yet sent</p>
        <p class="text-xs text-[var(--ui-text-muted)] truncate font-normal">{{ formatCurrency(summary?.notSentTotal) }} · open balance</p>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="Why this matters"
          description="These invoices were created in Xero but never emailed to the client (sentToContact=false). Send them before chasing payment — the client may not even know they exist yet."
        />

        <div v-if="notSentInvoices.length" class="space-y-2">
          <button
            v-for="inv in notSentInvoices"
            :key="inv.id"
            type="button"
            class="w-full text-left p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-amber-500 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition"
            @click="openInvoice(inv.id); showNotSentDetail = false"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ inv.number }}</p>
                <p class="text-xs text-[var(--ui-text-muted)] truncate">{{ inv.contact || 'Unknown' }}</p>
                <p class="text-[11px] text-[var(--ui-text-muted)]">
                  Issued {{ formatDate(inv.date) }} · Due {{ formatDate(inv.dueDate) }}
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(inv.amountDue, inv.currency) }}</p>
                <UBadge
                  v-if="inv.status === 'OVERDUE'"
                  color="error"
                  variant="subtle"
                  size="sm"
                >
                  {{ inv.daysOverdue }}d overdue
                </UBadge>
                <UBadge
                  v-else
                  color="warning"
                  variant="subtle"
                  size="sm"
                >
                  Due in {{ inv.daysUntilDue }}d
                </UBadge>
              </div>
            </div>
          </button>
        </div>

        <p v-else class="text-sm text-[var(--ui-text-muted)] text-center py-4">All open invoices have been sent. Nothing to chase here.</p>
      </div>
    </template>
  </USlideover>

  <!-- "This month" drill-down: every invoice issued this calendar month
       (paid + unpaid) with comparison stats and the full per-invoice list. -->
  <USlideover v-model:open="showMonthDetail" :title="`Invoiced this month: ${formatCurrency((summary as any)?.monthToDateInvoicedTotal)}`" :description="`${(summary as any)?.monthToDateInvoicedCount ?? 0} invoices since ${formatDate((summary as any)?.monthStart)}`">
    <template #title>
      <div class="min-w-0">
        <p class="font-semibold text-[var(--ui-text-highlighted)] truncate">
          Invoiced this month
        </p>
        <p class="text-xs text-[var(--ui-text-muted)] truncate font-normal">
          {{ formatCurrency((summary as any)?.monthToDateInvoicedTotal) }} · {{ (summary as any)?.monthToDateInvoicedCount }} invoices · day {{ (summary as any)?.monthDayOfMonth }}/{{ (summary as any)?.monthDaysInMonth }}
        </p>
      </div>
    </template>
    <template #body>
      <div class="space-y-6">
        <!-- KPI grid -->
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-lg border border-[var(--ui-border)]">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Total billed</p>
            <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.monthToDateInvoicedTotal) }}</p>
          </div>
          <div class="p-3 rounded-lg border border-[var(--ui-border)]">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Avg invoice</p>
            <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.monthAvgInvoice) }}</p>
          </div>
          <div class="p-3 rounded-lg border border-emerald-300 dark:border-emerald-700">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Already paid</p>
            <p class="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{{ formatCurrency((summary as any)?.monthPaidPortion) }}</p>
          </div>
          <div class="p-3 rounded-lg border" :class="((summary as any)?.monthUnpaidPortion ?? 0) > 0 ? 'border-amber-300 dark:border-amber-700' : 'border-[var(--ui-border)]'">
            <p class="text-[10px] text-[var(--ui-text-muted)] uppercase">Still owed</p>
            <p class="text-lg font-semibold" :class="((summary as any)?.monthUnpaidPortion ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--ui-text-highlighted)]'">
              {{ formatCurrency((summary as any)?.monthUnpaidPortion) }}
            </p>
          </div>
        </div>

        <!-- vs last month + pace -->
        <div class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Trend</h3>
          <div class="grid grid-cols-1 gap-2 text-sm">
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Same window last month (1st – day {{ (summary as any)?.monthDayOfMonth }})</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.monthLastSameWindowTotal) }}</span>
            </div>
            <div v-if="(summary as any)?.monthVsLastMonthPct != null" class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Change</span>
              <span
                class="font-semibold"
                :class="(summary as any).monthVsLastMonthPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
              >
                {{ (summary as any).monthVsLastMonthPct >= 0 ? '+' : '' }}{{ (summary as any).monthVsLastMonthPct }}%
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Pace projection (end of month)</span>
              <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency((summary as any)?.monthPaceProjection) }}</span>
            </div>
            <div v-if="(summary as any)?.monthTopCustomerName" class="flex justify-between">
              <span class="text-[var(--ui-text-muted)]">Top customer this month</span>
              <span class="font-medium text-[var(--ui-text-highlighted)] truncate ml-2">
                {{ (summary as any).monthTopCustomerName }} · {{ formatCurrency((summary as any).monthTopCustomerTotal) }}
              </span>
            </div>
          </div>
          <p class="text-[10px] text-[var(--ui-text-muted)] italic">Comparison and pace use a straight-line extrapolation from current MTD; useful as a signal, not a forecast.</p>
        </div>

        <!-- Per-invoice list -->
        <div v-if="monthInvoices.length" class="space-y-2">
          <h3 class="text-xs uppercase text-[var(--ui-text-muted)] font-semibold tracking-wider">Invoices ({{ monthInvoices.length }})</h3>
          <div class="space-y-2">
            <button
              v-for="inv in monthInvoices"
              :key="inv.id"
              type="button"
              class="w-full text-left p-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
              @click="openInvoice(inv.id); showMonthDetail = false"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-[var(--ui-text-highlighted)] text-sm truncate">{{ inv.number }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)] truncate">{{ inv.contact || 'Unknown' }}</p>
                  <p class="text-[11px] text-[var(--ui-text-muted)]">Issued {{ formatDate(inv.date) }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-semibold text-[var(--ui-text-highlighted)]">{{ formatCurrency(inv.total, inv.currency) }}</p>
                  <UBadge
                    size="sm"
                    :color="inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'error' : 'warning'"
                    variant="subtle"
                  >
                    {{ inv.status === 'PAID' ? 'Paid' : inv.status === 'OVERDUE' ? `${inv.daysOverdue}d overdue` : 'Open' }}
                  </UBadge>
                </div>
              </div>
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-[var(--ui-text-muted)] text-center py-4">No invoices were issued this month.</p>
      </div>
    </template>
  </USlideover>
</template>
