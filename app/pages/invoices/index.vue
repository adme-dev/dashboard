<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/xero/invoices')

const search = ref('')
const selectedView = ref<'all' | 'outstanding' | 'overdue' | 'paid'>('all')
const outstandingAging = ref<'all' | 'due_7' | 'due_30'>('all')

function formatCurrency(value?: number, currency?: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 })
}

function formatDate(value?: string) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const summary = computed(() => data.value?.summary ?? null)
const agingDetails = computed(() => summary.value?.agingDetails ?? null)

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
  const list = data.value?.paid ?? []
  if (!search.value) return list
  return list.filter((inv: any) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()))
})

const filteredAll = computed(() => {
  const combined = data.value?.all ?? [
    ...(data.value?.outstanding ?? []),
    ...(data.value?.overdue ?? []),
    ...(data.value?.paid ?? [])
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

watch(selectedView, (view) => {
  if (view === 'all') pageAll.value = 1
  if (view === 'outstanding') pageOutstanding.value = 1
  if (view === 'overdue') pageOverdue.value = 1
  if (view === 'paid') pagePaid.value = 1
})

const topCustomers = computed(() => summary.value?.topCustomers ?? [])

const columnsOutstanding = [
  { id: 'number', key: 'number', label: 'Invoice #' },
  { id: 'contact', key: 'contact', label: 'Customer' },
  { id: 'issued', key: 'date', label: 'Issued' },
  { id: 'dueDate', key: 'dueDate', label: 'Due' },
  { id: 'daysUntilDue', key: 'daysUntilDue', label: 'Days' },
  { id: 'amountDue', key: 'amountDue', label: 'Amount Due', class: 'text-right' }
]

const columnsOverdue = [
  { id: 'number', key: 'number', label: 'Invoice #' },
  { id: 'contact', key: 'contact', label: 'Customer' },
  { id: 'issued', key: 'date', label: 'Issued' },
  { id: 'dueDate', key: 'dueDate', label: 'Due' },
  { id: 'daysOverdue', key: 'daysOverdue', label: 'Days Overdue' },
  { id: 'amountDue', key: 'amountDue', label: 'Amount Due', class: 'text-right' }
]

const columnsPaid = [
  { id: 'number', key: 'number', label: 'Invoice #' },
  { id: 'contact', key: 'contact', label: 'Customer' },
  { id: 'issued', key: 'date', label: 'Issued' },
  { id: 'paidOn', key: 'fullyPaidOnDate', label: 'Paid On' },
  { id: 'daysToPay', key: 'daysToPay', label: 'Days to Pay' },
  { id: 'total', key: 'total', label: 'Total', class: 'text-right' }
]

const columnsAll = [
  { id: 'number', key: 'number', label: 'Invoice #' },
  { id: 'contact', key: 'contact', label: 'Customer' },
  { id: 'status', key: 'status', label: 'Status' },
  { id: 'issued', key: 'date', label: 'Issued' },
  { id: 'dueDate', key: 'dueDate', label: 'Due' },
  { id: 'amount', key: 'amountDue', label: 'Balance', class: 'text-right' }
]
</script>

<template>
  <UDashboardPanel id="invoices">
    <template #header>
      <UDashboardNavbar title="Invoices" description="Track outstanding balances, overdue risk, and recent payments">
        <template #right>
          <UButton label="Refresh" color="neutral" icon="i-lucide-refresh-cw" @click="refresh" :loading="pending" />
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
          <div class="inline-flex items-center gap-2">
            <UButton :variant="selectedView === 'all' ? 'solid' : 'ghost'" icon="i-lucide-layers" @click="selectedView = 'all'">All</UButton>
            <UButton :variant="selectedView === 'outstanding' ? 'solid' : 'ghost'" icon="i-lucide-calendar-clock" @click="selectedView = 'outstanding'">Outstanding</UButton>
            <UButton :variant="selectedView === 'overdue' ? 'solid' : 'ghost'" icon="i-lucide-alarm-minus" color="red" @click="selectedView = 'overdue'">Overdue</UButton>
            <UButton :variant="selectedView === 'paid' ? 'solid' : 'ghost'" icon="i-lucide-badge-check" color="emerald" @click="selectedView = 'paid'">Paid</UButton>
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
        color="red"
        variant="subtle"
        title="Unable to load invoices"
        :description="error.statusMessage || 'Please try refreshing.'"
      />

      <div v-else class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Outstanding Balance</p>
                <p class="text-2xl font-bold">{{ formatCurrency(summary?.outstandingTotal) }}</p>
              </div>
              <UIcon name="i-lucide-file-text" class="h-7 w-7 text-emerald-500" />
            </div>
            <p class="text-xs text-muted mt-2">{{ summary?.outstandingCount || 0 }} invoices with open balances</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Overdue Balance</p>
                <p class="text-2xl font-bold text-red-600">{{ formatCurrency(summary?.overdueTotal) }}</p>
              </div>
              <UIcon name="i-lucide-alert-triangle" class="h-7 w-7 text-red-500" />
            </div>
            <p class="text-xs text-muted mt-2">{{ summary?.overdueCount || 0 }} invoices past due</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Due in 7 days</p>
                <p class="text-2xl font-bold text-amber-600">{{ formatCurrency(summary?.dueSoonTotal) }}</p>
              </div>
              <UIcon name="i-lucide-hourglass" class="h-7 w-7 text-amber-500" />
            </div>
            <p class="text-xs text-muted mt-2">Upcoming cash expected this week</p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Paid Last 30 Days</p>
                <p class="text-2xl font-bold text-emerald-600">{{ formatCurrency(summary?.paidLast30Total) }}</p>
              </div>
              <UIcon name="i-lucide-badge-check" class="h-7 w-7 text-emerald-500" />
            </div>
            <p class="text-xs text-muted mt-2">{{ summary?.paidLast30Count || 0 }} invoices closed recently</p>
          </UCard>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <UCard class="lg:col-span-2">
            <template #header>
              <h3 class="text-base font-semibold">Invoice Aging Overview</h3>
            </template>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                <p class="text-muted text-xs uppercase tracking-wide">Current</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.current ?? 0 }}</p>
                <p class="text-xs text-muted">Not yet due</p>
              </div>
              <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <p class="text-muted text-xs uppercase tracking-wide">Due &lt;= 7 days</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.dueSoon ?? 0 }}</p>
                <p class="text-xs text-muted">Requires follow-up</p>
              </div>
              <div class="p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                <p class="text-muted text-xs uppercase tracking-wide">Overdue &le; 7 days</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.overdue7 ?? summary?.agingBuckets?.bucket1 ?? 0 }}</p>
                <p class="text-xs text-muted">Recently late</p>
              </div>
              <div class="p-3 rounded-lg bg-red-50/90 dark:bg-red-950/40">
                <p class="text-muted text-xs uppercase tracking-wide">Overdue 8-14 days</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.overdue14 ?? summary?.agingBuckets?.bucket2 ?? 0 }}</p>
                <p class="text-xs text-muted">Watch closely</p>
              </div>
              <div class="p-3 rounded-lg bg-red-100 dark:bg-red-950/60">
                <p class="text-muted text-xs uppercase tracking-wide">Overdue 15-30 days</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.overdue30 ?? summary?.agingBuckets?.bucket3 ?? 0 }}</p>
                <p class="text-xs text-muted">Escalate if needed</p>
              </div>
              <div class="p-3 rounded-lg bg-red-200 dark:bg-red-900/80">
                <p class="text-muted text-xs uppercase tracking-wide">Overdue 30+ days</p>
                <p class="text-lg font-semibold">{{ summary?.agingBuckets?.overdue60 ?? summary?.agingBuckets?.bucket4 ?? 0 }}</p>
                <p class="text-xs text-muted">High risk</p>
              </div>
            </div>

            <div v-if="agingDetails" class="mt-6 space-y-6 text-sm">
              <template
                v-for="section in [
                  { key: 'current', title: 'Due in 30+ days', color: 'text-muted', helper: 'Planned future billing' },
                  { key: 'dueSoon', title: 'Due within 7 days', color: 'text-amber-600', helper: 'Reach out before due date' },
                  { key: 'due30', title: 'Due in 8-30 days', color: 'text-muted', helper: 'Plan follow-up next' },
                  { key: 'overdue7', title: 'Overdue 1-7 days', color: 'text-red-500', helper: 'Send gentle reminder' },
                  { key: 'overdue14', title: 'Overdue 8-14 days', color: 'text-red-500', helper: 'Escalate with account owner' },
                  { key: 'overdue30', title: 'Overdue 15-30 days', color: 'text-red-600', helper: 'Consider payment plan' },
                  { key: 'overdue60', title: 'Overdue 30+ days', color: 'text-red-700', helper: 'High risk – collections?' }
                ]"
              >
                <div v-if="agingDetails?.[section.key]?.length" :key="section.key">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-semibold" :class="section.color">{{ section.title }}</p>
                      <p class="text-xs text-muted">{{ section.helper }}</p>
                    </div>
                    <UBadge color="neutral" variant="subtle">{{ agingDetails?.[section.key]?.length }}</UBadge>
                  </div>
                  <div class="mt-3 space-y-2">
                    <div
                      v-for="inv in agingDetails?.[section.key] || []"
                      :key="inv.id"
                      class="flex items-start justify-between rounded border border-default bg-white/70 dark:bg-white/5 px-3 py-2"
                    >
                    <div>
                      <p class="font-medium">{{ inv.number }}</p>
                      <p class="text-xs text-muted">{{ inv.contact }} · Due {{ formatDate(inv.dueDate) }}</p>
                    </div>
                    <div class="text-right">
                      <p class="font-semibold" :class="section.key.includes('overdue') ? 'text-red-600' : 'text-emerald-600'">
                        {{ formatCurrency(inv.amountDue, inv.currency) }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ section.key.includes('overdue') ? `${inv.daysOverdue ?? 0} days overdue` : `${inv.daysUntilDue ?? 0} days` }}
                      </p>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold">Top Outstanding Clients</h3>
                <UBadge v-if="summary?.topCustomers?.length" color="neutral" variant="subtle">{{ summary?.topCustomers?.length }} listed</UBadge>
              </div>
            </template>
            <div class="space-y-3">
              <div v-for="client in topCustomers" :key="client.name" class="p-3 rounded-lg border border-default bg-white/70 dark:bg-white/5">
                <div class="flex items-center justify-between">
                  <p class="font-medium">{{ client.name }}</p>
                  <span class="text-xs text-muted">{{ client.count }} invoices</span>
                </div>
                <div class="flex items-center justify-between text-sm mt-1">
                  <span class="text-muted">Outstanding</span>
                  <span class="font-semibold">{{ formatCurrency(client.outstanding) }}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-red-500" v-if="client.overdue">
                  <span>Overdue</span>
                  <span class="font-medium">{{ formatCurrency(client.overdue) }}</span>
                </div>
                <div class="mt-2 flex gap-2">
                  <UButton size="xs" variant="ghost" icon="i-lucide-mail" color="neutral">Send reminder</UButton>
                  <UButton size="xs" variant="ghost" icon="i-lucide-clipboard-list" color="neutral">View account</UButton>
                </div>
              </div>
              <p v-if="!topCustomers.length" class="text-sm text-muted text-center">No outstanding clients—nice work!</p>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UCard v-if="data.value?.paidRecent?.length">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold">Recent Payments</h3>
                <UBadge color="neutral" variant="subtle">Last 30 days</UBadge>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="invoice in data.value?.paidRecent"
                :key="invoice.id"
                class="flex items-center justify-between text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"
              >
                <div>
                  <p class="font-medium">{{ invoice.number }}</p>
                  <p class="text-xs text-muted">{{ invoice.contact }} · Paid {{ formatDate(invoice.fullyPaidOnDate) }}</p>
                </div>
                <div class="text-right">
                  <p class="font-semibold text-emerald-600">{{ formatCurrency(invoice.total, invoice.currency) }}</p>
                  <p class="text-xs text-muted">{{ invoice.daysToPay ?? '-' }} days to pay</p>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-base font-semibold">Quick Actions</h3>
            </template>
            <div class="grid grid-cols-1 gap-3">
              <UButton color="neutral" icon="i-lucide-send" variant="outline">Send reminder emails</UButton>
              <UButton color="neutral" icon="i-lucide-download" variant="outline">Export aging report</UButton>
              <UButton color="neutral" icon="i-lucide-settings-2" variant="outline">Configure automation</UButton>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold">
                {{ selectedView === 'all' ? 'All Invoices' : selectedView === 'outstanding' ? 'Outstanding Invoices' : selectedView === 'overdue' ? 'Overdue Invoices' : 'Paid Invoices' }}
              </h3>
              <UBadge v-if="selectedView === 'paid' && summary?.avgDaysToPay" color="neutral" variant="subtle">
                Avg days to pay: {{ summary?.avgDaysToPay }}
              </UBadge>
            </div>
          </template>

          <UTable
            v-if="selectedView === 'all'"
            :rows="paginatedAll"
            :columns="columnsAll"
          >
            <template #status-data="{ row }">
              <UBadge
                :color="row.status === 'PAID' ? 'emerald' : row.status === 'OVERDUE' ? 'red' : 'amber'"
                variant="subtle"
              >
                {{ row.status === 'PAID' ? 'Paid' : row.status === 'OVERDUE' ? 'Overdue' : 'Outstanding' }}
              </UBadge>
            </template>
            <template #date-data="{ row }">{{ formatDate(row.date) }}</template>
            <template #dueDate-data="{ row }">{{ formatDate(row.dueDate) }}</template>
            <template #amount-data="{ row }">
              <span class="text-right block font-medium" :class="row.status === 'OVERDUE' ? 'text-red-600' : ''">
                {{ row.status === 'PAID' ? formatCurrency(row.total, row.currency) : formatCurrency(row.amountDue, row.currency) }}
              </span>
            </template>
          </UTable>

          <UTable
            v-else-if="selectedView === 'outstanding'"
            :rows="paginatedOutstanding"
            :columns="columnsOutstanding"
          >
            <template #date-data="{ row }">{{ formatDate(row.date) }}</template>
            <template #dueDate-data="{ row }">{{ formatDate(row.dueDate) }}</template>
            <template #daysUntilDue-data="{ row }">
              <span :class="row.daysUntilDue <= 3 ? 'text-amber-600 font-medium' : ''">
                {{ row.daysUntilDue != null ? row.daysUntilDue : '-' }}
              </span>
            </template>
            <template #amountDue-data="{ row }">
              <span class="text-right block font-medium">{{ formatCurrency(row.amountDue, row.currency) }}</span>
            </template>
          </UTable>

          <UTable
            v-else-if="selectedView === 'overdue'"
            :rows="paginatedOverdue"
            :columns="columnsOverdue"
          >
            <template #date-data="{ row }">{{ formatDate(row.date) }}</template>
            <template #dueDate-data="{ row }">{{ formatDate(row.dueDate) }}</template>
            <template #daysOverdue-data="{ row }">
              <span class="text-red-600 font-medium">{{ row.daysOverdue ?? '-' }}</span>
            </template>
            <template #amountDue-data="{ row }">
              <span class="text-right block font-medium text-red-600">{{ formatCurrency(row.amountDue, row.currency) }}</span>
            </template>
          </UTable>

          <UTable
            v-else
            :rows="paginatedPaid"
            :columns="columnsPaid"
          >
            <template #date-data="{ row }">{{ formatDate(row.date) }}</template>
            <template #fullyPaidOnDate-data="{ row }">{{ formatDate(row.fullyPaidOnDate) }}</template>
            <template #daysToPay-data="{ row }">{{ row.daysToPay ?? '-' }}</template>
            <template #total-data="{ row }">
              <span class="text-right block font-medium">{{ formatCurrency(row.total, row.currency) }}</span>
            </template>
          </UTable>

          <div class="mt-4 flex justify-end">
            <UPagination
              v-if="selectedView === 'all' && filteredAll.length > pageSize"
              v-model:page="pageAll"
              :page-count="totalPagesAll"
              size="sm"
            />
            <UPagination
              v-else-if="selectedView === 'outstanding' && filteredOutstanding.length > pageSize"
              v-model:page="pageOutstanding"
              :page-count="totalPagesOutstanding"
              size="sm"
            />
            <UPagination
              v-else-if="selectedView === 'overdue' && filteredOverdue.length > pageSize"
              v-model:page="pageOverdue"
              :page-count="totalPagesOverdue"
              size="sm"
            />
            <UPagination
              v-else-if="selectedView === 'paid' && filteredPaid.length > pageSize"
              v-model:page="pagePaid"
              :page-count="totalPagesPaid"
              size="sm"
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
