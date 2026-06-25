<script setup lang="ts">
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
}

type ModelMapResponse = {
  rows: ModelMapRow[]
  summary: {
    totalRows: number
    providers: string[]
    highRiskCount: number
    warningCount: number
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
    { label: 'Read tools', value: (summary?.orchestratorReadToolRuns ?? 0).toLocaleString(), icon: 'i-lucide-search-check' },
    { label: 'Reports', value: (summary?.totalReports ?? 0).toLocaleString(), icon: 'i-lucide-newspaper' },
    { label: 'Avg duration', value: durationLabel(summary?.avgDurationMs ?? 0), icon: 'i-lucide-timer' },
  ]
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

        <div class="mt-3 grid gap-3 text-sm sm:grid-cols-4">
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
            <span class="text-muted">Last run</span>
            <span class="text-xs text-muted">{{ dateLabel(agentRunsData?.summary.lastRunAt ?? null) }}</span>
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
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  <p>{{ run.reportCount.toLocaleString() }} reports</p>
                  <p>{{ run.unreadReportCount.toLocaleString() }} unread</p>
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
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Model map</h2>
              <p class="text-xs text-muted">Visibility-first inventory before the invocation ledger lands.</p>
            </div>
            <UBadge color="neutral" variant="soft">{{ data?.rows.length ?? 0 }} rows</UBadge>
          </div>
        </template>

        <div v-if="pending && !data" class="py-10 text-center text-sm text-muted">
          Loading model inventory...
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th class="pb-2 pr-4">Feature</th>
                <th class="pb-2 pr-4">Model</th>
                <th class="pb-2 pr-4">Provider</th>
                <th class="pb-2 pr-4">Status</th>
                <th class="pb-2 pr-4">Risk</th>
                <th class="pb-2 pr-4">Pricing</th>
                <th class="pb-2 pr-4">Fallback</th>
                <th class="pb-2">Warnings</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in data?.rows || []" :key="`${row.featureKey}:${row.modelId}`" class="align-top">
                <td class="py-3 pr-4">
                  <div class="min-w-[220px]">
                    <p class="font-medium text-default">{{ row.label }}</p>
                    <p class="text-xs text-muted">{{ row.featureKey }}</p>
                    <p class="mt-1 text-xs text-muted">{{ row.surface }} / {{ row.owner }}</p>
                    <p class="mt-1 font-mono text-[11px] text-muted">{{ row.sourceFile }}</p>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <div class="min-w-[220px]">
                    <p class="font-mono text-xs text-default">{{ row.modelId }}</p>
                    <p class="mt-1 text-xs text-muted">{{ row.modality }}</p>
                  </div>
                </td>
                <td class="py-3 pr-4">
                  <span class="font-medium text-default">{{ row.provider }}</span>
                </td>
                <td class="py-3 pr-4">
                  <UBadge :color="statusColor[row.status]" variant="soft" size="sm">
                    {{ row.status }}
                  </UBadge>
                </td>
                <td class="py-3 pr-4">
                  <UBadge :color="riskColor[row.riskTier]" variant="soft" size="sm">
                    {{ row.riskTier }}
                  </UBadge>
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  {{ pricingLabel(row) }}
                </td>
                <td class="py-3 pr-4 text-xs text-muted">
                  <span class="font-mono">{{ row.fallback || '-' }}</span>
                </td>
                <td class="py-3">
                  <div v-if="row.warnings.length" class="flex max-w-sm flex-wrap gap-1.5">
                    <UBadge v-for="warning in row.warnings" :key="warning" color="warning" variant="soft" size="sm">
                      {{ warning }}
                    </UBadge>
                  </div>
                  <span v-else class="text-xs text-success">No warnings</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
