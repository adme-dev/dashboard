<script setup lang="ts">
import { format } from 'date-fns'
import { apiErrorDescription } from '~/utils/apiError'

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

// Fetch client data
const clientData = ref<any>(null)
const crmSettingsData = ref<CrmSettings>({
  leadCaptureMode: 'capture_only',
  crmCoreStatus: 'suspended',
  crmExternalStatus: 'suspended'
})
const pending = ref(false)
const error = ref<any>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    const [clientResponse, crmResponse] = await Promise.all([
      apiFetch(`/api/agency/clients/${clientId}`),
      apiFetch<CrmSettings>(`/api/agency/clients/${clientId}/crm-settings`).catch(() => null)
    ])
    clientData.value = clientResponse
    if (crmResponse) crmSettingsData.value = crmResponse
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
const projects = computed(() => ((clientData.value as any)?.projects || []) as any[])
const recentTimeEntries = computed(() => ((clientData.value as any)?.recentTimeEntries || []) as any[])
const invoices = computed(() => ((clientData.value as any)?.invoices || []) as any[])
const mediaSpend = computed(() => ((clientData.value as any)?.mediaSpend || []) as any[])
const summary = computed(() => (clientData.value as any)?.summary || {
  totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMargin: 0,
  totalHours: 0, totalProjects: 0, activeProjects: 0, completedProjects: 0,
  totalInvoiced: 0, totalMediaSpend: 0, totalMediaCommission: 0, retainerAmount: 0
})

// Active tab
const activeTab = ref('overview')

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number | null | undefined) => `${(value ?? 0).toFixed(1)}%`

const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// Status colors
const getProjectStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'active': return 'success'
    case 'completed': return 'info'
    case 'on_hold': return 'warning'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

const getInvoiceStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'paid': return 'success'
    case 'sent': return 'warning'
    case 'overdue': return 'error'
    default: return 'neutral'
  }
}

const getMarginColor = (margin: number): 'success' | 'warning' | 'error' => {
  if (margin >= 30) return 'success'
  if (margin >= 15) return 'warning'
  return 'error'
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
    const requests: Array<Promise<unknown>> = [
      apiFetch(`/api/agency/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKeyFor('client', clientPayload) },
        body: clientPayload
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
    refresh()
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

// Project columns
const projectColumns = [
  { accessorKey: 'name', header: 'Project' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'budget', header: 'Budget' },
  { accessorKey: 'spent', header: 'Spent' },
  { accessorKey: 'margin', header: 'Margin' }
]

// Time entry columns
const timeColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'project', header: 'Project' },
  { accessorKey: 'user', header: 'Team Member' },
  { accessorKey: 'hours', header: 'Hours' },
  { accessorKey: 'amount', header: 'Amount' }
]

// Invoice columns
const invoiceColumns = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'total', header: 'Total' },
  { accessorKey: 'status', header: 'Status' }
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
          <!-- Summary Cards -->
          <!-- Revenue is surfaced by source (project budgets / retainer / commission /
               invoiced) rather than blended, keeping the headline figure consistent
               with the clients list + analytics, which both define revenue as project budgets. -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Project Revenue
                </p>
                <p class="text-xl font-bold">
                  {{ formatCurrency(summary.totalRevenue) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Retainer
                </p>
                <p class="text-xl font-bold">
                  <template v-if="summary.retainerAmount > 0">
                    {{ formatCurrency(summary.retainerAmount) }}<span class="text-sm font-normal text-muted">/mo</span>
                  </template>
                  <template v-else>
                    —
                  </template>
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Media Commission
                </p>
                <p class="text-xl font-bold">
                  {{ formatCurrency(summary.totalMediaCommission) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Invoiced
                </p>
                <p class="text-xl font-bold">
                  {{ formatCurrency(summary.totalInvoiced) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Total Cost
                </p>
                <p class="text-xl font-bold">
                  {{ formatCurrency(summary.totalCost) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Gross Profit
                </p>
                <p class="text-xl font-bold" :class="summary.grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">
                  {{ formatCurrency(summary.grossProfit) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Margin
                </p>
                <UBadge :color="getMarginColor(summary.grossMargin)" size="lg">
                  {{ formatPercent(summary.grossMargin) }}
                </UBadge>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Total Hours
                </p>
                <p class="text-xl font-bold">
                  {{ (summary.totalHours ?? 0).toFixed(1) }}h
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">
                  Projects
                </p>
                <p class="text-xl font-bold">
                  <span class="text-emerald-500">{{ summary.activeProjects }}</span>
                  <span class="text-dimmed"> / {{ summary.totalProjects }}</span>
                </p>
              </div>
            </UCard>
          </div>

          <!-- Tabs -->
          <UTabs
            v-model="activeTab"
            :items="[
              { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
              { label: 'Projects', value: 'projects', icon: 'i-lucide-folder', badge: projects.length.toString() },
              { label: 'Time Entries', value: 'time', icon: 'i-lucide-clock' },
              { label: 'Invoices', value: 'invoices', icon: 'i-lucide-receipt' },
              { label: 'Media Spend', value: 'media', icon: 'i-lucide-megaphone' },
              { label: 'Website', value: 'website', icon: 'i-lucide-radio' },
              ...(canAccessMediaBuying ? [{ label: 'Measurement', value: 'measurement', icon: 'i-lucide-activity' }] : [])
            ]"
            class="mb-6"
          />

          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Client Info -->
            <UCard>
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

            <!-- Recent Projects -->
            <UCard class="lg:col-span-2">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">
                    Active Projects
                  </h3>
                  <UButton
                    variant="ghost"
                    size="xs"
                    label="View All"
                    @click="activeTab = 'projects'"
                  />
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="project in projects.filter(p => p.status === 'active').slice(0, 5)"
                  :key="project.id"
                  class="flex items-center justify-between p-3 rounded-lg bg-elevated"
                >
                  <div>
                    <NuxtLink :to="`/agency/projects/${project.id}`" class="font-medium hover:text-primary-500">
                      {{ project.name }}
                    </NuxtLink>
                    <p class="text-sm text-muted">
                      {{ formatCurrency(project.budgetAmount) }} budget
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium">
                      {{ formatCurrency(project.totalCost) }} spent
                    </p>
                    <UBadge :color="getMarginColor(project.margin)" variant="subtle" size="xs">
                      {{ formatPercent(project.margin) }} margin
                    </UBadge>
                  </div>
                </div>
                <div v-if="projects.filter(p => p.status === 'active').length === 0" class="text-center text-muted py-4">
                  No active projects
                </div>
              </div>
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
          <div v-if="activeTab === 'projects'">
            <UCard>
              <UTable :data="projects" :columns="projectColumns">
                <template #name-cell="{ row: r }">
                  <NuxtLink :to="`/agency/projects/${(r as any).id}`" class="font-medium hover:text-primary-500">
                    {{ (r as any).name }}
                  </NuxtLink>
                </template>

                <template #status-cell="{ row: r }">
                  <UBadge :color="getProjectStatusColor((r as any).status)" variant="subtle">
                    {{ (r as any).status }}
                  </UBadge>
                </template>

                <template #budget-cell="{ row: r }">
                  {{ formatCurrency((r as any).budgetAmount) }}
                </template>

                <template #spent-cell="{ row: r }">
                  {{ formatCurrency((r as any).totalCost) }}
                </template>

                <template #margin-cell="{ row: r }">
                  <UBadge :color="getMarginColor((r as any).margin)" variant="subtle">
                    {{ formatPercent((r as any).margin) }}
                  </UBadge>
                </template>
              </UTable>

              <div v-if="projects.length === 0" class="text-center text-muted py-8">
                No projects yet
              </div>
            </UCard>
          </div>

          <!-- Time Entries Tab -->
          <div v-if="activeTab === 'time'">
            <UCard>
              <UTable :data="recentTimeEntries" :columns="timeColumns">
                <template #date-cell="{ row: r }">
                  {{ formatDate((r as any).date) }}
                </template>

                <template #project-cell="{ row: r }">
                  {{ (r as any).projectName }}
                </template>

                <template #user-cell="{ row: r }">
                  {{ (r as any).userName }}
                </template>

                <template #hours-cell="{ row: r }">
                  {{ (r as any).hours }}h
                </template>

                <template #amount-cell="{ row: r }">
                  {{ formatCurrency((r as any).amount) }}
                </template>
              </UTable>

              <div v-if="recentTimeEntries.length === 0" class="text-center text-muted py-8">
                No time entries yet
              </div>
            </UCard>
          </div>

          <!-- Invoices Tab -->
          <div v-if="activeTab === 'invoices'">
            <UCard>
              <UTable :data="invoices" :columns="invoiceColumns">
                <template #number-cell="{ row: r }">
                  <span class="font-medium">{{ (r as any).invoiceNumber }}</span>
                </template>

                <template #date-cell="{ row: r }">
                  {{ formatDate((r as any).issueDate) }}
                </template>

                <template #total-cell="{ row: r }">
                  {{ formatCurrency((r as any).total) }}
                </template>

                <template #status-cell="{ row: r }">
                  <UBadge :color="getInvoiceStatusColor((r as any).status)" variant="subtle">
                    {{ (r as any).status }}
                  </UBadge>
                </template>
              </UTable>

              <div v-if="invoices.length === 0" class="text-center text-muted py-8">
                No invoices yet
              </div>
            </UCard>
          </div>

          <!-- Media Spend Tab -->
          <div v-if="activeTab === 'media'">
            <UCard>
              <div class="mb-4 p-4 bg-elevated rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-muted">
                      Total Media Spend
                    </p>
                    <p class="text-2xl font-bold">
                      {{ formatCurrency(summary.totalMediaSpend) }}
                    </p>
                  </div>
                  <div v-if="summary.totalMediaCommission > 0">
                    <p class="text-sm text-muted">
                      Est. Commission
                    </p>
                    <p class="text-2xl font-bold text-emerald-500">
                      {{ formatCurrency(summary.totalMediaCommission) }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div
                  v-for="spend in mediaSpend"
                  :key="spend.id"
                  class="flex items-center justify-between p-3 rounded-lg border border-default"
                >
                  <div>
                    <p class="font-medium">
                      {{ spend.platform }}
                    </p>
                    <p class="text-sm text-muted">
                      {{ spend.period }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium">
                      {{ formatCurrency(spend.actualSpend) }}
                    </p>
                    <p class="text-sm text-emerald-500">
                      +{{ formatCurrency(spend.commission) }} commission
                    </p>
                  </div>
                </div>
              </div>

              <div v-if="mediaSpend.length === 0" class="text-center text-muted py-8">
                No media spend tracked
              </div>
            </UCard>
          </div>

          <!-- Website analytics Tab -->
          <div v-if="activeTab === 'website'">
            <TrackingAnalyticsContainer :client-id="clientId" />
          </div>

          <div v-if="activeTab === 'measurement' && canAccessMediaBuying">
            <ClientsClientMeasurementPanel
              :client-id="clientId"
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
            @click="showEditModal = false"
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
  </div>
</template>
