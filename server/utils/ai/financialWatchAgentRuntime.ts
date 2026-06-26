import { queryRows } from '~~/server/utils/db'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} from '~~/server/utils/ai/platformAgentRuns'

export interface FinancialWatchAgentRuntimeInput {
  prompt: string
  tenantId: string
  clientId?: string | null
  userId?: string | null
  route?: string
}

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export async function runFinancialWatchAgentRequest(input: FinancialWatchAgentRuntimeInput) {
  const prompt = input.prompt.trim()
  const tenantId = input.tenantId.trim()
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'tenantId required' })

  const startedAtMs = Date.now()
  const run = await startPlatformAgentRun({
    agentType: 'financial_watch',
    featureKey: 'agent_financial_watch',
    mode: 'read_only',
    userId: input.userId ?? null,
    clientId: input.clientId ?? null,
    route: input.route ?? '/agency/ai/finance',
    prompt,
    context: {
      tenantId,
      clientId: input.clientId ?? null,
    },
  })

  try {
    const [reportRows, recommendationRows, budgetAlertRows] = await Promise.all([
      queryRows<any>(
        `SELECT id::text, period_key, period_label, grade, score, headline, verdict, payload, generated_at::text
         FROM financial_advisor_reports
         WHERE tenant_id = $1
         ORDER BY generated_at DESC
         LIMIT 3`,
        [tenantId],
      ),
      queryRows<any>(
        `SELECT id::text, title, action, impact, priority, status, target_metric, target_direction, due_date::text, created_at::text
         FROM recommendations
         WHERE tenant_id = $1
           AND status IN ('open', 'in_progress')
           AND ($2::uuid IS NULL OR client_id = $2::uuid)
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 10`,
        [tenantId, input.clientId ?? null],
      ),
      queryRows<any>(
        `SELECT id::text, alert_type, severity, status, message, budget_amount, actual_amount, variance_amount, created_at::text
         FROM budget_alerts
         WHERE status IN ('active', 'acknowledged')
           AND ($1::uuid IS NULL OR client_id = $1::uuid)
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 10`,
        [input.clientId ?? null],
      ).catch(() => []),
    ])

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

    const response = {
      mode: 'read_only' as const,
      answer: latestReport
        ? `Financial Watch reviewed ${reportRows.length} archived advisor report${reportRows.length === 1 ? '' : 's'}, ${recommendationRows.length} active recommendation${recommendationRows.length === 1 ? '' : 's'}, and ${budgetAlertRows.length} budget alert${budgetAlertRows.length === 1 ? '' : 's'}.`
        : 'Financial Watch could not find an archived advisor report for this tenant yet.',
      summary: {
        tenantId,
        clientId: input.clientId ?? null,
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
          clientId: input.clientId ?? null,
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
