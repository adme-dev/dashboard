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

const confidenceColor: Record<string, string> = {
  high: 'success',
  medium: 'warning',
  low: 'error',
}

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
  if (!confirm('Regenerate all line items? Edits will be lost.')) return
  try {
    run.value = await regenerateRun(runId)
    toast.add({ title: 'Regenerated', color: 'success' })
    await loadItems()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
}

async function handleValidateContacts() {
  try {
    contacts.value = await validateContacts(runId)
  } catch (e: any) {
    toast.add({ title: 'Validation failed', description: e.message, color: 'error' })
  }
}

async function handlePush() {
  if (!confirm('Push all invoices to Xero as DRAFT? This requires all contacts to be matched.')) return
  try {
    const result = await pushToXero(runId)
    toast.add({ title: `Pushed ${result.created} invoices`, description: result.failed > 0 ? `${result.failed} failed` : undefined, color: result.failed > 0 ? 'warning' : 'success' })
    await loadRun()
  } catch (e: any) {
    toast.add({ title: 'Push failed', description: e.data?.statusMessage || e.message, color: 'error' })
  }
}

async function handleCheckXeroStatus() {
  try {
    xeroStatus.value = await fetchXeroStatus(runId)
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
}

async function handleArchive() {
  if (!confirm('Archive this run and mark as complete?')) return
  try {
    await archiveRun(runId)
    toast.add({ title: 'Archived', color: 'success' })
    await loadRun()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
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
  <div class="p-6 max-w-7xl mx-auto space-y-4">
    <!-- Header -->
    <div v-if="run" class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <UButton to="/agency/eom" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-xl font-bold">{{ months[run.month - 1] }} {{ run.year }}</h1>
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
    <div class="flex gap-1 border-b border-default">
      <button
        v-for="tab in [
          { id: 'items', label: 'Line Items', icon: 'i-lucide-list' },
          { id: 'validation', label: 'Validation', icon: 'i-lucide-shield-check' },
          { id: 'summary', label: 'Summary', icon: 'i-lucide-pie-chart' },
          { id: 'push', label: 'Push to Xero', icon: 'i-lucide-upload' },
        ]"
        :key="tab.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-default'"
        @click="activeTab = tab.id"
      >
        <UIcon :name="tab.icon" class="w-4 h-4 mr-1 inline" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Line Items Tab -->
    <div v-if="activeTab === 'items'" class="space-y-4">
      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input v-model="filters.client" placeholder="Filter client..." class="border border-default rounded-md px-3 py-1.5 text-sm bg-default w-48" />
        <select v-model="filters.confidence" class="border border-default rounded-md px-3 py-1.5 text-sm bg-default">
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select v-model="filters.reviewStatus" class="border border-default rounded-md px-3 py-1.5 text-sm bg-default">
          <option value="">All status</option>
          <option value="auto">Auto</option>
          <option value="reviewed">Reviewed</option>
          <option value="flagged">Flagged</option>
          <option value="corrected">Corrected</option>
        </select>
        <select v-model="filters.source" class="border border-default rounded-md px-3 py-1.5 text-sm bg-default">
          <option value="">All sources</option>
          <option value="monday">Monday.com</option>
          <option value="meta_ads">Meta Ads</option>
          <option value="google_ads">Google Ads</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <!-- Items Table -->
      <EomLineItemTable :items="items" :total="itemsTotal" :page="itemsPage" @update:page="itemsPage = $event" @edit="editingItem = $event" />
    </div>

    <!-- Validation Tab -->
    <div v-if="activeTab === 'validation'">
      <EomValidation v-if="validation" :validation="validation" />
      <div v-else class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin" />
      </div>
    </div>

    <!-- Summary Tab -->
    <div v-if="activeTab === 'summary'">
      <EomGSTAudit v-if="summary" :summary="summary" />
      <div v-else class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin" />
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

    <!-- Item Editor Slideover -->
    <EomItemEditor
      v-if="editingItem"
      :item="editingItem"
      :run-id="runId"
      @close="editingItem = null"
      @saved="loadItems(); editingItem = null"
    />
  </div>
</template>
