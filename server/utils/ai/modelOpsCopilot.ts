import type { AiModelAssignmentRow } from '~~/server/utils/ai/modelAssignments'
import type {
  CloudflareModelCatalogResult,
  RecommendedCloudflareCatalogModel,
} from '~~/server/utils/ai/cloudflareModelCatalog'
import { recommendCloudflareModelsForFeature } from '~~/server/utils/ai/cloudflareModelCatalog'

export type ModelOpsCopilotSeverity = 'critical' | 'warning' | 'info'

export interface ModelOpsCopilotFinding {
  severity: ModelOpsCopilotSeverity
  title: string
  detail: string
  featureKey?: string
}

export interface ModelOpsCopilotProposedAssignment {
  featureKey: string
  provider: string
  modelId: string
  fallbackModelId: string | null
  notes: string
  rationale: string[]
}

export interface ModelOpsCopilotInput {
  prompt: string
  featureKey?: string | null
  rows: AiModelAssignmentRow[]
  catalog: CloudflareModelCatalogResult
  telemetry?: ModelOpsCopilotTelemetry | null
}

export interface ModelOpsCopilotTelemetry {
  available: boolean
  totalInvocations: number
  fallbackRate: number
  errorRate: number
  gatewayRate: number
  missingMappedFeatureCount: number
  topFeatureKey: string | null
  topModelKey: string | null
  agentFailureRate: number
  orchestratorReadToolFailures: number
}

export interface ModelOpsCopilotResponse {
  mode: 'read_only'
  answer: string
  findings: ModelOpsCopilotFinding[]
  recommendedActions: string[]
  proposedAssignment: ModelOpsCopilotProposedAssignment | null
  context: {
    runtimeControllableCount: number
    overrideCount: number
    catalogSource: CloudflareModelCatalogResult['source']
    catalogAvailable: boolean
    telemetryAvailable: boolean
    fallbackRate: number
    errorRate: number
    gatewayRate: number
  }
}

function sentence(value: string) {
  return value.endsWith('.') ? value : `${value}.`
}

function firstAssignableRecommendation(
  row: AiModelAssignmentRow,
  catalog: CloudflareModelCatalogResult
): RecommendedCloudflareCatalogModel | null {
  return recommendCloudflareModelsForFeature(row, catalog.models)
    .find(model => model.assignable && model.modelId !== row.assignedModelId) ?? null
}

function selectedFeature(input: ModelOpsCopilotInput) {
  if (input.featureKey) return input.rows.find(row => row.featureKey === input.featureKey) ?? null
  const prompt = input.prompt.toLowerCase()
  return input.rows.find(row =>
    prompt.includes(row.featureKey.toLowerCase())
    || prompt.includes(row.label.toLowerCase())
  ) ?? null
}

function buildFindings(
  rows: AiModelAssignmentRow[],
  catalog: CloudflareModelCatalogResult,
  telemetry: ModelOpsCopilotTelemetry | null | undefined
): ModelOpsCopilotFinding[] {
  const findings: ModelOpsCopilotFinding[] = []
  const directRows = rows.filter(row => row.runtimeRoutingStatus === 'direct')
  const workerRows = rows.filter(row => row.runtimeRoutingStatus === 'worker_side')
  const warningRows = rows.filter(row => row.warnings.length > 0)
  const highRiskDefaults = rows.filter(row => row.riskTier === 'high' && row.assignmentSource === 'default' && row.runtimeControlEnabled)

  if (!catalog.available) {
    findings.push({
      severity: 'warning',
      title: 'Cloudflare catalog is using the local fallback',
      detail: catalog.reason || 'Live Cloudflare model search is not available, so recommendations are limited to the local registry.',
    })
  }
  if (directRows.length) {
    findings.push({
      severity: 'warning',
      title: `${directRows.length} model map rows are not runtime-routed`,
      detail: 'These rows are visible in Model Ops but cannot be safely edited until their call sites use the assignment resolver.',
    })
  }
  if (workerRows.length) {
    findings.push({
      severity: 'info',
      title: `${workerRows.length} worker-side rows need rollout plumbing`,
      detail: 'Worker jobs should receive assignment snapshots or call a runtime resolver before dashboard overrides can affect them.',
    })
  }
  if (warningRows.length) {
    findings.push({
      severity: 'warning',
      title: `${warningRows.length} rows have model registry warnings`,
      detail: 'Review deprecated, unknown, or duplicate rows before broadening assignment control.',
      featureKey: warningRows[0].featureKey,
    })
  }
  if (highRiskDefaults.length) {
    findings.push({
      severity: 'info',
      title: `${highRiskDefaults.length} high-risk routed surfaces still use defaults`,
      detail: 'These are good candidates for explicit owner-reviewed assignments and fallback notes.',
      featureKey: highRiskDefaults[0].featureKey,
    })
  }
  if (!telemetry?.available) {
    findings.push({
      severity: 'info',
      title: 'Invocation telemetry is not available to Copilot',
      detail: 'Recommendations are based on registry and catalog compatibility only until the invocation ledger has data.',
    })
  } else {
    if (telemetry.errorRate > 0) {
      findings.unshift({
        severity: 'critical',
        title: `AI invocation error rate is ${Math.round(telemetry.errorRate * 100)}%`,
        detail: telemetry.topFeatureKey
          ? `Prioritize the high-volume feature ${telemetry.topFeatureKey} and recent error rows before broad assignment changes.`
          : 'Prioritize recent error rows before broad assignment changes.',
        featureKey: telemetry.topFeatureKey ?? undefined,
      })
    }
    if (telemetry.fallbackRate > 0.1) {
      findings.push({
        severity: 'warning',
        title: `Fallback usage is ${Math.round(telemetry.fallbackRate * 100)}%`,
        detail: 'Review model availability, gateway routing, and fallback quality before switching more traffic.',
      })
    }
    if (telemetry.missingMappedFeatureCount > 0) {
      findings.push({
        severity: 'info',
        title: `${telemetry.missingMappedFeatureCount} mapped features have no recent telemetry`,
        detail: 'Treat unused or unobserved surfaces conservatively because Copilot cannot validate production behavior from invocation rows.',
      })
    }
    if (telemetry.orchestratorReadToolFailures > 0 || telemetry.agentFailureRate > 0) {
      findings.push({
        severity: 'warning',
        title: 'Agent run telemetry shows recent failures',
        detail: 'Resolve orchestrator read-tool or agent failures before relying on agentic assignment recommendations.',
      })
    }
  }

  return findings.slice(0, 6)
}

export function createModelOpsCopilotResponse(input: ModelOpsCopilotInput): ModelOpsCopilotResponse {
  const feature = selectedFeature(input)
  const telemetry = input.telemetry ?? null
  const findings = buildFindings(input.rows, input.catalog, telemetry)
  const runtimeControllableCount = input.rows.filter(row => row.runtimeControlEnabled).length
  const overrideCount = input.rows.filter(row => row.assignmentSource === 'override').length
  const recommendedActions = [
    'Prioritize runtime-routed high-risk rows before direct or worker-side rows.',
    'Use Cloudflare-hosted Workers AI models where the feature supports them and task modality matches.',
    'Keep assignment changes human-confirmed through the existing Save action so audit history stays intact.',
  ]

  let proposedAssignment: ModelOpsCopilotProposedAssignment | null = null
  let answer = `I reviewed ${input.rows.length} mapped AI surfaces. ${runtimeControllableCount} are runtime-controllable and ${overrideCount} currently use admin overrides.`
  if (telemetry?.available) {
    answer += ` Recent telemetry shows ${telemetry.totalInvocations} calls, ${Math.round(telemetry.errorRate * 100)}% errors, ${Math.round(telemetry.fallbackRate * 100)}% fallback usage, and ${Math.round(telemetry.gatewayRate * 100)}% gateway routing.`
  }

  if (feature) {
    answer += ` For ${feature.label}, the runtime status is ${feature.runtimeRoutingLabel.toLowerCase()} and the current model is ${feature.assignedProvider}/${feature.assignedModelId}.`
    if (!feature.assignmentEditable || !feature.runtimeControlEnabled) {
      findings.unshift({
        severity: 'warning',
        title: 'Selected feature cannot be changed from the dashboard yet',
        detail: feature.runtimeNotes || 'The feature is not editable or not wired to runtime assignment control.',
        featureKey: feature.featureKey,
      })
    } else {
      const recommendation = firstAssignableRecommendation(feature, input.catalog)
      if (recommendation) {
        proposedAssignment = {
          featureKey: feature.featureKey,
          provider: recommendation.provider,
          modelId: recommendation.modelId,
          fallbackModelId: feature.assignedFallback,
          notes: `Model Ops Copilot draft: ${recommendation.label} recommended for ${feature.label}.`,
          rationale: recommendation.recommendation.reasons.map(sentence).slice(0, 4),
        }
        answer += ` I can draft ${recommendation.provider}/${recommendation.modelId} because it is catalog-compatible for this feature.`
      } else {
        answer += ' I did not find a better assignable catalog model than the current assignment.'
      }
    }
  } else if (findings.length) {
    answer += ` The top issue is: ${findings[0].title}.`
  }

  return {
    mode: 'read_only',
    answer,
    findings: findings.slice(0, 6),
    recommendedActions,
    proposedAssignment,
    context: {
      runtimeControllableCount,
      overrideCount,
      catalogSource: input.catalog.source,
      catalogAvailable: input.catalog.available,
      telemetryAvailable: Boolean(telemetry?.available),
      fallbackRate: telemetry?.fallbackRate ?? 0,
      errorRate: telemetry?.errorRate ?? 0,
      gatewayRate: telemetry?.gatewayRate ?? 0,
    },
  }
}
