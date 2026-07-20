import { queryOne, queryRows } from '~~/server/utils/db'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} from '~~/server/utils/ai/platformAgentRuns'
import type { PlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'

export interface FinancialWatchAgentRuntimeInput {
  prompt: string
  scope: PlatformAgentScope
  userId?: string | null
  route?: string
}

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function watchStatus(previous: { fingerprint: string, severity_score: number } | null, fingerprint: string, severityScore: number) {
  if (!previous) return 'new'
  if (severityScore === 0 && previous.severity_score > 0) return 'resolved'
  if (fingerprint === previous.fingerprint) return 'unchanged'
  if (severityScore > previous.severity_score) return 'worsened'
  if (severityScore < previous.severity_score) return 'improved'
  return 'unchanged'
}

function rowMatchesTenant(row: Record<string, unknown>, tenantId: string) {
  return row.tenant_id === tenantId
}

function rowMatchesClientScope(
  row: Record<string, unknown>,
  clientId: string | null,
  allowedClientIds: readonly string[],
) {
  if (!Object.prototype.hasOwnProperty.call(row, 'client_id')) return false
  if (row.client_id !== null && typeof row.client_id !== 'string') return false
  const rowClientId = row.client_id
  return clientId ? rowClientId === clientId : rowClientId === null || allowedClientIds.includes(rowClientId)
}

async function persistFinancialWatchState(input: {
  tenantId: string
  clientId: string | null
  fingerprint: string
  severityScore: number
  summary: Record<string, unknown>
}) {
  const scopeKey = input.clientId ? `client:${input.clientId}` : 'agency'
  const previous = await queryOne<{ fingerprint: string, severity_score: number }>(
    `SELECT fingerprint, severity_score
     FROM platform_agent_watch_states
     WHERE agent_type = 'financial_watch'
       AND tenant_id = $1
       AND scope_key = $2`,
    [input.tenantId, scopeKey],
  )
  const stateStatus = watchStatus(previous, input.fingerprint, input.severityScore)
  const row = await queryOne<any>(
    `INSERT INTO platform_agent_watch_states
       (agent_type, tenant_id, scope_key, fingerprint, previous_fingerprint, severity_score,
        previous_severity_score, state_status, summary)
     VALUES ('financial_watch', $1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (agent_type, tenant_id, scope_key)
     DO UPDATE SET
       previous_fingerprint = platform_agent_watch_states.fingerprint,
       fingerprint = EXCLUDED.fingerprint,
       previous_severity_score = platform_agent_watch_states.severity_score,
       severity_score = EXCLUDED.severity_score,
       state_status = EXCLUDED.state_status,
       summary = EXCLUDED.summary,
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING state_status, previous_fingerprint, previous_severity_score`,
    [
      input.tenantId,
      scopeKey,
      input.fingerprint,
      previous?.fingerprint ?? null,
      input.severityScore,
      previous?.severity_score ?? null,
      stateStatus,
      JSON.stringify(input.summary),
    ],
  )
  return {
    scopeKey,
    status: row?.state_status || stateStatus,
    previousFingerprint: row?.previous_fingerprint ?? previous?.fingerprint ?? null,
    previousSeverityScore: row?.previous_severity_score ?? previous?.severity_score ?? null,
  }
}

export async function runFinancialWatchAgentRequest(input: FinancialWatchAgentRuntimeInput) {
  const prompt = input.prompt.trim()
  const tenantId = (input.scope.tenantId ?? '').trim()
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'tenantId required' })
  const clientId = input.scope.client.kind === 'single' ? input.scope.client.clientId : null
  const allowedClientIds = input.scope.client.kind === 'single'
    ? [input.scope.client.clientId]
    : [...input.scope.client.clientIds]

  const startedAtMs = Date.now()
  const run = await startPlatformAgentRun({
    agentType: 'financial_watch',
    featureKey: 'agent_financial_watch',
    mode: 'read_only',
    userId: input.userId ?? null,
    clientId,
    route: input.route ?? '/agency/ai/finance',
    prompt,
    context: {
      tenantId,
      clientId,
      clientScopeCount: allowedClientIds.length,
    },
  })

  try {
    const [unscopedReportRows, unscopedRecommendationRows, unscopedBudgetAlertRows] = await Promise.all([
      queryRows<any>(
        `SELECT id::text, tenant_id, period_key, period_label, grade, score, headline, verdict, payload, generated_at::text
         FROM financial_advisor_reports
         WHERE tenant_id = $1
         ORDER BY generated_at DESC
         LIMIT 3`,
        [tenantId],
      ),
      queryRows<any>(
        `SELECT id::text, tenant_id, client_id::text, title, action, impact, priority, status, target_metric, target_direction, due_date::text, created_at::text
         FROM recommendations
         WHERE tenant_id = $1
           AND status IN ('open', 'in_progress')
           AND (
             ($2::uuid IS NOT NULL AND client_id = $2::uuid)
             OR ($2::uuid IS NULL AND ($3::uuid[] IS NULL OR client_id IS NULL OR client_id = ANY($3::uuid[])))
           )
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 10`,
        [tenantId, clientId, allowedClientIds],
      ),
      queryRows<any>(
        `SELECT id::text, tenant_id, client_id::text, alert_type, severity, status, message, budget_amount, actual_amount, variance_amount, created_at::text
         FROM budget_alerts
         WHERE tenant_id = $1
           AND status IN ('active', 'acknowledged')
           AND (
             ($2::uuid IS NOT NULL AND client_id = $2::uuid)
             OR ($2::uuid IS NULL AND ($3::uuid[] IS NULL OR client_id IS NULL OR client_id = ANY($3::uuid[])))
           )
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 10`,
        [tenantId, clientId, allowedClientIds],
      ).catch(() => []),
    ])

    // SQL predicates are the primary boundary. These checks are a second boundary
    // so a future join/regression cannot turn mixed source rows into model output.
    const reportRows = unscopedReportRows.filter(row => rowMatchesTenant(row, tenantId))
    const recommendationRows = unscopedRecommendationRows.filter(row => (
      rowMatchesTenant(row, tenantId) && rowMatchesClientScope(row, clientId, allowedClientIds)
    ))
    const budgetAlertRows = unscopedBudgetAlertRows.filter(row => (
      rowMatchesTenant(row, tenantId) && rowMatchesClientScope(row, clientId, allowedClientIds)
    ))

    const latestReport = reportRows[0] ?? null
    const highPriorityRecommendations = recommendationRows.filter(row => row.priority === 'high').length
    const activeBudgetAlerts = budgetAlertRows.filter(row => row.status === 'active').length
    const criticalBudgetAlerts = budgetAlertRows.filter(row => row.severity === 'critical').length
    const payload = latestReport?.payload && typeof latestReport.payload === 'object' ? latestReport.payload : {}
    const financialAlerts = Array.isArray(payload.alerts) ? payload.alerts : []
    const risks = Array.isArray(payload.risks) ? payload.risks : []

    const findings = [
      latestReport
        ? {
            severity: latestReport.score != null && toNumber(latestReport.score) < 60 ? 'warning' : 'info',
            title: `Latest advisor grade ${latestReport.grade || 'unknown'}`,
            detail: latestReport.verdict || latestReport.headline || 'Latest financial advisor report is available.',
          }
        : {
            severity: 'warning',
            title: 'No archived financial advisor report found',
            detail: 'Run the Financial Advisor so Financial Watch has a current stored snapshot to review.',
          },
      highPriorityRecommendations > 0
        ? {
            severity: 'warning',
            title: `${highPriorityRecommendations} high-priority recommendation${highPriorityRecommendations === 1 ? '' : 's'} open`,
            detail: 'Review open finance recommendations before making new commitments.',
          }
        : null,
      criticalBudgetAlerts > 0
        ? {
            severity: 'warning',
            title: `${criticalBudgetAlerts} critical budget alert${criticalBudgetAlerts === 1 ? '' : 's'}`,
            detail: 'Resolve critical budget alerts or explicitly acknowledge the risk.',
          }
        : null,
    ].filter((value): value is { severity: string, title: string, detail: string } => Boolean(value))
    const severityScore = (latestReport?.score != null && toNumber(latestReport.score) < 60 ? 2 : 0)
      + highPriorityRecommendations
      + activeBudgetAlerts
      + (criticalBudgetAlerts * 2)
      + financialAlerts.filter((alert: any) => alert?.level === 'critical').length * 2
      + financialAlerts.filter((alert: any) => alert?.level === 'warning').length
    const fingerprint = stableStringify({
      latestReportId: latestReport?.id ?? null,
      latestScore: latestReport?.score ?? null,
      highPriorityRecommendationIds: recommendationRows.filter(row => row.priority === 'high').map(row => row.id).sort(),
      activeBudgetAlertIds: budgetAlertRows.filter(row => row.status === 'active').map(row => row.id).sort(),
      advisorAlerts: financialAlerts.map((alert: any) => `${alert?.level || 'info'}:${alert?.message || ''}`).sort(),
    })
    const watchState = await persistFinancialWatchState({
      tenantId,
      clientId,
      fingerprint,
      severityScore,
      summary: {
        latestReportId: latestReport?.id ?? null,
        highPriorityRecommendations,
        activeBudgetAlerts,
        criticalBudgetAlerts,
      },
    })

    const response = {
      mode: 'read_only' as const,
      answer: latestReport
        ? `Financial Watch reviewed ${reportRows.length} archived advisor report${reportRows.length === 1 ? '' : 's'}, ${recommendationRows.length} active recommendation${recommendationRows.length === 1 ? '' : 's'}, and ${budgetAlertRows.length} budget alert${budgetAlertRows.length === 1 ? '' : 's'}.`
        : 'Financial Watch could not find an archived advisor report for this tenant yet.',
      summary: {
        tenantId,
        clientId,
        latestReport: latestReport ? {
          id: latestReport.id,
          periodKey: latestReport.period_key,
          periodLabel: latestReport.period_label,
          grade: latestReport.grade,
          score: latestReport.score,
          headline: latestReport.headline,
          generatedAt: latestReport.generated_at,
        } : null,
        reportCount: reportRows.length,
        activeRecommendationCount: recommendationRows.length,
        highPriorityRecommendationCount: highPriorityRecommendations,
        activeBudgetAlertCount: activeBudgetAlerts,
        criticalBudgetAlertCount: criticalBudgetAlerts,
        advisorAlertCount: financialAlerts.length,
        riskCount: risks.length,
        watchState,
        severityScore,
      },
      findings,
      recommendations: recommendationRows,
      alerts: [
        ...financialAlerts.slice(0, 5).map((alert: any) => ({
          source: 'financial_advisor',
          level: alert.level || 'info',
          message: alert.message || String(alert),
        })),
        ...budgetAlertRows.slice(0, 5).map((alert: any) => ({
          source: 'budget_alert',
          level: alert.severity || 'info',
          message: alert.message || alert.alert_type,
        })),
      ],
      proposedActions: [],
      audit: {
        modelFeatureKey: 'agent_financial_watch',
        toolCallCount: 3,
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
          tenantId,
          clientId,
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
