<script setup lang="ts">
import type {
  GoogleAiMaxCampaignDetail,
  GoogleAiMaxCampaignListItem,
  GoogleAiMaxReadinessResponse,
} from '~/types'
import {
  buildAiMaxApiFilters,
  buildAiMaxRouteQuery,
  normalizeAiMaxRouteFilters,
  type GoogleAiMaxPageFilters,
} from '~/utils/googleAiMaxPageState'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchReadiness, fetchDetail, startScan, fetchScan, exportUrl } = useGoogleAiMax()

const filters = reactive<GoogleAiMaxPageFilters>(normalizeAiMaxRouteFilters(route.query))
const response = ref<GoogleAiMaxReadinessResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const scanning = ref(false)
const selectedId = ref<string | null>(null)
const detail = ref<GoogleAiMaxCampaignDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const detailOpen = computed({
  get: () => Boolean(selectedId.value),
  set: (value: boolean) => { if (!value) selectedId.value = null },
})
let requestSequence = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null

const items = computed(() => response.value?.items ?? [])
const latestRun = computed(() => response.value?.latestRun ?? null)
const exportHref = computed(() => exportUrl(buildAiMaxApiFilters(filters)))

function uniqueOptions(
  rows: GoogleAiMaxCampaignListItem[],
  id: (row: GoogleAiMaxCampaignListItem) => string | null,
  label: (row: GoogleAiMaxCampaignListItem) => string | null,
  allLabel: string,
  selected: string,
) {
  const options = new Map<string, string>()
  for (const row of rows) {
    const value = id(row)
    if (value) options.set(value, label(row) || value)
  }
  if (selected !== 'all' && !options.has(selected)) options.set(selected, `Selected · ${selected}`)
  return [
    { label: allLabel, value: 'all' },
    ...Array.from(options, ([value, optionLabel]) => ({ label: optionLabel, value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]
}

const connectionOptions = computed(() => uniqueOptions(
  items.value,
  row => row.connectionId,
  row => row.accountName || row.customerId,
  'All accounts',
  filters.connectionId,
))
const clientOptions = computed(() => uniqueOptions(
  items.value,
  row => row.client?.id ?? null,
  row => row.client?.name ?? null,
  'All clients',
  filters.clientId,
))

function messageOf(cause: unknown, fallback: string) {
  const value = cause as { data?: { statusMessage?: string }, message?: string }
  return value?.data?.statusMessage || value?.message || fallback
}

async function loadReadiness(options: { quiet?: boolean } = {}) {
  const sequence = ++requestSequence
  if (!options.quiet) loading.value = true
  error.value = null
  try {
    const result = await fetchReadiness(buildAiMaxApiFilters(filters))
    if (sequence === requestSequence) response.value = result
  } catch (cause) {
    if (sequence === requestSequence) error.value = messageOf(cause, 'AI Max readiness could not be loaded.')
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void loadReadiness(), 250)
}

function updateFilter(key: keyof GoogleAiMaxPageFilters, value: string) {
  if (key !== 'page') filters.page = 1
  if (key === 'page' || key === 'pageSize') filters[key] = Number(value)
  else filters[key] = value as never
}

function clearFilters() {
  Object.assign(filters, normalizeAiMaxRouteFilters({}))
}

async function openCampaign(id: string) {
  selectedId.value = id
  detail.value = null
  detailError.value = null
  detailLoading.value = true
  try {
    detail.value = await fetchDetail(id)
  } catch (cause) {
    detailError.value = messageOf(cause, 'Campaign evidence could not be loaded.')
  } finally {
    detailLoading.value = false
  }
}

async function pollScan(runId: string, attempt = 0): Promise<void> {
  if (attempt >= 240) {
    scanning.value = false
    toast.add({ title: 'Scan is still running', description: 'Refresh this page later to see the completed evidence.', color: 'warning' })
    return
  }
  try {
    const run = await fetchScan(runId)
    if (response.value) response.value.latestRun = run
    if (['completed', 'partial', 'failed'].includes(run.status)) {
      scanning.value = false
      await loadReadiness({ quiet: true })
      toast.add({
        title: run.status === 'completed' ? 'AI Max scan complete' : run.status === 'partial' ? 'AI Max scan partially complete' : 'AI Max scan failed',
        description: `${run.processedConnections}/${run.totalConnections} Google accounts processed.`,
        color: run.status === 'completed' ? 'success' : run.status === 'partial' ? 'warning' : 'error',
      })
      return
    }
    pollTimer = setTimeout(() => void pollScan(runId, attempt + 1), 4000)
  } catch (cause) {
    scanning.value = false
    toast.add({ title: 'Could not check scan progress', description: messageOf(cause, 'Try again shortly.'), color: 'error' })
  }
}

async function runScan() {
  scanning.value = true
  try {
    const run = await startScan(filters.connectionId === 'all' ? undefined : filters.connectionId)
    toast.add({ title: run.deduplicated ? 'Existing scan resumed' : 'AI Max scan started', description: 'Google Ads settings are being read. No campaign changes will be made.', color: 'success' })
    await pollScan(run.runId)
  } catch (cause) {
    scanning.value = false
    toast.add({ title: 'AI Max scan could not start', description: messageOf(cause, 'Try again shortly.'), color: 'error' })
  }
}

watch(filters, (value) => {
  void router.replace({ query: buildAiMaxRouteQuery(value) })
  scheduleRefresh()
}, { deep: true })

onMounted(() => void loadReadiness())
onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="flex items-center gap-2 text-xs text-muted">
          <NuxtLink to="/agency/social/spend" class="hover:text-default">Ad spend</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <span>Google readiness</span>
        </div>
        <h1 class="mt-2 text-2xl font-bold tracking-tight">Google Ads AI Max readiness</h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Inspect Search campaign migration exposure, effective controls, and material changes before Google consolidates legacy settings.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="neutral" variant="subtle" icon="i-lucide-eye">Observational only</UBadge>
        <UButton :to="exportHref" external variant="ghost" color="neutral" icon="i-lucide-download" :disabled="loading">
          Export CSV
        </UButton>
        <UButton icon="i-lucide-scan-search" :loading="scanning" :disabled="scanning" @click="runScan">
          Scan now
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="error"
      color="error"
      title="AI Max readiness unavailable"
      :description="error"
      :actions="[{ label: 'Try again', onClick: () => loadReadiness() }]"
    />

    <SocialSpendAiMaxSummary :summary="response?.summary ?? null" :latest-run="latestRun" />

    <SocialSpendAiMaxTable
      :items="items"
      :loading="loading"
      :page="response?.pagination.page ?? filters.page"
      :page-size="response?.pagination.pageSize ?? filters.pageSize"
      :total="response?.pagination.total ?? 0"
      :filters="filters"
      :connection-options="connectionOptions"
      :client-options="clientOptions"
      @update-filter="updateFilter"
      @update-page="filters.page = $event"
      @open-campaign="openCampaign"
      @clear-filters="clearFilters"
    />

    <SocialSpendAiMaxDetailSlideover
      v-model:open="detailOpen"
      :detail="detail"
      :loading="detailLoading"
      :error="detailError"
    />
  </div>
</template>
