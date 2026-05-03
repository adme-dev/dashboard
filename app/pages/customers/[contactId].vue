<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const route = useRoute()
const toast = useToast()
const contactId = computed(() => String(route.params.contactId))

// ── Types ──
interface Bucket { month: string; cents: number }
interface PaymentTerms { days: number; type: string | null }
interface AgingBuckets { current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number }

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  website: string | null
  isCustomer: boolean
  isSupplier: boolean
  status: string
  currency: string
  accountNumber: string | null
  contactNumber: string | null
  taxNumber: string | null
  paymentTerms: PaymentTerms | null
  address: { line1: string | null; line2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null } | null
  outstanding: number
  overdue: number
  ltv: number
  ytdRevenue: number
  last12mRevenue: number
  last12mBuckets: Bucket[]
  invoiceCount: number
  paidInvoiceCount: number
  avgInvoice: number
  firstInvoiceDate: string | null
  lastInvoiceDate: string | null
  lastPaymentDate: string | null
  tenureDays: number | null
  dsoDays: number | null
  paidLatePct: number | null
  oldestOverdueDays: number
  agingBuckets: AgingBuckets
  mrr: number
  hasActiveRepeating: boolean
  concentrationPct: number
  health: 'overdue' | 'outstanding' | 'clear'
  agencyClientId: string | null
}

interface DetailResponse {
  customer: Customer
  recentInvoices: Array<{
    id: string
    invoiceNumber: string | null
    status: string
    date: string
    dueDate: string | null
    paidDate: string | null
    total: number
    amountDue: number
    amountPaid: number
    currency: string
  }>
}

// ── Detail (Overview tab) ──
const { data, pending, error, refresh } = await useFetch<DetailResponse>(
  () => `/api/customers/${contactId.value}`,
  { lazy: true, server: false, watch: [contactId] },
)

const customer = computed(() => data.value?.customer)

// ── Tab state — load each tab's data only when first activated ──
const activeTab = ref<'overview' | 'invoices' | 'pipeline' | 'work' | 'spend' | 'finance' | 'insights'>('overview')

// Invoices tab — typed shape matches /api/customers/[contactId]/invoices
interface InvoicesResponse {
  invoices: Array<{
    id: string
    invoiceNumber: string | null
    reference: string | null
    status: string
    date: string
    dueDate: string | null
    paidDate: string | null
    total: number
    amountDue: number
    amountPaid: number
    currency: string
    overdueDays: number | null
    daysToPay: number | null
  }>
  summary: {
    total: number; open: number; paid: number; voided: number; overdue: number
    totalOutstanding: number; totalOverdue: number
  }
}
const invoicesFetch = useFetch<InvoicesResponse>(
  () => `/api/customers/${contactId.value}/invoices`,
  { lazy: true, server: false, immediate: false, watch: [contactId] },
)
watch(() => activeTab.value === 'invoices', (on) => { if (on) invoicesFetch.execute() })

// Pipeline tab
const pipelineFetch = useFetch<{
  quotes: Array<{ id: string; quoteNumber: string | null; reference: string | null; status: string; date: string | null; expiryDate: string | null; total: number; currency: string }>
  repeating: Array<{ id: string; reference: string | null; status: string; total: number; monthlyEquivalent: number; currency: string; unit: string; period: number; nextScheduledDate: string | null; endDate: string | null }>
  summary: { openQuoteCount: number; openQuoteValue: number; mrr: number; annualisedRecurring: number }
}>(() => `/api/customers/${contactId.value}/pipeline`, {
  lazy: true, server: false, immediate: false, watch: [contactId],
})
watch(() => activeTab.value === 'pipeline', (on) => { if (on) pipelineFetch.execute() })

// Work tab
const workFetch = useFetch<{
  linked: boolean
  client: { id: string; name: string; billingType: string } | null
  projects: Array<{ id: string; name: string; status: string; budgetAmount: number; totalHours: number; totalCost: number; margin: number }>
  recentTimeEntries: Array<{ id: string; date: string; hours: number; amount: number; description: string | null; billable: boolean; projectName: string; userName: string }>
  monthlyHours: Array<{ month: string; hours: number; amountCents: number }>
  summary: { activeProjects: number; completedProjects: number; totalProjects: number; hoursThisMonth: number; billableThisMonth: number }
}>(() => `/api/customers/${contactId.value}/work`, {
  lazy: true, server: false, immediate: false, watch: [contactId],
})
watch(() => activeTab.value === 'work', (on) => { if (on) workFetch.execute() })

// Ad spend tab
const spendFetch = useFetch<{
  linked: boolean
  client: { id: string; name: string; defaultCommissionRate: number | null } | null
  months: string[]
  platforms: Array<{ platform: string; total: number; commission: number; budget: number; thisMonth: number; buckets: Array<{ month: string; spend: number }> }>
  summary: { thisMonthSpend: number; last6mSpend: number; last6mCommission: number; platformCount: number }
}>(() => `/api/customers/${contactId.value}/ad-spend`, {
  lazy: true, server: false, immediate: false, watch: [contactId],
})
watch(() => activeTab.value === 'spend', (on) => { if (on) spendFetch.execute() })

// Finance tab — credit settings, tags, collections log
interface FinanceState {
  creditLimit: number | null
  creditHold: boolean
  holdReason: string | null
  paymentPriority: number
  internalNotes: string | null
  accountManager: { id: string; name: string | null } | null
  updatedAt: string | null
}
interface DictTag { id: string; label: string; color: string; customerCount: number }
interface AssignedTag { id: string; label: string; color: string; assigned_at: string }
interface CollectionsEntry {
  id: string
  action: string
  invoiceId: string | null
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string | null } | null
}

const financeFetch = useFetch<FinanceState>(
  () => `/api/customers/${contactId.value}/finance`,
  { lazy: true, server: false, immediate: false, watch: [contactId] },
)
const tagDictFetch = useFetch<{ tags: DictTag[] }>(
  '/api/customer-tags',
  { lazy: true, server: false, immediate: false },
)
const customerTagsFetch = useFetch<{ tags: AssignedTag[] }>(
  () => `/api/customers/${contactId.value}/tags`,
  { lazy: true, server: false, immediate: false, watch: [contactId] },
)
const collectionsFetch = useFetch<{ log: CollectionsEntry[] }>(
  () => `/api/customers/${contactId.value}/collections`,
  { lazy: true, server: false, immediate: false, watch: [contactId] },
)
watch(() => activeTab.value === 'finance', (on) => {
  if (!on) return
  financeFetch.execute()
  tagDictFetch.execute()
  customerTagsFetch.execute()
  collectionsFetch.execute()
})

// Local edit buffer mirrors what's persisted, edited in the form, saved on blur/submit
const financeForm = reactive({
  creditLimit: null as number | null,
  creditHold: false,
  holdReason: '' as string,
  paymentPriority: 0 as number,
  internalNotes: '' as string,
})
watch(() => financeFetch.data.value, (v) => {
  if (!v) return
  financeForm.creditLimit = v.creditLimit
  financeForm.creditHold = v.creditHold
  financeForm.holdReason = v.holdReason ?? ''
  financeForm.paymentPriority = v.paymentPriority
  financeForm.internalNotes = v.internalNotes ?? ''
}, { immediate: true })

const savingFinance = ref(false)
async function saveFinance() {
  savingFinance.value = true
  try {
    await $fetch(`/api/customers/${contactId.value}/finance`, {
      method: 'PUT',
      body: {
        creditLimit: financeForm.creditLimit,
        creditHold: financeForm.creditHold,
        holdReason: financeForm.holdReason || null,
        paymentPriority: financeForm.paymentPriority,
        internalNotes: financeForm.internalNotes || null,
      },
    })
    toast.add({ title: 'Saved', color: 'success' })
    financeFetch.execute()
  } catch (err: any) {
    toast.add({
      title: 'Save failed',
      description: err?.statusMessage || err?.message,
      color: 'error',
    })
  } finally {
    savingFinance.value = false
  }
}

// Tag management
const newTagLabel = ref('')
const creatingTag = ref(false)
async function createTag() {
  const label = newTagLabel.value.trim()
  if (!label) return
  creatingTag.value = true
  try {
    await $fetch('/api/customer-tags', { method: 'POST', body: { label } })
    newTagLabel.value = ''
    await tagDictFetch.execute()
  } catch (err: any) {
    toast.add({
      title: 'Could not create tag',
      description: err?.statusMessage || err?.message,
      color: 'error',
    })
  } finally {
    creatingTag.value = false
  }
}

async function toggleTag(tag: DictTag) {
  const isAssigned = customerTagsFetch.data.value?.tags.some(t => t.id === tag.id)
  try {
    if (isAssigned) {
      await $fetch(`/api/customers/${contactId.value}/tags?tagId=${tag.id}`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/customers/${contactId.value}/tags`, {
        method: 'POST',
        body: { tagIds: [tag.id] },
      })
    }
    await Promise.all([customerTagsFetch.execute(), tagDictFetch.execute()])
  } catch (err: any) {
    toast.add({ title: 'Tag update failed', description: err?.message, color: 'error' })
  }
}

// Collections log entry
const newLogAction = ref<'note' | 'phone_call' | 'email_custom' | 'escalated_to_handover'>('note')
const newLogNotes = ref('')
const loggingAction = ref(false)
async function addCollectionsEntry() {
  loggingAction.value = true
  try {
    await $fetch(`/api/customers/${contactId.value}/collections`, {
      method: 'POST',
      body: { action: newLogAction.value, notes: newLogNotes.value || null },
    })
    newLogNotes.value = ''
    newLogAction.value = 'note'
    await collectionsFetch.execute()
    toast.add({ title: 'Logged', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Could not log entry', description: err?.message, color: 'error' })
  } finally {
    loggingAction.value = false
  }
}

function actionLabel(a: string | null): string {
  if (!a) return '—'
  return ({
    reminder_gentle: 'Gentle reminder',
    reminder_firm: 'Firm reminder',
    reminder_final: 'Final notice',
    phone_call: 'Phone call',
    email_custom: 'Custom email',
    escalated_to_handover: 'Escalated',
    note: 'Note',
    paid: 'Paid',
  } as Record<string, string>)[a] ?? a
}

function actionIcon(a: string | null): string {
  if (!a) return 'i-lucide-circle'
  return ({
    reminder_gentle: 'i-lucide-mail',
    reminder_firm: 'i-lucide-mail-warning',
    reminder_final: 'i-lucide-mail-x',
    phone_call: 'i-lucide-phone',
    email_custom: 'i-lucide-pen-square',
    escalated_to_handover: 'i-lucide-arrow-up-right',
    note: 'i-lucide-sticky-note',
    paid: 'i-lucide-check-circle-2',
  } as Record<string, string>)[a] ?? 'i-lucide-circle'
}

// Insights tab — churn risk + AI summary + anomalies + forecast
interface FactorBlock { score: number; label: string; weight: number }
interface InsightsResponse {
  ready: boolean
  message?: string
  churnRiskScore: number
  churnRiskBand: 'low' | 'moderate' | 'high' | 'critical'
  churnFactors: {
    revenueTrend: FactorBlock
    paymentBehaviour: FactorBlock
    activity: FactorBlock
    mrrDiscount: number
  } | null
  forecast12m: number
  forecastBasis: 'mrr' | 'trend' | 'hybrid' | 'insufficient' | 'unknown'
  aiSummary: string | null
  aiSummaryAt: string | null
  anomalies: Array<{
    id: string
    type: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    title: string
    description: string
    recommendation: string | null
    createdAt: string
  }>
  computedAt: string | null
}
// Insights load eagerly — the header strip surfaces a churn-risk badge
// that should be visible on Overview without needing the user to click
// into the Insights tab first.
const insightsFetch = useFetch<InsightsResponse>(
  () => `/api/customers/${contactId.value}/insights`,
  { lazy: true, server: false, watch: [contactId] },
)

const refreshingSummary = ref(false)
async function refreshAiSummary() {
  refreshingSummary.value = true
  try {
    await $fetch(`/api/customers/${contactId.value}/insights?refresh=true`)
    await insightsFetch.execute()
    toast.add({ title: 'Summary refreshed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Refresh failed', description: err?.message, color: 'error' })
  } finally {
    refreshingSummary.value = false
  }
}

// Real "Refresh" — triggers a Xero sync (delta) so rollups/invoices/contact
// metadata get rebuilt before refetching the cache. Without this, hitting
// Refresh while the cache was empty just re-served the same blanks.
const syncing = ref(false)
async function syncAndRefresh() {
  syncing.value = true
  try {
    await $fetch('/api/xero/contacts/sync', { method: 'POST' })
    await refresh()
    toast.add({ title: 'Synced from Xero', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Sync failed',
      description: err?.data?.statusMessage || err?.message || 'Could not sync from Xero',
      color: 'error',
    })
    // Still refetch the cache — it might have partial data even if sync errored.
    try { await refresh() } catch { /* ignore */ }
  } finally {
    syncing.value = false
  }
}

function riskColor(band: string): string {
  if (band === 'critical' || band === 'high') return 'error'
  if (band === 'moderate') return 'warning'
  return 'success'
}
function severityColor(s: string): string {
  if (s === 'critical' || s === 'high') return 'error'
  if (s === 'medium') return 'warning'
  return 'info'
}
function forecastBasisLabel(b: string): string {
  return ({
    mrr: 'Based on contracted MRR',
    trend: 'Extrapolated from recent invoicing trend',
    hybrid: 'MRR + ad-hoc invoicing trend',
    insufficient: 'Insufficient history for reliable forecast',
    unknown: 'No forecast basis available',
  } as Record<string, string>)[b] ?? b
}

// ── Formatters ──
function fmt(value?: number | null, currency = 'AUD'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 })
}
function fmtCompact(value?: number | null, currency = 'AUD'): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return '—'
  if (Math.abs(value) >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `${currency} ${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 })
}
function formatDate(value?: string | null): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function tenureLabel(days: number | null): string {
  if (!days || days < 1) return 'New'
  if (days < 31) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return months > 0 ? `${years}y ${months}mo` : `${years}y`
}
function relativeTime(value?: string | null): string {
  if (!value) return 'never'
  const dt = new Date(value)
  const days = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 1) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
function dsoColor(c: Customer | undefined): string {
  if (!c?.dsoDays) return 'neutral'
  const terms = c.paymentTerms?.days ?? 30
  if (c.dsoDays > terms + 14) return 'error'
  if (c.dsoDays > terms) return 'warning'
  return 'success'
}
function dsoLabel(c: Customer | undefined): string {
  if (!c?.dsoDays) return '—'
  return `${Math.round(c.dsoDays)}d`
}
function healthBadge(c: Customer | undefined): { label: string; color: string } {
  if (!c) return { label: '—', color: 'neutral' }
  if (c.health === 'overdue') return { label: 'Overdue', color: 'error' }
  if (c.health === 'outstanding') return { label: 'Outstanding', color: 'warning' }
  return { label: 'Clear', color: 'success' }
}
function statusColor(status: string): string {
  switch (status) {
    case 'PAID': return 'success'
    case 'AUTHORISED': return 'warning'
    case 'DRAFT':
    case 'SUBMITTED': return 'info'
    case 'VOIDED': return 'neutral'
    default: return 'neutral'
  }
}
function platformLabel(p: string): string {
  const map: Record<string, string> = {
    google_ads: 'Google Ads',
    meta: 'Meta',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    programmatic: 'Programmatic',
    traditional: 'Traditional',
    other: 'Other',
  }
  return map[p] ?? p
}

// ── Send-reminder action ──
const sendingReminderId = ref<string | null>(null)
async function sendReminder(invoiceId: string) {
  sendingReminderId.value = invoiceId
  try {
    await $fetch(`/api/xero/invoices/${invoiceId}/send-reminder`, { method: 'POST' })
    toast.add({ title: 'Reminder sent', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Reminder failed',
      description: err?.statusMessage || err?.message || 'Could not send reminder',
      color: 'error',
    })
  } finally {
    sendingReminderId.value = null
  }
}

// ── Aging segments helper ──
function bucketSegments(b: AgingBuckets) {
  const total = b.current + b['1-30'] + b['31-60'] + b['61-90'] + b['90+']
  if (total <= 0) return []
  const order: Array<{ key: keyof AgingBuckets; label: string; color: string }> = [
    { key: 'current', label: 'Current', color: 'bg-emerald-500' },
    { key: '1-30',    label: '1-30d',   color: 'bg-blue-500' },
    { key: '31-60',   label: '31-60d',  color: 'bg-amber-500' },
    { key: '61-90',   label: '61-90d',  color: 'bg-orange-500' },
    { key: '90+',     label: '90+d',    color: 'bg-red-500' },
  ]
  return order
    .map(o => ({ ...o, amount: b[o.key], pct: (b[o.key] / total) * 100 }))
    .filter(s => s.amount > 0)
}

const tabItems = computed(() => [
  { label: 'Overview',  value: 'overview',  icon: 'i-lucide-layout-dashboard' },
  { label: 'Insights',  value: 'insights',  icon: 'i-lucide-sparkles' },
  { label: 'Invoices',  value: 'invoices',  icon: 'i-lucide-receipt' },
  { label: 'Pipeline',  value: 'pipeline',  icon: 'i-lucide-trending-up' },
  { label: 'Work',      value: 'work',      icon: 'i-lucide-briefcase' },
  { label: 'Ad spend',  value: 'spend',     icon: 'i-lucide-megaphone' },
  { label: 'Finance',   value: 'finance',   icon: 'i-lucide-shield-check' },
])

const breadcrumbs = computed(() => ([
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Customers', to: '/customers' },
  { label: customer.value?.name ?? 'Customer' },
]))
</script>

<template>
  <UDashboardPanel id="customer-detail">
    <template #header>
      <UDashboardNavbar
        :title="customer?.name ?? 'Customer'"
        :description="customer?.email ?? undefined"
      >
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/customers"
          />
        </template>
        <template #right>
          <UButton
            label="Sync from Xero"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="pending || syncing"
            @click="syncAndRefresh"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :items="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-32" />
        <USkeleton class="h-64" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load customer"
        :description="(error as any)?.statusMessage || 'This customer was not found in the cache. Try syncing from Xero.'"
      />

      <div v-else-if="customer" class="space-y-6">
        <!-- ═══ Headline strip ═══ -->
        <UCard :ui="{ body: '!p-6' }">
          <div class="flex items-start justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4 min-w-0">
              <UAvatar :label="customer.name.charAt(0)" size="xl" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-xl font-semibold truncate">{{ customer.name }}</h2>
                  <UBadge :color="healthBadge(customer).color as any" variant="subtle" size="xs">
                    {{ healthBadge(customer).label }}
                  </UBadge>
                  <UBadge v-if="customer.hasActiveRepeating" color="info" variant="subtle" size="xs">
                    <UIcon name="i-lucide-repeat" class="size-3 mr-0.5" />
                    Retainer
                  </UBadge>
                  <UBadge v-if="customer.concentrationPct >= 10" color="warning" variant="subtle" size="xs">
                    <UIcon name="i-lucide-alert-triangle" class="size-3 mr-0.5" />
                    {{ customer.concentrationPct.toFixed(1) }}% of YTD
                  </UBadge>
                  <UBadge v-if="!customer.agencyClientId" color="neutral" variant="outline" size="xs">
                    Not linked to internal client
                  </UBadge>
                  <UBadge
                    v-if="insightsFetch.data.value?.ready && insightsFetch.data.value.churnRiskBand !== 'low'"
                    :color="riskColor(insightsFetch.data.value.churnRiskBand) as any"
                    variant="subtle"
                    size="xs"
                    class="capitalize cursor-pointer"
                    @click="activeTab = 'insights'"
                  >
                    <UIcon name="i-lucide-alert-triangle" class="size-3 mr-0.5" />
                    {{ insightsFetch.data.value.churnRiskBand }} churn risk
                  </UBadge>
                </div>
                <p class="text-sm text-muted mt-1">
                  Client since {{ formatDate(customer.firstInvoiceDate) }} · {{ tenureLabel(customer.tenureDays) }}
                </p>
              </div>
            </div>

            <!-- Top metrics -->
            <div class="flex items-stretch gap-6">
              <div>
                <p class="text-[10px] text-muted uppercase">Lifetime</p>
                <p class="text-xl font-semibold tabular-nums">{{ fmtCompact(customer.ltv, customer.currency) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">YTD</p>
                <p class="text-xl font-semibold tabular-nums">{{ fmtCompact(customer.ytdRevenue, customer.currency) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">MRR</p>
                <p class="text-xl font-semibold tabular-nums" :class="customer.mrr > 0 ? 'text-violet-600 dark:text-violet-400' : ''">
                  {{ customer.mrr > 0 ? fmtCompact(customer.mrr, customer.currency) : '—' }}
                </p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">Outstanding</p>
                <p class="text-xl font-semibold tabular-nums" :class="customer.overdue > 0 ? 'text-red-500' : ''">
                  {{ fmtCompact(customer.outstanding, customer.currency) }}
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- ═══ Tabs ═══ -->
        <UTabs v-model="activeTab" :items="tabItems" variant="link" color="primary" />

        <!-- ─── Overview ─── -->
        <div v-if="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- 12-month trend -->
          <UCard class="lg:col-span-2" :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">12-month revenue</p>
              <h3 class="text-lg font-semibold">{{ fmt(customer.last12mRevenue, customer.currency) }}</h3>
            </header>
            <CustomersRevenueSparkline
              v-if="customer.last12mBuckets.length > 0"
              :buckets="customer.last12mBuckets"
              :width="600"
              :height="80"
              class="w-full"
            />
            <p v-else class="text-sm text-muted">No invoiced revenue in the last 12 months.</p>
          </UCard>

          <!-- Payment behaviour -->
          <UCard :ui="{ body: '!p-6 space-y-3' }">
            <header>
              <p class="text-xs uppercase text-muted">Payment behaviour</p>
              <h3 class="text-lg font-semibold">{{ dsoLabel(customer) }} <span class="text-sm text-muted font-normal">avg pay</span></h3>
            </header>
            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-muted">Terms</span>
                <span class="font-medium">{{ customer.paymentTerms ? `${customer.paymentTerms.days}d` : '—' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted">DSO badge</span>
                <UBadge :color="dsoColor(customer) as any" variant="subtle" size="xs">{{ dsoLabel(customer) }}</UBadge>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Late payment rate</span>
                <span class="font-medium" :class="(customer.paidLatePct ?? 0) > 50 ? 'text-red-500' : (customer.paidLatePct ?? 0) > 20 ? 'text-amber-500' : ''">
                  {{ customer.paidLatePct != null ? `${Math.round(customer.paidLatePct)}%` : '—' }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Avg invoice</span>
                <span class="font-medium">{{ fmtCompact(customer.avgInvoice, customer.currency) }}</span>
              </div>
            </div>
          </UCard>

          <!-- AR + aging -->
          <UCard v-if="customer.outstanding > 0" :ui="{ body: '!p-6 space-y-3' }">
            <header>
              <p class="text-xs uppercase text-muted">Accounts receivable</p>
              <h3 class="text-lg font-semibold" :class="customer.overdue > 0 ? 'text-red-500' : ''">
                {{ fmt(customer.outstanding, customer.currency) }}
              </h3>
            </header>
            <div v-if="bucketSegments(customer.agingBuckets).length" class="space-y-2">
              <div class="flex h-2 rounded-full overflow-hidden bg-muted/10">
                <div
                  v-for="seg in bucketSegments(customer.agingBuckets)"
                  :key="seg.key"
                  :class="seg.color"
                  :style="{ width: `${seg.pct}%` }"
                />
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <span v-for="seg in bucketSegments(customer.agingBuckets)" :key="seg.key" class="flex items-center gap-1.5">
                  <span :class="['size-2 rounded-full', seg.color]" />
                  <span class="text-muted">{{ seg.label }}</span>
                  <span class="font-medium">{{ fmt(seg.amount, customer.currency) }}</span>
                </span>
              </div>
            </div>
            <p v-if="customer.oldestOverdueDays > 0" class="text-xs text-red-400">
              Oldest overdue invoice: {{ customer.oldestOverdueDays }}d past due
            </p>
          </UCard>

          <!-- Recent invoices -->
          <UCard class="lg:col-span-3" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between px-6">
                <div>
                  <p class="text-xs uppercase text-muted">Recent invoices</p>
                  <h3 class="text-base font-semibold">Latest 5</h3>
                </div>
                <UButton label="View all" variant="ghost" color="neutral" size="xs" @click="activeTab = 'invoices'" />
              </div>
            </template>
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-xs uppercase text-muted">
                <tr>
                  <th class="text-left font-medium px-4 py-2">Number</th>
                  <th class="text-left font-medium px-4 py-2">Date</th>
                  <th class="text-left font-medium px-4 py-2">Status</th>
                  <th class="text-right font-medium px-4 py-2">Total</th>
                  <th class="text-right font-medium px-4 py-2">Outstanding</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="inv in data?.recentInvoices ?? []" :key="inv.id">
                  <td class="px-4 py-2 font-medium">{{ inv.invoiceNumber || '—' }}</td>
                  <td class="px-4 py-2 text-muted">{{ formatDate(inv.date) }}</td>
                  <td class="px-4 py-2">
                    <UBadge :color="statusColor(inv.status) as any" variant="subtle" size="xs">{{ inv.status }}</UBadge>
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ fmt(inv.total, inv.currency) }}</td>
                  <td class="px-4 py-2 text-right tabular-nums" :class="inv.amountDue > 0 ? 'font-medium' : 'text-muted'">
                    {{ fmt(inv.amountDue, inv.currency) }}
                  </td>
                </tr>
                <tr v-if="!(data?.recentInvoices?.length)">
                  <td colspan="5" class="px-4 py-6 text-center text-muted text-sm">No invoices.</td>
                </tr>
              </tbody>
            </table>
          </UCard>
        </div>

        <!-- ─── Insights ─── -->
        <div v-if="activeTab === 'insights'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div v-if="insightsFetch.pending.value" class="lg:col-span-3 space-y-2">
            <USkeleton v-for="n in 3" :key="`isk-${n}`" class="h-32" />
          </div>

          <UAlert
            v-else-if="insightsFetch.data.value && !insightsFetch.data.value.ready"
            class="lg:col-span-3"
            color="info"
            variant="subtle"
            icon="i-lucide-sparkles"
            title="Insights not yet computed"
            :description="insightsFetch.data.value.message ?? 'Run a Sync from Xero to populate insights.'"
          />

          <template v-else-if="insightsFetch.data.value">
            <!-- AI summary (full-width) -->
            <UCard class="lg:col-span-3" :ui="{ body: '!p-6 space-y-3' }">
              <header class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-xs uppercase text-muted">AI account summary</p>
                  <h3 class="text-lg font-semibold">What you should know</h3>
                </div>
                <div class="flex items-center gap-3">
                  <span v-if="insightsFetch.data.value.aiSummaryAt" class="text-[11px] text-muted">
                    Generated {{ relativeTime(insightsFetch.data.value.aiSummaryAt) }}
                  </span>
                  <UButton
                    label="Refresh"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-refresh-cw"
                    :loading="refreshingSummary"
                    @click="refreshAiSummary"
                  />
                </div>
              </header>
              <p v-if="insightsFetch.data.value.aiSummary" class="text-sm leading-relaxed">
                {{ insightsFetch.data.value.aiSummary }}
              </p>
              <p v-else class="text-sm text-muted italic">
                No summary available yet. Click refresh to generate one.
              </p>
            </UCard>

            <!-- Risk score + factors -->
            <UCard class="lg:col-span-2" :ui="{ body: '!p-6 space-y-4' }">
              <header class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs uppercase text-muted">Churn risk</p>
                  <h3 class="text-2xl font-semibold">
                    {{ insightsFetch.data.value.churnRiskScore }}<span class="text-base font-normal text-muted">/100</span>
                  </h3>
                </div>
                <UBadge :color="riskColor(insightsFetch.data.value.churnRiskBand) as any" variant="subtle" size="md" class="capitalize">
                  {{ insightsFetch.data.value.churnRiskBand }}
                </UBadge>
              </header>

              <div v-if="insightsFetch.data.value.churnFactors" class="space-y-3">
                <div v-for="(factor, key) in {
                  revenueTrend: insightsFetch.data.value.churnFactors.revenueTrend,
                  paymentBehaviour: insightsFetch.data.value.churnFactors.paymentBehaviour,
                  activity: insightsFetch.data.value.churnFactors.activity,
                }" :key="key" class="space-y-1">
                  <div class="flex items-center justify-between text-sm">
                    <span class="capitalize text-muted">{{ String(key).replace(/([A-Z])/g, ' $1').trim() }}</span>
                    <span class="font-medium">{{ factor.label }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-muted/10 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="factor.score >= 0.7 ? 'bg-red-500' : factor.score >= 0.4 ? 'bg-amber-500' : factor.score >= 0.15 ? 'bg-blue-500' : 'bg-emerald-500'"
                      :style="{ width: `${Math.max(2, factor.score * 100)}%` }"
                    />
                  </div>
                </div>

                <p v-if="insightsFetch.data.value.churnFactors.mrrDiscount > 0" class="text-xs text-emerald-500 flex items-center gap-1.5">
                  <UIcon name="i-lucide-shield" class="size-4" />
                  Active retainer discounts risk by {{ Math.round(insightsFetch.data.value.churnFactors.mrrDiscount * 100) }} points
                </p>
              </div>
            </UCard>

            <!-- Forecast -->
            <UCard :ui="{ body: '!p-6 space-y-3' }">
              <header>
                <p class="text-xs uppercase text-muted">12-month forecast</p>
                <h3 class="text-2xl font-semibold">{{ fmt(insightsFetch.data.value.forecast12m, customer.currency) }}</h3>
              </header>
              <p class="text-xs text-muted">{{ forecastBasisLabel(insightsFetch.data.value.forecastBasis) }}</p>
              <div v-if="customer.mrr > 0" class="pt-3 border-t border-default text-sm">
                <p class="text-muted text-xs">Locked-in recurring</p>
                <p class="font-medium text-violet-600 dark:text-violet-400">
                  {{ fmt(customer.mrr * 12, customer.currency) }}/yr
                </p>
              </div>
            </UCard>

            <!-- Anomalies -->
            <UCard class="lg:col-span-3" :ui="{ body: '!p-0' }">
              <template #header>
                <div class="flex items-center justify-between px-6">
                  <div>
                    <p class="text-xs uppercase text-muted">Open anomalies</p>
                    <h3 class="text-base font-semibold">
                      {{ insightsFetch.data.value.anomalies.length }} open
                    </h3>
                  </div>
                  <UButton
                    v-if="insightsFetch.data.value.anomalies.length > 0"
                    label="View all"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    to="/anomalies"
                    trailing-icon="i-lucide-arrow-right"
                  />
                </div>
              </template>
              <div v-if="!insightsFetch.data.value.anomalies.length" class="px-6 py-8 text-center text-sm text-muted">
                <UIcon name="i-lucide-check-circle-2" class="size-6 mx-auto mb-2 text-emerald-500" />
                No open anomalies for this customer.
              </div>
              <div v-else class="divide-y divide-default">
                <div
                  v-for="a in insightsFetch.data.value.anomalies"
                  :key="a.id"
                  class="px-6 py-3 space-y-1"
                >
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-2 min-w-0">
                      <UBadge :color="severityColor(a.severity) as any" variant="subtle" size="xs" class="capitalize shrink-0">
                        {{ a.severity }}
                      </UBadge>
                      <span class="font-medium text-sm truncate">{{ a.title }}</span>
                    </div>
                    <span class="text-[11px] text-muted">{{ relativeTime(a.createdAt) }}</span>
                  </div>
                  <p class="text-sm text-muted">{{ a.description }}</p>
                  <p v-if="a.recommendation" class="text-xs text-emerald-600 dark:text-emerald-400">
                    💡 {{ a.recommendation }}
                  </p>
                </div>
              </div>
            </UCard>
          </template>
        </div>

        <!-- ─── Invoices ─── -->
        <div v-if="activeTab === 'invoices'">
          <UCard :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between gap-4 px-6 flex-wrap">
                <div>
                  <h3 class="text-base font-semibold">Invoice history</h3>
                  <p class="text-xs text-muted">
                    <template v-if="invoicesFetch.data.value">
                      {{ invoicesFetch.data.value.summary.total }} total ·
                      {{ invoicesFetch.data.value.summary.open }} open ·
                      {{ invoicesFetch.data.value.summary.paid }} paid ·
                      <span v-if="invoicesFetch.data.value.summary.overdue > 0" class="text-red-500 font-medium">
                        {{ invoicesFetch.data.value.summary.overdue }} overdue
                      </span>
                    </template>
                  </p>
                </div>
                <div v-if="invoicesFetch.data.value" class="flex items-center gap-4 text-sm">
                  <div>
                    <p class="text-[10px] text-muted uppercase">Outstanding</p>
                    <p class="font-semibold tabular-nums">{{ fmt(invoicesFetch.data.value.summary.totalOutstanding, customer.currency) }}</p>
                  </div>
                  <div>
                    <p class="text-[10px] text-muted uppercase">Overdue</p>
                    <p class="font-semibold tabular-nums" :class="invoicesFetch.data.value.summary.totalOverdue > 0 ? 'text-red-500' : ''">
                      {{ fmt(invoicesFetch.data.value.summary.totalOverdue, customer.currency) }}
                    </p>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="invoicesFetch.pending.value" class="p-6 space-y-2">
              <USkeleton v-for="n in 6" :key="`isk-${n}`" class="h-8" />
            </div>

            <div v-else-if="invoicesFetch.data.value" class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-3">Number</th>
                    <th class="text-left font-medium px-4 py-3">Date</th>
                    <th class="text-left font-medium px-4 py-3">Due</th>
                    <th class="text-left font-medium px-4 py-3">Status</th>
                    <th class="text-right font-medium px-4 py-3">Total</th>
                    <th class="text-right font-medium px-4 py-3">Outstanding</th>
                    <th class="text-right font-medium px-4 py-3">Notes</th>
                    <th class="px-4 py-3" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="inv in invoicesFetch.data.value.invoices" :key="inv.id" class="hover:bg-elevated/40">
                    <td class="px-4 py-3 font-medium">
                      <a :href="`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${inv.id}`" target="_blank" rel="noopener" class="hover:text-primary">
                        {{ inv.invoiceNumber || inv.reference || inv.id.slice(0, 8) }}
                      </a>
                    </td>
                    <td class="px-4 py-3 text-muted">{{ formatDate(inv.date) }}</td>
                    <td class="px-4 py-3 text-muted">{{ formatDate(inv.dueDate) }}</td>
                    <td class="px-4 py-3">
                      <UBadge :color="statusColor(inv.status) as any" variant="subtle" size="xs">{{ inv.status }}</UBadge>
                    </td>
                    <td class="px-4 py-3 text-right tabular-nums">{{ fmt(inv.total, inv.currency) }}</td>
                    <td class="px-4 py-3 text-right tabular-nums" :class="inv.amountDue > 0 ? 'font-medium' : 'text-muted'">
                      {{ fmt(inv.amountDue, inv.currency) }}
                    </td>
                    <td class="px-4 py-3 text-right text-xs">
                      <span v-if="inv.overdueDays" class="text-red-500 font-medium">{{ inv.overdueDays }}d late</span>
                      <span v-else-if="inv.daysToPay != null" class="text-muted">paid in {{ inv.daysToPay }}d</span>
                      <span v-else class="text-muted">—</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <UButton
                        v-if="inv.status === 'AUTHORISED' && inv.overdueDays"
                        label="Send reminder"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        :loading="sendingReminderId === inv.id"
                        @click="sendReminder(inv.id)"
                      />
                    </td>
                  </tr>
                  <tr v-if="!invoicesFetch.data.value.invoices.length">
                    <td colspan="8" class="px-4 py-6 text-center text-muted text-sm">No invoices for this customer.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </div>

        <!-- ─── Pipeline ─── -->
        <div v-if="activeTab === 'pipeline'" class="space-y-4">
          <div v-if="pipelineFetch.pending.value" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <USkeleton class="h-48" />
            <USkeleton class="h-48" />
          </div>

          <div v-else-if="pipelineFetch.data.value" class="space-y-4">
            <!-- Pipeline summary -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Open quotes</p>
                <p class="text-xl font-semibold">{{ pipelineFetch.data.value.summary.openQuoteCount }}</p>
                <p class="text-[11px] text-muted mt-1">{{ fmt(pipelineFetch.data.value.summary.openQuoteValue, customer.currency) }} value</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">MRR</p>
                <p class="text-xl font-semibold text-violet-600 dark:text-violet-400">{{ fmt(pipelineFetch.data.value.summary.mrr, customer.currency) }}</p>
                <p class="text-[11px] text-muted mt-1">/month</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Annualised recurring</p>
                <p class="text-xl font-semibold">{{ fmt(pipelineFetch.data.value.summary.annualisedRecurring, customer.currency) }}</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Forward total</p>
                <p class="text-xl font-semibold">{{ fmt(pipelineFetch.data.value.summary.openQuoteValue + pipelineFetch.data.value.summary.annualisedRecurring, customer.currency) }}</p>
                <p class="text-[11px] text-muted mt-1">Quotes + 12mo recurring</p>
              </UCard>
            </div>

            <!-- Quotes table -->
            <UCard :ui="{ body: '!p-0' }">
              <template #header>
                <h3 class="px-6 text-base font-semibold">Open quotes</h3>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Quote #</th>
                    <th class="text-left font-medium px-4 py-2">Date</th>
                    <th class="text-left font-medium px-4 py-2">Expires</th>
                    <th class="text-left font-medium px-4 py-2">Status</th>
                    <th class="text-right font-medium px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="q in pipelineFetch.data.value.quotes" :key="q.id">
                    <td class="px-4 py-2 font-medium">{{ q.quoteNumber || q.reference || '—' }}</td>
                    <td class="px-4 py-2 text-muted">{{ formatDate(q.date) }}</td>
                    <td class="px-4 py-2 text-muted">{{ formatDate(q.expiryDate) }}</td>
                    <td class="px-4 py-2">
                      <UBadge :color="q.status === 'ACCEPTED' ? 'success' : q.status === 'SENT' ? 'info' : 'neutral'" variant="subtle" size="xs">
                        {{ q.status }}
                      </UBadge>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(q.total, q.currency) }}</td>
                  </tr>
                  <tr v-if="!pipelineFetch.data.value.quotes.length">
                    <td colspan="5" class="px-4 py-6 text-center text-muted text-sm">No open quotes.</td>
                  </tr>
                </tbody>
              </table>
            </UCard>

            <!-- Repeating invoices -->
            <UCard :ui="{ body: '!p-0' }">
              <template #header>
                <h3 class="px-6 text-base font-semibold">Active recurring schedules</h3>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Reference</th>
                    <th class="text-left font-medium px-4 py-2">Schedule</th>
                    <th class="text-left font-medium px-4 py-2">Next</th>
                    <th class="text-left font-medium px-4 py-2">Ends</th>
                    <th class="text-right font-medium px-4 py-2">Per cycle</th>
                    <th class="text-right font-medium px-4 py-2">Monthly equiv</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="r in pipelineFetch.data.value.repeating" :key="r.id">
                    <td class="px-4 py-2 font-medium">{{ r.reference || '—' }}</td>
                    <td class="px-4 py-2 text-muted">Every {{ r.period }} {{ r.unit.toLowerCase() }}</td>
                    <td class="px-4 py-2 text-muted">{{ formatDate(r.nextScheduledDate) }}</td>
                    <td class="px-4 py-2 text-muted">{{ formatDate(r.endDate) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(r.total, r.currency) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium text-violet-600 dark:text-violet-400">
                      {{ fmt(r.monthlyEquivalent, r.currency) }}
                    </td>
                  </tr>
                  <tr v-if="!pipelineFetch.data.value.repeating.length">
                    <td colspan="6" class="px-4 py-6 text-center text-muted text-sm">No active recurring schedules.</td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </div>
        </div>

        <!-- ─── Work ─── -->
        <div v-if="activeTab === 'work'" class="space-y-4">
          <div v-if="workFetch.pending.value" class="space-y-2">
            <USkeleton v-for="n in 4" :key="`wsk-${n}`" class="h-12" />
          </div>

          <UAlert
            v-else-if="workFetch.data.value && !workFetch.data.value.linked"
            color="info"
            variant="subtle"
            icon="i-lucide-link-2"
            title="Not linked to an internal client"
            description="This Xero contact hasn't been mirrored into agency_clients yet. Run a Sync from Xero from the customers page to link it, then the Work and Ad spend tabs will populate."
          />

          <template v-else-if="workFetch.data.value">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Active projects</p>
                <p class="text-xl font-semibold">{{ workFetch.data.value.summary.activeProjects }}</p>
                <p class="text-[11px] text-muted mt-1">{{ workFetch.data.value.summary.totalProjects }} total</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Hours this month</p>
                <p class="text-xl font-semibold">{{ workFetch.data.value.summary.hoursThisMonth }}</p>
                <p class="text-[11px] text-muted mt-1">{{ workFetch.data.value.summary.billableThisMonth }} billable</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Billing</p>
                <p class="text-xl font-semibold capitalize">{{ workFetch.data.value.client?.billingType || '—' }}</p>
              </UCard>
            </div>

            <UCard :ui="{ body: '!p-0' }">
              <template #header>
                <h3 class="px-6 text-base font-semibold">Projects</h3>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Project</th>
                    <th class="text-left font-medium px-4 py-2">Status</th>
                    <th class="text-right font-medium px-4 py-2">Budget</th>
                    <th class="text-right font-medium px-4 py-2">Cost</th>
                    <th class="text-right font-medium px-4 py-2">Hours</th>
                    <th class="text-right font-medium px-4 py-2">Margin</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="p in workFetch.data.value.projects" :key="p.id">
                    <td class="px-4 py-2 font-medium">{{ p.name }}</td>
                    <td class="px-4 py-2">
                      <UBadge :color="p.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="xs" class="capitalize">{{ p.status }}</UBadge>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(p.budgetAmount, customer.currency) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(p.totalCost, customer.currency) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ p.totalHours.toFixed(1) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums" :class="p.margin < 0 ? 'text-red-500' : p.margin < 20 ? 'text-amber-500' : ''">
                      {{ p.budgetAmount > 0 ? `${p.margin.toFixed(0)}%` : '—' }}
                    </td>
                  </tr>
                  <tr v-if="!workFetch.data.value.projects.length">
                    <td colspan="6" class="px-4 py-6 text-center text-muted text-sm">No projects yet.</td>
                  </tr>
                </tbody>
              </table>
            </UCard>

            <UCard v-if="workFetch.data.value.recentTimeEntries.length" :ui="{ body: '!p-0' }">
              <template #header>
                <h3 class="px-6 text-base font-semibold">Recent time</h3>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Date</th>
                    <th class="text-left font-medium px-4 py-2">User</th>
                    <th class="text-left font-medium px-4 py-2">Project</th>
                    <th class="text-left font-medium px-4 py-2">Description</th>
                    <th class="text-right font-medium px-4 py-2">Hours</th>
                    <th class="text-right font-medium px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="te in workFetch.data.value.recentTimeEntries" :key="te.id">
                    <td class="px-4 py-2 text-muted">{{ formatDate(te.date) }}</td>
                    <td class="px-4 py-2">{{ te.userName }}</td>
                    <td class="px-4 py-2 text-muted">{{ te.projectName }}</td>
                    <td class="px-4 py-2 text-muted truncate max-w-xs">{{ te.description || '—' }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ te.hours.toFixed(1) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ fmt(te.amount, customer.currency) }}</td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </template>
        </div>

        <!-- ─── Ad spend ─── -->
        <div v-if="activeTab === 'spend'" class="space-y-4">
          <div v-if="spendFetch.pending.value" class="space-y-2">
            <USkeleton v-for="n in 4" :key="`ssk-${n}`" class="h-12" />
          </div>

          <UAlert
            v-else-if="spendFetch.data.value && !spendFetch.data.value.linked"
            color="info"
            variant="subtle"
            icon="i-lucide-link-2"
            title="Not linked to an internal client"
            description="Link this Xero contact to an agency client to see ad-spend attribution."
          />

          <template v-else-if="spendFetch.data.value">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">This month spend</p>
                <p class="text-xl font-semibold">{{ fmt(spendFetch.data.value.summary.thisMonthSpend, customer.currency) }}</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Last 6 mo spend</p>
                <p class="text-xl font-semibold">{{ fmt(spendFetch.data.value.summary.last6mSpend, customer.currency) }}</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Last 6 mo commission</p>
                <p class="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{{ fmt(spendFetch.data.value.summary.last6mCommission, customer.currency) }}</p>
              </UCard>
              <UCard :ui="{ body: '!p-4' }">
                <p class="text-xs text-muted uppercase">Active platforms</p>
                <p class="text-xl font-semibold">{{ spendFetch.data.value.summary.platformCount }}</p>
              </UCard>
            </div>

            <UCard :ui="{ body: '!p-0' }">
              <template #header>
                <h3 class="px-6 text-base font-semibold">Spend by platform · 6-month</h3>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Platform</th>
                    <th
                      v-for="m in spendFetch.data.value.months"
                      :key="m"
                      class="text-right font-medium px-3 py-2 whitespace-nowrap"
                    >{{ m.slice(5) }}/{{ m.slice(2, 4) }}</th>
                    <th class="text-right font-medium px-4 py-2">Total</th>
                    <th class="text-right font-medium px-4 py-2">Commission</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="p in spendFetch.data.value.platforms" :key="p.platform">
                    <td class="px-4 py-2 font-medium">{{ platformLabel(p.platform) }}</td>
                    <td v-for="b in p.buckets" :key="b.month" class="px-3 py-2 text-right tabular-nums" :class="b.spend > 0 ? '' : 'text-muted'">
                      {{ b.spend > 0 ? fmtCompact(b.spend, customer.currency) : '—' }}
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums font-semibold">{{ fmt(p.total, customer.currency) }}</td>
                    <td class="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{{ fmt(p.commission, customer.currency) }}</td>
                  </tr>
                  <tr v-if="!spendFetch.data.value.platforms.length">
                    <td :colspan="spendFetch.data.value.months.length + 3" class="px-4 py-6 text-center text-muted text-sm">
                      No ad spend recorded for this client in the last 6 months.
                    </td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </template>
        </div>

        <!-- ─── Finance ─── -->
        <div v-if="activeTab === 'finance'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- Credit + priority -->
          <UCard class="lg:col-span-2" :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Credit & priority</p>
              <h3 class="text-lg font-semibold">Credit control</h3>
            </header>
            <div v-if="financeFetch.pending.value" class="space-y-2">
              <USkeleton v-for="n in 4" :key="`fsk-${n}`" class="h-10" />
            </div>
            <div v-else class="space-y-4">
              <UFormField label="Credit hold" help="Pause new invoices and flag this customer in the queue.">
                <div class="flex items-center gap-3">
                  <UCheckbox v-model="financeForm.creditHold" />
                  <span class="text-sm" :class="financeForm.creditHold ? 'text-amber-500 font-medium' : 'text-muted'">
                    {{ financeForm.creditHold ? 'On hold' : 'Active' }}
                  </span>
                </div>
              </UFormField>

              <UFormField v-if="financeForm.creditHold" label="Hold reason">
                <UInput v-model="financeForm.holdReason" placeholder="e.g. Overdue 90+ days, awaiting payment plan" />
              </UFormField>

              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Credit limit" help="In customer's currency. Leave blank for no limit.">
                  <UInput
                    v-model.number="financeForm.creditLimit"
                    type="number"
                    min="0"
                    :placeholder="`No limit (${customer.currency})`"
                  />
                </UFormField>

                <UFormField label="Payment priority" help="High clients are sorted to the top of the collections queue.">
                  <USelect
                    v-model="financeForm.paymentPriority"
                    :items="[
                      { label: 'Low', value: -1 },
                      { label: 'Normal', value: 0 },
                      { label: 'High', value: 1 },
                    ]"
                  />
                </UFormField>
              </div>

              <UFormField label="Internal notes" help="Visible to staff only — never shown to the customer.">
                <UTextarea v-model="financeForm.internalNotes" :rows="5" placeholder="Payment-plan terms, finance contact, anything not in Xero..." />
              </UFormField>

              <div class="flex items-center justify-between pt-2">
                <p v-if="financeFetch.data.value?.updatedAt" class="text-xs text-muted">
                  Last updated {{ relativeTime(financeFetch.data.value.updatedAt) }}
                </p>
                <UButton
                  label="Save"
                  color="primary"
                  :loading="savingFinance"
                  @click="saveFinance"
                />
              </div>
            </div>
          </UCard>

          <!-- Tags -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Segments</p>
              <h3 class="text-lg font-semibold">Tags</h3>
            </header>

            <div v-if="customerTagsFetch.pending.value || tagDictFetch.pending.value" class="space-y-2">
              <USkeleton v-for="n in 3" :key="`tsk-${n}`" class="h-8" />
            </div>

            <div v-else class="space-y-3">
              <p v-if="!(tagDictFetch.data.value?.tags.length)" class="text-sm text-muted">
                No tags defined yet. Create one below to start segmenting customers.
              </p>

              <div v-else class="flex flex-wrap gap-2">
                <button
                  v-for="t in tagDictFetch.data.value?.tags"
                  :key="t.id"
                  type="button"
                  class="rounded-full"
                  @click="toggleTag(t)"
                >
                  <UBadge
                    :color="t.color as any"
                    :variant="customerTagsFetch.data.value?.tags.some(ct => ct.id === t.id) ? 'solid' : 'outline'"
                    size="sm"
                  >
                    {{ t.label }}
                  </UBadge>
                </button>
              </div>

              <UFormField label="New tag">
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="newTagLabel"
                    placeholder="e.g. Strategic, Top 10, Churn risk"
                    class="flex-1"
                    @keyup.enter="createTag"
                  />
                  <UButton
                    label="Add"
                    color="neutral"
                    :loading="creatingTag"
                    :disabled="!newTagLabel.trim()"
                    @click="createTag"
                  />
                </div>
              </UFormField>
            </div>
          </UCard>

          <!-- Collections activity log -->
          <UCard class="lg:col-span-3" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between px-6">
                <div>
                  <p class="text-xs uppercase text-muted">Collections log</p>
                  <h3 class="text-base font-semibold">Activity history</h3>
                </div>
              </div>
            </template>

            <!-- Quick add -->
            <div class="px-6 py-4 border-b border-default flex flex-wrap items-end gap-3">
              <UFormField label="Action" class="w-48">
                <USelect
                  v-model="newLogAction"
                  :items="[
                    { label: 'Note', value: 'note' },
                    { label: 'Phone call', value: 'phone_call' },
                    { label: 'Custom email', value: 'email_custom' },
                    { label: 'Escalated to handover', value: 'escalated_to_handover' },
                  ]"
                />
              </UFormField>
              <UFormField label="Notes" class="flex-1 min-w-64">
                <UInput v-model="newLogNotes" placeholder="What happened?" />
              </UFormField>
              <UButton
                label="Log"
                color="primary"
                :loading="loggingAction"
                @click="addCollectionsEntry"
              />
            </div>

            <!-- Log entries -->
            <div v-if="collectionsFetch.pending.value" class="p-6 space-y-2">
              <USkeleton v-for="n in 4" :key="`csk-${n}`" class="h-12" />
            </div>
            <div v-else-if="collectionsFetch.data.value?.log.length" class="divide-y divide-default">
              <div
                v-for="entry in collectionsFetch.data.value?.log"
                :key="entry.id"
                class="px-6 py-3 flex items-start gap-3"
              >
                <UIcon :name="actionIcon(entry.action)" class="size-5 text-muted shrink-0 mt-0.5" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <span class="font-medium text-sm">{{ actionLabel(entry.action) }}</span>
                    <span class="text-[11px] text-muted">
                      {{ relativeTime(entry.createdAt) }}<span v-if="entry.createdBy?.name"> · {{ entry.createdBy.name }}</span>
                    </span>
                  </div>
                  <p v-if="entry.notes" class="text-sm text-muted mt-1 whitespace-pre-line">{{ entry.notes }}</p>
                </div>
              </div>
            </div>
            <div v-else class="px-6 py-8 text-center text-sm text-muted">
              No activity logged yet.
            </div>
          </UCard>
        </div>

        <!-- ═══ Activity / contact strip (always visible at bottom) ═══ -->
        <UCard :ui="{ body: '!p-6' }">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <div>
              <p class="text-[10px] text-muted uppercase">Last invoice</p>
              <p class="font-medium">{{ formatDate(customer.lastInvoiceDate) }}</p>
              <p class="text-[11px] text-muted">{{ relativeTime(customer.lastInvoiceDate) }}</p>
            </div>
            <div>
              <p class="text-[10px] text-muted uppercase">Last payment</p>
              <p class="font-medium">{{ formatDate(customer.lastPaymentDate) }}</p>
              <p class="text-[11px] text-muted">{{ relativeTime(customer.lastPaymentDate) }}</p>
            </div>
            <div>
              <p class="text-[10px] text-muted uppercase">Email</p>
              <a v-if="customer.email" :href="`mailto:${customer.email}`" class="font-medium text-primary hover:underline truncate block">
                {{ customer.email }}
              </a>
              <p v-else class="text-muted">—</p>
            </div>
            <div>
              <p class="text-[10px] text-muted uppercase">Phone</p>
              <p class="font-medium">{{ customer.phone || '—' }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
