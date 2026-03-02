<script setup lang="ts">
import type { EomRun, EomLineItem } from '~/types'

definePageMeta({ layout: 'agency' })

const route = useRoute()
const toast = useToast()
const runId = route.params.runId as string
const { fetchRun, fetchItems, fetchValidation, fetchSummary, exportCSV, regenerateRun, pushToXero, validateContacts, fetchXeroStatus, archiveRun } = useEom()

const activeTab = ref('items')
const run = ref<EomRun | null>(null)
const loading = ref(true)
const editingItem = ref<EomLineItem | null>(null)

// Confirmation modal state
const confirmModal = ref(false)
const confirmTitle = ref('')
const confirmDescription = ref('')
const confirmColor = ref<'primary' | 'error' | 'warning'>('primary')
const confirmLabel = ref('Confirm')
let confirmAction: (() => Promise<void>) | null = null

function showConfirm(opts: { title: string; description: string; label: string; color?: 'primary' | 'error' | 'warning'; action: () => Promise<void> }) {
  confirmTitle.value = opts.title
  confirmDescription.value = opts.description
  confirmLabel.value = opts.label
  confirmColor.value = opts.color || 'primary'
  confirmAction = opts.action
  confirmModal.value = true
}

async function executeConfirm() {
  confirmModal.value = false
  if (confirmAction) await confirmAction()
  confirmAction = null
}

// Tabs
const tabs = [
  { label: 'Line Items', value: 'items', icon: 'i-lucide-list' },
  { label: 'Validation', value: 'validation', icon: 'i-lucide-shield-check' },
  { label: 'Summary', value: 'summary', icon: 'i-lucide-pie-chart' },
  { label: 'Push to Xero', value: 'push', icon: 'i-lucide-upload' },
]

// Line items state
const items = ref<EomLineItem[]>([])
const itemsTotal = ref(0)
const itemsPage = ref(1)
const filters = reactive({
  client: '',
  confidence: '',
  reviewStatus: '',
  source: '',
  accountCode: '',
})

// Other tab data
const validation = ref<any>(null)
const summary = ref<any>(null)
const contacts = ref<any>(null)
const xeroStatus = ref<any>(null)

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatCurrency(val: number | null) {
  if (val === null || val === undefined) return '$0'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(val)
}

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'neutral', label: 'Draft' },
  generating: { color: 'info', label: 'Generating' },
  review: { color: 'warning', label: 'Review' },
  pushed: { color: 'success', label: 'Pushed' },
  complete: { color: 'success', label: 'Complete' },
  failed: { color: 'error', label: 'Failed' },
}

const confidenceOptions = [
  { label: 'All confidence', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

const reviewStatusOptions = [
  { label: 'All status', value: '' },
  { label: 'Auto', value: 'auto' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Corrected', value: 'corrected' },
]

const sourceOptions = [
  { label: 'All sources', value: '' },
  { label: 'Monday.com', value: 'monday' },
  { label: 'Meta Ads', value: 'meta_ads' },
  { label: 'Google Ads', value: 'google_ads' },
  { label: 'Manual', value: 'manual' },
]

async function loadRun() {
  loading.value = true
  try {
    run.value = await fetchRun(runId)
  } finally {
    loading.value = false
  }
}

async function loadItems() {
  const params: any = { page: itemsPage.value, limit: 50 }
  if (filters.client) params.client = filters.client
  if (filters.confidence) params.confidence = filters.confidence
  if (filters.reviewStatus) params.reviewStatus = filters.reviewStatus
  if (filters.source) params.source = filters.source
  if (filters.accountCode) params.accountCode = filters.accountCode
  const result = await fetchItems(runId, params)
  items.value = result.items
  itemsTotal.value = result.total
}

async function loadValidation() {
  validation.value = await fetchValidation(runId)
}

async function loadSummary() {
  summary.value = await fetchSummary(runId)
}

async function handleRegenerate() {
  showConfirm({
    title: 'Regenerate all line items?',
    description: 'All manual edits will be lost. This will re-run the EOM generation engine for this period.',
    label: 'Regenerate',
    color: 'warning',
    action: async () => {
      try {
        run.value = await regenerateRun(runId)
        toast.add({ title: 'Regenerated', color: 'success' })
        await loadItems()
      } catch (e: any) {
        toast.add({ title: 'Error', description: e.message, color: 'error' })
      }
    }
  })
}

async function handleValidateContacts() {
  try {
    contacts.value = await validateContacts(runId)
  } catch (e: any) {
    toast.add({ title: 'Validation failed', description: e.message, color: 'error' })
  }
}

async function handlePush() {
  showConfirm({
    title: 'Push to Xero as DRAFT?',
    description: 'All invoices will be created as DRAFT invoices in Xero. This requires all contacts to be matched.',
    label: 'Push to Xero',
    color: 'primary',
    action: async () => {
      try {
        const result = await pushToXero(runId)
        toast.add({ title: `Pushed ${result.created} invoices`, description: result.failed > 0 ? `${result.failed} failed` : undefined, color: result.failed > 0 ? 'warning' : 'success' })
        await loadRun()
      } catch (e: any) {
        toast.add({ title: 'Push failed', description: e.data?.statusMessage || e.message, color: 'error' })
      }
    }
  })
}

async function handleCheckXeroStatus() {
  try {
    xeroStatus.value = await fetchXeroStatus(runId)
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
}

async function handleArchive() {
  showConfirm({
    title: 'Archive this run?',
    description: 'This will mark the run as complete. You can still view it but cannot make further changes.',
    label: 'Archive',
    color: 'primary',
    action: async () => {
      try {
        await archiveRun(runId)
        toast.add({ title: 'Archived', color: 'success' })
        await loadRun()
      } catch (e: any) {
        toast.add({ title: 'Error', description: e.message, color: 'error' })
      }
    }
  })
}

// Watch tab changes to lazy-load data
watch(activeTab, async (tab) => {
  if (tab === 'validation' && !validation.value) await loadValidation()
  if (tab === 'summary' && !summary.value) await loadSummary()
  if (tab === 'push' && !contacts.value) await handleValidateContacts()
  if (tab === 'push' && run.value?.status === 'pushed' && !xeroStatus.value) await handleCheckXeroStatus()
})

watch([itemsPage, () => filters.client, () => filters.confidence, () => filters.reviewStatus, () => filters.source, () => filters.accountCode], () => loadItems())

onMounted(async () => {
  await loadRun()
  await loadItems()
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-24">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
          <span class="text-sm text-muted">Loading EOM run...</span>
        </div>
      </div>

      <template v-else-if="run">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <UButton to="/agency/billing?tab=eom" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
            <div>
              <h1 class="text-2xl font-bold tracking-tight">{{ months[run.month - 1] }} {{ run.year }}</h1>
              <div class="flex items-center gap-2 mt-1">
                <UBadge :color="(statusConfig[run.status]?.color as any) || 'neutral'" variant="subtle" size="xs">
                  {{ statusConfig[run.status]?.label || run.status }}
                </UBadge>
                <span class="text-sm text-muted">{{ formatCurrency(run.totalExGst) }} ex-GST</span>
                <span class="text-sm text-muted">{{ run.invoiceCount }} invoices</span>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton v-if="run.status === 'review'" variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="handleRegenerate">
              Regenerate
            </UButton>
            <UButton variant="soft" size="sm" icon="i-lucide-download" @click="exportCSV(runId)">
              Export CSV
            </UButton>
            <UButton v-if="run.status === 'pushed'" variant="soft" size="sm" color="success" icon="i-lucide-archive" @click="handleArchive">
              Archive
            </UButton>
          </div>
        </div>

        <!-- Tabs -->
        <UTabs v-model="activeTab" :items="tabs" />

        <!-- Line Items Tab -->
        <div v-if="activeTab === 'items'" class="space-y-4">
          <!-- Filters -->
          <div class="flex gap-3 flex-wrap">
            <UInput v-model="filters.client" placeholder="Filter client..." icon="i-lucide-search" class="w-48" />
            <USelect v-model="filters.confidence" :items="confidenceOptions" value-key="value" class="w-40" />
            <USelect v-model="filters.reviewStatus" :items="reviewStatusOptions" value-key="value" class="w-40" />
            <USelect v-model="filters.source" :items="sourceOptions" value-key="value" class="w-44" />
          </div>

          <!-- Items Table -->
          <EomLineItemTable :items="items" :total="itemsTotal" :page="itemsPage" @update:page="itemsPage = $event" @edit="editingItem = $event" />
        </div>

        <!-- Validation Tab -->
        <div v-if="activeTab === 'validation'">
          <EomValidation v-if="validation" :validation="validation" />
          <div v-else class="flex items-center justify-center py-16">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
              <span class="text-sm text-muted">Running validation checks...</span>
            </div>
          </div>
        </div>

        <!-- Summary Tab -->
        <div v-if="activeTab === 'summary'">
          <EomGSTAudit v-if="summary" :summary="summary" />
          <div v-else class="flex items-center justify-center py-16">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
              <span class="text-sm text-muted">Loading summary...</span>
            </div>
          </div>
        </div>

        <!-- Push to Xero Tab -->
        <div v-if="activeTab === 'push'">
          <EomPushToXero
            v-if="run"
            :run="run"
            :contacts="contacts"
            :xero-status="xeroStatus"
            @validate="handleValidateContacts"
            @push="handlePush"
            @check-status="handleCheckXeroStatus"
            @archive="handleArchive"
          />
        </div>
      </template>

      <!-- Item Editor Slideover -->
      <EomItemEditor
        v-if="editingItem"
        :item="editingItem"
        :run-id="runId"
        @close="editingItem = null"
        @saved="loadItems(); editingItem = null"
      />

      <!-- Confirmation Modal -->
      <UModal v-model:open="confirmModal">
        <template #content>
          <div class="p-6 space-y-4">
            <div class="flex items-start gap-3">
              <div class="rounded-full p-2" :class="confirmColor === 'error' ? 'bg-red-100 dark:bg-red-950/40' : confirmColor === 'warning' ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-blue-100 dark:bg-blue-950/40'">
                <UIcon
                  :name="confirmColor === 'error' ? 'i-lucide-alert-triangle' : confirmColor === 'warning' ? 'i-lucide-alert-circle' : 'i-lucide-info'"
                  class="size-5"
                  :class="confirmColor === 'error' ? 'text-red-500' : confirmColor === 'warning' ? 'text-amber-500' : 'text-blue-500'"
                />
              </div>
              <div>
                <h3 class="font-semibold">{{ confirmTitle }}</h3>
                <p class="text-sm text-muted mt-1">{{ confirmDescription }}</p>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" label="Cancel" @click="confirmModal = false" />
              <UButton :color="confirmColor === 'error' ? 'error' : 'primary'" :label="confirmLabel" @click="executeConfirm" />
            </div>
          </div>
        </template>
      </UModal>

    </div>
  </div>
</template>
