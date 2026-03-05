<script setup lang="ts">
definePageMeta({ layout: 'agency' })

// ── Types ──
type Contact = {
  id: string
  contactNumber?: string
  accountNumber?: string
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  isCustomer: boolean
  isSupplier: boolean
  status: string
  defaultCurrency?: string
  website?: string
  taxNumber?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
  balances?: {
    receivableOutstanding?: number
    receivableOverdue?: number
    payableOutstanding?: number
    payableOverdue?: number
  }
  paymentTerms?: {
    days: number
    type: string
  }
  updatedAt?: string
}

type ContactsResponse = {
  contacts: Contact[]
  count: number
  customerCount: number
  supplierCount: number
}

type AgingContact = { name: string; amount: number; count: number; oldestDays: number }
type AgingReport = {
  reportType: string
  totalOutstanding: number
  totalInvoices: number
  averageDaysPastDue: number
  criticalCount: number
  criticalAmount: number
  agingSummary: Array<{ bucket: string; amount: number; count: number; percentage: number }>
  topContacts: AgingContact[]
}

// ── Data ──
const { data, pending, error, refresh } = await useFetch<ContactsResponse>('/api/xero/contacts')

const { data: aging, pending: agingPending } = await useFetch<AgingReport>(
  '/api/xero/reports/aging',
  { lazy: true, server: false }
)

// ── Filters ──
const search = ref('')
const filterType = ref<'all' | 'customers' | 'suppliers'>('all')

const filteredContacts = computed(() => {
  let list = data.value?.contacts ?? []

  if (filterType.value === 'customers') list = list.filter(c => c.isCustomer)
  else if (filterType.value === 'suppliers') list = list.filter(c => c.isSupplier)

  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.accountNumber?.toLowerCase().includes(q)
    )
  }

  return list
})

// ── Pagination ──
const pageSize = 25
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredContacts.value.length / pageSize)))
const paginatedContacts = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredContacts.value.slice(start, start + pageSize)
})

watch(filteredContacts, () => {
  if (page.value > totalPages.value) page.value = 1
})

// ── Summary metrics ──
const metrics = computed(() => {
  const contacts = data.value?.contacts ?? []
  let totalOutstanding = 0
  let totalOverdue = 0
  let contactsWithBalance = 0

  for (const c of contacts) {
    const outstanding = c.balances?.receivableOutstanding ?? 0
    const overdue = c.balances?.receivableOverdue ?? 0
    if (outstanding > 0) contactsWithBalance++
    totalOutstanding += outstanding
    totalOverdue += overdue
  }

  return {
    total: data.value?.count ?? 0,
    customers: data.value?.customerCount ?? 0,
    suppliers: data.value?.supplierCount ?? 0,
    totalOutstanding,
    totalOverdue,
    contactsWithBalance,
    avgDaysPastDue: aging.value?.averageDaysPastDue ?? 0
  }
})

// ── Top debtors (from aging API for richer data) ──
const topDebtors = computed(() => aging.value?.topContacts?.slice(0, 8) ?? [])

// ── Health scoring ──
function contactHealth(c: Contact): { label: string; color: string } {
  const overdue = c.balances?.receivableOverdue ?? 0
  const outstanding = c.balances?.receivableOutstanding ?? 0
  if (overdue > 0) return { label: 'Overdue', color: 'error' }
  if (outstanding > 0) return { label: 'Outstanding', color: 'warning' }
  return { label: 'Clear', color: 'success' }
}

// ── Payment terms display ──
function paymentTermsLabel(pt?: Contact['paymentTerms']): string {
  if (!pt) return '-'
  const typeMap: Record<string, string> = {
    DAYSAFTERBILLDATE: 'days after invoice',
    DAYSAFTERBILLMONTH: 'days after month end',
    OFFOLLOWINGMONTH: 'of following month'
  }
  return `${pt.days} ${typeMap[pt.type] ?? pt.type}`
}

// ── Formatters ──
function fmt(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function formatDate(value?: string) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Slideover detail ──
const selectedContact = ref<Contact | null>(null)
const showDetail = ref(false)

function openContact(c: Contact) {
  selectedContact.value = c
  showDetail.value = true
}

// ── Table columns ──
const columns = [
  { accessorKey: 'name', header: 'Name', id: 'ct-name' },
  { accessorKey: 'email', header: 'Email', id: 'ct-email' },
  { accessorKey: 'type', header: 'Type', id: 'ct-type' },
  { accessorKey: 'outstanding', header: 'Outstanding', id: 'ct-outstanding', class: 'text-right' },
  { accessorKey: 'overdue', header: 'Overdue', id: 'ct-overdue', class: 'text-right' },
  { accessorKey: 'terms', header: 'Terms', id: 'ct-terms' },
  { accessorKey: 'health', header: 'Status', id: 'ct-health' }
]

const tableRows = computed(() =>
  paginatedContacts.value.map(c => ({
    _raw: c,
    name: c.name,
    email: c.email ?? '-',
    type: c.isCustomer && c.isSupplier ? 'Both' : c.isCustomer ? 'Customer' : 'Supplier',
    outstanding: fmt(c.balances?.receivableOutstanding),
    overdue: fmt(c.balances?.receivableOverdue),
    terms: paymentTermsLabel(c.paymentTerms),
    health: contactHealth(c)
  }))
)

const breadcrumbs = computed(() => ([
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Financial Reports', to: '/reports' },
  { label: 'Customers', to: '/customers' }
]))
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar title="Customers & Contacts" description="Client accounts, balances, and payment history from Xero">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>
        <template #right>
          <UInput
            v-model="search"
            placeholder="Search contacts..."
            icon="i-lucide-search"
            class="w-56"
          />
          <div class="flex items-center gap-1">
            <UButton
              label="All"
              :variant="filterType === 'all' ? 'soft' : 'ghost'"
              color="neutral"
              size="xs"
              @click="filterType = 'all'"
            />
            <UButton
              label="Customers"
              :variant="filterType === 'customers' ? 'soft' : 'ghost'"
              color="neutral"
              size="xs"
              @click="filterType = 'customers'"
            />
            <UButton
              label="Suppliers"
              :variant="filterType === 'suppliers' ? 'soft' : 'ghost'"
              color="neutral"
              size="xs"
              @click="filterType = 'suppliers'"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="`sk-${n}`" class="h-24" />
        </div>
        <USkeleton class="h-96" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load contacts"
        :description="(error as any)?.statusMessage || 'Please connect to Xero and try again.'"
      />

      <div v-else class="space-y-6">
        <!-- ═══ Summary Cards ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Total Contacts</p>
              <UIcon name="i-lucide-users" class="size-5 text-blue-500" />
            </div>
            <p class="text-2xl font-bold">{{ metrics.total }}</p>
            <p class="text-[11px] text-muted mt-1">{{ metrics.customers }} customers, {{ metrics.suppliers }} suppliers</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Outstanding</p>
              <UIcon name="i-lucide-receipt" class="size-5 text-amber-500" />
            </div>
            <p class="text-2xl font-bold">{{ fmt(metrics.totalOutstanding) }}</p>
            <p class="text-[11px] text-muted mt-1">{{ metrics.contactsWithBalance }} contacts with balance</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Overdue</p>
              <UIcon name="i-lucide-alert-triangle" class="size-5 text-red-500" />
            </div>
            <p class="text-2xl font-bold" :class="metrics.totalOverdue > 0 ? 'text-red-500' : ''">
              {{ fmt(metrics.totalOverdue) }}
            </p>
            <p class="text-[11px] text-muted mt-1">Avg {{ Math.round(metrics.avgDaysPastDue) }} days past due</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Collection Risk</p>
              <UIcon
                name="i-lucide-shield-check"
                :class="['size-5', metrics.totalOverdue > metrics.totalOutstanding * 0.3 ? 'text-red-500' : metrics.totalOverdue > 0 ? 'text-amber-500' : 'text-green-500']"
              />
            </div>
            <p class="text-2xl font-bold">
              {{ metrics.totalOutstanding > 0 ? `${((metrics.totalOverdue / metrics.totalOutstanding) * 100).toFixed(0)}%` : '0%' }}
            </p>
            <p class="text-[11px] text-muted mt-1">Overdue as % of outstanding</p>
          </UCard>
        </div>

        <!-- ═══ Top Debtors + Aging ═══ -->
        <div v-if="topDebtors.length" class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Top Outstanding Contacts</p>
              <h3 class="text-lg font-semibold">Highest Balances</h3>
            </header>

            <div v-if="agingPending" class="space-y-3">
              <USkeleton v-for="n in 5" :key="`debt-sk-${n}`" class="h-10" />
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="contact in topDebtors"
                :key="contact.name"
                class="flex items-center justify-between p-3 rounded-lg border border-default hover:bg-elevated/50 transition-colors"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <UAvatar :label="contact.name.charAt(0)" size="sm" />
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{{ contact.name }}</p>
                    <p class="text-xs text-muted">{{ contact.count }} invoice{{ contact.count !== 1 ? 's' : '' }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-sm font-semibold">{{ fmt(contact.amount) }}</span>
                  <UBadge v-if="contact.oldestDays > 60" color="error" variant="subtle" size="xs">
                    {{ contact.oldestDays }}d
                  </UBadge>
                  <UBadge v-else-if="contact.oldestDays > 30" color="warning" variant="subtle" size="xs">
                    {{ contact.oldestDays }}d
                  </UBadge>
                </div>
              </div>
            </div>
          </UCard>

          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Receivables Aging</p>
              <h3 class="text-lg font-semibold">{{ fmt(aging?.totalOutstanding) }} Total</h3>
            </header>

            <div v-if="agingPending" class="space-y-3">
              <USkeleton v-for="n in 5" :key="`ag-sk-${n}`" class="h-8" />
            </div>
            <template v-else-if="aging?.agingSummary?.length">
              <div class="space-y-2">
                <div v-for="bucket in aging.agingSummary" :key="bucket.bucket" class="flex items-center gap-3">
                  <span class="text-xs text-muted w-16 text-right shrink-0">
                    {{ bucket.bucket === 'current' ? 'Current' : bucket.bucket === '90+' ? '90+ days' : `${bucket.bucket} days` }}
                  </span>
                  <div class="flex-1 h-6 bg-muted/10 rounded-full overflow-hidden">
                    <div
                      :class="[
                        'h-full rounded-full transition-all duration-500',
                        bucket.bucket === 'current' ? 'bg-green-500' :
                        bucket.bucket === '1-30' ? 'bg-blue-500' :
                        bucket.bucket === '31-60' ? 'bg-yellow-500' :
                        bucket.bucket === '61-90' ? 'bg-orange-500' : 'bg-red-500'
                      ]"
                      :style="{ width: (aging?.totalOutstanding ?? 0) > 0 ? `${Math.max(2, (bucket.amount / (aging?.totalOutstanding ?? 1)) * 100)}%` : '0%' }"
                    />
                  </div>
                  <div class="text-xs text-right shrink-0 w-24">
                    <span class="font-medium">{{ fmt(bucket.amount) }}</span>
                    <span class="text-muted ml-1">({{ bucket.count }})</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3 pt-3 border-t border-default">
                <div>
                  <p class="text-[10px] text-muted uppercase">Total Invoices</p>
                  <p class="text-sm font-semibold">{{ aging?.totalInvoices ?? 0 }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted uppercase">Avg Days Late</p>
                  <p class="text-sm font-semibold">{{ Math.round(aging?.averageDaysPastDue ?? 0) }}</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted uppercase">Critical (90+)</p>
                  <p class="text-sm font-semibold" :class="(aging?.criticalCount ?? 0) > 0 ? 'text-red-500' : ''">
                    {{ aging?.criticalCount ?? 0 }} ({{ fmt(aging?.criticalAmount) }})
                  </p>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No aging data available.</p>
          </UCard>
        </div>

        <!-- ═══ Contacts Table ═══ -->
        <UCard :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center justify-between px-6">
              <div>
                <h3 class="text-base font-semibold">All Contacts</h3>
                <p class="text-xs text-muted">{{ filteredContacts.length }} contact{{ filteredContacts.length !== 1 ? 's' : '' }} found</p>
              </div>
            </div>
          </template>

          <UTable :columns="columns" :data="tableRows" class="w-full">
            <template #name-cell="{ row }">
              <button class="text-left hover:text-primary transition-colors" @click="openContact(row.original._raw)">
                <div class="flex items-center gap-2">
                  <UAvatar :label="row.original.name.charAt(0)" size="xs" />
                  <span class="font-medium text-sm">{{ row.original.name }}</span>
                </div>
              </button>
            </template>

            <template #email-cell="{ row }">
              <span class="text-xs text-muted">{{ row.original.email }}</span>
            </template>

            <template #type-cell="{ row }">
              <UBadge
                :color="row.original.type === 'Customer' ? 'primary' : row.original.type === 'Supplier' ? 'neutral' : 'info'"
                variant="subtle"
                size="xs"
              >
                {{ row.original.type }}
              </UBadge>
            </template>

            <template #outstanding-cell="{ row }">
              <span class="text-sm font-medium text-right block">{{ row.original.outstanding }}</span>
            </template>

            <template #overdue-cell="{ row }">
              <span
                class="text-sm font-medium text-right block"
                :class="row.original.overdue !== '-' && row.original.overdue !== '$0' ? 'text-red-500' : ''"
              >
                {{ row.original.overdue }}
              </span>
            </template>

            <template #health-cell="{ row }">
              <UBadge
                :color="row.original.health.color as any"
                variant="subtle"
                size="xs"
              >
                {{ row.original.health.label }}
              </UBadge>
            </template>
          </UTable>

          <div v-if="filteredContacts.length > pageSize" class="flex justify-end px-6 py-3 border-t border-default">
            <UPagination v-model:page="page" :total="filteredContacts.length" :items-per-page="pageSize" size="sm" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- ═══ Contact Detail Slideover ═══ -->
  <USlideover v-model:open="showDetail">
    <template #content>
      <div v-if="selectedContact" class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-start gap-4">
          <UAvatar :label="selectedContact.name.charAt(0)" size="lg" />
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold truncate">{{ selectedContact.name }}</h2>
            <div class="flex items-center gap-2 mt-1">
              <UBadge v-if="selectedContact.isCustomer" color="primary" variant="subtle" size="xs">Customer</UBadge>
              <UBadge v-if="selectedContact.isSupplier" color="neutral" variant="subtle" size="xs">Supplier</UBadge>
              <UBadge :color="contactHealth(selectedContact).color as any" variant="subtle" size="xs">
                {{ contactHealth(selectedContact).label }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Contact Info -->
        <div class="space-y-3">
          <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Contact Info</h3>

          <div v-if="selectedContact.email" class="flex items-center gap-3 text-sm">
            <UIcon name="i-lucide-mail" class="size-4 text-muted shrink-0" />
            <a :href="`mailto:${selectedContact.email}`" class="text-primary hover:underline truncate">{{ selectedContact.email }}</a>
          </div>

          <div v-if="selectedContact.phone" class="flex items-center gap-3 text-sm">
            <UIcon name="i-lucide-phone" class="size-4 text-muted shrink-0" />
            <span>{{ selectedContact.phone }}</span>
          </div>

          <div v-if="selectedContact.website" class="flex items-center gap-3 text-sm">
            <UIcon name="i-lucide-globe" class="size-4 text-muted shrink-0" />
            <a :href="selectedContact.website" target="_blank" rel="noopener" class="text-primary hover:underline truncate">
              {{ selectedContact.website }}
            </a>
          </div>

          <div v-if="selectedContact.address?.line1" class="flex items-start gap-3 text-sm">
            <UIcon name="i-lucide-map-pin" class="size-4 text-muted shrink-0 mt-0.5" />
            <div>
              <p>{{ selectedContact.address.line1 }}</p>
              <p v-if="selectedContact.address.line2">{{ selectedContact.address.line2 }}</p>
              <p>
                {{ [selectedContact.address.city, selectedContact.address.region, selectedContact.address.postalCode].filter(Boolean).join(', ') }}
              </p>
              <p v-if="selectedContact.address.country">{{ selectedContact.address.country }}</p>
            </div>
          </div>
        </div>

        <!-- Financial -->
        <div v-if="selectedContact.balances" class="space-y-3">
          <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Financial</h3>

          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-lg border border-default">
              <p class="text-[10px] text-muted uppercase">Receivable Outstanding</p>
              <p class="text-lg font-semibold">{{ fmt(selectedContact.balances.receivableOutstanding) }}</p>
            </div>
            <div class="p-3 rounded-lg border border-default">
              <p class="text-[10px] text-muted uppercase">Receivable Overdue</p>
              <p class="text-lg font-semibold" :class="(selectedContact.balances.receivableOverdue ?? 0) > 0 ? 'text-red-500' : ''">
                {{ fmt(selectedContact.balances.receivableOverdue) }}
              </p>
            </div>
            <div class="p-3 rounded-lg border border-default">
              <p class="text-[10px] text-muted uppercase">Payable Outstanding</p>
              <p class="text-lg font-semibold">{{ fmt(selectedContact.balances.payableOutstanding) }}</p>
            </div>
            <div class="p-3 rounded-lg border border-default">
              <p class="text-[10px] text-muted uppercase">Payable Overdue</p>
              <p class="text-lg font-semibold" :class="(selectedContact.balances.payableOverdue ?? 0) > 0 ? 'text-red-500' : ''">
                {{ fmt(selectedContact.balances.payableOverdue) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Payment Terms -->
        <div v-if="selectedContact.paymentTerms" class="space-y-3">
          <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Payment Terms</h3>
          <div class="flex items-center gap-3 text-sm">
            <UIcon name="i-lucide-calendar-clock" class="size-4 text-muted" />
            <span>{{ paymentTermsLabel(selectedContact.paymentTerms) }}</span>
          </div>
        </div>

        <!-- Meta -->
        <div class="space-y-3 pt-3 border-t border-default">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>Account #</span>
            <span class="font-medium">{{ selectedContact.accountNumber || selectedContact.contactNumber || '-' }}</span>
          </div>
          <div v-if="selectedContact.taxNumber" class="flex items-center justify-between text-xs text-muted">
            <span>Tax Number</span>
            <span class="font-medium">{{ selectedContact.taxNumber }}</span>
          </div>
          <div v-if="selectedContact.defaultCurrency" class="flex items-center justify-between text-xs text-muted">
            <span>Currency</span>
            <span class="font-medium">{{ selectedContact.defaultCurrency }}</span>
          </div>
          <div v-if="selectedContact.updatedAt" class="flex items-center justify-between text-xs text-muted">
            <span>Last Updated</span>
            <span class="font-medium">{{ formatDate(selectedContact.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
