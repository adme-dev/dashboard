<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import { format } from 'date-fns'
import { apiErrorDescription } from '~/utils/apiError'
import type {
  ClientFinancialMediaCampaign,
  ClientFinancialsResponse,
  FinancialDataSource,
  FinancialSourceFreshness,
} from '~/types'

definePageMeta({
  title: 'Client Details',
  middleware: ['role-clients']
})

const route = useRoute()
const toast = useToast()
// KPI targets are editable only by MANAGEMENT roles (matches the kpi-targets PUT
// guard) — non-managers get a read-only view instead of a 403 on save.
const { isManager, isOwner, canAccessMediaBuying, canWrite } = useAuth()
const clientId = route.params.id as string
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
) => Promise<T>

type LeadCaptureMode = 'analytics_only' | 'capture_only' | 'lightweight_crm' | 'full_crm' | 'external_crm'
type EntitlementStatus = 'trial' | 'active' | 'grace' | 'capped' | 'overdue' | 'suspended' | 'cancelled'
interface CrmSettings {
  leadCaptureMode: LeadCaptureMode
  crmCoreStatus: EntitlementStatus
  crmExternalStatus: EntitlementStatus
}
interface BoardOption {
  label: string
  value: string
}

// Fetch client data
const clientData = ref<any>(null)
const crmSettingsData = ref<CrmSettings>({
  leadCaptureMode: 'capture_only',
  crmCoreStatus: 'suspended',
  crmExternalStatus: 'suspended'
})
const pending = ref(false)
const error = ref<any>(null)
const portalBoardOptions = ref<BoardOption[]>([{ label: 'No portal board', value: '__none__' }])

async function refresh() {
  pending.value = true
  error.value = null
  try {
    const [clientResponse, crmResponse, boardsResponse] = await Promise.all([
      apiFetch(`/api/agency/clients/${clientId}`),
      apiFetch<CrmSettings>(`/api/agency/clients/${clientId}/crm-settings`).catch(() => null),
      apiFetch<{ boards: Array<{ id: string, name: string }> }>('/api/agency/boards').catch(() => ({ boards: [] }))
    ])
    clientData.value = clientResponse
    if (crmResponse) crmSettingsData.value = crmResponse
    portalBoardOptions.value = [
      { label: 'No portal board', value: '__none__' },
      ...boardsResponse.boards.map(board => ({ label: board.name, value: board.id }))
    ]
  } catch (err) {
    clientData.value = null
    error.value = err
  } finally {
    pending.value = false
  }
}

await refresh()
// Distinguish a genuine 404 from a transient/permission failure for the error state.
const isNotFound = computed(() => ((error.value as any)?.statusCode ?? (error.value as any)?.status) === 404)

const client = computed(() => (clientData.value as any)?.client || null)

// One reporting period owns every financial surface on this route. CalendarDate
// keeps the inclusive ISO range independent of browser/server UTC conversion.
const calendarToday = today(getLocalTimeZone())
const financialMonth = ref(calendarToday.month)
const financialYear = ref(calendarToday.year)
const financialWeekFilter = ref<{ start: string; end: string } | null>(null)

const financialRange = computed(() => {
  const monthStart = new CalendarDate(financialYear.value, financialMonth.value, 1)
  const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 })
  const requestedFrom = financialWeekFilter.value?.start ?? monthStart.toString()
  const requestedTo = financialWeekFilter.value?.end ?? monthEnd.toString()
  const isCurrentMonth = financialMonth.value === calendarToday.month
    && financialYear.value === calendarToday.year
  const to = isCurrentMonth && requestedTo > calendarToday.toString()
    ? calendarToday.toString()
    : requestedTo

  return {
    // Future week pills in the current month collapse to today's valid boundary.
    from: requestedFrom > to ? to : requestedFrom,
    to,
  }
})

const financialQuery = computed(() => ({
  from: financialRange.value.from,
  to: financialRange.value.to,
}))

const {
  data: financialData,
  status: financialStatus,
  error: financialError,
  refresh: refreshFinancials,
} = await useFetch<ClientFinancialsResponse>(
  `/api/agency/clients/${clientId}/financials`,
  { query: financialQuery },
)

// Nuxt retains prior data while a reactive query changes. Only render a response
// whose inclusive server period matches the currently selected range.
const currentFinancialData = computed(() => {
  if (financialStatus.value !== 'success') return null
  const response = financialData.value
  if (!response) return null
  return response.period.from === financialRange.value.from
    && response.period.to === financialRange.value.to
    ? response
    : null
})

const financialPending = computed(() => financialStatus.value === 'idle'
  || financialStatus.value === 'pending'
  || (financialStatus.value === 'success' && !currentFinancialData.value))
const financialFailed = computed(() => financialStatus.value === 'error' && financialError.value !== null)
const financialProjects = computed(() => currentFinancialData.value?.projects ?? [])
const financialActivity = computed(() => currentFinancialData.value?.activity ?? null)
const summaryWarnings = computed(() => (currentFinancialData.value?.warnings ?? [])
  .filter(warning => warning.code !== 'activity_truncated'))

function freshnessFor(source: FinancialDataSource): FinancialSourceFreshness | undefined {
  return currentFinancialData.value?.freshness.find(entry => entry.source === source)
}

const timeFreshness = computed(() => freshnessFor('time_entries'))
const invoiceFreshness = computed(() => freshnessFor('xero_invoices'))
const mediaFreshness = computed(() => freshnessFor('media_spend'))

function isSourceUnavailable(source: FinancialSourceFreshness | undefined): boolean {
  return source?.status === 'unavailable' || source?.status === 'not_connected'
}

function isSourcePartial(source: FinancialSourceFreshness | undefined): boolean {
  return source?.status === 'partial' || source?.status === 'stale'
}

const financialPeriodEmpty = computed(() => {
  const data = currentFinancialData.value
  if (!data || data.freshness.some(source => isSourceUnavailable(source))) return false
  return data.summary.xeroRevenue === 0
    && data.summary.mediaSpend === 0
    && data.summary.deliveryCost === 0
    && data.summary.hours === 0
    && data.activity.timeEntries.length === 0
    && data.activity.invoices.length === 0
    && data.activity.mediaCampaigns.length === 0
})

const mediaConfirmedZero = computed(() => mediaFreshness.value?.status === 'fresh'
  && financialActivity.value?.mediaCampaigns.length === 0
  && currentFinancialData.value?.summary.mediaSpend === 0)

// Active tab
const activeTab = ref('overview')
const showFinancialAllocation = ref(false)
const qrGrid = ref<{ refresh: () => void, openNew: () => void }>()

const tabItems = computed(() => [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  {
    label: 'Projects',
    value: 'projects',
    icon: 'i-lucide-folder',
    badge: currentFinancialData.value ? String(financialProjects.value.length) : undefined,
  },
  {
    label: 'Time Entries',
    value: 'time',
    icon: 'i-lucide-clock',
    badge: currentFinancialData.value && financialActivity.value
      ? String(financialActivity.value.totalTimeEntries)
      : undefined,
  },
  {
    label: 'Invoices',
    value: 'invoices',
    icon: 'i-lucide-receipt',
    badge: currentFinancialData.value && financialActivity.value
      ? String(financialActivity.value.invoices.length)
      : undefined,
  },
  {
    label: 'Media Spend',
    value: 'media',
    icon: 'i-lucide-megaphone',
    badge: currentFinancialData.value && financialActivity.value
      ? String(financialActivity.value.mediaCampaigns.length)
      : undefined,
  },
  { label: 'Website', value: 'website', icon: 'i-lucide-radio' },
  { label: 'QR Codes', value: 'qr', icon: 'i-lucide-qr-code' },
  ...(canAccessMediaBuying.value
    ? [{ label: 'Measurement', value: 'measurement', icon: 'i-lucide-activity' }]
    : []),
])

// Format helpers
const currencyFormatters = new Map<string, Intl.NumberFormat>()

const formatCurrency = (value: unknown, currency = 'AUD') => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available'
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'AUD'
  let formatter = currencyFormatters.get(safeCurrency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    currencyFormatters.set(safeCurrency, formatter)
  }
  return formatter.format(value)
}

const formatHours = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? `${value.toFixed(1)}h`
  : 'Not available'

const formatDate = (date: string) => {
  if (!date) return '—'
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date)
  return Number.isNaN(parsed.getTime()) ? 'Not available' : format(parsed, 'MMM d, yyyy')
}

const getInvoiceStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status.toUpperCase()) {
    case 'PAID': return 'success'
    case 'AUTHORISED':
    case 'AUTHORIZED':
    case 'SUBMITTED': return 'warning'
    case 'VOIDED':
    case 'DELETED': return 'error'
    default: return 'neutral'
  }
}

const getMediaSourceColor = (state: ClientFinancialMediaCampaign['sourceState']): 'success' | 'warning' | 'error' | 'neutral' => {
  if (state === 'available') return 'success'
  if (state === 'partial') return 'warning'
  if (state === 'unavailable') return 'error'
  return 'neutral'
}

const getMediaSourceLabel = (state: ClientFinancialMediaCampaign['sourceState']) => {
  if (state === 'available') return 'Available'
  if (state === 'partial') return 'Partial'
  if (state === 'unavailable') return 'Unavailable'
  return 'Not connected'
}

const formatStatusLabel = (value: string | null) => {
  if (!value) return 'Not supplied'
  const normalized = value.replaceAll('_', ' ').trim()
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Not supplied'
}

const formatCampaignSpend = (campaign: ClientFinancialMediaCampaign) => {
  if (campaign.sourceState === 'not_connected') return 'Not connected'
  if (campaign.sourceState === 'unavailable') return 'Not available'
  if (campaign.sourceState === 'partial') return 'Partial period unavailable'
  return formatCurrency(campaign.actualSpend)
}

async function retryFinancials() {
  await refreshFinancials()
}

async function handleFinancialAllocated() {
  await refreshFinancials()
}

// Billing type labels
const billingTypeLabels: Record<string, string> = {
  retainer: 'Retainer',
  time_materials: 'Time & Materials',
  fixed: 'Fixed Price',
  commission: 'Commission',
  project: 'Project-Based',
  hybrid: 'Hybrid'
}

// Edit modal
const showEditModal = ref(false)
const editForm = ref({
  name: '',
  billingType: '',
  paymentTerms: 30,
  hourlyRate: null as number | null,
  retainerAmount: null as number | null,
  mediaCommissionRate: null as number | null,
  xeroContactId: null as string | null,
  contactEmail: '',
  contactPhone: '',
  address: '',
  notes: '',
  isActive: true,
  portalBoardId: '__none__',
  leadCaptureMode: 'capture_only' as LeadCaptureMode,
  crmCoreStatus: 'suspended' as EntitlementStatus,
  crmExternalStatus: 'suspended' as EntitlementStatus
})

const openEditModal = () => {
  if (client.value) {
    editForm.value = {
      name: client.value.name,
      billingType: client.value.billingType,
      paymentTerms: client.value.paymentTerms || 30,
      hourlyRate: client.value.hourlyRate,
      retainerAmount: client.value.retainerAmount,
      mediaCommissionRate: client.value.mediaCommissionRate,
      xeroContactId: client.value.xeroContactId || null,
      contactEmail: client.value.contactEmail || '',
      contactPhone: client.value.contactPhone || '',
      address: client.value.address || '',
      notes: client.value.notes || '',
      isActive: client.value.isActive,
      portalBoardId: client.value.portalBoardId || '__none__',
      leadCaptureMode: crmSettingsData.value.leadCaptureMode,
      crmCoreStatus: crmSettingsData.value.crmCoreStatus,
      crmExternalStatus: crmSettingsData.value.crmExternalStatus
    }
    showEditModal.value = true
  }
}

const saving = ref(false)
type ClientMutationKind = 'client' | 'crm' | 'unlink'
const mutationAttempts = new Map<ClientMutationKind, { signature: string; key: string }>()

function idempotencyKeyFor(kind: ClientMutationKind, body: unknown): string {
  const signature = JSON.stringify(body)
  const current = mutationAttempts.get(kind)
  if (current?.signature === signature) return current.key
  const key = `agency-client:${kind}:${crypto.randomUUID()}`
  mutationAttempts.set(kind, { signature, key })
  return key
}

const saveClient = async () => {
  saving.value = true
  try {
    const {
      leadCaptureMode,
      crmCoreStatus,
      crmExternalStatus,
      ...clientPayload
    } = editForm.value
    const crmPayload = { leadCaptureMode, crmCoreStatus, crmExternalStatus }
    const normalizedClientPayload = {
      ...clientPayload,
      portalBoardId: clientPayload.portalBoardId === '__none__' ? null : clientPayload.portalBoardId
    }
    const requests: Array<Promise<unknown>> = [
      apiFetch(`/api/agency/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKeyFor('client', normalizedClientPayload) },
        body: normalizedClientPayload
      })
    ]
    if (isManager.value) {
      requests.push(apiFetch(`/api/agency/clients/${clientId}/crm-settings`, {
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKeyFor('crm', crmPayload) },
        body: crmPayload
      }))
    }
    await Promise.all(requests)
    toast.add({ title: 'Client updated', color: 'success' })
    mutationAttempts.delete('client')
    mutationAttempts.delete('crm')
    showEditModal.value = false
    await refresh()
    await refreshFinancials()
  } catch (err: any) {
    toast.add({ title: 'Failed to update client', description: apiErrorDescription(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

const unlinkXero = async () => {
  const payload = { xeroContactId: null }
  try {
    await apiFetch(`/api/agency/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Idempotency-Key': idempotencyKeyFor('unlink', payload) },
      body: payload
    })
    mutationAttempts.delete('unlink')
    toast.add({ title: 'Xero contact unlinked', color: 'success' })
    await refresh()
    await refreshFinancials()
  } catch (err: any) {
    toast.add({ title: 'Failed to unlink', description: apiErrorDescription(err), color: 'error' })
  }
}

const billingTypeOptions = [
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Commission', value: 'commission' },
  { label: 'Project-Based', value: 'project' },
  { label: 'Hybrid', value: 'hybrid' }
]

const crmModeOptions = [
  { label: 'Analytics only', value: 'analytics_only' },
  { label: 'Capture leads', value: 'capture_only' },
  { label: 'Lightweight CRM', value: 'lightweight_crm' },
  { label: 'Full CRM', value: 'full_crm' },
  { label: 'External CRM', value: 'external_crm' }
]

const crmModeDescriptions: Record<LeadCaptureMode, string> = {
  analytics_only: 'Measure website and campaign activity without creating canonical lead records.',
  capture_only: 'Capture, reconcile and attribute leads without creating CRM opportunities.',
  lightweight_crm: 'Create contacts and opportunities in the streamlined XeroFlow CRM workspace.',
  full_crm: 'Enable the complete XeroFlow CRM lifecycle, automation and future AI features.',
  external_crm: 'Capture leads in XeroFlow and deliver them to the client’s connected CRM.'
}

const entitlementStatusOptions = [
  { label: 'Trial', value: 'trial' },
  { label: 'Active', value: 'active' },
  { label: 'Grace period', value: 'grace' },
  { label: 'Usage capped', value: 'capped' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Cancelled', value: 'cancelled' }
]


// Time entry columns
const timeColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'userName', header: 'Team member' },
  { accessorKey: 'description', header: 'Description' },
  { accessorKey: 'hours', header: 'Hours' },
  { accessorKey: 'labourCost', header: 'Labour cost' },
]

// Invoice columns
const invoiceColumns = [
  { accessorKey: 'invoiceNumber', header: 'Invoice #' },
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'total', header: 'Total' },
  { accessorKey: 'amountDue', header: 'Amount due' },
  { accessorKey: 'status', header: 'Status' },
]

const mediaColumns = [
  { accessorKey: 'campaignName', header: 'Campaign' },
  { accessorKey: 'platform', header: 'Platform' },
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'budget', header: 'Budget' },
  { accessorKey: 'actualSpend', header: 'Actual spend' },
  { accessorKey: 'pacingStatus', header: 'Pacing' },
  { accessorKey: 'sourceState', header: 'Source' },
]

// KPI Targets
const kpiData = ref<{ targets: Array<{ resultType: string, targetCostPerResult: number, targetCtr: number | null, maxFrequency: number | null }>, availableResultTypes: string[] }>({ targets: [], availableResultTypes: [] })

async function refreshKpi() {
  kpiData.value = await apiFetch<{ targets: Array<{ resultType: string, targetCostPerResult: number, targetCtr: number | null, maxFrequency: number | null }>, availableResultTypes: string[] }>(
    `/api/agency/clients/${clientId}/kpi-targets`
  ).catch(() => ({ targets: [], availableResultTypes: [] }))
}

await refreshKpi()
const kpiTargets = ref<Array<{ resultType: string, targetCostPerResult: number | null, targetCtr: number | null, maxFrequency: number | null }>>([])
watch(kpiData, (v) => { kpiTargets.value = (v?.targets || []).map(t => ({ ...t })) }, { immediate: true })
// Result-type options = the values this client's campaigns actually carry, plus any already-saved targets.
const resultTypeOptions = computed(() => {
  const set = new Set<string>(kpiData.value?.availableResultTypes || [])
  for (const t of kpiTargets.value) if (t.resultType) set.add(t.resultType)
  return [...set].sort()
})

function addKpiRow() { kpiTargets.value.push({ resultType: '', targetCostPerResult: null, targetCtr: null, maxFrequency: null }) }
function removeKpiRow(i: number) { kpiTargets.value.splice(i, 1) }

const kpiSaving = ref(false)
async function saveKpiTargets() {
  const clean = kpiTargets.value.filter(t => t.resultType && Number(t.targetCostPerResult) > 0)
  kpiSaving.value = true
  try {
    await apiFetch(`/api/agency/clients/${clientId}/kpi-targets`, { method: 'PUT', body: { targets: clean } })
    toast.add({ title: 'KPI targets saved', color: 'success' })
    await refreshKpi()
  } catch {
    toast.add({ title: 'Failed to save targets', color: 'error' })
  } finally {
    kpiSaving.value = false
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar :title="client?.name || 'Client Details'">
        <template #leading>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/clients"
          />
        </template>
        <template #trailing>
          <div v-if="client" class="flex items-center gap-2">
            <UBadge variant="subtle" :color="client.isActive ? 'success' : 'neutral'">
              {{ client.isActive ? 'Active' : 'Inactive' }}
            </UBadge>
            <span class="text-sm text-muted">{{ billingTypeLabels[client.billingType] || client.billingType }}</span>
          </div>
        </template>
        <template #right>
          <div class="flex gap-2">
            <UButton
              label="New Project"
              icon="i-lucide-folder-plus"
              variant="outline"
              :to="`/agency/projects/new?clientId=${clientId}`"
            />
            <UButton
              label="Edit"
              icon="i-lucide-pencil"
              color="primary"
              @click="openEditModal"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <template v-else-if="client">
          <section aria-labelledby="client-financial-heading" class="mb-6 space-y-4">
            <div class="flex flex-col gap-4 border-b border-default pb-4 xl:flex-row xl:items-end xl:justify-between">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 id="client-financial-heading" class="text-lg font-semibold text-highlighted">
                    Financial performance
                  </h2>
                  <UBadge v-if="currentFinancialData" color="neutral" variant="subtle">
                    Inclusive period
                  </UBadge>
                </div>
                <p class="max-w-2xl text-sm text-muted">
                  Reconciled Xero revenue, agency-paid media and delivery cost for one reporting period.
                </p>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
                <SocialSpendPeriodPicker
                  v-model:month="financialMonth"
                  v-model:year="financialYear"
                  v-model:week-filter="financialWeekFilter"
                  :show-sync="false"
                />
                <UButton
                  v-if="currentFinancialData?.permissions.canAllocate"
                  label="Allocate costs"
                  icon="i-lucide-split"
                  variant="outline"
                  @click="() => { showFinancialAllocation = true }"
                />
              </div>
            </div>

            <div
              v-if="financialPending"
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-busy="true"
              aria-label="Loading client financials"
            >
              <USkeleton v-for="index in 9" :key="index" class="h-36 w-full rounded-lg" />
            </div>

            <UAlert
              v-else-if="financialFailed"
              title="Financial reporting could not be refreshed"
              description="Retry the reconciled financial read. Website and Measurement remain available while this source is unavailable."
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
            >
              <template #actions>
                <UButton
                  label="Retry financials"
                  color="error"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-refresh-cw"
                  @click="retryFinancials"
                />
              </template>
            </UAlert>

            <template v-else-if="currentFinancialData">
              <ClientsClientFinancialSummary
                :summary="currentFinancialData.summary"
                :allocation-coverage="currentFinancialData.allocationCoverage"
                :freshness="currentFinancialData.freshness"
              />

              <UAlert
                v-if="financialPeriodEmpty"
                title="No financial activity in this period"
                description="The connected sources returned a confirmed empty result for the inclusive reporting period."
                color="neutral"
                variant="subtle"
                icon="i-lucide-calendar-x"
              />

              <ClientsClientFinancialWarnings
                :warnings="summaryWarnings"
                :reconciliation="currentFinancialData.reconciliation"
              />
            </template>
          </section>

          <!-- Tabs -->
          <UTabs
            v-model="activeTab"
            :items="tabItems"
            class="mb-6"
          />

          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Client Info -->
            <UCard class="lg:col-span-2">
              <template #header>
                <h3 class="font-semibold">
                  Client Information
                </h3>
              </template>
              <dl class="space-y-3">
                <div>
                  <dt class="text-sm text-muted">
                    Billing Type
                  </dt>
                  <dd class="font-medium">
                    {{ billingTypeLabels[client.billingType] || client.billingType }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">
                    Payment Terms
                  </dt>
                  <dd class="font-medium">
                    {{ client.paymentTerms }} days
                  </dd>
                </div>
                <div v-if="client.contactEmail">
                  <dt class="text-sm text-muted">
                    Contact Email
                  </dt>
                  <dd class="font-medium">
                    <a :href="`mailto:${client.contactEmail}`" class="text-primary hover:underline">{{ client.contactEmail }}</a>
                  </dd>
                </div>
                <div v-if="client.contactPhone">
                  <dt class="text-sm text-muted">
                    Contact Phone
                  </dt>
                  <dd class="font-medium">
                    <a :href="`tel:${client.contactPhone}`" class="text-primary hover:underline">{{ client.contactPhone }}</a>
                  </dd>
                </div>
                <div v-if="client.address">
                  <dt class="text-sm text-muted">
                    Billing Address
                  </dt>
                  <dd class="text-sm whitespace-pre-line">
                    {{ client.address }}
                  </dd>
                </div>
                <div v-if="client.hourlyRate">
                  <dt class="text-sm text-muted">
                    Hourly Rate
                  </dt>
                  <dd class="font-medium">
                    {{ formatCurrency(client.hourlyRate) }}/hr
                  </dd>
                </div>
                <div v-if="client.retainerAmount">
                  <dt class="text-sm text-muted">
                    Retainer Amount
                  </dt>
                  <dd class="font-medium">
                    {{ formatCurrency(client.retainerAmount) }}/mo
                  </dd>
                </div>
                <div v-if="client.mediaCommissionRate">
                  <dt class="text-sm text-muted">
                    Media Commission
                  </dt>
                  <dd class="font-medium">
                    {{ client.mediaCommissionRate }}%
                  </dd>
                </div>
                <div v-if="client.notes">
                  <dt class="text-sm text-muted">
                    Notes
                  </dt>
                  <dd class="text-sm">
                    {{ client.notes }}
                  </dd>
                </div>
              </dl>
            </UCard>

            <!-- Account Team -->
            <ClientsClientTeamCard :client-id="clientId" />

            <!-- Xero Link -->
            <UCard class="lg:col-span-3">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">
                    Xero Integration
                  </h3>
                  <UIcon name="i-lucide-link" class="w-5 h-5 text-dimmed" />
                </div>
              </template>
              <div v-if="client.xeroContactId" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UBadge color="success" variant="subtle">
                    <UIcon name="i-lucide-check" class="w-3 h-3 mr-1" />
                    Linked
                  </UBadge>
                  <span class="text-sm text-muted">Contact ID: {{ client.xeroContactId }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    label="View in Xero"
                    icon="i-lucide-external-link"
                    variant="outline"
                    size="sm"
                    :to="`https://go.xero.com/Contacts/View/${client.xeroContactId}`"
                    target="_blank"
                  />
                  <UButton
                    label="Unlink"
                    icon="i-lucide-unlink"
                    variant="ghost"
                    size="sm"
                    color="error"
                    @click="unlinkXero"
                  />
                </div>
              </div>
              <div v-else class="flex items-center justify-between">
                <p class="text-sm text-muted">
                  Not linked to a Xero contact
                </p>
                <UButton
                  label="Link to Xero Contact"
                  icon="i-lucide-link"
                  variant="outline"
                  size="sm"
                  @click="openEditModal"
                />
              </div>
            </UCard>

            <!-- KPI Targets -->
            <UCard class="lg:col-span-3">
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold text-default">
                      KPI Targets
                    </h3>
                    <p class="text-xs text-muted">
                      Per-result-type targets that drive the campaign health score.
                    </p>
                  </div>
                  <UButton
                    v-if="isManager"
                    size="xs"
                    variant="outline"
                    icon="i-lucide-plus"
                    label="Add"
                    @click="addKpiRow"
                  />
                </div>
              </template>
              <div class="space-y-3">
                <div v-for="(t, i) in kpiTargets" :key="i" class="grid grid-cols-12 gap-2 items-end">
                  <UFormField class="col-span-4" label="Result type">
                    <USelectMenu
                      v-model="t.resultType"
                      :items="resultTypeOptions"
                      create-item
                      placeholder="Select result type"
                      size="sm"
                      :disabled="!isManager"
                      @create="(v: string) => { t.resultType = v }"
                    />
                  </UFormField>
                  <UFormField class="col-span-3" label="Target cost / result">
                    <UInput
                      v-model.number="t.targetCostPerResult"
                      type="number"
                      :min="0"
                      step="0.01"
                      size="sm"
                      :disabled="!isManager"
                    />
                  </UFormField>
                  <UFormField class="col-span-2" label="Target CTR %">
                    <UInput
                      v-model.number="t.targetCtr"
                      type="number"
                      :min="0"
                      step="0.01"
                      size="sm"
                      :disabled="!isManager"
                    />
                  </UFormField>
                  <UFormField class="col-span-2" label="Max freq.">
                    <UInput
                      v-model.number="t.maxFrequency"
                      type="number"
                      :min="0"
                      step="0.1"
                      size="sm"
                      :disabled="!isManager"
                    />
                  </UFormField>
                  <UButton
                    v-if="isManager"
                    class="col-span-1"
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    @click="removeKpiRow(i)"
                  />
                </div>
                <p v-if="!kpiTargets.length" class="text-xs text-muted">
                  {{ isManager ? 'No targets yet. Add one to enable health scoring for this client.' : 'No KPI targets set for this client.' }}
                </p>
                <div v-if="isManager" class="flex justify-end pt-1">
                  <UButton
                    size="sm"
                    label="Save targets"
                    :loading="kpiSaving"
                    @click="saveKpiTargets"
                  />
                </div>
              </div>
            </UCard>
          </div>

          <!-- Projects Tab -->
          <section v-if="activeTab === 'projects'" aria-label="Project financials" class="space-y-4">
            <ClientsClientProjectFinancialTable
              v-if="financialPending"
              :projects="[]"
              pending
            />
            <UAlert
              v-else-if="financialFailed"
              title="Project financials are unavailable"
              description="Retry the financial façade above to load reconciled project results."
              color="error"
              variant="subtle"
              icon="i-lucide-folder-x"
            />
            <template v-else-if="currentFinancialData">
              <ClientsClientProjectFinancialTable :projects="financialProjects" />
              <UAlert
                v-if="financialProjects.length === 0"
                title="No projects to report"
                description="This client has no project rows in the selected reporting context."
                color="neutral"
                variant="subtle"
                icon="i-lucide-folder-open"
              />
            </template>
          </section>

          <!-- Time Entries Tab -->
          <section v-if="activeTab === 'time'" aria-labelledby="time-entries-heading" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="time-entries-heading" class="text-base font-semibold text-highlighted">Time entries</h3>
              <UBadge v-if="financialActivity" color="neutral" variant="subtle">
                {{ financialActivity.totalTimeEntries }} in period
              </UBadge>
            </div>

            <USkeleton v-if="financialPending" class="h-72 w-full rounded-lg" aria-label="Loading time entries" />
            <UAlert
              v-else-if="financialFailed"
              title="Time entries are unavailable"
              description="Retry the financial façade above to load selected-period activity."
              color="error"
              variant="subtle"
              icon="i-lucide-clock-alert"
            />
            <template v-else-if="currentFinancialData && financialActivity">
              <UAlert
                v-if="isSourceUnavailable(timeFreshness)"
                title="Time-entry source unavailable"
                :description="timeFreshness?.label || 'The time-entry source could not confirm this period.'"
                color="error"
                variant="subtle"
                icon="i-lucide-clock-alert"
              />
              <UAlert
                v-else-if="isSourcePartial(timeFreshness)"
                title="Time-entry activity is partial"
                :description="timeFreshness?.label || 'Only part of the selected period is available.'"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />
              <UAlert
                v-if="financialActivity.truncated"
                title="Time-entry activity is truncated"
                :description="`Showing ${financialActivity.timeEntries.length} of ${financialActivity.totalTimeEntries} entries. Narrow the reporting period to review all activity.`"
                color="warning"
                variant="subtle"
                icon="i-lucide-list-end"
              />

              <UCard v-if="!isSourceUnavailable(timeFreshness)">
                <UTable :data="financialActivity.timeEntries" :columns="timeColumns">
                  <template #date-cell="{ row }">
                    {{ formatDate(row.original.date) }}
                  </template>
                  <template #projectName-cell="{ row }">
                    <span class="font-medium text-highlighted">{{ row.original.projectName }}</span>
                  </template>
                  <template #userName-cell="{ row }">
                    {{ row.original.userName || 'Unassigned' }}
                  </template>
                  <template #description-cell="{ row }">
                    <span class="text-muted">{{ row.original.description || '—' }}</span>
                  </template>
                  <template #hours-cell="{ row }">
                    <span class="tabular-nums">{{ formatHours(row.original.hours) }}</span>
                  </template>
                  <template #labourCost-cell="{ row }">
                    <span class="tabular-nums">{{ formatCurrency(row.original.labourCost) }}</span>
                  </template>
                </UTable>

                <div
                  v-if="financialActivity.timeEntries.length === 0"
                  role="status"
                  class="py-8 text-center text-sm text-muted"
                >
                  No time entries in the selected period
                </div>
              </UCard>
            </template>
          </section>

          <!-- Invoices Tab -->
          <section v-if="activeTab === 'invoices'" aria-labelledby="invoices-heading" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="invoices-heading" class="text-base font-semibold text-highlighted">Xero invoice headers</h3>
              <UBadge v-if="financialActivity" color="neutral" variant="subtle">
                {{ financialActivity.invoices.length }} in period
              </UBadge>
            </div>

            <USkeleton v-if="financialPending" class="h-72 w-full rounded-lg" aria-label="Loading Xero invoices" />
            <UAlert
              v-else-if="financialFailed"
              title="Xero invoice headers are unavailable"
              description="Retry the financial façade above to load invoice activity."
              color="error"
              variant="subtle"
              icon="i-lucide-receipt-text"
            />
            <template v-else-if="currentFinancialData && financialActivity">
              <UAlert
                v-if="isSourceUnavailable(invoiceFreshness)"
                title="Xero invoice source unavailable"
                :description="invoiceFreshness?.label || 'Xero could not confirm invoice headers for this period.'"
                color="error"
                variant="subtle"
                icon="i-lucide-unplug"
              />
              <UAlert
                v-else-if="isSourcePartial(invoiceFreshness)"
                title="Xero invoice activity is partial"
                :description="invoiceFreshness?.label || 'Only part of the selected period is available.'"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />

              <UCard v-if="!isSourceUnavailable(invoiceFreshness)">
                <UTable :data="financialActivity.invoices" :columns="invoiceColumns">
                  <template #invoiceNumber-cell="{ row }">
                    <span class="font-medium text-highlighted">{{ row.original.invoiceNumber }}</span>
                  </template>
                  <template #date-cell="{ row }">
                    {{ formatDate(row.original.date) }}
                  </template>
                  <template #total-cell="{ row }">
                    <span class="tabular-nums">{{ formatCurrency(row.original.total, row.original.currency) }}</span>
                  </template>
                  <template #amountDue-cell="{ row }">
                    <span class="tabular-nums">{{ formatCurrency(row.original.amountDue, row.original.currency) }}</span>
                  </template>
                  <template #status-cell="{ row }">
                    <UBadge :color="getInvoiceStatusColor(row.original.status)" variant="subtle">
                      {{ row.original.status }}
                    </UBadge>
                  </template>
                </UTable>

                <div
                  v-if="financialActivity.invoices.length === 0"
                  role="status"
                  class="py-8 text-center text-sm text-muted"
                >
                  No Xero invoice headers in the selected period
                </div>
              </UCard>
            </template>
          </section>

          <!-- Media Spend Tab -->
          <section v-if="activeTab === 'media'" aria-labelledby="media-spend-heading" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="media-spend-heading" class="text-base font-semibold text-highlighted">Campaign media spend</h3>
              <UBadge
                v-if="mediaFreshness"
                :color="mediaFreshness.status === 'fresh' ? 'success' : mediaFreshness.status === 'partial' ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ mediaFreshness.label }}
              </UBadge>
            </div>

            <USkeleton v-if="financialPending" class="h-72 w-full rounded-lg" aria-label="Loading media spend" />
            <UAlert
              v-else-if="financialFailed"
              title="Media spend is unavailable"
              description="Retry the financial façade above to load campaign activity."
              color="error"
              variant="subtle"
              icon="i-lucide-megaphone-off"
            />
            <template v-else-if="currentFinancialData && financialActivity">
              <UAlert
                v-if="mediaFreshness?.status === 'not_connected'"
                title="No media account connected"
                description="Connect a media account or add confirmed manual media data before relying on campaign spend."
                color="neutral"
                variant="subtle"
                icon="i-lucide-unplug"
              />
              <UAlert
                v-else-if="mediaFreshness?.status === 'unavailable'"
                title="Media source unavailable"
                :description="mediaFreshness.label || 'Campaign spend could not be confirmed for this period.'"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
              />
              <UAlert
                v-else-if="mediaFreshness?.status === 'partial' || mediaFreshness?.status === 'stale'"
                title="Media spend is partial"
                :description="mediaFreshness.label || 'Only part of the selected period is available.'"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />

              <UAlert
                v-if="mediaConfirmedZero"
                title="Connected with confirmed zero spend"
                description="The connected media source returned $0 and no campaign activity for this reporting period."
                color="success"
                variant="subtle"
                icon="i-lucide-badge-check"
              />
              <UAlert
                v-else-if="financialActivity.mediaCampaigns.length === 0 && !isSourceUnavailable(mediaFreshness)"
                title="No campaign rows in this period"
                description="The media source returned no campaign-level activity for the selected inclusive dates."
                color="neutral"
                variant="subtle"
                icon="i-lucide-megaphone-off"
              />

              <UCard v-if="financialActivity.mediaCampaigns.length > 0">
                <div class="overflow-x-auto">
                  <UTable :data="financialActivity.mediaCampaigns" :columns="mediaColumns" class="min-w-[820px]">
                    <template #campaignName-cell="{ row }">
                      <span class="font-medium text-highlighted">{{ row.original.campaignName }}</span>
                    </template>
                    <template #platform-cell="{ row }">
                      {{ row.original.platform }}
                    </template>
                    <template #projectName-cell="{ row }">
                      <span :class="row.original.projectName ? 'text-default' : 'text-muted'">
                        {{ row.original.projectName || 'Unallocated' }}
                      </span>
                    </template>
                    <template #budget-cell="{ row }">
                      <span class="tabular-nums">
                        {{ row.original.budget === null ? 'Not set' : formatCurrency(row.original.budget) }}
                      </span>
                    </template>
                    <template #actualSpend-cell="{ row }">
                      <span class="tabular-nums">{{ formatCampaignSpend(row.original) }}</span>
                    </template>
                    <template #pacingStatus-cell="{ row }">
                      <span :class="row.original.pacingStatus ? 'text-default' : 'text-muted'">
                        {{ formatStatusLabel(row.original.pacingStatus) }}
                      </span>
                    </template>
                    <template #sourceState-cell="{ row }">
                      <UBadge :color="getMediaSourceColor(row.original.sourceState)" variant="subtle">
                        {{ getMediaSourceLabel(row.original.sourceState) }}
                      </UBadge>
                    </template>
                  </UTable>
                </div>
              </UCard>
            </template>
          </section>

          <!-- Website analytics Tab -->
          <div v-if="activeTab === 'website'">
            <TrackingAnalyticsContainer :client-id="clientId" />
          </div>

          <div v-if="activeTab === 'qr'" class="space-y-4">
            <div class="flex justify-end"><UButton icon="i-lucide-plus" @click="qrGrid?.openNew()">New QR code</UButton></div>
            <QrGrid ref="qrGrid" :client-id="clientId" />
          </div>

          <div v-if="activeTab === 'measurement' && canAccessMediaBuying">
            <ClientsClientMeasurementPanel
              :client-id="clientId"
              :client-name="client?.name"
              :can-configure="canWrite"
              :can-owner-override="isOwner"
            />
          </div>
        </template>

        <!-- Not found (404) vs a transient/permission load failure -->
        <div v-else class="flex flex-col items-center justify-center text-center py-20">
          <UIcon :name="isNotFound ? 'i-lucide-user-x' : 'i-lucide-alert-triangle'" class="w-10 h-10 text-dimmed mb-3" />
          <h3 class="text-base font-semibold">
            {{ isNotFound ? 'Client not found' : 'Couldn’t load client' }}
          </h3>
          <p class="text-sm text-muted mt-1 max-w-sm">
            {{ isNotFound
              ? 'This client doesn’t exist or you don’t have access to it. It may have been removed.'
              : 'Something went wrong loading this client. Please try again.' }}
          </p>
          <div class="mt-4 flex items-center gap-2">
            <UButton
              v-if="!isNotFound"
              icon="i-lucide-refresh-cw"
              label="Retry"
              @click="refresh()"
            />
            <UButton
              variant="outline"
              icon="i-lucide-arrow-left"
              label="Back to clients"
              to="/agency/clients"
            />
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Edit Modal -->
    <USlideover v-model:open="showEditModal">
      <template #header>
        <h3 class="text-[16px] font-[500]">
          Edit Client
        </h3>
      </template>
      <template #body>
        <form class="@container px-1 space-y-6" @submit.prevent="saveClient">
          <!-- Section: General -->
          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              General
            </legend>

            <UFormField label="Client Name" required>
              <UInput
                v-model="editForm.name"
                size="xl"
                class="w-full"
                placeholder="Client name"
              />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Billing Type">
                <USelectMenu
                  v-model="editForm.billingType"
                  :items="billingTypeOptions"
                  value-key="value"
                  size="xl"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Payment Terms">
                <UInput
                  v-model.number="editForm.paymentTerms"
                  type="number"
                  min="0"
                  size="xl"
                  class="w-full"
                  placeholder="30"
                >
                  <template #trailing>
                    <span class="text-muted text-xs">days</span>
                  </template>
                </UInput>
              </UFormField>
            </div>
          </fieldset>

          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Client portal
            </legend>

            <UFormField
              label="Linked board"
              help="Portal users see a read-only view containing only work attached to this client's projects."
            >
              <USelectMenu
                v-model="editForm.portalBoardId"
                :items="portalBoardOptions"
                value-key="value"
                size="xl"
                class="w-full"
              />
            </UFormField>

            <UAlert
              color="neutral"
              variant="subtle"
              icon="i-lucide-shield-check"
              title="Client-scoped visibility"
              description="Other clients' tasks and internal board items without a matching client project are never exposed."
            />
          </fieldset>

          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Lead capture & CRM
            </legend>

            <UFormField label="Operating mode">
              <USelectMenu
                v-model="editForm.leadCaptureMode"
                :items="crmModeOptions"
                value-key="value"
                size="xl"
                class="w-full"
                :disabled="!isManager"
              />
              <template #hint>
                <span class="text-xs text-muted">
                  {{ crmModeDescriptions[editForm.leadCaptureMode] }}
                </span>
              </template>
            </UFormField>

            <UFormField
              v-if="['lightweight_crm', 'full_crm'].includes(editForm.leadCaptureMode)"
              label="XeroFlow CRM access"
            >
              <USelectMenu
                v-model="editForm.crmCoreStatus"
                :items="entitlementStatusOptions"
                value-key="value"
                size="xl"
                class="w-full"
                :disabled="!isManager"
              />
              <template #hint>
                <span class="text-xs text-muted">
                  Trial, active and grace-period access can promote captured leads into CRM.
                </span>
              </template>
            </UFormField>

            <UFormField
              v-if="editForm.leadCaptureMode === 'external_crm'"
              label="External CRM delivery"
            >
              <USelectMenu
                v-model="editForm.crmExternalStatus"
                :items="entitlementStatusOptions"
                value-key="value"
                size="xl"
                class="w-full"
                :disabled="!isManager"
              />
              <template #hint>
                <span class="text-xs text-muted">
                  Suspending delivery never stops canonical lead capture or attribution.
                </span>
              </template>
            </UFormField>

            <UAlert
              v-if="!isManager"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              title="Management access required"
              description="Only management users can change lead capture and CRM entitlement settings."
            />
          </fieldset>

          <!-- Section: Contact -->
          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Contact
            </legend>

            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Contact Email">
                <UInput
                  v-model="editForm.contactEmail"
                  type="email"
                  size="xl"
                  class="w-full"
                  placeholder="name@company.com"
                >
                  <template #leading>
                    <UIcon name="i-lucide-mail" class="text-muted" />
                  </template>
                </UInput>
              </UFormField>

              <UFormField label="Contact Phone">
                <UInput
                  v-model="editForm.contactPhone"
                  type="tel"
                  size="xl"
                  class="w-full"
                  placeholder="+61 ..."
                >
                  <template #leading>
                    <UIcon name="i-lucide-phone" class="text-muted" />
                  </template>
                </UInput>
              </UFormField>
            </div>

            <UFormField label="Billing Address">
              <UTextarea
                v-model="editForm.address"
                :rows="3"
                size="xl"
                class="w-full"
                placeholder="Street, suburb, state, postcode"
              />
            </UFormField>
          </fieldset>

          <!-- Section: Rates -->
          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Rates
            </legend>

            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Hourly Rate">
                <UInput
                  v-model.number="editForm.hourlyRate"
                  type="number"
                  min="0"
                  size="xl"
                  class="w-full"
                  placeholder="0"
                >
                  <template #leading>
                    <span class="text-muted">$</span>
                  </template>
                </UInput>
              </UFormField>

              <UFormField label="Retainer Amount" help="Monthly retainer fee.">
                <UInput
                  v-model.number="editForm.retainerAmount"
                  type="number"
                  min="0"
                  size="xl"
                  class="w-full"
                  placeholder="0"
                >
                  <template #leading>
                    <span class="text-muted">$</span>
                  </template>
                </UInput>
              </UFormField>
            </div>

            <UFormField label="Media Commission" help="Commission on ad spend.">
              <UInput
                v-model.number="editForm.mediaCommissionRate"
                type="number"
                min="0"
                max="100"
                size="xl"
                class="w-full"
                placeholder="0"
              >
                <template #trailing>
                  <span class="text-muted">%</span>
                </template>
              </UInput>
            </UFormField>
          </fieldset>

          <!-- Section: Integrations -->
          <fieldset class="space-y-5 pb-6 border-b border-default">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Integrations
            </legend>

            <UFormField label="Xero Contact">
              <XeroContactSearch v-model="editForm.xeroContactId" />
            </UFormField>
          </fieldset>

          <!-- Section: Notes & Status -->
          <fieldset class="space-y-5">
            <legend class="text-[11px] font-medium text-muted uppercase tracking-widest mb-1">
              Notes & Status
            </legend>

            <UFormField label="Notes">
              <UTextarea
                v-model="editForm.notes"
                :rows="4"
                size="xl"
                class="w-full"
                placeholder="Internal notes about this client..."
              />
            </UFormField>

            <UCheckbox v-model="editForm.isActive" label="Client is active" />
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            size="lg"
            @click="() => { showEditModal = false }"
          />
          <UButton
            color="primary"
            label="Save Changes"
            size="lg"
            :loading="saving"
            @click="saveClient"
          />
        </div>
      </template>
    </USlideover>

    <ClientsClientFinancialAllocationSlideover
      v-if="currentFinancialData?.permissions.canAllocate"
      v-model:open="showFinancialAllocation"
      :client-id="clientId"
      :sources="currentFinancialData.sources ?? []"
      :tracking="currentFinancialData.tracking"
      :projects="currentFinancialData.projects"
      @allocated="handleFinancialAllocated"
    />
  </div>
</template>
