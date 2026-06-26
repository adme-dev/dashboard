<script setup lang="ts">
import { reactive, watch } from 'vue'

definePageMeta({ middleware: ['role-admin'] })

type ModelMapRow = {
  featureKey: string
  label: string
  surface: string
  owner: string
  provider: string
  modelId: string
  fallback: string | null
  modality: 'text' | 'vision' | 'audio' | 'video' | 'multimodal'
  riskTier: 'low' | 'medium' | 'high'
  sourceFile: string
  status: 'production' | 'preview' | 'deprecated' | 'unknown'
  pricing: {
    inputPricePerMillionUsd?: number
    outputPricePerMillionUsd?: number
    unitPriceCents?: number
    unitName?: string
  } | null
  warnings: string[]
  defaultProvider: string
  defaultModelId: string
  defaultFallback: string | null
  assignedProvider: string
  assignedModelId: string
  assignedFallback: string | null
  assignmentSource: 'default' | 'override'
  assignmentEditable: boolean
  assignmentNotes: string | null
  assignmentUpdatedBy: string | null
  assignmentUpdatedAt: string | null
  runtimeRoutingStatus: 'runtime_routed' | 'partial' | 'worker_side' | 'direct'
  runtimeRoutingLabel: string
  runtimeControlEnabled: boolean
  runtimeSupportedProviders: Array<'groq' | 'anthropic' | 'workers_ai' | 'minimax' | 'aigateway'>
  runtimeNotes: string | null
}

type ModelMapResponse = {
  rows: ModelMapRow[]
  summary: {
    totalRows: number
    providers: string[]
    highRiskCount: number
    warningCount: number
    overrideCount: number
    editableCount: number
    blockedDuplicateCount: number
    runtimeRoutedCount: number
    runtimePartialCount: number
    runtimeWorkerSideCount: number
    runtimeDirectCount: number
    runtimeControllableCount: number
  }
  config: {
    gateway: {
      configured: boolean
      host: string | null
      authTokenConfigured: boolean
    }
    providers: Array<{
      key: string
      label: string
      configured: boolean
      requiredFor: string
    }>
    loop: {
      toolsEnabled: boolean
      model: string
      fallbackModel: string
      budgetUsd: number
      advisorBackend: string
    }
    orchestrator: {
      internalApiKeyConfigured: boolean
      workerConfigured: boolean
      workerHost: string | null
      manualCheckReady: boolean
      readToolCount: number
    }
    platformAgents: {
      internalApiKeyConfigured: boolean
      workerConfigured: boolean
      workerHost: string | null
      bridgeReady: boolean
      enabledFlagCount: number
      totalFlagCount: number
      flags: Array<{
        key: string
        label: string
        enabled: boolean
      }>
      modes: Array<{
        agent: string
        mode: string
      }>
    }
  }
  assignments: {
    available: boolean
    reason: string | null
    catalog: Array<{
      provider: string
      modelId: string
      status: string
      pricing: ModelMapRow['pricing']
      warnings: string[]
    }>
  }
}

type CloudflareCatalogModel = {
  id: string
  label: string
  modelId: string
  provider: ModelMapRow['runtimeSupportedProviders'][number]
  providerLabel: string
  task: string
  taskLabel: string
  modality: string
  author: string | null
  capabilities: string[]
  source: 'cloudflare_hosted' | 'third_party' | 'local_registry' | 'unknown'
  status: string
  description: string | null
  assignable: boolean
  recommendation: {
    level: 'recommended' | 'compatible' | 'incompatible'
    score: number
    reasons: string[]
    blockers: string[]
  }
}

type CloudflareCatalogResponse = {
  available: boolean
  configured: boolean
  credentialSource: {
    accountId: 'CLOUDFLARE_ACCOUNT_ID' | 'R2_ACCOUNT_ID' | null
    token: 'CLOUDFLARE_API_TOKEN' | 'CF_API_TOKEN' | 'CLOUDFLARE_API_KEY' | null
  }
  source: 'cloudflare_api' | 'local_registry'
  reason: string | null
  fetchedAt: string
  feature: {
    featureKey: string
    label: string
    modality: string
    riskTier: string
    runtimeSupportedProviders: string[]
  } | null
  summary: {
    totalModels: number
    filteredModels: number
    assignableModels: number
    recommendedModels: number
    providers: string[]
    tasks: string[]
    capabilities: string[]
  }
  models: CloudflareCatalogModel[]
}

type ModelOpsCopilotResponse = {
  mode: 'read_only'
  answer: string
  findings: Array<{
    severity: 'critical' | 'warning' | 'info'
    title: string
    detail: string
    featureKey?: string
  }>
  recommendedActions: string[]
  proposedAssignment: {
    featureKey: string
    provider: string
    modelId: string
    fallbackModelId: string | null
    notes: string
    rationale: string[]
  } | null
  context: {
    runtimeControllableCount: number
    overrideCount: number
    catalogSource: 'cloudflare_api' | 'local_registry'
    catalogAvailable: boolean
    telemetryAvailable: boolean
    fallbackRate: number
    errorRate: number
    gatewayRate: number
  }
}

type InvocationBreakdown = {
  key: string
  invocations: number
  estimatedCostUsd: number
  totalTokens: number
  fallbackCount: number
  errorCount: number
}

type RecentInvocation = {
  id: string
  featureKey: string
  provider: string
  modelId: string
  gatewayUsed: boolean
  fallbackUsed: boolean
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  status: string
  errorCode: string | null
  latencyMs: number
  createdAt: string
}

type LegacyMessageUsage = {
  available: boolean
  turns: number
  estimatedCostUsd: number
  totalTokens: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

type InvocationResponse = {
  available: boolean
  reason: string | null
  health: {
    tableReady: boolean
    totalRows: number
    oldestRowAt: string | null
    newestRowAt: string | null
    requestRows: number
    runtimeRows: number
    completionRows: number
    distinctFeatures: number
    distinctModels: number
    hasRequestTelemetry: boolean
    hasRuntimeTelemetry: boolean
    hasCompletionTelemetry: boolean
  }
  coverage: {
    mappedFeatureCount: number
    seenMappedFeatureCount: number
    unmappedSeenFeatureCount: number
    missingMappedFeatureKeys: string[]
    unmappedSeenFeatureKeys: string[]
    coverageRate: number
  }
  summary: {
    totalInvocations: number
    successCount: number
    errorCount: number
    gatewayCount: number
    fallbackCount: number
    totalTokens: number
    estimatedCostUsd: number
    avgLatencyMs: number
    firstSeenAt: string | null
    lastSeenAt: string | null
    fallbackRate: number
    errorRate: number
    gatewayRate: number
  }
  byFeature: InvocationBreakdown[]
  byModel: InvocationBreakdown[]
  legacyMessages: LegacyMessageUsage
  recent: RecentInvocation[]
}

type GraphifyRepoStatus =
  | 'ready'
  | 'stale'
  | 'missing_path'
  | 'missing_artifact'
  | 'r2_unconfigured'
  | 'error'

type GraphifyRepo = {
  id: string
  repoUrl: string
  provider: string
  defaultBranch: string
  board: {
    id: string
    name: string
    slug: string | null
  }
  graphifyPath: string | null
  graphifyLastSyncedAt: string | null
  repoUpdatedAt: string | null
  nodeCount: number
  edgeCount: number
  hyperedgeCount: number
  reportChars: number
  status: GraphifyRepoStatus
  reason: string | null
}

type GraphifyResponse = {
  available: boolean
  reason: string | null
  r2Configured: boolean
  staleAfterDays: number
  summary: {
    totalRepos: number
    configuredRepos: number
    readyRepos: number
    staleRepos: number
    issueRepos: number
    totalNodes: number
    totalEdges: number
    statusCounts: Record<GraphifyRepoStatus, number>
  }
  repos: GraphifyRepo[]
}

type AgentRun = {
  id: string
  runType: string
  status: string
  statusBucket: 'completed' | 'failed' | 'running' | 'other'
  startedAt: string | null
  completedAt: string | null
  durationMs: number
  checksPerformed: number
  findingsCount: number
  notificationsSent: number
  reportCount: number
  unreadReportCount: number
  errorCount: number
  source: string | null
  agentType: string | null
  featureKey: string | null
  proposedActionCount: number
  blockedActionCount: number
  proposalDecisionCounts: {
    accepted: number
    rejected: number
    edited: number
    ignored: number
  }
  summary: Record<string, unknown>
  createdAt: string
}

type AgentRunsResponse = {
  available: boolean
  reason: string | null
  summary: {
    totalRuns: number
    completedRuns: number
    failedRuns: number
    runningRuns: number
    orchestratorReadToolRuns: number
    orchestratorReadToolFailures: number
    platformAgentRuns: number
    platformAgentFailures: number
    platformAgentProposedActions: number
    platformAgentBlockedActions: number
    platformAgentAcceptedProposals: number
    platformAgentRejectedProposals: number
    platformAgentEditedProposals: number
    platformAgentIgnoredProposals: number
    totalReports: number
    totalFindings: number
    totalNotifications: number
    avgDurationMs: number
    lastRunAt: string | null
    failureRate: number
  }
  recent: AgentRun[]
}

type OrchestratorCheckResponse = {
  ok: boolean
  mode: string
  summary: {
    totalTools: number
    successfulTools: number
    failedTools: number
    readOnly: boolean
  }
  results: Array<{
    tool: string
    ok: boolean
    error?: string
  }>
}

type AssignmentDraft = {
  provider: string
  modelId: string
  fallbackModelId: string
  notes: string
}

const ALL_MODEL_PICKER_FILTERS = '__all__'
const NO_FALLBACK_MODEL = '__none__'
const COPILOT_ALL_FEATURES = '__overview__'
const MODEL_MAP_ALL_FILTERS = '__all__'
const copilotPromptPresets = [
  {
    label: 'Safe next change',
    prompt: 'Review Model Ops and recommend the next safest model assignment change.',
  },
  {
    label: 'High-risk defaults',
    prompt: 'Which runtime-routed high-risk features need explicit owner-reviewed assignments?',
  },
  {
    label: 'Telemetry blockers',
    prompt: 'Check telemetry health and tell me if fallback or error rates should block model changes.',
  },
  {
    label: 'Cloud-first pick',
    prompt: 'Recommend a cloud-first Workers AI model for the selected feature.',
  },
]

const { data, pending, error, refresh } = await useFetch<ModelMapResponse>('/api/admin/ai/model-ops/model-map')
const {
  data: invocationData,
  pending: invocationsPending,
  error: invocationsError,
  refresh: refreshInvocations
} = await useFetch<InvocationResponse>('/api/admin/ai/model-ops/invocations')
const {
  data: graphifyData,
  pending: graphifyPending,
  error: graphifyError,
  refresh: refreshGraphify
} = await useFetch<GraphifyResponse>('/api/admin/ai/model-ops/graphify')
const {
  data: agentRunsData,
  pending: agentRunsPending,
  error: agentRunsError,
  refresh: refreshAgentRuns
} = await useFetch<AgentRunsResponse>('/api/admin/ai/model-ops/agent-runs')

const orchestratorCheckPending = ref(false)
const orchestratorCheckError = ref<string | null>(null)
const orchestratorCheckResult = ref<OrchestratorCheckResponse | null>(null)
const assignmentDrafts = reactive<Record<string, AssignmentDraft>>({})
const assignmentSaving = reactive<Record<string, boolean>>({})
const assignmentError = ref<string | null>(null)
const assignmentSuccess = ref<string | null>(null)
const modelPickerOpen = ref(false)
const modelPickerRow = ref<ModelMapRow | null>(null)
const modelPickerPending = ref(false)
const modelPickerError = ref<string | null>(null)
const modelPickerData = ref<CloudflareCatalogResponse | null>(null)
const modelPickerSearch = ref('')
const modelPickerProvider = ref(ALL_MODEL_PICKER_FILTERS)
const modelPickerTask = ref(ALL_MODEL_PICKER_FILTERS)
const modelPickerCapability = ref(ALL_MODEL_PICKER_FILTERS)
const copilotPrompt = ref('Review Model Ops and recommend the next safest model assignment change.')
const copilotFeatureKey = ref(COPILOT_ALL_FEATURES)
const copilotPending = ref(false)
const copilotError = ref<string | null>(null)
const copilotResult = ref<ModelOpsCopilotResponse | null>(null)
const modelMapSearch = ref('')
const modelMapRuntimeFilter = ref(MODEL_MAP_ALL_FILTERS)
const modelMapProviderFilter = ref(MODEL_MAP_ALL_FILTERS)
const modelMapRiskFilter = ref(MODEL_MAP_ALL_FILTERS)

const orchestratorManualCheckReady = computed(() => Boolean(data.value?.config.orchestrator.manualCheckReady))
const orchestratorReadCheckDisabled = computed(() => orchestratorCheckPending.value || !orchestratorManualCheckReady.value)
const orchestratorReadCheckUnavailableMessage = 'Set INTERNAL_API_KEY to enable manual read checks.'

const cards = computed(() => {
  const summary = data.value?.summary
  return [
    { label: 'Mapped rows', value: summary?.totalRows ?? 0, icon: 'i-lucide-table-properties' },
    { label: 'Providers', value: summary?.providers.length ?? 0, icon: 'i-lucide-network' },
    { label: 'High risk', value: summary?.highRiskCount ?? 0, icon: 'i-lucide-triangle-alert' },
    { label: 'Warnings', value: summary?.warningCount ?? 0, icon: 'i-lucide-badge-alert' },
  ]
})

const invocationCards = computed(() => {
  const summary = invocationData.value?.summary
  return [
    { label: 'Calls (30d)', value: (summary?.totalInvocations ?? 0).toLocaleString(), icon: 'i-lucide-activity' },
    { label: 'Cost (30d)', value: money(summary?.estimatedCostUsd ?? 0), icon: 'i-lucide-dollar-sign' },
    { label: 'Tokens (30d)', value: (summary?.totalTokens ?? 0).toLocaleString(), icon: 'i-lucide-cpu' },
    { label: 'Avg latency', value: `${summary?.avgLatencyMs ?? 0}ms`, icon: 'i-lucide-timer' },
  ]
})

const ledgerHealthItems = computed(() => {
  const health = invocationData.value?.health
  return [
    {
      label: 'Ledger table',
      value: health?.tableReady ? 'Ready' : 'Missing',
      active: Boolean(health?.tableReady),
    },
    {
      label: 'Request rows',
      value: (health?.requestRows ?? 0).toLocaleString(),
      active: Boolean(health?.hasRequestTelemetry),
    },
    {
      label: 'Runtime rows',
      value: (health?.runtimeRows ?? 0).toLocaleString(),
      active: Boolean(health?.hasRuntimeTelemetry),
    },
    {
      label: 'Completion rows',
      value: (health?.completionRows ?? 0).toLocaleString(),
      active: Boolean(health?.hasCompletionTelemetry),
    },
  ]
})

const missingTelemetryPreview = computed(() => invocationData.value?.coverage.missingMappedFeatureKeys.slice(0, 8) ?? [])

const configProviderItems = computed(() => data.value?.config.providers ?? [])

const assignmentBriefCards = computed(() => {
  const summary = data.value?.summary
  return [
    { label: 'Runtime controlled', value: (summary?.runtimeControllableCount ?? 0).toLocaleString(), icon: 'i-lucide-route' },
    { label: 'Overrides', value: (summary?.overrideCount ?? 0).toLocaleString(), icon: 'i-lucide-git-compare-arrows' },
    { label: 'Worker-side rollout', value: (summary?.runtimeWorkerSideCount ?? 0).toLocaleString(), icon: 'i-lucide-cloud-cog' },
    { label: 'High-risk surfaces', value: (summary?.highRiskCount ?? 0).toLocaleString(), icon: 'i-lucide-shield-alert' },
  ]
})

const runtimeBriefCards = computed(() => {
  const summary = data.value?.summary
  return [
    { label: 'Runtime routed', value: (summary?.runtimeRoutedCount ?? 0).toLocaleString(), icon: 'i-lucide-circle-check' },
    { label: 'Partial', value: (summary?.runtimePartialCount ?? 0).toLocaleString(), icon: 'i-lucide-circle-dashed' },
    { label: 'Direct', value: (summary?.runtimeDirectCount ?? 0).toLocaleString(), icon: 'i-lucide-unplug' },
    { label: 'Blocked duplicates', value: (summary?.blockedDuplicateCount ?? 0).toLocaleString(), icon: 'i-lucide-copy-x' },
  ]
})

const modelPickerProviderOptions = computed(() => [
  { label: 'All providers', value: ALL_MODEL_PICKER_FILTERS },
  ...(modelPickerData.value?.summary.providers ?? []).map(provider => ({ label: provider, value: provider }))
])

const modelPickerTaskOptions = computed(() => [
  { label: 'All tasks', value: ALL_MODEL_PICKER_FILTERS },
  ...(modelPickerData.value?.summary.tasks ?? []).map(task => ({ label: task.replace(/_/g, ' '), value: task }))
])

const modelPickerCapabilityOptions = computed(() => [
  { label: 'All capabilities', value: ALL_MODEL_PICKER_FILTERS },
  ...(modelPickerData.value?.summary.capabilities ?? []).map(capability => ({ label: capability.replace(/_/g, ' '), value: capability }))
])

const copilotFeatureOptions = computed(() => [
  { label: 'Whole dashboard', value: COPILOT_ALL_FEATURES },
  ...(data.value?.rows ?? [])
    .filter(row => row.assignmentEditable)
    .map(row => ({ label: `${row.label} (${row.featureKey})`, value: row.featureKey }))
])

const modelMapRuntimeFilterOptions = computed(() => [
  { label: 'All runtime states', value: MODEL_MAP_ALL_FILTERS },
  ...Array.from(new Set((data.value?.rows ?? []).map(row => row.runtimeRoutingStatus)))
    .sort()
    .map(status => ({ label: status.replace(/_/g, ' '), value: status }))
])

const modelMapProviderFilterOptions = computed(() => [
  { label: 'All providers', value: MODEL_MAP_ALL_FILTERS },
  ...Array.from(new Set((data.value?.rows ?? []).map(row => row.provider)))
    .filter(Boolean)
    .sort()
    .map(provider => ({ label: provider, value: provider }))
])

const modelMapRiskFilterOptions = computed(() => [
  { label: 'All risk tiers', value: MODEL_MAP_ALL_FILTERS },
  ...Array.from(new Set((data.value?.rows ?? []).map(row => row.riskTier)))
    .sort()
    .map(risk => ({ label: risk, value: risk }))
])

const filteredModelMapRows = computed(() => {
  const search = modelMapSearch.value.trim().toLowerCase()
  return (data.value?.rows ?? []).filter((row) => {
    if (modelMapRuntimeFilter.value !== MODEL_MAP_ALL_FILTERS && row.runtimeRoutingStatus !== modelMapRuntimeFilter.value) return false
    if (modelMapProviderFilter.value !== MODEL_MAP_ALL_FILTERS && row.provider !== modelMapProviderFilter.value) return false
    if (modelMapRiskFilter.value !== MODEL_MAP_ALL_FILTERS && row.riskTier !== modelMapRiskFilter.value) return false
    if (!search) return true
    return [
      row.label,
      row.featureKey,
      row.surface,
      row.owner,
      row.provider,
      row.modelId,
      row.fallback,
      row.defaultModelId,
      row.sourceFile,
      row.runtimeRoutingLabel,
      row.warnings.join(' '),
    ].filter(Boolean).join(' ').toLowerCase().includes(search)
  })
})

const graphifyCards = computed(() => {
  const summary = graphifyData.value?.summary
  return [
    { label: 'Repos', value: (summary?.totalRepos ?? 0).toLocaleString(), icon: 'i-lucide-git-branch' },
    { label: 'Ready', value: (summary?.readyRepos ?? 0).toLocaleString(), icon: 'i-lucide-circle-check' },
    { label: 'Issues', value: (summary?.issueRepos ?? 0).toLocaleString(), icon: 'i-lucide-triangle-alert' },
    { label: 'Graph nodes', value: (summary?.totalNodes ?? 0).toLocaleString(), icon: 'i-lucide-waypoints' },
  ]
})

const agentRunCards = computed(() => {
  const summary = agentRunsData.value?.summary
  return [
    { label: 'Runs (30d)', value: (summary?.totalRuns ?? 0).toLocaleString(), icon: 'i-lucide-bot' },
    { label: 'Platform agents', value: (summary?.platformAgentRuns ?? 0).toLocaleString(), icon: 'i-lucide-brain-circuit' },
    { label: 'Proposals', value: (summary?.platformAgentProposedActions ?? 0).toLocaleString(), icon: 'i-lucide-file-plus-2' },
    { label: 'Avg duration', value: durationLabel(summary?.avgDurationMs ?? 0), icon: 'i-lucide-timer' },
  ]
})

const latestPlatformAgentRuns = computed(() => {
  const latest = new Map<string, AgentRun>()
  for (const run of agentRunsData.value?.recent ?? []) {
    if (run.source !== 'platform_agent' || !run.agentType) continue
    if (!latest.has(run.agentType)) latest.set(run.agentType, run)
  }
  return latest
})

const platformAgentHealthRows = computed(() => {
  const modeLabels: Record<string, string> = {
    spend_controller: 'Read-only + proposal drafts',
    publishing_planner: 'Read-only + draft suggestions',
    financial_watch: 'Read-only',
    traffic_controller: 'Read-only',
  }
  const featureLabels: Record<string, string> = {
    spend_controller: 'Spend Controller',
    publishing_planner: 'Publishing Planner',
    financial_watch: 'Financial Watch',
    traffic_controller: 'Traffic Controller',
  }
  return Object.entries(featureLabels).map(([agentType, label]) => ({
    agentType,
    label,
    mode: modeLabels[agentType],
    lastRun: latestPlatformAgentRuns.value.get(agentType) ?? null,
  }))
})

function pricingLabel(row: ModelMapRow) {
  if (!row.pricing) return 'Unknown'
  if (row.pricing.unitPriceCents != null) {
    return `${row.pricing.unitPriceCents}c/${row.pricing.unitName || 'unit'}`
  }
  const input = row.pricing.inputPricePerMillionUsd
  const output = row.pricing.outputPricePerMillionUsd
  if (input != null || output != null) {
    return `$${(input ?? 0).toFixed(2)} / $${(output ?? 0).toFixed(2)} per 1M`
  }
  return 'Unknown'
}

function money(value: number) {
  if (value < 0.01 && value > 0) return `$${value.toFixed(5)}`
  return `$${value.toFixed(2)}`
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function dateLabel(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(+date) ? value : date.toLocaleString()
}

function durationLabel(value: number) {
  if (!value) return '0ms'
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 60_000)}m`
}

function agentRunLabel(run: AgentRun | null) {
  if (!run) return 'No run yet'
  return `${run.status} / ${dateLabel(run.startedAt || run.createdAt)}`
}

function hydrateAssignmentDrafts() {
  for (const row of data.value?.rows ?? []) {
    const existing = assignmentDrafts[row.featureKey]
    if (existing && assignmentSaving[row.featureKey]) continue
    assignmentDrafts[row.featureKey] = {
      provider: row.assignedProvider || row.provider,
      modelId: row.assignedModelId || row.modelId,
      fallbackModelId: row.assignedFallback || NO_FALLBACK_MODEL,
      notes: row.assignmentNotes || '',
    }
  }
}

watch(data, hydrateAssignmentDrafts, { immediate: true })

function assignmentProviderOptionsFor(row: ModelMapRow) {
  const providers = new Set<string>(row.runtimeSupportedProviders)
  providers.add(row.defaultProvider || row.provider)
  providers.add(row.assignedProvider || row.provider)
  return Array.from(providers).filter(Boolean).sort().map((provider) => ({ label: provider, value: provider }))
}

function modelOptionsFor(row: ModelMapRow) {
  const draft = assignmentDrafts[row.featureKey]
  const provider = draft?.provider || row.assignedProvider || row.provider
  const options = new Map<string, { label: string, value: string }>()
  for (const model of data.value?.assignments.catalog ?? []) {
    if (model.provider === provider) options.set(model.modelId, { label: model.modelId, value: model.modelId })
  }
  for (const modelId of [row.defaultModelId, row.assignedModelId, row.defaultFallback, row.assignedFallback]) {
    if (modelId) options.set(modelId, { label: modelId, value: modelId })
  }
  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function fallbackOptionsFor(row: ModelMapRow) {
  return [{ label: 'No fallback', value: NO_FALLBACK_MODEL }, ...modelOptionsFor(row)]
}

async function loadModelPicker(row = modelPickerRow.value) {
  if (!row) return
  modelPickerPending.value = true
  modelPickerError.value = null
  try {
    modelPickerData.value = await $fetch<CloudflareCatalogResponse>('/api/admin/ai/model-ops/cloudflare-models', {
      query: {
        featureKey: row.featureKey,
        search: modelPickerSearch.value || undefined,
        provider: modelPickerProvider.value === ALL_MODEL_PICKER_FILTERS ? undefined : modelPickerProvider.value,
        task: modelPickerTask.value === ALL_MODEL_PICKER_FILTERS ? undefined : modelPickerTask.value,
        capability: modelPickerCapability.value === ALL_MODEL_PICKER_FILTERS ? undefined : modelPickerCapability.value,
      },
    })
  } catch (err: any) {
    modelPickerError.value = err?.data?.statusMessage || err?.message || 'Cloudflare model catalog failed to load.'
  } finally {
    modelPickerPending.value = false
  }
}

async function openModelPicker(row: ModelMapRow) {
  modelPickerRow.value = row
  modelPickerOpen.value = true
  modelPickerSearch.value = ''
  modelPickerProvider.value = ALL_MODEL_PICKER_FILTERS
  modelPickerTask.value = ALL_MODEL_PICKER_FILTERS
  modelPickerCapability.value = ALL_MODEL_PICKER_FILTERS
  await loadModelPicker(row)
}

function closeModelPicker() {
  modelPickerOpen.value = false
  modelPickerRow.value = null
  modelPickerData.value = null
  modelPickerError.value = null
}

async function applyModelPickerFilters() {
  await loadModelPicker()
}

function useCatalogModel(model: CloudflareCatalogModel) {
  const row = modelPickerRow.value
  if (!row || !model.assignable) return
  assignmentDrafts[row.featureKey] = {
    ...(assignmentDrafts[row.featureKey] ?? {
      provider: row.assignedProvider || row.provider,
      modelId: row.assignedModelId || row.modelId,
      fallbackModelId: row.assignedFallback || NO_FALLBACK_MODEL,
      notes: row.assignmentNotes || '',
    }),
    provider: model.provider,
    modelId: model.modelId,
  }
  closeModelPicker()
}

async function askCopilot() {
  const prompt = copilotPrompt.value.trim()
  if (!prompt) {
    copilotError.value = 'Enter a question or instruction for the Model Ops Copilot.'
    return
  }
  copilotPending.value = true
  copilotError.value = null
  try {
    copilotResult.value = await $fetch<ModelOpsCopilotResponse>('/api/admin/ai/model-ops/copilot', {
      method: 'POST',
      body: {
        prompt,
        featureKey: copilotFeatureKey.value === COPILOT_ALL_FEATURES ? null : copilotFeatureKey.value,
      },
    })
  } catch (err: any) {
    copilotError.value = err?.data?.statusMessage || err?.message || 'Model Ops Copilot failed to respond.'
  } finally {
    copilotPending.value = false
  }
}

function applyCopilotAssignment() {
  const proposed = copilotResult.value?.proposedAssignment
  if (!proposed) return
  const row = data.value?.rows.find(item => item.featureKey === proposed.featureKey)
  if (!row || !row.assignmentEditable || !row.runtimeControlEnabled) return
  assignmentDrafts[row.featureKey] = {
    ...(assignmentDrafts[row.featureKey] ?? {
      provider: row.assignedProvider || row.provider,
      modelId: row.assignedModelId || row.modelId,
      fallbackModelId: row.assignedFallback || NO_FALLBACK_MODEL,
      notes: row.assignmentNotes || '',
    }),
    provider: proposed.provider,
    modelId: proposed.modelId,
    fallbackModelId: proposed.fallbackModelId || NO_FALLBACK_MODEL,
    notes: proposed.notes,
  }
  assignmentSuccess.value = `Drafted ${row.label}. Review it in the model map, then press Save to update production.`
}

function useCopilotPreset(prompt: string) {
  copilotPrompt.value = prompt
}

function assignmentChanged(row: ModelMapRow) {
  const draft = assignmentDrafts[row.featureKey]
  if (!draft) return false
  const draftFallback = draft.fallbackModelId === NO_FALLBACK_MODEL ? null : draft.fallbackModelId
  return draft.provider !== row.assignedProvider
    || draft.modelId !== row.assignedModelId
    || draftFallback !== row.assignedFallback
    || draft.notes.trim() !== (row.assignmentNotes || '')
}

function applyAssignmentResponse(result: Pick<ModelMapResponse, 'rows' | 'summary' | 'assignments'>) {
  if (!data.value) return
  data.value = {
    ...data.value,
    rows: result.rows,
    summary: result.summary,
    assignments: result.assignments,
  }
  hydrateAssignmentDrafts()
}

function repoName(url: string) {
  const clean = url.replace(/\/+$/, '')
  return clean.split('/').slice(-2).join('/')
}

async function refreshAll() {
  await Promise.all([refresh(), refreshInvocations(), refreshGraphify(), refreshAgentRuns()])
}

async function runOrchestratorCheck() {
  orchestratorCheckResult.value = null
  if (!orchestratorManualCheckReady.value) {
    orchestratorCheckError.value = orchestratorReadCheckUnavailableMessage
    return
  }
  orchestratorCheckPending.value = true
  orchestratorCheckError.value = null
  try {
    orchestratorCheckResult.value = await $fetch<OrchestratorCheckResponse>('/api/admin/ai/model-ops/orchestrator-check', {
      method: 'POST',
    })
    await refreshAgentRuns()
  } catch (err: any) {
    orchestratorCheckError.value = err?.data?.statusMessage || err?.message || 'Orchestrator check failed.'
  } finally {
    orchestratorCheckPending.value = false
  }
}

async function saveAssignment(row: ModelMapRow) {
  const draft = assignmentDrafts[row.featureKey]
  if (!draft || !row.assignmentEditable || !row.runtimeControlEnabled || !data.value?.assignments.available) return
  assignmentSaving[row.featureKey] = true
  assignmentError.value = null
  assignmentSuccess.value = null
  try {
    const result = await $fetch<Pick<ModelMapResponse, 'rows' | 'summary' | 'assignments'>>(
      `/api/admin/ai/model-ops/assignments/${encodeURIComponent(row.featureKey)}`,
      {
        method: 'PATCH',
        body: {
          provider: draft.provider,
          modelId: draft.modelId,
          fallbackModelId: draft.fallbackModelId === NO_FALLBACK_MODEL ? null : draft.fallbackModelId,
          notes: draft.notes.trim() || null,
        },
      }
    )
    applyAssignmentResponse(result)
    assignmentSuccess.value = `Updated ${row.label}.`
  } catch (err: any) {
    assignmentError.value = err?.data?.statusMessage || err?.message || 'Model assignment update failed.'
  } finally {
    assignmentSaving[row.featureKey] = false
  }
}

async function resetAssignment(row: ModelMapRow) {
  if (!row.assignmentEditable || !data.value?.assignments.available) return
  assignmentSaving[row.featureKey] = true
  assignmentError.value = null
  assignmentSuccess.value = null
  try {
    const result = await $fetch<Pick<ModelMapResponse, 'rows' | 'summary' | 'assignments'>>(
      `/api/admin/ai/model-ops/assignments/${encodeURIComponent(row.featureKey)}`,
      { method: 'DELETE' }
    )
    applyAssignmentResponse(result)
    assignmentSuccess.value = `Reset ${row.label} to the registry default.`
  } catch (err: any) {
    assignmentError.value = err?.data?.statusMessage || err?.message || 'Model assignment reset failed.'
  } finally {
    assignmentSaving[row.featureKey] = false
  }
}

const riskColor: Record<ModelMapRow['riskTier'], 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error'
}

const statusColor: Record<ModelMapRow['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  production: 'success',
  preview: 'warning',
  deprecated: 'error',
  unknown: 'neutral'
}

const runtimeStatusColor: Record<ModelMapRow['runtimeRoutingStatus'], 'success' | 'warning' | 'error' | 'neutral'> = {
  runtime_routed: 'success',
  partial: 'warning',
  worker_side: 'neutral',
  direct: 'error',
}

const copilotSeverityColor: Record<ModelOpsCopilotResponse['findings'][number]['severity'], 'success' | 'warning' | 'error' | 'neutral'> = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral',
}

const graphifyStatusColor: Record<GraphifyRepoStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  ready: 'success',
  stale: 'warning',
  missing_path: 'neutral',
  missing_artifact: 'warning',
  r2_unconfigured: 'warning',
  error: 'error',
}

const agentRunStatusColor: Record<AgentRun['statusBucket'], 'success' | 'warning' | 'error' | 'neutral'> = {
  completed: 'success',
  failed: 'error',
  running: 'warning',
  other: 'neutral',
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">AI Model Ops</h1>
        <p class="mt-1 text-sm text-muted">
          Static inventory of the current AI surfaces, model routing, pricing coverage, and risk.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          data-testid="run-orchestrator-read-check"
          icon="i-lucide-play"
          color="primary"
          variant="soft"
          :loading="orchestratorCheckPending"
          :disabled="orchestratorReadCheckDisabled"
          :title="orchestratorManualCheckReady ? 'Run read-only orchestrator check' : orchestratorReadCheckUnavailableMessage"
          @click="runOrchestratorCheck()"
        >
          Run read check
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="pending || invocationsPending || graphifyPending || agentRunsPending"
          @click="refreshAll()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn't load AI Model Ops"
      :description="(error as any)?.data?.statusMessage || 'You may not have access.'"
    />

    <UAlert
      v-if="invocationsError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn't load invocation telemetry"
      :description="(invocationsError as any)?.data?.statusMessage || 'Telemetry may be temporarily unavailable.'"
    />

    <UAlert
      v-if="graphifyError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn't load Graphify status"
      :description="(graphifyError as any)?.data?.statusMessage || 'Graphify status may be temporarily unavailable.'"
    />

    <UAlert
      v-if="orchestratorCheckError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn't run orchestrator check"
      :description="orchestratorCheckError"
    />

    <UAlert
      v-if="data && !orchestratorManualCheckReady"
      color="warning"
      variant="soft"
      icon="i-lucide-key-round"
      title="Manual orchestrator checks unavailable"
      :description="orchestratorReadCheckUnavailableMessage"
    />

    <UAlert
      v-if="orchestratorCheckResult"
      :color="orchestratorCheckResult.summary.failedTools > 0 ? 'warning' : 'success'"
      variant="soft"
      icon="i-lucide-search-check"
      title="Read-only orchestrator check complete"
      :description="`${orchestratorCheckResult.summary.successfulTools}/${orchestratorCheckResult.summary.totalTools} tools succeeded`"
    />

    <UAlert
      v-if="agentRunsError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn't load agent runs"
      :description="(agentRunsError as any)?.data?.statusMessage || 'Agent run telemetry may be temporarily unavailable.'"
    />

    <template v-else>
      <UAlert
        v-if="invocationData && !invocationData.available"
        color="warning"
        variant="soft"
        icon="i-lucide-database"
        title="Invocation telemetry not active yet"
        :description="invocationData.reason || 'Run the AI invocation migration to enable live usage and cost reporting.'"
      />

      <UAlert
        v-if="agentRunsData && !agentRunsData.available"
        color="warning"
        variant="soft"
        icon="i-lucide-bot"
        title="Agent run telemetry not active yet"
        :description="agentRunsData.reason || 'Run the AI agent migration to enable agent run reporting.'"
      />

      <UAlert
        v-if="graphifyData && !graphifyData.available"
        color="warning"
        variant="soft"
        icon="i-lucide-waypoints"
        title="Graphify status not active yet"
        :description="graphifyData.reason || 'Configure repository metadata to enable Graphify status.'"
      />

      <UAlert
        v-if="data && !data.assignments.available"
        color="warning"
        variant="soft"
        icon="i-lucide-database"
        title="Editable model assignments not active yet"
        :description="data.assignments.reason || 'Run the model assignment migration to enable admin-managed overrides.'"
      />

      <UAlert
        v-if="assignmentError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Couldn't update model assignment"
        :description="assignmentError"
      />

      <UAlert
        v-if="assignmentSuccess"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        title="Model assignment updated"
        :description="assignmentSuccess"
      />

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Model assignment brief</h2>
              <p class="text-xs text-muted">Dashboard assignments now control runtime-routed app-server and edge surfaces; worker-side routes are tracked for rollout.</p>
            </div>
            <UBadge :color="data?.assignments.available ? 'success' : 'warning'" variant="soft">
              {{ data?.assignments.available ? 'Editable' : 'Read only' }}
            </UBadge>
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="card in assignmentBriefCards" :key="card.label" class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon :name="card.icon" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
          </div>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="card in runtimeBriefCards" :key="card.label" class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon :name="card.icon" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
          </div>
        </div>

        <div class="mt-3 grid gap-3 text-sm xl:grid-cols-3">
          <div class="rounded-md border border-default p-3">
            <p class="font-medium text-default">Current source</p>
            <p class="mt-1 text-xs text-muted">Defaults come from the code registry; overrides are stored in the admin assignment table with audit entries.</p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="font-medium text-default">Orchestrator status</p>
            <p class="mt-1 text-xs text-muted">
              {{ data?.config.orchestrator.workerConfigured ? 'Worker URL is configured' : 'Worker URL is missing' }}
              /
              {{ data?.config.orchestrator.manualCheckReady ? 'manual checks are ready' : 'manual checks need INTERNAL_API_KEY' }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="font-medium text-default">Runtime note</p>
            <p class="mt-1 text-xs text-muted">Saves are enabled only for rows consumed by the runtime resolver, so direct and worker-side entries stay visible without creating ignored overrides.</p>
          </div>
        </div>
      </UCard>

      <UCard data-testid="model-ops-copilot-card">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Model Ops Copilot</h2>
              <p class="text-xs text-muted">Read-only assistant for model routing, catalog recommendations, and assignment drafts.</p>
            </div>
            <UBadge :color="copilotResult?.context.catalogAvailable ? 'success' : 'warning'" variant="soft">
              {{ copilotResult?.context.catalogSource === 'cloudflare_api' ? 'Cloudflare synced' : 'Read only' }}
            </UBadge>
          </div>
        </template>

        <div class="grid gap-3 xl:grid-cols-12">
          <div class="space-y-2 xl:col-span-6">
            <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <USelect
                v-model="copilotFeatureKey"
                :items="copilotFeatureOptions"
                value-key="value"
                aria-label="Copilot feature scope"
              />
              <UButton
                data-testid="ask-model-ops-copilot"
                icon="i-lucide-sparkles"
                color="primary"
                variant="soft"
                :loading="copilotPending"
                class="justify-center"
                @click="askCopilot()"
              >
                Ask
              </UButton>
            </div>

            <UTextarea
              v-model="copilotPrompt"
              :rows="4"
              maxlength="1200"
              aria-label="Model Ops Copilot prompt"
              placeholder="Ask for a routing review, safer model recommendation, or next rollout step"
              class="w-full"
            />

            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <button
                v-for="preset in copilotPromptPresets"
                :key="preset.label"
                type="button"
                class="rounded-md border border-default bg-muted px-2 py-1.5 text-center text-xs font-medium text-default transition hover:bg-elevated focus:outline-none focus:ring-2 focus:ring-primary"
                @click="useCopilotPreset(preset.prompt)"
              >
                {{ preset.label }}
              </button>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-muted">Drafts require Save in the model map.</p>
              <UButton
                v-if="copilotResult?.proposedAssignment"
                data-testid="apply-copilot-assignment"
                icon="i-lucide-copy-check"
                color="neutral"
                variant="soft"
                size="sm"
                @click="applyCopilotAssignment()"
              >
                Apply draft
              </UButton>
            </div>
          </div>

          <div class="xl:col-span-6">
            <UAlert
              v-if="copilotError"
              color="error"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="Couldn't run Model Ops Copilot"
              :description="copilotError"
            />
            <div v-else-if="!copilotResult" class="grid min-h-[104px] place-items-center rounded-md border border-default px-4 py-3 text-center text-sm text-muted">
              <div>
                <p class="font-medium text-default">No Copilot run yet</p>
                <p class="mt-1 text-xs text-muted">Choose a scope, adjust the prompt, then ask for a recommendation.</p>
              </div>
            </div>
            <div v-else class="space-y-4">
              <div class="rounded-md border border-default p-4">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge color="neutral" variant="soft">{{ copilotResult.mode.replace('_', ' ') }}</UBadge>
                  <UBadge :color="copilotResult.context.catalogAvailable ? 'success' : 'warning'" variant="soft">
                    {{ copilotResult.context.catalogSource.replace('_', ' ') }}
                  </UBadge>
                  <UBadge color="neutral" variant="soft">
                    {{ copilotResult.context.runtimeControllableCount }} controllable
                  </UBadge>
                  <UBadge :color="copilotResult.context.telemetryAvailable ? 'success' : 'warning'" variant="soft">
                    {{ copilotResult.context.telemetryAvailable ? 'telemetry active' : 'telemetry unavailable' }}
                  </UBadge>
                  <UBadge :color="copilotResult.context.errorRate > 0 ? 'error' : 'success'" variant="soft">
                    {{ percent(copilotResult.context.errorRate) }} errors
                  </UBadge>
                  <UBadge :color="copilotResult.context.fallbackRate > 0.1 ? 'warning' : 'success'" variant="soft">
                    {{ percent(copilotResult.context.fallbackRate) }} fallback
                  </UBadge>
                </div>
                <p class="mt-3 text-sm text-default">{{ copilotResult.answer }}</p>
              </div>

              <div v-if="copilotResult.proposedAssignment" class="rounded-md border border-default p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-default">Draft assignment</p>
                    <p class="mt-1 font-mono text-xs text-muted">
                      {{ copilotResult.proposedAssignment.provider }}/{{ copilotResult.proposedAssignment.modelId }}
                    </p>
                  </div>
                  <UBadge color="success" variant="soft">Requires Save</UBadge>
                </div>
                <ul class="mt-3 space-y-1 text-xs text-muted">
                  <li v-for="reason in copilotResult.proposedAssignment.rationale" :key="reason">
                    {{ reason }}
                  </li>
                </ul>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-md border border-default p-4">
                  <p class="text-sm font-medium text-default">Findings</p>
                  <ul v-if="copilotResult.findings.length" class="mt-3 space-y-3">
                    <li v-for="finding in copilotResult.findings" :key="`${finding.title}:${finding.featureKey || 'global'}`" class="text-xs">
                      <div class="flex items-center gap-2">
                        <UBadge :color="copilotSeverityColor[finding.severity]" variant="soft" size="sm">
                          {{ finding.severity }}
                        </UBadge>
                        <span class="font-medium text-default">{{ finding.title }}</span>
                      </div>
                      <p class="mt-1 text-muted">{{ finding.detail }}</p>
                    </li>
                  </ul>
                  <p v-else class="mt-3 text-xs text-muted">No findings returned.</p>
                </div>

                <div class="rounded-md border border-default p-4">
                  <p class="text-sm font-medium text-default">Recommended actions</p>
                  <ul class="mt-3 space-y-2 text-xs text-muted">
                    <li v-for="action in copilotResult.recommendedActions" :key="action">
                      {{ action }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="card in invocationCards" :key="card.label" :ui="{ body: 'p-4' }">
          <div class="flex items-center gap-2 text-muted">
            <UIcon :name="card.icon" class="size-4" />
            <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
          </div>
          <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Configuration readiness</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">AI Gateway</span>
              <UBadge :color="data?.config.gateway.configured ? 'success' : 'neutral'" variant="soft">
                {{ data?.config.gateway.configured ? 'Configured' : 'Missing' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Gateway auth</span>
              <UBadge :color="data?.config.gateway.authTokenConfigured ? 'success' : 'neutral'" variant="soft">
                {{ data?.config.gateway.authTokenConfigured ? 'Configured' : 'Not set' }}
              </UBadge>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              Host: {{ data?.config.gateway.host || '-' }}
            </div>
          </div>
        </UCard>

        <UCard data-testid="orchestrator-readiness-card" :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Provider readiness</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div v-for="provider in configProviderItems" :key="provider.key" class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-default">{{ provider.label }}</p>
                <p class="truncate text-xs text-muted">{{ provider.requiredFor }}</p>
              </div>
              <UBadge :color="provider.configured ? 'success' : 'neutral'" variant="soft">
                {{ provider.configured ? 'Ready' : 'Missing' }}
              </UBadge>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              Loop: {{ data?.config.loop.model || '-' }} / fallback {{ data?.config.loop.fallbackModel || '-' }} / {{ money(data?.config.loop.budgetUsd ?? 0) }}
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Orchestrator readiness</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Manual check</span>
              <UBadge :color="data?.config.orchestrator.manualCheckReady ? 'success' : 'neutral'" variant="soft">
                {{ data?.config.orchestrator.manualCheckReady ? 'Ready' : 'Missing secret' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Worker URL</span>
              <UBadge :color="data?.config.orchestrator.workerConfigured ? 'success' : 'neutral'" variant="soft">
                {{ data?.config.orchestrator.workerConfigured ? 'Configured' : 'Not set' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Read tools</span>
              <span class="font-medium text-default">{{ data?.config.orchestrator.readToolCount ?? 0 }}</span>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              Host: {{ data?.config.orchestrator.workerHost || '-' }}
            </div>
          </div>
        </UCard>
      </div>

      <UCard data-testid="platform-agent-readiness-card">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Platform Agents</h2>
              <p class="text-xs text-muted">Feature flags, Worker bridge prerequisites, and latest read-only run state.</p>
            </div>
            <UBadge :color="data?.config.platformAgents.bridgeReady ? 'success' : 'warning'" variant="soft">
              {{ data?.config.platformAgents.bridgeReady ? 'Ready' : 'Needs setup' }}
            </UBadge>
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-plug-zap" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">Bridge</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">
              {{ data?.config.platformAgents.bridgeReady ? 'Ready' : 'Blocked' }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-toggle-left" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">Flags</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">
              {{ data?.config.platformAgents.enabledFlagCount ?? 0 }} / {{ data?.config.platformAgents.totalFlagCount ?? 0 }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-cloud-cog" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">Worker</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">
              {{ data?.config.platformAgents.workerConfigured ? 'Configured' : 'Missing' }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon name="i-lucide-key-round" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">Internal key</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">
              {{ data?.config.platformAgents.internalApiKeyConfigured ? 'Configured' : 'Missing' }}
            </p>
          </div>
        </div>

        <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div class="rounded-md border border-default p-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                v-for="flag in data?.config.platformAgents.flags ?? []"
                :key="flag.key"
                :color="flag.enabled ? 'success' : 'neutral'"
                variant="soft"
                size="sm"
              >
                {{ flag.label }}
              </UBadge>
            </div>
            <p class="mt-3 text-xs text-muted">
              Worker host: {{ data?.config.platformAgents.workerHost || '-' }}
            </p>
          </div>

          <div class="rounded-md border border-default p-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div v-for="row in platformAgentHealthRows" :key="row.agentType" class="min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-default">{{ row.label }}</p>
                  <UBadge :color="row.lastRun ? agentRunStatusColor[row.lastRun.statusBucket] : 'neutral'" variant="soft" size="sm">
                    {{ row.lastRun ? row.lastRun.status : 'No run' }}
                  </UBadge>
                </div>
                <p class="mt-1 truncate text-xs text-muted">{{ row.mode }}</p>
                <p class="mt-1 truncate font-mono text-[11px] text-muted">{{ agentRunLabel(row.lastRun) }}</p>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 xl:grid-cols-5">
        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Telemetry readiness</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div v-for="item in ledgerHealthItems" :key="item.label" class="flex items-center justify-between gap-3">
              <span class="text-muted">{{ item.label }}</span>
              <UBadge :color="item.active ? 'success' : 'neutral'" variant="soft">
                {{ item.value }}
              </UBadge>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              {{ invocationData?.health.totalRows ?? 0 }} total rows / {{ invocationData?.health.distinctFeatures ?? 0 }} features / {{ invocationData?.health.distinctModels ?? 0 }} models
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Gateway health</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Gateway routed</span>
              <span class="font-medium text-default">{{ percent(invocationData?.summary.gatewayRate ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Fallback used</span>
              <UBadge :color="(invocationData?.summary.fallbackRate ?? 0) > 0.1 ? 'warning' : 'success'" variant="soft">
                {{ percent(invocationData?.summary.fallbackRate ?? 0) }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Errors</span>
              <UBadge :color="(invocationData?.summary.errorRate ?? 0) > 0 ? 'error' : 'success'" variant="soft">
                {{ percent(invocationData?.summary.errorRate ?? 0) }}
              </UBadge>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              Last call: {{ dateLabel(invocationData?.summary.lastSeenAt ?? null) }}
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Legacy message cost</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Status</span>
              <UBadge :color="invocationData?.legacyMessages.available ? 'success' : 'neutral'" variant="soft">
                {{ invocationData?.legacyMessages.available ? 'Available' : 'Unavailable' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Assistant turns</span>
              <span class="font-medium text-default">{{ (invocationData?.legacyMessages.turns ?? 0).toLocaleString() }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Cost / tokens</span>
              <span class="text-right font-medium text-default">
                {{ money(invocationData?.legacyMessages.estimatedCostUsd ?? 0) }} / {{ (invocationData?.legacyMessages.totalTokens ?? 0).toLocaleString() }}
              </span>
            </div>
            <div class="border-t border-default pt-3 text-xs text-muted">
              Last message: {{ dateLabel(invocationData?.legacyMessages.lastSeenAt ?? null) }}
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Top features</h2>
          </template>
          <div v-if="!invocationData?.byFeature.length" class="py-6 text-center text-sm text-muted">
            No invocation rows yet.
          </div>
          <ul v-else class="divide-y divide-default">
            <li v-for="row in invocationData.byFeature.slice(0, 5)" :key="row.key" class="py-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="min-w-0 truncate font-medium text-default">{{ row.key }}</span>
                <span class="text-xs text-muted">{{ row.invocations }} calls</span>
              </div>
              <p class="mt-1 text-xs text-muted">{{ row.totalTokens.toLocaleString() }} tokens / {{ money(row.estimatedCostUsd) }}</p>
            </li>
          </ul>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Top models</h2>
          </template>
          <div v-if="!invocationData?.byModel.length" class="py-6 text-center text-sm text-muted">
            No model usage yet.
          </div>
          <ul v-else class="divide-y divide-default">
            <li v-for="row in invocationData.byModel.slice(0, 5)" :key="row.key" class="py-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="min-w-0 truncate font-mono text-xs text-default">{{ row.key }}</span>
                <span class="text-xs text-muted">{{ row.invocations }} calls</span>
              </div>
              <p class="mt-1 text-xs text-muted">{{ row.totalTokens.toLocaleString() }} tokens / {{ money(row.estimatedCostUsd) }}</p>
            </li>
          </ul>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <template #header>
            <h2 class="text-sm font-semibold text-highlighted">Telemetry coverage</h2>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Mapped features seen</span>
              <UBadge :color="(invocationData?.coverage.coverageRate ?? 0) > 0.5 ? 'success' : 'warning'" variant="soft">
                {{ invocationData?.coverage.seenMappedFeatureCount ?? 0 }} / {{ invocationData?.coverage.mappedFeatureCount ?? 0 }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Coverage rate</span>
              <span class="font-medium text-default">{{ percent(invocationData?.coverage.coverageRate ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Unmapped rows</span>
              <UBadge :color="(invocationData?.coverage.unmappedSeenFeatureCount ?? 0) > 0 ? 'warning' : 'success'" variant="soft">
                {{ invocationData?.coverage.unmappedSeenFeatureCount ?? 0 }}
              </UBadge>
            </div>
            <div class="border-t border-default pt-3">
              <p class="text-xs text-muted">Missing telemetry keys</p>
              <div v-if="missingTelemetryPreview.length" class="mt-2 flex flex-wrap gap-1.5">
                <UBadge v-for="key in missingTelemetryPreview" :key="key" color="neutral" variant="soft" size="sm">
                  {{ key }}
                </UBadge>
              </div>
              <p v-else class="mt-2 text-xs text-success">All mapped features have telemetry rows.</p>
            </div>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Graphify context</h2>
              <p class="text-xs text-muted">Connected repo graph freshness and artifact coverage for AI context retrieval.</p>
            </div>
            <UBadge :color="graphifyData?.r2Configured ? 'success' : 'warning'" variant="soft">
              {{ graphifyData?.r2Configured ? 'R2 configured' : 'R2 not configured' }}
            </UBadge>
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="card in graphifyCards" :key="card.label" class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon :name="card.icon" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
          </div>
        </div>

        <div v-if="graphifyPending && !graphifyData" class="py-10 text-center text-sm text-muted">
          Loading Graphify status...
        </div>
        <div v-else-if="!graphifyData?.repos.length" class="mt-4 py-10 text-center text-sm text-muted">
          No connected repos found.
        </div>
        <div v-else class="mt-4 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th class="pb-2 pr-4">Repo</th>
                <th class="pb-2 pr-4">Board</th>
                <th class="pb-2 pr-4">Graph path</th>
                <th class="pb-2 pr-4">Last sync</th>
                <th class="pb-2 pr-4">Graph size</th>
                <th class="pb-2">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="repo in graphifyData.repos" :key="repo.id" class="align-top">
                <td class="py-3 pr-4">
                  <p class="font-medium text-default">{{ repoName(repo.repoUrl) }}</p>
                  <p class="text-xs text-muted">{{ repo.provider }} / {{ repo.defaultBranch }}</p>
                </td>
                <td class="py-3 pr-4">
                  <p class="font-medium text-default">{{ repo.board.name }}</p>
                  <p class="text-xs text-muted">{{ repo.board.slug || repo.board.id }}</p>
                </td>
                <td class="py-3 pr-4 font-mono text-xs text-muted">
                  {{ repo.graphifyPath || '-' }}
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  {{ dateLabel(repo.graphifyLastSyncedAt) }}
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  <p>{{ repo.nodeCount.toLocaleString() }} nodes / {{ repo.edgeCount.toLocaleString() }} edges</p>
                  <p>{{ repo.hyperedgeCount.toLocaleString() }} hyperedges / {{ repo.reportChars.toLocaleString() }} report chars</p>
                </td>
                <td class="py-3">
                  <UBadge :color="graphifyStatusColor[repo.status]" variant="soft" size="sm">
                    {{ repo.status.replaceAll('_', ' ') }}
                  </UBadge>
                  <p v-if="repo.reason" class="mt-1 max-w-xs text-xs text-muted">{{ repo.reason }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Agent runs</h2>
              <p class="text-xs text-muted">Existing app agent run health, report counts, findings, and failures.</p>
            </div>
            <UBadge :color="(agentRunsData?.summary.failureRate ?? 0) > 0 ? 'warning' : 'success'" variant="soft">
              {{ percent(agentRunsData?.summary.failureRate ?? 0) }} failure rate
            </UBadge>
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="card in agentRunCards" :key="card.label" class="rounded-md border border-default p-3">
            <div class="flex items-center gap-2 text-muted">
              <UIcon :name="card.icon" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
            </div>
            <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
          </div>
        </div>

        <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Completed</span>
            <UBadge color="success" variant="soft">{{ agentRunsData?.summary.completedRuns ?? 0 }}</UBadge>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Running</span>
            <UBadge color="warning" variant="soft">{{ agentRunsData?.summary.runningRuns ?? 0 }}</UBadge>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Read tool failures</span>
            <UBadge :color="(agentRunsData?.summary.orchestratorReadToolFailures ?? 0) > 0 ? 'warning' : 'success'" variant="soft">
              {{ agentRunsData?.summary.orchestratorReadToolFailures ?? 0 }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Accepted proposals</span>
            <UBadge color="success" variant="soft">{{ agentRunsData?.summary.platformAgentAcceptedProposals ?? 0 }}</UBadge>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Rejected proposals</span>
            <UBadge :color="(agentRunsData?.summary.platformAgentRejectedProposals ?? 0) > 0 ? 'warning' : 'neutral'" variant="soft">
              {{ agentRunsData?.summary.platformAgentRejectedProposals ?? 0 }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border border-default p-3">
            <span class="text-muted">Edited proposals</span>
            <UBadge color="info" variant="soft">{{ agentRunsData?.summary.platformAgentEditedProposals ?? 0 }}</UBadge>
          </div>
        </div>

        <div v-if="agentRunsPending && !agentRunsData" class="py-10 text-center text-sm text-muted">
          Loading agent runs...
        </div>
        <div v-else-if="!agentRunsData?.recent.length" class="mt-4 py-10 text-center text-sm text-muted">
          No agent runs logged yet.
        </div>
        <div v-else class="mt-4 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th class="pb-2 pr-4">When</th>
                <th class="pb-2 pr-4">Run</th>
                <th class="pb-2 pr-4">Work</th>
                <th class="pb-2 pr-4">Reports</th>
                <th class="pb-2 pr-4">Duration</th>
                <th class="pb-2">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="run in agentRunsData.recent" :key="run.id" class="align-top">
                <td class="py-3 pr-4 text-xs text-muted">{{ dateLabel(run.startedAt || run.createdAt) }}</td>
                <td class="py-3 pr-4">
                  <p class="font-medium text-default">{{ run.runType.replaceAll('_', ' ') }}</p>
                  <p class="font-mono text-[11px] text-muted">{{ run.id }}</p>
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  <p>{{ run.checksPerformed.toLocaleString() }} checks / {{ run.findingsCount.toLocaleString() }} findings</p>
                  <p>{{ run.notificationsSent.toLocaleString() }} notifications</p>
                  <p v-if="run.source === 'platform_agent'">
                    {{ run.proposedActionCount.toLocaleString() }} proposals / {{ run.blockedActionCount.toLocaleString() }} blocked
                  </p>
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  <p>{{ run.reportCount.toLocaleString() }} reports</p>
                  <p>{{ run.unreadReportCount.toLocaleString() }} unread</p>
                  <p v-if="run.source === 'platform_agent'">
                    {{ run.proposalDecisionCounts.accepted.toLocaleString() }} accepted /
                    {{ run.proposalDecisionCounts.rejected.toLocaleString() }} rejected /
                    {{ run.proposalDecisionCounts.edited.toLocaleString() }} edited /
                    {{ run.proposalDecisionCounts.ignored.toLocaleString() }} ignored
                  </p>
                </td>
                <td class="py-3 pr-4 text-xs text-muted">{{ durationLabel(run.durationMs) }}</td>
                <td class="py-3">
                  <UBadge :color="agentRunStatusColor[run.statusBucket]" variant="soft" size="sm">
                    {{ run.status }}
                  </UBadge>
                  <p v-if="run.errorCount" class="mt-1 text-xs text-error">{{ run.errorCount }} error{{ run.errorCount === 1 ? '' : 's' }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Recent invocations</h2>
              <p class="text-xs text-muted">Last 25 logged AI calls. Prompts and outputs are not stored here.</p>
            </div>
            <UBadge color="neutral" variant="soft">{{ invocationData?.recent.length ?? 0 }} rows</UBadge>
          </div>
        </template>

        <div v-if="invocationsPending && !invocationData" class="py-10 text-center text-sm text-muted">
          Loading invocation telemetry...
        </div>
        <div v-else-if="!invocationData?.recent.length" class="py-10 text-center text-sm text-muted">
          No invocation rows yet.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th class="pb-2 pr-4">When</th>
                <th class="pb-2 pr-4">Feature</th>
                <th class="pb-2 pr-4">Model</th>
                <th class="pb-2 pr-4">Gateway</th>
                <th class="pb-2 pr-4">Tokens</th>
                <th class="pb-2 pr-4">Cost</th>
                <th class="pb-2">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in invocationData.recent" :key="row.id" class="align-top">
                <td class="py-3 pr-4 text-xs text-muted">{{ dateLabel(row.createdAt) }}</td>
                <td class="py-3 pr-4">
                  <p class="font-medium text-default">{{ row.featureKey }}</p>
                  <p class="text-xs text-muted">{{ row.provider }} / {{ row.latencyMs }}ms</p>
                </td>
                <td class="py-3 pr-4 font-mono text-xs text-default">{{ row.modelId }}</td>
                <td class="py-3 pr-4">
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge :color="row.gatewayUsed ? 'success' : 'neutral'" variant="soft" size="sm">
                      {{ row.gatewayUsed ? 'gateway' : 'direct' }}
                    </UBadge>
                    <UBadge v-if="row.fallbackUsed" color="warning" variant="soft" size="sm">
                      fallback
                    </UBadge>
                  </div>
                </td>
                <td class="py-3 pr-4 text-xs text-muted">{{ row.totalTokens.toLocaleString() }}</td>
                <td class="py-3 pr-4 text-xs text-muted">{{ money(row.estimatedCostUsd) }}</td>
                <td class="py-3">
                  <UBadge :color="row.status === 'success' ? 'success' : 'error'" variant="soft" size="sm">
                    {{ row.status }}
                  </UBadge>
                  <p v-if="row.errorCode" class="mt-1 max-w-xs truncate text-xs text-error">{{ row.errorCode }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="card in cards" :key="card.label" :ui="{ body: 'p-4' }">
          <div class="flex items-center gap-2 text-muted">
            <UIcon :name="card.icon" class="size-4" />
            <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
          </div>
          <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ card.value }}</p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Model map</h2>
              <p class="text-xs text-muted">Default registry plus admin assignment overrides for the orchestration brief.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="neutral" variant="soft">
                {{ filteredModelMapRows.length }} of {{ data?.rows.length ?? 0 }} rows
              </UBadge>
              <UBadge v-if="modelMapSearch || modelMapRuntimeFilter !== MODEL_MAP_ALL_FILTERS || modelMapProviderFilter !== MODEL_MAP_ALL_FILTERS || modelMapRiskFilter !== MODEL_MAP_ALL_FILTERS" color="warning" variant="soft">
                Filtered
              </UBadge>
            </div>
          </div>
        </template>

        <div v-if="pending && !data" class="py-10 text-center text-sm text-muted">
          Loading model inventory...
        </div>

        <div v-else class="space-y-3">
          <div class="grid gap-2 lg:grid-cols-12">
            <input
              v-model="modelMapSearch"
              class="rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary lg:col-span-5"
              type="search"
              placeholder="Search feature, model, provider, owner, source"
              aria-label="Search model map"
            >
            <select
              v-model="modelMapRuntimeFilter"
              class="rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary lg:col-span-3"
              aria-label="Filter model map runtime"
            >
              <option v-for="item in modelMapRuntimeFilterOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <select
              v-model="modelMapProviderFilter"
              class="rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary lg:col-span-2"
              aria-label="Filter model map provider"
            >
              <option v-for="item in modelMapProviderFilterOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <select
              v-model="modelMapRiskFilter"
              class="rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary lg:col-span-2"
              aria-label="Filter model map risk"
            >
              <option v-for="item in modelMapRiskFilterOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </div>

          <div v-if="!filteredModelMapRows.length" class="py-10 text-center text-sm text-muted">
            No model map rows match those filters.
          </div>

          <div v-else class="overflow-x-auto">
          <table data-testid="model-map-table" class="min-w-[960px] table-fixed text-sm">
            <colgroup>
              <col class="w-[26%]">
              <col class="w-[25%]">
              <col class="w-[32%]">
              <col class="w-[17%]">
            </colgroup>
            <thead>
              <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th class="pb-2 pr-4">Feature</th>
                <th class="pb-2 pr-4">Routing</th>
                <th class="pb-2 pr-4">Assignment</th>
                <th class="pb-2">Health</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in filteredModelMapRows" :key="`${row.featureKey}:${row.modelId}`" class="align-top">
                <td class="py-3 pr-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <p class="font-medium text-default">{{ row.label }}</p>
                      <UBadge :color="riskColor[row.riskTier]" variant="soft" size="sm">
                        {{ row.riskTier }}
                      </UBadge>
                    </div>
                    <p class="mt-1 truncate text-xs text-muted">{{ row.featureKey }}</p>
                    <p class="mt-1 truncate text-xs text-muted">{{ row.surface }} / {{ row.owner }}</p>
                    <details class="mt-2 text-xs text-muted">
                      <summary class="cursor-pointer select-none">Source</summary>
                      <p class="mt-1 break-all font-mono text-[11px]">{{ row.sourceFile }}</p>
                    </details>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <div class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <UBadge :color="runtimeStatusColor[row.runtimeRoutingStatus]" variant="soft" size="sm">
                        {{ row.runtimeRoutingLabel }}
                      </UBadge>
                      <UBadge :color="statusColor[row.status]" variant="soft" size="sm">
                        {{ row.status }}
                      </UBadge>
                      <UBadge color="neutral" variant="soft" size="sm">
                        {{ row.provider }}
                      </UBadge>
                    </div>
                    <p class="break-all font-mono text-xs text-default">{{ row.modelId }}</p>
                    <p class="text-xs text-muted">
                      {{ row.modality }} / {{ pricingLabel(row) }}
                    </p>
                    <p v-if="row.fallback" class="break-all text-xs text-muted">
                      Fallback: <span class="font-mono">{{ row.fallback }}</span>
                    </p>
                    <p v-if="row.assignmentSource === 'override'" class="mt-1 text-xs text-muted">
                      Default: {{ row.defaultModelId }}
                    </p>
                    <div v-if="row.runtimeSupportedProviders.length" class="flex flex-wrap gap-1.5">
                      <UBadge
                        v-for="provider in row.runtimeSupportedProviders"
                        :key="provider"
                        color="neutral"
                        variant="soft"
                        size="sm"
                      >
                        {{ provider }}
                      </UBadge>
                    </div>
                    <p v-if="row.assignmentSource === 'override'" class="text-xs text-muted">Default provider: {{ row.defaultProvider }}</p>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <div class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge :color="row.assignmentSource === 'override' ? 'warning' : 'neutral'" variant="soft" size="sm">
                        {{ row.assignmentSource === 'override' ? 'Override' : 'Default' }}
                      </UBadge>
                      <span v-if="row.assignmentUpdatedAt" class="text-xs text-muted">
                        Updated {{ dateLabel(row.assignmentUpdatedAt) }}
                      </span>
                    </div>

                    <div v-if="row.assignmentEditable && assignmentDrafts[row.featureKey]" class="grid gap-2 lg:grid-cols-5">
                      <USelect
                        v-model="assignmentDrafts[row.featureKey].provider"
                        :items="assignmentProviderOptionsFor(row)"
                        value-key="value"
                        size="sm"
                        aria-label="Assigned provider"
                        :disabled="!data?.assignments.available || assignmentSaving[row.featureKey] || !row.runtimeControlEnabled"
                        class="lg:col-span-2"
                      />
                      <USelect
                        v-model="assignmentDrafts[row.featureKey].modelId"
                        :items="modelOptionsFor(row)"
                        value-key="value"
                        size="sm"
                        aria-label="Assigned model"
                        :disabled="!data?.assignments.available || assignmentSaving[row.featureKey] || !row.runtimeControlEnabled"
                        class="lg:col-span-3"
                      />
                      <USelect
                        v-model="assignmentDrafts[row.featureKey].fallbackModelId"
                        :items="fallbackOptionsFor(row)"
                        value-key="value"
                        size="sm"
                        aria-label="Assigned fallback model"
                        :disabled="!data?.assignments.available || assignmentSaving[row.featureKey] || !row.runtimeControlEnabled"
                        class="lg:col-span-5"
                      />
                      <UTextarea
                        v-model="assignmentDrafts[row.featureKey].notes"
                        :rows="1"
                        maxlength="500"
                        placeholder="Assignment note"
                        aria-label="Assignment note"
                        :disabled="!data?.assignments.available || assignmentSaving[row.featureKey] || !row.runtimeControlEnabled"
                        class="lg:col-span-5"
                      />
                    </div>
                    <p v-else class="text-xs text-muted">
                      Duplicate feature key; split this registry row before enabling direct assignment.
                    </p>
                    <p v-if="row.assignmentEditable && !row.runtimeControlEnabled" class="text-xs text-muted">
                      Dashboard save is disabled until this feature is wired into the runtime assignment resolver.
                    </p>

                    <div class="flex flex-wrap gap-2">
                      <UButton
                        icon="i-lucide-search"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        :disabled="!row.assignmentEditable || !row.runtimeControlEnabled"
                        @click="openModelPicker(row)"
                      >
                        Browse catalog
                      </UButton>
                      <UButton
                        icon="i-lucide-save"
                        color="primary"
                        variant="soft"
                        size="sm"
                        :loading="assignmentSaving[row.featureKey]"
                        :disabled="!row.assignmentEditable || !row.runtimeControlEnabled || !data?.assignments.available || !assignmentChanged(row)"
                        @click="saveAssignment(row)"
                      >
                        Save
                      </UButton>
                      <UButton
                        icon="i-lucide-rotate-ccw"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :loading="assignmentSaving[row.featureKey]"
                        :disabled="!row.assignmentEditable || !data?.assignments.available || row.assignmentSource === 'default'"
                        @click="resetAssignment(row)"
                      >
                        Reset
                      </UButton>
                    </div>
                    <p v-if="row.assignmentNotes" class="text-xs text-muted">{{ row.assignmentNotes }}</p>
                  </div>
                </td>
                <td class="py-3">
                  <div class="min-w-0 space-y-2">
                    <p v-if="row.runtimeNotes" class="text-xs text-muted">{{ row.runtimeNotes }}</p>
                    <div v-if="row.warnings.length" class="flex flex-wrap gap-1.5">
                      <UBadge v-for="warning in row.warnings" :key="warning" color="warning" variant="soft" size="sm">
                        {{ warning }}
                      </UBadge>
                    </div>
                    <span v-else class="text-xs text-success">No warnings</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </UCard>

      <div
        v-if="modelPickerOpen"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-picker-title"
      >
        <div class="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-default bg-default shadow-xl">
          <header class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
            <div>
              <h2 id="model-picker-title" class="text-sm font-semibold text-highlighted">Cloudflare model catalog</h2>
              <p class="mt-1 text-xs text-muted">
                {{ modelPickerRow?.label || 'Select a feature' }}
                <span v-if="modelPickerData">/ {{ modelPickerData.summary.assignableModels }} assignable of {{ modelPickerData.summary.filteredModels }} shown</span>
                <span v-if="modelPickerData?.available">/ synced via {{ modelPickerData.credentialSource.accountId }} + {{ modelPickerData.credentialSource.token }}</span>
              </p>
            </div>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Close model catalog" @click="closeModelPicker()" />
          </header>

          <div class="border-b border-default p-4">
            <UAlert
              v-if="modelPickerData && !modelPickerData.available"
              color="warning"
              variant="soft"
              icon="i-lucide-cloud-off"
              title="Cloudflare catalog sync not active"
              :description="modelPickerData.reason || 'Showing local model registry fallback.'"
              class="mb-3"
            />
            <UAlert
              v-if="modelPickerError"
              color="error"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="Couldn't load Cloudflare models"
              :description="modelPickerError"
              class="mb-3"
            />

            <div class="grid gap-2 md:grid-cols-12">
              <input
                v-model="modelPickerSearch"
                class="md:col-span-5 rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
                type="search"
                placeholder="Search models, providers, authors, capabilities"
                aria-label="Search Cloudflare models"
                @keydown.enter.prevent="applyModelPickerFilters()"
              >
              <select
                v-model="modelPickerProvider"
                class="md:col-span-2 rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
                aria-label="Filter model provider"
              >
                <option v-for="item in modelPickerProviderOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
              <select
                v-model="modelPickerTask"
                class="md:col-span-2 rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
                aria-label="Filter model task"
              >
                <option v-for="item in modelPickerTaskOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
              <select
                v-model="modelPickerCapability"
                class="md:col-span-2 rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
                aria-label="Filter model capability"
              >
                <option v-for="item in modelPickerCapabilityOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
              <UButton
                icon="i-lucide-filter"
                color="primary"
                variant="soft"
                size="sm"
                :loading="modelPickerPending"
                class="justify-center"
                @click="applyModelPickerFilters()"
              >
                Filter
              </UButton>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <div v-if="modelPickerPending && !modelPickerData" class="py-12 text-center text-sm text-muted">
              Loading Cloudflare catalog...
            </div>
            <div v-else-if="!modelPickerData?.models.length" class="py-12 text-center text-sm text-muted">
              No models match those filters.
            </div>
            <ul v-else class="divide-y divide-default">
              <li v-for="model in modelPickerData.models" :key="model.id" class="p-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-medium text-default">{{ model.label }}</p>
                      <UBadge :color="model.recommendation.level === 'recommended' ? 'success' : model.assignable ? 'neutral' : 'warning'" variant="soft" size="sm">
                        {{ model.recommendation.level }}
                      </UBadge>
                      <UBadge :color="model.source === 'cloudflare_hosted' ? 'success' : 'neutral'" variant="soft" size="sm">
                        {{ model.source.replace(/_/g, ' ') }}
                      </UBadge>
                    </div>
                    <p class="mt-1 font-mono text-xs text-muted">{{ model.modelId }}</p>
                    <p class="mt-1 text-xs text-muted">
                      {{ model.providerLabel }} / {{ model.taskLabel }} / {{ model.modality }}
                      <span v-if="model.author">/ {{ model.author }}</span>
                    </p>
                    <div v-if="model.capabilities.length" class="mt-2 flex flex-wrap gap-1.5">
                      <UBadge v-for="capability in model.capabilities.slice(0, 6)" :key="capability" color="neutral" variant="soft" size="sm">
                        {{ capability.replace(/_/g, ' ') }}
                      </UBadge>
                    </div>
                    <p v-if="model.recommendation.reasons.length" class="mt-2 text-xs text-muted">
                      {{ model.recommendation.reasons.slice(0, 2).join(' ') }}
                    </p>
                    <p v-if="model.recommendation.blockers.length" class="mt-2 text-xs text-warning">
                      {{ model.recommendation.blockers[0] }}
                    </p>
                  </div>
                  <UButton
                    icon="i-lucide-check"
                    color="primary"
                    variant="soft"
                    size="sm"
                    :disabled="!model.assignable"
                    class="shrink-0"
                    @click="useCatalogModel(model)"
                  >
                    Use model
                  </UButton>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
