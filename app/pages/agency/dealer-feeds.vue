<script setup lang="ts">
import { formatDealerFeedHandoffSummary } from '~/utils/dealerFeedHandoff'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

type AgencyClient = {
  id: string
  name: string
  isActive?: boolean
}

type DealerFeedClientOption = {
  id: string
  label: string
  name: string
  source: 'agency' | 'social'
  clientId: string | null
  isActive: boolean
  socialConnectionIds: string[]
  socialPlatforms: string[]
}

type DealerFeedLink = {
  id: string
  clientId: string
  clientName: string | null
  providerId: string
  externalOrgId: string
  sellerRefs: string[]
  defaultFeedIds: string[]
  status: string
  createdAt: string
  updatedAt: string
}

type FeedWorkbookTemplate = {
  id: string
  name: string
  description: string | null
  tags: string[] | null
  estimatedDurationDays: number | null
  estimatedHours: number
  phaseCount: number
  taskCount: number
}

type FeedWorkbookTemplatesResponse = {
  templates: FeedWorkbookTemplate[]
}

type ProjectSummary = {
  id: string
  name: string
  status: string
}

type UseTemplateResponse = {
  project: {
    id: string
    name: string
  }
  tasksCreated: number
}

type FeedSummary = {
  id: string
  name: string
  platform: 'google' | 'facebook'
  isActive: boolean
}

type VehicleSummary = {
  id: string
  make: string
  model: string
  year: number | null
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  image: string | null
}

type StockListMode = 'off' | 'include' | 'exclude'
type FeedPresetId = 'all-saleable' | 'new' | 'demo' | 'used' | 'stock-list'

type FeedPreset = {
  id: FeedPresetId
  label: string
  icon: string
}

type FeedValidationIssueSummary = {
  id: string | null
  issues: unknown[]
}

type FeedPreviewValidation = {
  matchedTotal: number
  validatedTotal: number
  invalidTotal: number
  candidateLimit?: number
  invalidSummaries: FeedValidationIssueSummary[]
  showingFallbackCandidates?: boolean
}

type FeedReadinessStatus = 'unknown' | 'empty' | 'ready' | 'partial' | 'blocked'
type FeedReadinessFixMode = 'source_required' | 'ai_assisted' | 'mapping_required' | 'manual_review'

type FeedReadinessIssueGroup = {
  key: string
  label: string
  field: string
  count: number
  fixMode: FeedReadinessFixMode
  sampleIds: string[]
  messages: string[]
}

type FeedReadinessSummary = {
  status: FeedReadinessStatus
  matchedTotal: number
  validatedTotal: number
  invalidTotal: number
  issueGroups: FeedReadinessIssueGroup[]
  sourceRequiredCount: number
  aiAssistedCount: number
  mappingRequiredCount: number
  manualReviewCount: number
}

type FeedPreviewState = {
  feed: FeedSummary
  total: number
  items: VehicleSummary[]
  validation?: FeedPreviewValidation
  readiness?: FeedReadinessSummary
}

type DraftPreviewState = {
  total: number
  items: VehicleSummary[]
  validation?: FeedPreviewValidation
  readiness?: FeedReadinessSummary
}

const toast = useToast()

const FEED_WORKBOOK_TEMPLATE_NAME = 'Dealer Feed Workbook'

const selectedClientOptionId = ref('')
const feedRows = ref<FeedSummary[]>([])
const feedsPending = ref(false)
const feedsError = ref('')
const previewPendingFeedId = ref('')
const generatingFeedKey = ref('')
const feedPreview = ref<FeedPreviewState | null>(null)
const feedPreviewSearch = ref('')
const draftPreview = ref<DraftPreviewState | null>(null)
const draftPreviewPending = ref(false)
const draftPreviewError = ref('')
const draftPreviewRequestId = ref(0)
const generatedFeedUrl = ref('')
const generatedFeedMeta = ref<{ feedName: string, itemCount: number } | null>(null)
const generatedFeedUrlInput = ref<HTMLInputElement | null>(null)
const stockListFileInput = ref<HTMLInputElement | null>(null)
const savingLink = ref(false)
const savingFeed = ref(false)
const deletingLink = ref(false)
const startingFeedWorkbook = ref(false)
const feedWorkbookProjectPending = ref(false)
const feedWorkbookProjectError = ref('')
const feedWorkbookProjectRequestId = ref(0)
const openFeedWorkbookProject = ref<ProjectSummary | null>(null)

const mappingForm = reactive({
  externalOrgId: '',
  sellerRefsText: '',
  defaultFeedIdsText: ''
})

const feedForm = reactive({
  name: '',
  platform: 'google' as 'google' | 'facebook',
  storeCode: '',
  condition: [] as string[],
  makeText: '',
  modelText: '',
  search: '',
  yearMin: null as number | null,
  yearMax: null as number | null,
  priceMin: null as number | null,
  priceMax: null as number | null,
  kmsMin: null as number | null,
  kmsMax: null as number | null,
  stockListMode: 'off' as StockListMode,
  stockRefsText: ''
})

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
) => Promise<T>
const clientOptionsData = ref<{ items: DealerFeedClientOption[] }>({ items: [] })
const clientsPending = ref(false)
const linksData = ref<{ ok: boolean, links: DealerFeedLink[] }>({ ok: false, links: [] })
const linksPending = ref(false)
const linksError = ref<any>(null)
const feedWorkbookTemplatesData = ref<FeedWorkbookTemplatesResponse>({ templates: [] })
const feedWorkbookPending = ref(false)

async function refreshClientOptions() {
  clientsPending.value = true
  try {
    clientOptionsData.value = await apiFetch<{ items: DealerFeedClientOption[] }>('/api/admin/dealer-feed-client-options')
  } finally {
    clientsPending.value = false
  }
}

async function refreshLinks() {
  linksPending.value = true
  linksError.value = null
  try {
    linksData.value = await apiFetch<{ ok: boolean, links: DealerFeedLink[] }>('/api/admin/dealer-feed-links')
  } catch (error) {
    linksError.value = error
  } finally {
    linksPending.value = false
  }
}

async function refreshFeedWorkbookTemplate() {
  feedWorkbookPending.value = true
  try {
    feedWorkbookTemplatesData.value = await apiFetch<FeedWorkbookTemplatesResponse>('/api/agency/templates', {
      query: { search: FEED_WORKBOOK_TEMPLATE_NAME, limit: 10 }
    })
  } finally {
    feedWorkbookPending.value = false
  }
}

onMounted(() => {
  void Promise.all([refreshClientOptions(), refreshLinks(), refreshFeedWorkbookTemplate()])
})

const clientRows = computed(() => clientOptionsData.value?.items || [])
const links = computed(() => linksData.value?.links || [])
const feedWorkbookTemplate = computed(() =>
  (feedWorkbookTemplatesData.value?.templates || []).find(template => template.name === FEED_WORKBOOK_TEMPLATE_NAME)
  || (feedWorkbookTemplatesData.value?.templates || []).find(template => template.tags?.includes('feed-workbook'))
  || null
)

const clientOptions = computed(() =>
  clientRows.value.map(client => ({ label: client.label, value: client.id }))
)

const selectedClientOption = computed(() =>
  clientRows.value.find(client => client.id === selectedClientOptionId.value) || null
)

const selectedClientId = computed(() => selectedClientOption.value?.clientId || '')

const selectedClient = computed<AgencyClient | null>(() =>
  selectedClientOption.value
    ? {
        id: selectedClientOption.value.clientId || selectedClientOption.value.socialConnectionIds.join(', '),
        name: selectedClientOption.value.name,
        isActive: selectedClientOption.value.isActive
      }
    : null
)

const selectedLink = computed(() =>
  links.value.find(link => link.clientId === selectedClientId.value) || null
)

const linkedClientIds = computed(() => new Set(links.value.map(link => link.clientId)))
const unmappedClientCount = computed(() =>
  clientRows.value.filter((client) => {
    if (client.source === 'social') return true
    return client.clientId ? !linkedClientIds.value.has(client.clientId) : true
  }).length
)

const stats = computed(() => [
  { label: 'Mapped clients', value: links.value.length, icon: 'i-lucide-link' },
  { label: 'Unmapped clients', value: unmappedClientCount.value, icon: 'i-lucide-unlink' },
  { label: 'Visible feeds', value: feedRows.value.length, icon: 'i-lucide-rss' }
])

const platformOptions = [
  { label: 'Google Merchant', value: 'google' },
  { label: 'Facebook Catalog', value: 'facebook' }
]

const conditionOptions = [
  { label: 'New', value: 'New' },
  { label: 'Demo', value: 'Demo' },
  { label: 'Used', value: 'Used' }
]

const stockListModeOptions = [
  { label: 'No stock list', value: 'off' },
  { label: 'Only listed cars', value: 'include' },
  { label: 'Exclude listed cars', value: 'exclude' }
]

const feedPresets: FeedPreset[] = [
  { id: 'all-saleable', label: 'All saleable', icon: 'i-lucide-shield-check' },
  { id: 'new', label: 'New cars', icon: 'i-lucide-sparkles' },
  { id: 'demo', label: 'Demo cars', icon: 'i-lucide-gauge' },
  { id: 'used', label: 'Used cars', icon: 'i-lucide-refresh-cw' },
  { id: 'stock-list', label: 'CSV stock list', icon: 'i-lucide-file-spreadsheet' }
]

const feedWorkbookHandoffItems = [
  { label: 'Intake', description: 'Monday brief, Slack thread, Meta and Google access', icon: 'i-lucide-inbox' },
  { label: 'Readiness', description: 'Saleable stock, URLs, prices, images, condition and store code', icon: 'i-lucide-shield-check' },
  { label: 'Build', description: 'Campaign filters, CSV stock list, feed URL and preview QA', icon: 'i-lucide-sliders-horizontal' },
  { label: 'Launch', description: 'Platform import, approval checkpoint, monitoring and handoff', icon: 'i-lucide-rocket' }
]

const feedBuildCheckpointItems = [
  { label: 'Brief captured', icon: 'i-lucide-clipboard-check' },
  { label: 'Validation fixes tracked', icon: 'i-lucide-shield-alert' },
  { label: 'Feed URL QA assigned', icon: 'i-lucide-link-2' }
]

const parseList = (value: string) =>
  value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)

const slugifySellerRef = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const value = text.slice(0, 1_000_000)

  while (i < value.length) {
    const ch = value[i]
    if (inQuotes) {
      if (ch === '"') {
        if (value[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      if (row.some(part => part.trim())) rows.push(row)
      row = []
      cell = ''
      i += 1
      continue
    }
    cell += ch
    i += 1
  }

  row.push(cell)
  if (row.some(part => part.trim())) rows.push(row)
  return rows
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function stockRefsFromText(value: string): string[] {
  const rows = parseCsvRows(value)
  if (!rows.length) return []

  const stockHeaders = new Set([
    'id',
    'vehicle_id',
    'vehicleid',
    'stock',
    'stock_no',
    'stock_num',
    'stock_number',
    'stocknumber',
    'stock_id',
    'vin'
  ])
  const headers = rows[0].map(normalizeCsvHeader)
  const headerIndexes = headers
    .map((header, index) => stockHeaders.has(header) ? index : -1)
    .filter(index => index >= 0)
  const indexes = headerIndexes.length ? headerIndexes : [0]
  const dataRows = headerIndexes.length ? rows.slice(1) : rows

  return Array.from(new Set(
    dataRows
      .slice(0, 5000)
      .flatMap(row => indexes.map(index => row[index] || ''))
      .map(ref => ref.trim())
      .filter(Boolean)
  ))
}

function finiteFormNumber(value: number | string | null): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function addRangeFilter(filters: Record<string, unknown>, key: string, minValue: number | string | null, maxValue: number | string | null) {
  const min = finiteFormNumber(minValue)
  const max = finiteFormNumber(maxValue)
  if (min === undefined && max === undefined) return
  filters[key] = {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {})
  }
}

function buildFeedFilters(): Record<string, unknown> {
  const filters: Record<string, unknown> = { onlyActive: true }
  const conditions = Array.from(new Set(feedForm.condition.map(String).map(item => item.trim()).filter(Boolean)))
  const makes = parseList(feedForm.makeText)
  const models = parseList(feedForm.modelText)
  const stockRefs = stockRefsFromText(feedForm.stockRefsText)

  if (conditions.length) filters.condition = conditions
  if (makes.length) filters.makes = makes
  if (models.length) filters.models = models
  if (feedForm.search.trim()) filters.search = feedForm.search.trim()
  addRangeFilter(filters, 'years', feedForm.yearMin, feedForm.yearMax)
  addRangeFilter(filters, 'price', feedForm.priceMin, feedForm.priceMax)
  addRangeFilter(filters, 'kms', feedForm.kmsMin, feedForm.kmsMax)

  if (feedForm.stockListMode === 'include' && stockRefs.length) filters.includeIds = stockRefs
  if (feedForm.stockListMode === 'exclude' && stockRefs.length) filters.excludeIds = stockRefs

  return filters
}

function buildFeedPlatformSettings(): Record<string, unknown> {
  return feedForm.platform === 'google' && feedForm.storeCode.trim()
    ? { store_code: feedForm.storeCode.trim() }
    : {}
}

function buildDraftPreviewBody() {
  return {
    name: feedForm.name.trim() || undefined,
    platform: feedForm.platform,
    filters: buildFeedFilters(),
    platformSettings: buildFeedPlatformSettings(),
    limit: 8
  }
}

const stockRefCount = computed(() => stockRefsFromText(feedForm.stockRefsText).length)
const draftPreviewSignature = computed(() =>
  selectedLink.value
    ? JSON.stringify({ clientId: selectedClientId.value, ...buildDraftPreviewBody() })
    : ''
)
const debouncedDraftPreviewSignature = refDebounced(draftPreviewSignature, 450)

function rangeChip(label: string, minValue: number | string | null, maxValue: number | string | null, prefix = '') {
  const min = finiteFormNumber(minValue)
  const max = finiteFormNumber(maxValue)
  if (min === undefined && max === undefined) return ''
  if (min !== undefined && max !== undefined) return `${label}: ${prefix}${formatCount(min)}-${prefix}${formatCount(max)}`
  if (min !== undefined) return `${label}: from ${prefix}${formatCount(min)}`
  return `${label}: to ${prefix}${formatCount(max)}`
}

const activeFilterChips = computed(() => {
  const chips: string[] = []
  const conditions = Array.from(new Set(feedForm.condition.map(String).map(item => item.trim()).filter(Boolean)))
  const makes = parseList(feedForm.makeText)
  const models = parseList(feedForm.modelText)
  const search = feedForm.search.trim()
  const stockRefs = stockRefsFromText(feedForm.stockRefsText)

  if (conditions.length) chips.push(`Condition: ${conditions.join(', ')}`)
  if (makes.length) chips.push(`Make: ${makes.join(', ')}`)
  if (models.length) chips.push(`Model: ${models.join(', ')}`)
  if (search) chips.push(`Title: ${search}`)
  const year = rangeChip('Year', feedForm.yearMin, feedForm.yearMax)
  const price = rangeChip('Price', feedForm.priceMin, feedForm.priceMax, '$')
  const kms = rangeChip('Kms', feedForm.kmsMin, feedForm.kmsMax)
  if (year) chips.push(year)
  if (price) chips.push(price)
  if (kms) chips.push(kms)
  if (feedForm.stockListMode === 'include' && stockRefs.length) chips.push(`Only ${formatCount(stockRefs.length)} stock refs`)
  if (feedForm.stockListMode === 'exclude' && stockRefs.length) chips.push(`Exclude ${formatCount(stockRefs.length)} stock refs`)
  return chips
})

function hasRangeFilter(minValue: number | string | null, maxValue: number | string | null) {
  return finiteFormNumber(minValue) !== undefined || finiteFormNumber(maxValue) !== undefined
}

function hasTextOrRangeFilters() {
  return Boolean(
    parseList(feedForm.makeText).length
    || parseList(feedForm.modelText).length
    || feedForm.search.trim()
    || hasRangeFilter(feedForm.yearMin, feedForm.yearMax)
    || hasRangeFilter(feedForm.priceMin, feedForm.priceMax)
    || hasRangeFilter(feedForm.kmsMin, feedForm.kmsMax)
  )
}

function singleConditionPreset(value: string) {
  return feedForm.condition.length === 1 && feedForm.condition[0] === value
}

const selectedFeedPresetId = computed<FeedPresetId | 'custom'>(() => {
  if (feedForm.stockListMode === 'include') return 'stock-list'
  if (feedForm.stockListMode !== 'off' || hasTextOrRangeFilters()) return 'custom'
  if (singleConditionPreset('New')) return 'new'
  if (singleConditionPreset('Demo')) return 'demo'
  if (singleConditionPreset('Used')) return 'used'
  if (feedForm.condition.length === 0) return 'all-saleable'
  return 'custom'
})

function conditionSelected(value: string) {
  return feedForm.condition.includes(value)
}

function toggleCondition(value: string) {
  feedForm.condition = conditionSelected(value)
    ? feedForm.condition.filter(item => item !== value)
    : [...feedForm.condition, value]
}

function clearFeedFilters() {
  feedForm.condition = []
  feedForm.makeText = ''
  feedForm.modelText = ''
  feedForm.search = ''
  feedForm.yearMin = null
  feedForm.yearMax = null
  feedForm.priceMin = null
  feedForm.priceMax = null
  feedForm.kmsMin = null
  feedForm.kmsMax = null
  feedForm.stockListMode = 'off'
  feedForm.stockRefsText = ''
}

function applyFeedPreset(preset: FeedPreset) {
  const existingStockRefs = feedForm.stockRefsText

  clearFeedFilters()

  if (preset.id === 'new') feedForm.condition = ['New']
  if (preset.id === 'demo') feedForm.condition = ['Demo']
  if (preset.id === 'used') feedForm.condition = ['Used']
  if (preset.id === 'stock-list') {
    feedForm.stockListMode = 'include'
    feedForm.stockRefsText = existingStockRefs
  }
}

async function handleStockListFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    if (file.size > 1_000_000) {
      toast.add({
        title: 'CSV is too large',
        description: 'Upload a stock list under 1 MB.',
        color: 'error'
      })
      return
    }

    const refs = stockRefsFromText(await file.text())
    if (!refs.length) {
      toast.add({
        title: 'No stock refs found',
        description: 'Use a stock_number, stock, vin, vehicle_id, or id column.',
        color: 'error'
      })
      return
    }

    feedForm.stockRefsText = refs.join('\n')
    if (feedForm.stockListMode === 'off') feedForm.stockListMode = 'include'
    toast.add({
      title: 'Stock list loaded',
      description: `${formatCount(refs.length)} stock/VIN refs ready for this feed.`,
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'CSV could not be read',
      description: errorMessage(error, 'Please try another CSV file.'),
      color: 'error'
    })
  } finally {
    input.value = ''
  }
}

function resetFeedForm() {
  feedForm.name = ''
  feedForm.storeCode = ''
  feedForm.condition = []
  feedForm.makeText = ''
  feedForm.modelText = ''
  feedForm.search = ''
  feedForm.yearMin = null
  feedForm.yearMax = null
  feedForm.priceMin = null
  feedForm.priceMax = null
  feedForm.kmsMin = null
  feedForm.kmsMax = null
  feedForm.stockListMode = 'off'
  feedForm.stockRefsText = ''
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      data?: { statusMessage?: string, message?: string }
      message?: string
    }
    return maybeError.data?.statusMessage || maybeError.data?.message || maybeError.message || fallback
  }
  return fallback
}

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat('en-AU').format(Number(value) || 0)
}

function feedPlatformLabel(platform: FeedSummary['platform']) {
  return platform === 'google' ? 'Google' : 'Facebook'
}

function feedValidationLabel(platform: FeedSummary['platform']) {
  return platform === 'google' ? 'Google feed' : 'Facebook catalog'
}

function previewCountLabel(preview: FeedPreviewState) {
  if (preview.validation?.showingFallbackCandidates) {
    return `Showing ${formatCount(preview.items.length)} raw matches of ${formatCount(preview.validation.matchedTotal || preview.total)} matched vehicles.`
  }

  if (preview.validation && preview.validation.matchedTotal !== preview.validation.validatedTotal) {
    return `Showing ${formatCount(preview.items.length)} feed-valid vehicles of ${formatCount(preview.validation.matchedTotal)} matched vehicles.`
  }

  return `Showing ${formatCount(preview.items.length)} of ${formatCount(preview.total)} vehicles.`
}

function hasPreviewValidationWarning(preview: FeedPreviewState) {
  const validation = preview.validation
  return Boolean(validation && validation.matchedTotal > 0 && validation.validatedTotal === 0)
}

function validationWarningTitle(preview: FeedPreviewState) {
  const validation = preview.validation
  if (!validation) return ''
  return `${formatCount(validation.matchedTotal)} vehicles matched, but 0 currently pass ${feedValidationLabel(preview.feed.platform)} validation`
}

function validationWarningDescription(preview: FeedPreviewState) {
  if (preview.validation?.showingFallbackCandidates) {
    return 'Showing raw matched vehicles below so you can diagnose the feed setup. The live feed may still be empty until the validation issues are fixed.'
  }
  return 'The inventory match is working, but the feed output is empty. Check the validation issues and feed field mappings.'
}

function validationIssueText(issue: unknown): string {
  if (typeof issue === 'string') return issue
  if (typeof issue === 'number' || typeof issue === 'boolean') return String(issue)
  if (issue && typeof issue === 'object') {
    const value = issue as Record<string, unknown>
    const field = typeof value.field === 'string' ? value.field : ''
    const message = typeof value.message === 'string'
      ? value.message
      : typeof value.reason === 'string'
        ? value.reason
        : ''
    if (field && message) return `${field}: ${message}`
    if (message) return message
    if (field) return field
    try {
      return JSON.stringify(value)
    } catch {
      return 'Validation issue'
    }
  }
  return 'Validation issue'
}

function validationSummaryIssues(summary: FeedValidationIssueSummary) {
  return summary.issues.map(validationIssueText).join(', ')
}

function visibleValidationSummaries(validation?: FeedPreviewValidation) {
  return validation?.invalidSummaries.slice(0, 3) || []
}

function hiddenValidationSummaryCount(validation?: FeedPreviewValidation) {
  return Math.max(0, (validation?.invalidSummaries.length || 0) - 3)
}

function readinessStatusColor(status?: FeedReadinessStatus) {
  if (status === 'ready') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'blocked') return 'error'
  return 'neutral'
}

function readinessStatusLabel(status?: FeedReadinessStatus) {
  if (status === 'ready') return 'Ready'
  if (status === 'partial') return 'Partial'
  if (status === 'blocked') return 'Blocked'
  if (status === 'empty') return 'No matches'
  return 'Checking'
}

function readinessPercent(readiness?: FeedReadinessSummary) {
  if (!readiness?.matchedTotal) return 0
  return Math.max(0, Math.min(100, Math.round((readiness.validatedTotal / readiness.matchedTotal) * 100)))
}

function readinessTitle(readiness?: FeedReadinessSummary, platform: FeedSummary['platform'] = feedForm.platform) {
  if (!readiness || readiness.status === 'unknown') return 'Validation pending'
  if (readiness.status === 'empty') return 'No vehicles match these filters'
  if (readiness.status === 'ready') return `${formatCount(readiness.validatedTotal)} vehicles ready for ${feedValidationLabel(platform)}`
  if (readiness.status === 'partial') {
    return `${formatCount(readiness.validatedTotal)} of ${formatCount(readiness.matchedTotal)} vehicles are feed-ready`
  }
  return `${formatCount(readiness.matchedTotal)} matched, but none pass ${feedValidationLabel(platform)} validation`
}

function readinessDescription(readiness?: FeedReadinessSummary) {
  if (!readiness || readiness.status === 'unknown') return 'Changing filters checks the candidate catalog rows before a feed is created.'
  if (readiness.status === 'empty') return 'Widen the filters or check the dealership seller refs.'
  if (readiness.status === 'ready') return 'The selected inventory has the required catalog fields.'
  if (readiness.status === 'partial') return 'The feed can publish now, but the blocked rows below need source or enrichment fixes.'
  return 'The inventory scope is matching, but required catalog fields are missing.'
}

function readinessIssueGroups(readiness?: FeedReadinessSummary) {
  return readiness?.issueGroups.slice(0, 4) || []
}

function fixModeLabel(mode: FeedReadinessFixMode) {
  if (mode === 'source_required') return 'Source fix'
  if (mode === 'ai_assisted') return 'AI assist'
  if (mode === 'mapping_required') return 'Mapping'
  return 'Review'
}

function fixModeColor(mode: FeedReadinessFixMode) {
  if (mode === 'source_required') return 'warning'
  if (mode === 'ai_assisted') return 'primary'
  if (mode === 'mapping_required') return 'info'
  return 'neutral'
}

function fixModeDescription(mode: FeedReadinessFixMode) {
  if (mode === 'source_required') return 'Must come from the inventory source or verified VDP.'
  if (mode === 'ai_assisted') return 'Can be normalized or drafted from verified source data.'
  if (mode === 'mapping_required') return 'Needs feed setup or platform mapping.'
  return 'Needs manual review before publishing.'
}

function emptyPreviewMessage(preview: FeedPreviewState) {
  if (preview.validation && preview.validation.matchedTotal > 0) {
    return preview.validation.invalidSummaries.length
      ? 'No feed-valid vehicles returned. Check the validation issues above.'
      : 'No feed-valid vehicles returned. The matched inventory is being filtered out by feed validation.'
  }
  return preview.total > 0
    ? 'Vehicles matched this feed, but no preview rows were returned.'
    : 'No vehicles returned for this feed preview.'
}

function populateMappingForm() {
  const link = selectedLink.value
  mappingForm.externalOrgId = link?.externalOrgId || ''
  mappingForm.sellerRefsText = link?.sellerRefs.join(', ') || (selectedClient.value ? slugifySellerRef(selectedClient.value.name) : '')
  mappingForm.defaultFeedIdsText = link?.defaultFeedIds.join(', ') || ''
}

async function createOrFindAgencyClient(option: DealerFeedClientOption): Promise<AgencyClient> {
  try {
    return await apiFetch<AgencyClient>('/api/agency/clients', {
      method: 'POST',
      body: {
        name: option.name,
        billingType: 'project',
        notes: `Created from Dealer Feeds for connected ad accounts: ${option.socialPlatforms.join(', ')}`
      }
    })
  } catch (error: unknown) {
    if (!/already exists|409/.test(errorMessage(error, ''))) throw error

    await refreshClientOptions()
    const existing = clientRows.value.find(client =>
      client.source === 'agency' && client.name.toLowerCase() === option.name.toLowerCase()
    )
    if (existing?.clientId) return { id: existing.clientId, name: existing.name, isActive: existing.isActive }
    throw error
  }
}

async function ensureAgencyClientForSelection(): Promise<string> {
  const option = selectedClientOption.value
  if (!option) throw new Error('Select a client first')
  if (option.clientId) return option.clientId

  const client = await createOrFindAgencyClient(option)

  await Promise.all(option.socialConnectionIds.map(connectionId =>
    apiFetch('/api/agency/social/spend/map-account', {
      method: 'POST',
      body: { connectionId, clientId: client.id }
    })
  ))

  await refreshClientOptions()
  selectedClientOptionId.value = `client:${client.id}`
  return client.id
}

function feedWorkbookProjectName(clientName: string) {
  return `${clientName} Feed Workbook`
}

function isOpenFeedWorkbookProject(project: ProjectSummary, projectName: string) {
  const name = project.name.trim().toLowerCase()
  if (project.status === 'completed' || project.status === 'cancelled') return false
  return name === projectName.trim().toLowerCase() || name.includes('feed workbook')
}

async function findExistingFeedWorkbookProject(clientId: string, projectName: string) {
  const projects = await apiFetch<ProjectSummary[]>('/api/agency/projects', {
    query: { clientId }
  })
  return projects.find(project => isOpenFeedWorkbookProject(project, projectName)) || null
}

async function loadFeedWorkbookProject() {
  const option = selectedClientOption.value
  const clientId = selectedClientId.value
  const requestId = feedWorkbookProjectRequestId.value + 1
  feedWorkbookProjectRequestId.value = requestId
  openFeedWorkbookProject.value = null
  feedWorkbookProjectError.value = ''

  if (!option || !clientId) {
    feedWorkbookProjectPending.value = false
    return
  }

  feedWorkbookProjectPending.value = true
  try {
    const project = await findExistingFeedWorkbookProject(clientId, feedWorkbookProjectName(option.name))
    if (feedWorkbookProjectRequestId.value !== requestId) return
    openFeedWorkbookProject.value = project
  } catch (error: unknown) {
    if (feedWorkbookProjectRequestId.value !== requestId) return
    feedWorkbookProjectError.value = errorMessage(error, 'Workbook state could not be loaded')
  } finally {
    if (feedWorkbookProjectRequestId.value === requestId) feedWorkbookProjectPending.value = false
  }
}

const feedWorkbookStatusLabel = computed(() => {
  if (feedWorkbookProjectPending.value) return 'Checking'
  if (!feedWorkbookTemplate.value) return 'Template pending'
  if (openFeedWorkbookProject.value) return 'Open workbook'
  return 'Ready to start'
})

const feedWorkbookStatusColor = computed(() => {
  if (!feedWorkbookTemplate.value || feedWorkbookProjectError.value) return 'warning'
  if (openFeedWorkbookProject.value) return 'success'
  return 'neutral'
})

const feedWorkbookButtonLabel = computed(() =>
  openFeedWorkbookProject.value ? 'Open workbook' : 'Start workbook'
)

const feedWorkbookButtonIcon = computed(() =>
  openFeedWorkbookProject.value ? 'i-lucide-arrow-up-right' : 'i-lucide-play'
)

const feedWorkbookClientNote = computed(() => {
  if (!selectedClientOption.value) return 'Select a client to attach feed setup to a project workflow.'
  if (openFeedWorkbookProject.value) return openFeedWorkbookProject.value.name
  if (!selectedClientOption.value.clientId) return 'Starting will create the agency client, map the ad account, and create the workbook.'
  return feedWorkbookProjectName(selectedClientOption.value.name)
})

const feedWorkbookCheckpointTitle = computed(() => {
  if (openFeedWorkbookProject.value) return 'Workbook is tracking this feed setup'
  if (!selectedClientOption.value) return 'Select a client to attach workflow'
  return 'Start the workbook before launch'
})

const feedWorkbookCheckpointDescription = computed(() => {
  if (!selectedClientOption.value) return 'The feed workbook will hold the campaign requirements, Slack handoff, validation fixes, and launch QA.'
  if (openFeedWorkbookProject.value) return 'Use the workbook for campaign requirements, validation fixes, approval notes, and post-launch monitoring.'
  if (!feedWorkbookTemplate.value) return 'The workbook template is not loaded yet. Refresh after the template migration is available.'
  if (!selectedClientOption.value.clientId) return 'Starting the workbook will create the agency client, connect the ad account, and open the project checklist.'
  return 'Create the project checklist now so filters, CSV stock lists, platform QA, and approvals have an owner.'
})

const feedWorkbookProjectRoute = computed(() =>
  openFeedWorkbookProject.value ? `/agency/projects/${openFeedWorkbookProject.value.id}` : ''
)

const dealerFeedHandoffSummary = computed(() => {
  const option = selectedClientOption.value
  if (!option) return ''

  return formatDealerFeedHandoffSummary({
    clientName: option.name,
    clientId: selectedClientId.value || option.clientId || undefined,
    feedName: feedForm.name.trim() || undefined,
    platform: feedForm.platform,
    storeCode: feedForm.storeCode.trim() || undefined,
    workbookName: openFeedWorkbookProject.value?.name || feedWorkbookProjectName(option.name),
    workbookUrl: feedWorkbookProjectRoute.value || undefined,
    workbookStatus: feedWorkbookStatusLabel.value,
    externalOrgId: selectedLink.value?.externalOrgId,
    sellerRefs: parseList(mappingForm.sellerRefsText),
    filterChips: activeFilterChips.value,
    stockListMode: feedForm.stockListMode,
    stockRefCount: stockRefCount.value,
    readiness: draftPreview.value?.readiness,
    generatedFeedUrl: generatedFeedUrl.value || undefined
  })
})

async function startFeedWorkbook() {
  const option = selectedClientOption.value
  if (!option) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }

  let template = feedWorkbookTemplate.value
  if (!template) {
    await refreshFeedWorkbookTemplate()
    template = feedWorkbookTemplate.value
  }

  if (!template) {
    toast.add({
      title: 'Feed Workbook template not found',
      description: 'Run the dealer feed workbook migration, then refresh this page.',
      color: 'warning'
    })
    return
  }

  startingFeedWorkbook.value = true
  try {
    if (openFeedWorkbookProject.value && option.clientId) {
      await navigateTo(`/agency/projects/${openFeedWorkbookProject.value.id}`)
      return
    }

    const clientId = await ensureAgencyClientForSelection()
    const projectName = feedWorkbookProjectName(option.name)
    const existingProject = openFeedWorkbookProject.value || await findExistingFeedWorkbookProject(clientId, projectName)

    if (existingProject) {
      toast.add({ title: 'Opening existing Feed Workbook', color: 'success' })
      await navigateTo(`/agency/projects/${existingProject.id}`)
      return
    }

    const result = await apiFetch<UseTemplateResponse>(`/api/agency/templates/${template.id}/use`, {
      method: 'POST',
      body: {
        clientId,
        projectName,
        startDate: new Date().toISOString().split('T')[0]
      }
    })

    toast.add({
      title: 'Feed Workbook created',
      description: `Created ${result.tasksCreated} workflow tasks for ${option.name}.`,
      color: 'success'
    })
    await navigateTo(`/agency/projects/${result.project.id}`)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to start Feed Workbook',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    startingFeedWorkbook.value = false
  }
}

async function loadFeeds() {
  feedRows.value = []
  feedsError.value = ''
  feedPreview.value = null
  generatedFeedUrl.value = ''
  generatedFeedMeta.value = null

  if (!selectedClientId.value || !selectedLink.value) {
    draftPreview.value = null
    draftPreviewError.value = ''
    return
  }

  feedsPending.value = true
  try {
    const result = await apiFetch<{ ok: boolean, feeds: FeedSummary[] }>(`/api/admin/dealer-feeds/${selectedClientId.value}`)
    feedRows.value = result.feeds || []
  } catch (error: unknown) {
    feedsError.value = errorMessage(error, 'Failed to load dealer feeds')
  } finally {
    feedsPending.value = false
  }
}

async function loadDraftPreview() {
  if (!selectedClientId.value || !selectedLink.value) {
    draftPreview.value = null
    draftPreviewError.value = ''
    draftPreviewPending.value = false
    return
  }

  const requestId = draftPreviewRequestId.value + 1
  draftPreviewRequestId.value = requestId
  draftPreviewPending.value = true
  draftPreviewError.value = ''

  try {
    const result = await apiFetch<{ ok: boolean, preview: DraftPreviewState }>(
      `/api/admin/dealer-feeds/${selectedClientId.value}/preview`,
      {
        method: 'POST',
        body: buildDraftPreviewBody()
      }
    )
    if (draftPreviewRequestId.value !== requestId) return
    draftPreview.value = {
      total: result.preview.total,
      items: result.preview.items || [],
      ...(result.preview.validation ? { validation: result.preview.validation } : {}),
      ...(result.preview.readiness ? { readiness: result.preview.readiness } : {})
    }
  } catch (error: unknown) {
    if (draftPreviewRequestId.value !== requestId) return
    draftPreview.value = null
    draftPreviewError.value = errorMessage(error, 'Live match could not be loaded')
  } finally {
    if (draftPreviewRequestId.value === requestId) draftPreviewPending.value = false
  }
}

async function previewFeed(feed: FeedSummary) {
  if (!selectedClientId.value) return

  previewPendingFeedId.value = feed.id
  generatedFeedUrl.value = ''
  generatedFeedMeta.value = null
  try {
    const result = await apiFetch<{ ok: boolean, preview: { total: number, items: VehicleSummary[], validation?: FeedPreviewValidation, readiness?: FeedReadinessSummary } }>(
      `/api/admin/dealer-feeds/${selectedClientId.value}/${feed.id}/preview`,
      { query: { platform: feed.platform, limit: 20, offset: 0, search: feedPreviewSearch.value.trim() || undefined } }
    )
    feedPreview.value = {
      feed,
      total: result.preview.total,
      items: result.preview.items || [],
      ...(result.preview.validation ? { validation: result.preview.validation } : {}),
      ...(result.preview.readiness ? { readiness: result.preview.readiness } : {})
    }
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to preview feed',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    previewPendingFeedId.value = ''
  }
}

async function copyGeneratedUrl(url: string) {
  if (!url) return

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      toast.add({ title: 'Feed URL copied', color: 'success' })
      return
    }

    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (copied) {
        toast.add({ title: 'Feed URL copied', color: 'success' })
        return
      }
    }
  } catch {
    // Fall through to visible URL panel.
  }

  await nextTick()
  generatedFeedUrlInput.value?.focus()
  generatedFeedUrlInput.value?.select()
  toast.add({
    title: 'Feed URL ready',
    description: 'Clipboard access was blocked. The URL field is selected so you can copy it manually.',
    color: 'warning'
  })
}

async function copyDealerFeedHandoff() {
  const summary = dealerFeedHandoffSummary.value
  if (!summary) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(summary)
      toast.add({
        title: 'Feed handoff copied',
        description: 'Paste it into Slack or the Monday item.',
        color: 'success'
      })
      return
    }

    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea')
      textarea.value = summary
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (copied) {
        toast.add({
          title: 'Feed handoff copied',
          description: 'Paste it into Slack or the Monday item.',
          color: 'success'
        })
        return
      }
    }

    throw new Error('Clipboard unavailable')
  } catch {
    toast.add({
      title: 'Could not copy handoff',
      description: 'Copy the visible feed URL and workbook details manually.',
      color: 'warning'
    })
  }
}

async function shareFeed(feed: FeedSummary) {
  if (!selectedClientId.value) return

  generatingFeedKey.value = feed.id
  try {
    const result = await apiFetch<{ ok: boolean, feedUrl: string, url?: string }>(
      `/api/admin/dealer-feeds/${selectedClientId.value}/${feed.id}/url`
    )
    const url = result.feedUrl || result.url || ''
    generatedFeedUrl.value = url
    generatedFeedMeta.value = { feedName: feed.name || feed.id, itemCount: 0 }
    await copyGeneratedUrl(url)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to prepare feed URL',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    generatingFeedKey.value = ''
  }
}

async function saveMapping() {
  if (!selectedClientOption.value) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }

  savingLink.value = true
  try {
    const clientId = await ensureAgencyClientForSelection()
    await apiFetch('/api/admin/dealer-feed-links', {
      method: 'POST',
      body: {
        clientId,
        externalOrgId: mappingForm.externalOrgId.trim() || undefined,
        sellerRefs: parseList(mappingForm.sellerRefsText),
        defaultFeedIds: parseList(mappingForm.defaultFeedIdsText),
        platforms: selectedClientOption.value.socialPlatforms
      }
    })
    toast.add({ title: 'Feed workspace ready', color: 'success' })
    await refreshLinks()
    populateMappingForm()
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to save mapping',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    savingLink.value = false
  }
}

async function deactivateMapping() {
  if (!selectedClientId.value || !selectedLink.value) return

  deletingLink.value = true
  try {
    await apiFetch(`/api/admin/dealer-feed-links/${selectedClientId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Dealer feed mapping deactivated', color: 'success' })
    await refreshLinks()
    populateMappingForm()
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to deactivate mapping',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    deletingLink.value = false
  }
}

async function createFeed() {
  if (!selectedLink.value) {
    toast.add({ title: 'Create a mapping before creating feeds', color: 'error' })
    return
  }
  if (!feedForm.name.trim()) {
    toast.add({ title: 'Feed name is required', color: 'error' })
    return
  }
  if (feedForm.stockListMode !== 'off' && stockRefCount.value === 0) {
    toast.add({ title: 'Stock list is empty', color: 'error' })
    return
  }

  savingFeed.value = true
  try {
    await apiFetch(`/api/admin/dealer-feeds/${selectedClientId.value}`, {
      method: 'POST',
      body: {
        name: feedForm.name.trim(),
        platform: feedForm.platform,
        filters: buildFeedFilters(),
        platformSettings: buildFeedPlatformSettings()
      }
    })
    toast.add({ title: 'Feed create request sent', color: 'success' })
    resetFeedForm()
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to create feed',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    savingFeed.value = false
  }
}

async function refreshView() {
  await refreshClientOptions()
  await refreshLinks()
  await loadFeedWorkbookProject()
  await loadFeeds()
}

const formatDate = (value: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const linkColumns = [
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'externalOrgId', header: 'Feed workspace' },
  { accessorKey: 'sellerRefs', header: 'Seller refs' },
  { accessorKey: 'defaultFeedIds', header: 'Default feeds' },
  { accessorKey: 'updatedAt', header: 'Updated' },
  { id: 'actions', header: '' }
]

const feedColumns = [
  { accessorKey: 'name', header: 'Feed' },
  { accessorKey: 'platform', header: 'Platform' },
  { accessorKey: 'id', header: 'Feed ID' },
  { accessorKey: 'isActive', header: 'Status' },
  { id: 'actions', header: '' }
]

watch(clientRows, (rows) => {
  if (!selectedClientOptionId.value && rows.length > 0) {
    selectedClientOptionId.value = rows[0].id
  }
}, { immediate: true })

watch([selectedClientOptionId, links], async () => {
  populateMappingForm()
  await loadFeeds()
}, { immediate: true })

watch([selectedClientOptionId, clientRows], () => {
  void loadFeedWorkbookProject()
}, { immediate: true })

watch(debouncedDraftPreviewSignature, () => {
  void loadDraftPreview()
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="dealer-feeds">
    <template #header>
      <UDashboardNavbar
        title="Dealer Feeds"
        description="Set up dealership inventory feeds for Google and Facebook catalogs."
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="outline"
            color="neutral"
            :loading="linksPending || feedsPending"
            @click="refreshView"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="space-y-6 pb-8">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="rounded-lg border border-default bg-default px-4 py-3"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-muted">
                  {{ stat.label }}
                </p>
                <p class="mt-1 text-2xl font-semibold text-highlighted">
                  {{ stat.value }}
                </p>
              </div>
              <UIcon :name="stat.icon" class="size-5 text-primary" />
            </div>
          </div>
        </div>

        <UAlert
          v-if="linksError"
          icon="i-lucide-alert-circle"
          color="error"
          variant="subtle"
          title="Dealer feed links could not be loaded"
          :description="linksError.message"
        />

        <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(480px,0.85fr)_minmax(0,1.35fr)]">
          <section class="rounded-lg border border-default bg-default">
            <div class="border-b border-default px-5 py-4">
              <h2 class="text-base font-semibold text-highlighted">
                Feed setup
              </h2>
              <p class="mt-1 text-sm text-muted">
                Select a dealership, confirm its inventory seller refs, then create feeds.
              </p>
            </div>

            <div class="space-y-4 p-5">
              <UFormField label="Client">
                <USelectMenu
                  v-model="selectedClientOptionId"
                  :items="clientOptions"
                  value-key="value"
                  :loading="clientsPending"
                  placeholder="Select client"
                  class="w-full"
                />
              </UFormField>

              <div
                v-if="selectedClient"
                class="rounded-lg border border-default bg-elevated/40 px-3 py-2"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ selectedClient.name }}
                    </p>
                    <p class="break-all text-xs text-muted">
                      {{ selectedClient.id }}
                    </p>
                  </div>
                  <UBadge
                    :color="selectedLink ? 'success' : 'warning'"
                    variant="subtle"
                    size="xs"
                    class="shrink-0"
                  >
                    {{ selectedLink ? 'Mapped' : 'Unmapped' }}
                  </UBadge>
                </div>
              </div>

              <div class="rounded-lg border border-default bg-elevated/40 px-3 py-3">
                <div class="flex items-start gap-3">
                  <UIcon
                    :name="selectedLink ? 'i-lucide-check-circle-2' : 'i-lucide-wand-sparkles'"
                    :class="selectedLink ? 'text-success' : 'text-primary'"
                    class="mt-0.5 size-5 shrink-0"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-highlighted">
                      {{ selectedLink ? 'Feed workspace connected' : 'Feed workspace will be created automatically' }}
                    </p>
                    <p class="mt-1 text-sm text-muted">
                      {{ selectedLink ? 'This client is linked to social-dashboard and can list or create catalog feeds.' : 'No social-dashboard org ID is needed. Saving will create or reuse the matching workspace in social-dashboard.' }}
                    </p>
                    <p
                      v-if="selectedLink"
                      class="mt-2 break-all font-mono text-xs text-muted"
                    >
                      {{ selectedLink.externalOrgId }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border border-default bg-elevated/40 px-3 py-3">
                <div class="flex flex-col gap-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <UIcon name="i-lucide-list-checks" class="size-5 text-primary" />
                        <p class="text-sm font-medium text-highlighted">
                          Feed Workbook
                        </p>
                        <UBadge
                          :color="feedWorkbookStatusColor"
                          variant="subtle"
                          size="xs"
                        >
                          {{ feedWorkbookStatusLabel }}
                        </UBadge>
                        <UBadge
                          v-if="feedWorkbookTemplate"
                          color="neutral"
                          variant="subtle"
                          size="xs"
                        >
                          {{ feedWorkbookTemplate.taskCount }} tasks
                        </UBadge>
                      </div>
                      <p class="mt-1 break-words text-sm text-muted">
                        {{ feedWorkbookClientNote }}
                      </p>
                      <p
                        v-if="openFeedWorkbookProject"
                        class="mt-1 break-all font-mono text-xs text-muted"
                      >
                        {{ openFeedWorkbookProject.id }}
                      </p>
                    </div>
                    <UButton
                      :icon="feedWorkbookButtonIcon"
                      color="neutral"
                      variant="outline"
                      :disabled="!selectedClientOption || feedWorkbookPending || feedWorkbookProjectPending"
                      :loading="startingFeedWorkbook || feedWorkbookProjectPending"
                      class="justify-center"
                      @click="startFeedWorkbook"
                    >
                      {{ feedWorkbookButtonLabel }}
                    </UButton>
                  </div>

                  <UAlert
                    v-if="feedWorkbookProjectError"
                    icon="i-lucide-alert-circle"
                    color="warning"
                    variant="subtle"
                    title="Workbook state unavailable"
                    :description="feedWorkbookProjectError"
                  />

                  <div class="grid grid-cols-1 gap-x-4 gap-y-3 border-t border-default pt-3 sm:grid-cols-2">
                    <div
                      v-for="item in feedWorkbookHandoffItems"
                      :key="item.label"
                      class="flex min-w-0 gap-2"
                    >
                      <UIcon :name="item.icon" class="mt-0.5 size-4 shrink-0 text-muted" />
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-highlighted">
                          {{ item.label }}
                        </p>
                        <p class="mt-0.5 text-xs leading-5 text-muted">
                          {{ item.description }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <UFormField label="Inventory seller refs">
                <UTextarea
                  v-model="mappingForm.sellerRefsText"
                  placeholder="Auto-filled from the dealership name"
                  :rows="3"
                  class="w-full"
                />
                <template #help>
                  Used to keep inventory scoped to this dealership. Edit only if the inventory slug differs.
                </template>
              </UFormField>

              <UFormField label="Existing feed IDs">
                <UTextarea
                  v-model="mappingForm.defaultFeedIdsText"
                  placeholder="Optional existing feed IDs"
                  :rows="2"
                  class="w-full"
                />
                <template #help>
                  Optional. Leave blank when setting up a new dealership feed workspace.
                </template>
              </UFormField>

              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  icon="i-lucide-save"
                  color="primary"
                  :loading="savingLink"
                  @click="saveMapping"
                >
                  {{ selectedLink ? 'Update setup' : 'Set up feeds' }}
                </UButton>
                <UButton
                  v-if="selectedLink"
                  icon="i-lucide-unlink"
                  color="error"
                  variant="ghost"
                  :loading="deletingLink"
                  @click="deactivateMapping"
                >
                  Deactivate
                </UButton>
              </div>
            </div>
          </section>

          <section class="space-y-6">
            <div class="rounded-lg border border-default bg-default">
              <div class="border-b border-default px-5 py-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 class="text-base font-semibold text-highlighted">
                      Connected mappings
                    </h2>
                    <p class="mt-1 text-sm text-muted">
                      Active dealership feed workspaces.
                    </p>
                  </div>
                  <UBadge color="neutral" variant="subtle">
                    {{ links.length }} active
                  </UBadge>
                </div>
              </div>

              <div v-if="linksPending" class="flex min-h-40 items-center justify-center">
                <XfLoader />
              </div>

              <UEmpty
                v-else-if="links.length === 0"
                icon="i-lucide-link"
                title="No dealer feed mappings"
                description="Select a client and set up feeds to make its workspace visible here."
                class="py-12"
              />

              <UTable
                v-else
                :data="links"
                :columns="linkColumns"
              >
                <template #clientName-cell="{ row }">
                  <button
                    type="button"
                    class="text-left text-sm font-medium text-primary hover:underline"
                    @click="selectedClientOptionId = `client:${row.original.clientId}`"
                  >
                    {{ row.original.clientName || row.original.clientId }}
                  </button>
                </template>

                <template #externalOrgId-cell="{ row }">
                  <code class="text-xs">{{ row.original.externalOrgId }}</code>
                </template>

                <template #sellerRefs-cell="{ row }">
                  <div class="flex max-w-72 flex-wrap gap-1">
                    <UBadge
                      v-for="sellerRef in row.original.sellerRefs"
                      :key="sellerRef"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                    >
                      {{ sellerRef }}
                    </UBadge>
                    <span v-if="row.original.sellerRefs.length === 0" class="text-xs text-muted">-</span>
                  </div>
                </template>

                <template #defaultFeedIds-cell="{ row }">
                  <span class="text-xs text-muted">{{ row.original.defaultFeedIds.length || '-' }}</span>
                </template>

                <template #updatedAt-cell="{ row }">
                  <span class="text-xs text-muted">{{ formatDate(row.original.updatedAt) }}</span>
                </template>

                <template #actions-cell="{ row }">
                  <UButton
                    icon="i-lucide-arrow-right"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="selectedClientOptionId = `client:${row.original.clientId}`"
                  />
                </template>
              </UTable>
            </div>

            <div class="rounded-lg border border-default bg-default">
              <div class="border-b border-default px-5 py-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 class="text-base font-semibold text-highlighted">
                      Feeds for selected client
                    </h2>
                    <p class="mt-1 text-sm text-muted">
                      {{ selectedClient ? selectedClient.name : 'Select a client to inspect its Google and Facebook feeds.' }}
                    </p>
                  </div>
                  <UButton
                    icon="i-lucide-refresh-cw"
                    variant="ghost"
                    color="neutral"
                    :disabled="!selectedLink"
                    :loading="feedsPending"
                    @click="loadFeeds"
                  />
                </div>
              </div>

              <div v-if="!selectedLink" class="p-5">
                <UAlert
                  icon="i-lucide-info"
                  color="warning"
                  variant="subtle"
                  title="No mapping for this client"
                  description="Set up feeds first, then this panel can list and create Google or Facebook catalog feeds."
                />
              </div>

              <template v-else>
                <div class="space-y-4 border-b border-default p-5">
                  <div class="rounded-lg border border-default bg-elevated/30 p-4">
                    <div class="mb-3 flex items-center gap-2">
                      <UIcon name="i-lucide-rss" class="size-4 text-primary" />
                      <h3 class="text-sm font-semibold text-highlighted">
                        Feed details
                      </h3>
                    </div>
                    <div
                      class="grid grid-cols-1 gap-3"
                      :class="feedForm.platform === 'google' ? 'lg:grid-cols-[minmax(0,1fr)_14rem_12rem]' : 'lg:grid-cols-[minmax(0,1fr)_14rem]'"
                    >
                      <UFormField label="Feed name">
                        <UInput
                          v-model="feedForm.name"
                          placeholder="Meta Blood Hyundai"
                          class="w-full"
                        />
                      </UFormField>
                      <UFormField label="Platform">
                        <USelect
                          v-model="feedForm.platform"
                          :items="platformOptions"
                          value-key="value"
                          class="w-full"
                        />
                      </UFormField>
                      <UFormField
                        v-if="feedForm.platform === 'google'"
                        label="Google store code"
                      >
                        <UInput
                          v-model="feedForm.storeCode"
                          placeholder="Store code"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>

                  <div class="rounded-lg border border-default bg-elevated/30 p-4">
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <UIcon name="i-lucide-layout-template" class="size-4 text-primary" />
                        <h3 class="text-sm font-semibold text-highlighted">
                          Campaign preset
                        </h3>
                      </div>
                      <UBadge
                        color="success"
                        variant="subtle"
                        icon="i-lucide-lock"
                      >
                        Saleable only
                      </UBadge>
                    </div>
                    <div class="grid grid-cols-2 gap-2 md:grid-cols-5">
                      <UButton
                        v-for="preset in feedPresets"
                        :key="preset.id"
                        :icon="preset.icon"
                        :color="selectedFeedPresetId === preset.id ? 'primary' : 'neutral'"
                        :variant="selectedFeedPresetId === preset.id ? 'solid' : 'outline'"
                        class="justify-center"
                        @click="applyFeedPreset(preset)"
                      >
                        {{ preset.label }}
                      </UButton>
                    </div>
                  </div>

                  <div class="rounded-lg border border-default bg-elevated/30 p-4">
                    <div class="mb-3 flex items-center gap-2">
                      <UIcon name="i-lucide-filter" class="size-4 text-primary" />
                      <h3 class="text-sm font-semibold text-highlighted">
                        Vehicle scope
                      </h3>
                    </div>

                    <div class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
                      <UFormField label="Title keywords">
                        <UInput
                          v-model="feedForm.search"
                          icon="i-lucide-search"
                          placeholder="hybrid, runout, SUV"
                          class="w-full"
                        />
                      </UFormField>

                      <div>
                        <p class="mb-2 text-sm font-medium text-highlighted">
                          Condition
                        </p>
                        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <button
                            type="button"
                            class="min-h-10 rounded-md border px-3 text-sm font-medium transition"
                            :class="feedForm.condition.length === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-default bg-default text-muted hover:bg-elevated'"
                            @click="feedForm.condition = []"
                          >
                            All
                          </button>
                          <button
                            v-for="option in conditionOptions"
                            :key="option.value"
                            type="button"
                            class="min-h-10 rounded-md border px-3 text-sm font-medium transition"
                            :class="conditionSelected(option.value) ? 'border-primary bg-primary/10 text-primary' : 'border-default bg-default text-muted hover:bg-elevated'"
                            @click="toggleCondition(option.value)"
                          >
                            {{ option.label }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <UFormField label="Make">
                        <UInput
                          v-model="feedForm.makeText"
                          placeholder="Hyundai, Kia"
                          class="w-full"
                        />
                      </UFormField>
                      <UFormField label="Model">
                        <UInput
                          v-model="feedForm.modelText"
                          placeholder="Tucson, i30"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div class="rounded-lg border border-default bg-elevated/30 p-4">
                      <p class="mb-3 text-sm font-medium text-highlighted">
                        Year
                      </p>
                      <div class="grid grid-cols-2 gap-2">
                        <UInput
                          v-model.number="feedForm.yearMin"
                          type="number"
                          min="1900"
                          placeholder="From"
                          aria-label="Year from"
                          class="w-full"
                        />
                        <UInput
                          v-model.number="feedForm.yearMax"
                          type="number"
                          min="1900"
                          placeholder="To"
                          aria-label="Year to"
                          class="w-full"
                        />
                      </div>
                    </div>

                    <div class="rounded-lg border border-default bg-elevated/30 p-4">
                      <p class="mb-3 text-sm font-medium text-highlighted">
                        Price
                      </p>
                      <div class="grid grid-cols-2 gap-2">
                        <UInput
                          v-model.number="feedForm.priceMin"
                          type="number"
                          min="0"
                          placeholder="From"
                          aria-label="Price from"
                          class="w-full"
                        />
                        <UInput
                          v-model.number="feedForm.priceMax"
                          type="number"
                          min="0"
                          placeholder="To"
                          aria-label="Price to"
                          class="w-full"
                        />
                      </div>
                    </div>

                    <div class="rounded-lg border border-default bg-elevated/30 p-4">
                      <p class="mb-3 text-sm font-medium text-highlighted">
                        Kilometres
                      </p>
                      <div class="grid grid-cols-2 gap-2">
                        <UInput
                          v-model.number="feedForm.kmsMin"
                          type="number"
                          min="0"
                          placeholder="From"
                          aria-label="Kilometres from"
                          class="w-full"
                        />
                        <UInput
                          v-model.number="feedForm.kmsMax"
                          type="number"
                          min="0"
                          placeholder="To"
                          aria-label="Kilometres to"
                          class="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="rounded-lg border border-default bg-elevated/30 p-4">
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <UIcon name="i-lucide-file-spreadsheet" class="size-4 text-primary" />
                        <h3 class="text-sm font-semibold text-highlighted">
                          Campaign stock list
                        </h3>
                      </div>
                      <UBadge color="neutral" variant="subtle">
                        {{ formatCount(stockRefCount) }} refs
                      </UBadge>
                    </div>

                    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[14rem_minmax(0,1fr)_auto]">
                      <UFormField label="Mode">
                        <USelect
                          v-model="feedForm.stockListMode"
                          :items="stockListModeOptions"
                          value-key="value"
                          class="w-full"
                        />
                      </UFormField>
                      <UFormField label="Stock, VIN or vehicle IDs">
                        <UTextarea
                          v-model="feedForm.stockRefsText"
                          placeholder="BH123, VIN123456789"
                          :rows="3"
                          :disabled="feedForm.stockListMode === 'off'"
                          class="w-full"
                        />
                      </UFormField>
                      <div class="flex items-end">
                        <input
                          ref="stockListFileInput"
                          type="file"
                          accept=".csv,text/csv"
                          class="hidden"
                          @change="handleStockListFile"
                        >
                        <UButton
                          icon="i-lucide-upload"
                          color="neutral"
                          variant="outline"
                          class="w-full justify-center lg:w-auto"
                          @click="stockListFileInput?.click()"
                        >
                          Upload CSV
                        </UButton>
                      </div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div class="rounded-lg border border-default bg-elevated/30 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                          <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-primary" />
                          <h3 class="text-sm font-semibold text-highlighted">
                            Active filters
                          </h3>
                        </div>
                        <UButton
                          v-if="activeFilterChips.length"
                          icon="i-lucide-x"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          @click="clearFeedFilters"
                        >
                          Clear
                        </UButton>
                      </div>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <UBadge
                          color="success"
                          variant="subtle"
                          icon="i-lucide-lock"
                        >
                          Saleable inventory only
                        </UBadge>
                        <UBadge
                          v-for="chip in activeFilterChips"
                          :key="chip"
                          color="neutral"
                          variant="subtle"
                        >
                          {{ chip }}
                        </UBadge>
                        <UBadge
                          v-if="!activeFilterChips.length"
                          color="neutral"
                          variant="subtle"
                        >
                          No campaign filter
                        </UBadge>
                      </div>
                    </div>

                    <div class="rounded-lg border border-default bg-elevated/30 p-4">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
                            <h3 class="text-sm font-semibold text-highlighted">
                              Catalog readiness
                            </h3>
                          </div>
                          <div class="mt-2 flex items-end gap-2">
                            <p class="text-2xl font-semibold text-highlighted">
                              {{ draftPreviewPending && !draftPreview ? '...' : formatCount(draftPreview?.readiness?.validatedTotal ?? draftPreview?.total ?? 0) }}
                            </p>
                            <p class="pb-1 text-xs text-muted">
                              feed-ready
                            </p>
                          </div>
                        </div>
                        <div class="flex items-center gap-1">
                          <UBadge
                            :color="readinessStatusColor(draftPreview?.readiness?.status)"
                            variant="subtle"
                            size="xs"
                          >
                            {{ readinessStatusLabel(draftPreview?.readiness?.status) }}
                          </UBadge>
                          <UButton
                            icon="i-lucide-refresh-cw"
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            :loading="draftPreviewPending"
                            @click="loadDraftPreview"
                          />
                        </div>
                      </div>

                      <UAlert
                        v-if="draftPreviewError"
                        icon="i-lucide-alert-circle"
                        color="error"
                        variant="subtle"
                        title="Readiness failed"
                        :description="draftPreviewError"
                        class="mt-3"
                      />

                      <template v-else>
                        <div class="mt-3">
                          <div class="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              class="h-full rounded-full bg-primary transition-all"
                              :style="{ width: `${readinessPercent(draftPreview?.readiness)}%` }"
                            />
                          </div>
                          <p class="mt-2 text-sm font-medium text-highlighted">
                            {{ readinessTitle(draftPreview?.readiness, feedForm.platform) }}
                          </p>
                          <p class="mt-1 text-xs text-muted">
                            {{ readinessDescription(draftPreview?.readiness) }}
                          </p>
                        </div>

                        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                          <div class="rounded-md border border-default bg-default px-2 py-2">
                            <p class="text-sm font-semibold text-highlighted">
                              {{ formatCount(draftPreview?.readiness?.matchedTotal ?? draftPreview?.total ?? 0) }}
                            </p>
                            <p class="text-[11px] text-muted">
                              matched
                            </p>
                          </div>
                          <div class="rounded-md border border-default bg-default px-2 py-2">
                            <p class="text-sm font-semibold text-success">
                              {{ formatCount(draftPreview?.readiness?.validatedTotal ?? 0) }}
                            </p>
                            <p class="text-[11px] text-muted">
                              valid
                            </p>
                          </div>
                          <div class="rounded-md border border-default bg-default px-2 py-2">
                            <p class="text-sm font-semibold text-warning">
                              {{ formatCount(draftPreview?.readiness?.invalidTotal ?? 0) }}
                            </p>
                            <p class="text-[11px] text-muted">
                              blocked
                            </p>
                          </div>
                        </div>

                        <div
                          v-if="readinessIssueGroups(draftPreview?.readiness).length"
                          class="mt-3 space-y-2"
                        >
                          <div
                            v-for="group in readinessIssueGroups(draftPreview?.readiness)"
                            :key="group.key"
                            class="rounded-md border border-default bg-default px-3 py-2"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <p class="text-xs font-medium text-highlighted">
                                {{ group.label }}
                              </p>
                              <UBadge
                                :color="fixModeColor(group.fixMode)"
                                variant="subtle"
                                size="xs"
                              >
                                {{ fixModeLabel(group.fixMode) }}
                              </UBadge>
                            </div>
                            <p class="mt-1 text-xs text-muted">
                              {{ formatCount(group.count) }} issue{{ group.count === 1 ? '' : 's' }}. {{ fixModeDescription(group.fixMode) }}
                            </p>
                          </div>
                        </div>

                        <div
                          v-if="draftPreview?.items.length"
                          class="mt-3 space-y-2"
                        >
                          <p class="text-xs font-medium text-muted">
                            Sample vehicles
                          </p>
                          <div
                            v-for="vehicle in draftPreview.items.slice(0, 3)"
                            :key="vehicle.id"
                            class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-default px-2 py-2"
                          >
                            <div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                              <img
                                v-if="vehicle.image"
                                :src="vehicle.image"
                                :alt="[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')"
                                class="h-full w-full object-cover"
                              >
                              <UIcon
                                v-else
                                name="i-lucide-car"
                                class="size-4 text-muted"
                              />
                            </div>
                            <div class="min-w-0">
                              <p class="truncate text-xs font-medium text-highlighted">
                                {{ [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id }}
                              </p>
                              <p class="truncate text-xs text-muted">
                                {{ vehicle.stockNumber || vehicle.condition || 'Vehicle' }}
                              </p>
                            </div>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>

                  <div class="rounded-lg border border-default bg-elevated/30 p-4">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <UIcon name="i-lucide-list-checks" class="size-4 text-primary" />
                          <h3 class="text-sm font-semibold text-highlighted">
                            Workflow checkpoint
                          </h3>
                          <UBadge
                            :color="feedWorkbookStatusColor"
                            variant="subtle"
                            size="xs"
                          >
                            {{ feedWorkbookStatusLabel }}
                          </UBadge>
                        </div>
                        <p class="mt-1 text-sm font-medium text-highlighted">
                          {{ feedWorkbookCheckpointTitle }}
                        </p>
                        <p class="mt-1 max-w-3xl text-sm text-muted">
                          {{ feedWorkbookCheckpointDescription }}
                        </p>
                      </div>
                      <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <UButton
                          icon="i-lucide-copy"
                          color="neutral"
                          variant="outline"
                          :disabled="!selectedClientOption"
                          class="w-full justify-center sm:w-auto"
                          @click="copyDealerFeedHandoff"
                        >
                          Copy handoff
                        </UButton>
                        <UButton
                          :icon="feedWorkbookButtonIcon"
                          color="neutral"
                          variant="outline"
                          :disabled="!selectedClientOption || feedWorkbookPending || feedWorkbookProjectPending"
                          :loading="startingFeedWorkbook || feedWorkbookProjectPending"
                          class="w-full justify-center sm:w-auto"
                          @click="startFeedWorkbook"
                        >
                          {{ feedWorkbookButtonLabel }}
                        </UButton>
                      </div>
                    </div>

                    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div
                        v-for="item in feedBuildCheckpointItems"
                        :key="item.label"
                        class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-default px-3 py-2"
                      >
                        <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
                        <span class="truncate text-xs font-medium text-muted">
                          {{ item.label }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <UButton
                      icon="i-lucide-plus"
                      color="primary"
                      class="w-full justify-center sm:w-auto"
                      :loading="savingFeed"
                      :disabled="!feedForm.name.trim()"
                      @click="createFeed"
                    >
                      Create feed
                    </UButton>
                  </div>
                </div>

                <UAlert
                  v-if="feedsError"
                  icon="i-lucide-alert-circle"
                  color="error"
                  variant="subtle"
                  title="Feeds could not be loaded"
                  :description="feedsError"
                  class="m-5"
                />

                <div v-if="feedsPending" class="flex min-h-40 items-center justify-center">
                  <XfLoader />
                </div>

                <UEmpty
                  v-else-if="feedRows.length === 0 && !feedsError"
                  icon="i-lucide-rss"
                  title="No feeds returned"
                  description="Create a Google or Facebook feed to send the selected client inventory into social-dashboard."
                  class="py-12"
                />

                <UTable
                  v-else-if="feedRows.length > 0"
                  :data="feedRows"
                  :columns="feedColumns"
                >
                  <template #name-cell="{ row }">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-highlighted">
                        {{ row.original.name || row.original.id }}
                      </p>
                      <p class="truncate text-xs text-muted">
                        {{ row.original.id }}
                      </p>
                    </div>
                  </template>

                  <template #platform-cell="{ row }">
                    <UBadge
                      :icon="row.original.platform === 'google' ? 'i-lucide-search' : 'i-lucide-facebook'"
                      color="neutral"
                      variant="subtle"
                    >
                      {{ row.original.platform === 'google' ? 'Google' : 'Facebook' }}
                    </UBadge>
                  </template>

                  <template #id-cell="{ row }">
                    <code class="text-xs">{{ row.original.id }}</code>
                  </template>

                  <template #isActive-cell="{ row }">
                    <UBadge
                      :color="row.original.isActive ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ row.original.isActive ? 'Active' : 'Inactive' }}
                    </UBadge>
                  </template>

                  <template #actions-cell="{ row }">
                    <div class="flex justify-end gap-1">
                      <UTooltip text="Preview vehicles">
                        <UButton
                          icon="i-lucide-eye"
                          variant="ghost"
                          color="neutral"
                          size="xs"
                          :loading="previewPendingFeedId === row.original.id"
                          @click="previewFeed(row.original)"
                        />
                      </UTooltip>
                      <UTooltip text="Copy live feed URL">
                        <UButton
                          icon="i-lucide-link"
                          variant="ghost"
                          color="neutral"
                          size="xs"
                          aria-label="Get live feed URL"
                          :loading="generatingFeedKey === row.original.id"
                          @click="shareFeed(row.original)"
                        />
                      </UTooltip>
                    </div>
                  </template>
                </UTable>

                <div
                  v-if="generatedFeedUrl"
                  class="border-t border-default p-5"
                >
                  <div class="rounded-lg border border-default bg-elevated/40 p-4">
                    <div class="flex flex-col gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-highlighted">
                          Live XML feed URL
                        </p>
                        <p class="mt-1 text-sm text-muted">
                          {{ generatedFeedMeta?.feedName }} · copy this URL into Google, Meta, or a browser preview.
                        </p>
                      </div>
                      <div class="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <input
                          ref="generatedFeedUrlInput"
                          :value="generatedFeedUrl"
                          readonly
                          aria-label="Live XML feed URL"
                          class="min-h-10 w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-xs text-highlighted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          @focus="event => (event.target as HTMLInputElement).select()"
                          @click="event => (event.target as HTMLInputElement).select()"
                        >
                        <UButton
                          icon="i-lucide-copy"
                          color="neutral"
                          variant="outline"
                          class="justify-center"
                          @click="copyGeneratedUrl(generatedFeedUrl)"
                        >
                          Copy
                        </UButton>
                        <UButton
                          icon="i-lucide-external-link"
                          color="neutral"
                          variant="ghost"
                          class="justify-center"
                          :to="generatedFeedUrl"
                          target="_blank"
                        >
                          Open
                        </UButton>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="feedPreview"
                  class="border-t border-default p-5"
                >
                  <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 class="text-sm font-semibold text-highlighted">
                        Preview: {{ feedPreview.feed.name || feedPreview.feed.id }}
                      </h3>
                      <p class="text-sm text-muted">
                        {{ previewCountLabel(feedPreview) }}
                      </p>
                    </div>
                    <UBadge color="neutral" variant="subtle">
                      {{ feedPlatformLabel(feedPreview.feed.platform) }}
                    </UBadge>
                  </div>

                  <div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <UInput
                      v-model="feedPreviewSearch"
                      icon="i-lucide-search"
                      placeholder="Search title, condition, stock number, kilometres"
                      class="w-full"
                      @keyup.enter="previewFeed(feedPreview.feed)"
                    />
                    <UButton
                      icon="i-lucide-search"
                      color="neutral"
                      variant="outline"
                      :loading="previewPendingFeedId === feedPreview.feed.id"
                      @click="previewFeed(feedPreview.feed)"
                    >
                      Search
                    </UButton>
                  </div>

                  <UAlert
                    v-if="hasPreviewValidationWarning(feedPreview)"
                    icon="i-lucide-triangle-alert"
                    color="warning"
                    variant="subtle"
                    :title="validationWarningTitle(feedPreview)"
                    :description="validationWarningDescription(feedPreview)"
                    class="mb-4"
                  />

                  <div
                    v-if="visibleValidationSummaries(feedPreview.validation).length"
                    class="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-3"
                  >
                    <div class="mb-2 flex items-center gap-2">
                      <UIcon name="i-lucide-list-warning" class="size-4 text-warning" />
                      <p class="text-xs font-semibold uppercase text-warning">
                        First validation issues
                      </p>
                    </div>
                    <ul class="space-y-2 text-sm">
                      <li
                        v-for="summary in visibleValidationSummaries(feedPreview.validation)"
                        :key="`${summary.id || 'vehicle'}-${validationSummaryIssues(summary)}`"
                        class="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]"
                      >
                        <span class="truncate font-mono text-xs text-muted">
                          {{ summary.id || 'Vehicle' }}
                        </span>
                        <span class="text-default">
                          {{ validationSummaryIssues(summary) }}
                        </span>
                      </li>
                    </ul>
                    <p
                      v-if="hiddenValidationSummaryCount(feedPreview.validation)"
                      class="mt-2 text-xs text-muted"
                    >
                      {{ hiddenValidationSummaryCount(feedPreview.validation) }} more issue summaries returned by the feed platform.
                    </p>
                  </div>

                  <div
                    v-if="feedPreview.items.length === 0"
                    class="rounded-lg border border-default bg-elevated/40 px-4 py-6 text-center text-sm text-muted"
                  >
                    {{ emptyPreviewMessage(feedPreview) }}
                  </div>

                  <div
                    v-else
                    class="max-h-[min(42rem,calc(100vh-18rem))] overflow-y-auto pr-1"
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      <article
                        v-for="vehicle in feedPreview.items"
                        :key="vehicle.id"
                        class="overflow-hidden rounded-lg border border-default bg-elevated/40"
                      >
                        <div class="flex gap-3 p-3">
                          <div class="h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                            <img
                              v-if="vehicle.image"
                              :src="vehicle.image"
                              :alt="[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')"
                              class="h-full w-full object-cover"
                            >
                            <div
                              v-else
                              class="flex h-full w-full items-center justify-center"
                            >
                              <UIcon name="i-lucide-car" class="size-6 text-muted" />
                            </div>
                          </div>
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-highlighted">
                              {{ [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id }}
                            </p>
                            <p class="mt-1 text-xs text-muted">
                              {{ vehicle.stockNumber || 'No stock number' }}
                            </p>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                              <p class="text-sm font-medium text-highlighted">
                                {{ vehicle.price == null ? 'Price unavailable' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(vehicle.price) }}
                              </p>
                              <UBadge
                                v-if="vehicle.condition"
                                color="neutral"
                                variant="subtle"
                                size="xs"
                              >
                                {{ vehicle.condition }}
                              </UBadge>
                            </div>
                            <UButton
                              v-if="vehicle.url"
                              icon="i-lucide-external-link"
                              variant="link"
                              color="primary"
                              size="xs"
                              class="mt-1 px-0"
                              :to="vehicle.url"
                              target="_blank"
                            >
                              Listing
                            </UButton>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <DealerFeedsMetaCatalogManager />
          </section>
        </div>
      </div>
    </div>
  </UDashboardPanel>
</template>
