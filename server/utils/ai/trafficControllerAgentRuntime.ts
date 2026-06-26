import { queryRows } from '~~/server/utils/db'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} from '~~/server/utils/ai/platformAgentRuns'

export interface TrafficControllerAgentRuntimeInput {
  prompt: string
  clientId?: string | null
  userId?: string | null
  route?: string
}

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function agentKey(runType: string) {
  return runType.replace(/^platform_agent_/, '')
}

function recommendationFromSignals(signals: Record<string, any>) {
  const spend = signals.spend_controller
  const publishing = signals.publishing_planner
  const finance = signals.financial_watch
  const recommendations = []

  const spendProposals = toNumber(spend?.summary?.proposedActionCount)
  const spendBlocked = toNumber(spend?.summary?.blockedActionCount)
  const financeSeverity = toNumber(finance?.summary?.severityScore)
  const draftCount = toNumber(publishing?.summary?.proposedActionCount)

  if (financeSeverity >= 4) {
    recommendations.push({
      priority: 'high',
      area: 'finance',
      title: 'Hold expansion until financial watch risks are reviewed',
      rationale: 'Financial Watch severity is elevated, so budget or publishing expansion should wait for owner review.',
    })
  }
  if (spendProposals > 0 || spendBlocked > 0) {
    recommendations.push({
      priority: spendBlocked > 0 ? 'high' : 'medium',
      area: 'paid-media',
      title: 'Review spend controller proposals before reallocating budget',
      rationale: `${spendProposals} spend proposal${spendProposals === 1 ? '' : 's'} and ${spendBlocked} blocked action${spendBlocked === 1 ? '' : 's'} were reported recently.`,
    })
  }
  if (draftCount > 0) {
    recommendations.push({
      priority: 'medium',
      area: 'publishing',
      title: 'Use approved draft capacity before creating more content',
      rationale: `${draftCount} publishing draft suggestion${draftCount === 1 ? '' : 's'} exist from recent planner runs.`,
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      priority: 'low',
      area: 'operations',
      title: 'No cross-studio traffic blockers detected',
      rationale: 'Recent platform-agent signals do not show finance, spend, or publishing blockers.',
    })
  }
  return recommendations
}

export async function runTrafficControllerAgentRequest(input: TrafficControllerAgentRuntimeInput) {
  const prompt = input.prompt.trim()
  const startedAtMs = Date.now()
  const run = await startPlatformAgentRun({
    agentType: 'traffic_controller',
    featureKey: 'agent_traffic_controller',
    mode: 'read_only',
    userId: input.userId ?? null,
    clientId: input.clientId ?? null,
    route: input.route ?? '/agency/traffic-controller',
    prompt,
    context: {
      clientId: input.clientId ?? null,
    },
  })

  try {
    const rows = await queryRows<any>(
      `SELECT DISTINCT ON (run_type)
          id::text,
          run_type,
          status,
          checks_performed,
          findings_count,
          summary,
          completed_at::text,
          created_at::text
       FROM ai_agent_runs
       WHERE run_type IN (
           'platform_agent_spend_controller',
           'platform_agent_publishing_planner',
           'platform_agent_financial_watch'
         )
         AND ($1::text IS NULL OR summary->>'clientId' = $1 OR summary->'context'->>'clientId' = $1)
       ORDER BY run_type, created_at DESC
       LIMIT 3`,
      [input.clientId ?? null],
    )

    const signals = Object.fromEntries(rows.map(row => [agentKey(row.run_type), row]))
    const recommendations = recommendationFromSignals(signals)
    const highPriorityCount = recommendations.filter(item => item.priority === 'high').length
    const missingSignals = ['spend_controller', 'publishing_planner', 'financial_watch'].filter(key => !signals[key])
    const findings = [
      missingSignals.length
        ? {
            severity: 'warning',
            title: 'Some platform signals are missing',
            detail: `No recent signal found for ${missingSignals.join(', ')}.`,
          }
        : null,
      highPriorityCount
        ? {
            severity: 'warning',
            title: `${highPriorityCount} high-priority traffic recommendation${highPriorityCount === 1 ? '' : 's'}`,
            detail: 'Review these before approving budget, publishing, or finance changes.',
          }
        : {
            severity: 'info',
            title: 'Traffic controller found no high-priority blocker',
            detail: 'Recent platform signals are suitable for normal review.',
          },
    ].filter((value): value is { severity: string, title: string, detail: string } => Boolean(value))

    const response = {
      mode: 'read_only' as const,
      answer: `Traffic Controller reviewed ${rows.length} platform signal${rows.length === 1 ? '' : 's'} and produced ${recommendations.length} recommendation${recommendations.length === 1 ? '' : 's'}.`,
      summary: {
        clientId: input.clientId ?? null,
        signalCount: rows.length,
        missingSignals,
        highPriorityCount,
      },
      signals: rows.map(row => ({
        id: row.id,
        agentType: agentKey(row.run_type),
        status: row.status,
        checksPerformed: toNumber(row.checks_performed),
        findingsCount: toNumber(row.findings_count),
        completedAt: row.completed_at,
        createdAt: row.created_at,
        summary: row.summary || {},
      })),
      findings,
      recommendations,
      proposedActions: [],
      audit: {
        modelFeatureKey: 'agent_traffic_controller',
        toolCallCount: 1,
        blockedActionCount: 0,
        runLoggingAvailable: run.ok,
      },
    }

    if (run.ok) {
      await completePlatformAgentRun({
        runId: run.runId,
        startedAtMs,
        toolCallCount: response.audit.toolCallCount,
        findingCount: response.findings.length,
        proposedActionCount: 0,
        blockedActionCount: 0,
        summary: {
          answerPreview: response.answer.slice(0, 240),
          clientId: input.clientId ?? null,
          highPriorityCount,
        },
      })
    }

    return {
      runId: run.ok ? run.runId : null,
      ...response,
    }
  } catch (error) {
    if (run.ok) {
      await failPlatformAgentRun({
        runId: run.runId,
        startedAtMs,
        error,
        toolCallCount: 1,
        findingCount: 0,
      })
    }
    throw error
  }
}
