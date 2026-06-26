import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

type AgentSummaryRow = {
  total_runs: string | number | null
  completed_runs: string | number | null
  failed_runs: string | number | null
  running_runs: string | number | null
  orchestrator_read_tool_runs: string | number | null
  orchestrator_read_tool_failures: string | number | null
  platform_agent_runs: string | number | null
  platform_agent_failures: string | number | null
  platform_agent_proposed_actions: string | number | null
  platform_agent_blocked_actions: string | number | null
  platform_agent_accepted_proposals: string | number | null
  platform_agent_rejected_proposals: string | number | null
  platform_agent_edited_proposals: string | number | null
  platform_agent_ignored_proposals: string | number | null
  total_reports: string | number | null
  total_findings: string | number | null
  total_notifications: string | number | null
  avg_duration_ms: string | number | null
  last_run_at: string | null
}

type AgentRunRow = {
  id: string
  run_type: string
  status: string
  started_at: string | null
  completed_at: string | null
  duration_ms: string | number | null
  checks_performed: string | number | null
  findings_count: string | number | null
  notifications_sent: string | number | null
  errors: unknown
  summary: unknown
  report_count: string | number | null
  unread_report_count: string | number | null
  proposal_accepted_count: string | number | null
  proposal_rejected_count: string | number | null
  proposal_edited_count: string | number | null
  proposal_ignored_count: string | number | null
  created_at: string
}

type AgentRunStatus = 'completed' | 'failed' | 'running' | 'other'

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function statusBucket(status: string): AgentRunStatus {
  if (status === 'completed' || status === 'failed' || status === 'running') return status
  return 'other'
}

function errorCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function summaryObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function isMissingAgentRunsError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  return err?.code === '42P01' || String(err?.message || '').includes('ai_agent_runs')
}

function unavailable(reason = 'AI agent run table is not available yet.') {
  return {
    available: false,
    reason,
    summary: {
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      orchestratorReadToolRuns: 0,
      orchestratorReadToolFailures: 0,
      platformAgentRuns: 0,
      platformAgentFailures: 0,
      platformAgentProposedActions: 0,
      platformAgentBlockedActions: 0,
      platformAgentAcceptedProposals: 0,
      platformAgentRejectedProposals: 0,
      platformAgentEditedProposals: 0,
      platformAgentIgnoredProposals: 0,
      totalReports: 0,
      totalFindings: 0,
      totalNotifications: 0,
      avgDurationMs: 0,
      lastRunAt: null,
      failureRate: 0,
    },
    recent: [],
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  try {
    const [summaryRows, recentRows] = await Promise.all([
      queryRows<AgentSummaryRow>(`
        SELECT
          COUNT(*) AS total_runs,
          COUNT(*) FILTER (WHERE r.status = 'completed') AS completed_runs,
          COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_runs,
          COUNT(*) FILTER (WHERE r.status = 'running') AS running_runs,
          COUNT(*) FILTER (WHERE r.run_type = 'ai_orchestrator_read_tool') AS orchestrator_read_tool_runs,
          COUNT(*) FILTER (WHERE r.run_type = 'ai_orchestrator_read_tool' AND r.status <> 'completed') AS orchestrator_read_tool_failures,
          COUNT(*) FILTER (WHERE r.summary->>'source' = 'platform_agent') AS platform_agent_runs,
          COUNT(*) FILTER (WHERE r.summary->>'source' = 'platform_agent' AND r.status <> 'completed') AS platform_agent_failures,
          COALESCE(SUM(NULLIF(r.summary->>'proposedActionCount', '')::int) FILTER (WHERE r.summary->>'source' = 'platform_agent'), 0) AS platform_agent_proposed_actions,
          COALESCE(SUM(NULLIF(r.summary->>'blockedActionCount', '')::int) FILTER (WHERE r.summary->>'source' = 'platform_agent'), 0) AS platform_agent_blocked_actions,
          (
            SELECT COUNT(*)
            FROM campaign_action_log cal
            JOIN ai_agent_runs ar ON ar.id::text = cal.metadata->>'agentRunId'
            WHERE ar.started_at >= NOW() - INTERVAL '30 days'
              AND ar.summary->>'source' = 'platform_agent'
              AND cal.metadata->>'source' = 'spend_controller_agent'
              AND cal.metadata->>'proposalDecision' = 'accepted'
          ) AS platform_agent_accepted_proposals,
          (
            SELECT COUNT(*)
            FROM campaign_action_log cal
            JOIN ai_agent_runs ar ON ar.id::text = cal.metadata->>'agentRunId'
            WHERE ar.started_at >= NOW() - INTERVAL '30 days'
              AND ar.summary->>'source' = 'platform_agent'
              AND cal.metadata->>'source' = 'spend_controller_agent'
              AND cal.metadata->>'proposalDecision' = 'rejected'
          ) AS platform_agent_rejected_proposals,
          (
            SELECT COUNT(*)
            FROM campaign_action_log cal
            JOIN ai_agent_runs ar ON ar.id::text = cal.metadata->>'agentRunId'
            WHERE ar.started_at >= NOW() - INTERVAL '30 days'
              AND ar.summary->>'source' = 'platform_agent'
              AND cal.metadata->>'source' = 'spend_controller_agent'
              AND cal.metadata->>'proposalDecision' = 'edited'
          ) AS platform_agent_edited_proposals,
          (
            SELECT COUNT(*)
            FROM campaign_action_log cal
            JOIN ai_agent_runs ar ON ar.id::text = cal.metadata->>'agentRunId'
            WHERE ar.started_at >= NOW() - INTERVAL '30 days'
              AND ar.summary->>'source' = 'platform_agent'
              AND cal.metadata->>'source' = 'spend_controller_agent'
              AND cal.metadata->>'proposalDecision' = 'ignored'
          ) AS platform_agent_ignored_proposals,
          COALESCE(SUM(report_counts.report_count), 0) AS total_reports,
          COALESCE(SUM(r.findings_count), 0) AS total_findings,
          COALESCE(SUM(r.notifications_sent), 0) AS total_notifications,
          COALESCE(AVG(r.duration_ms), 0) AS avg_duration_ms,
          MAX(r.started_at) AS last_run_at
        FROM ai_agent_runs r
        LEFT JOIN (
          SELECT run_id, COUNT(*) AS report_count
          FROM ai_agent_reports
          GROUP BY run_id
        ) report_counts ON report_counts.run_id = r.id
        WHERE r.started_at >= NOW() - INTERVAL '30 days'
      `),
      queryRows<AgentRunRow>(`
        SELECT
          r.id::text,
          r.run_type,
          r.status,
          r.started_at,
          r.completed_at,
          r.duration_ms,
          r.checks_performed,
          r.findings_count,
          r.notifications_sent,
          r.errors,
          r.summary,
          COALESCE(COUNT(rep.id), 0) AS report_count,
          COALESCE(COUNT(rep.id) FILTER (WHERE rep.is_read = false), 0) AS unread_report_count,
          COALESCE(action_counts.accepted_count, 0) AS proposal_accepted_count,
          COALESCE(action_counts.rejected_count, 0) AS proposal_rejected_count,
          COALESCE(action_counts.edited_count, 0) AS proposal_edited_count,
          COALESCE(action_counts.ignored_count, 0) AS proposal_ignored_count,
          r.created_at
        FROM ai_agent_runs r
        LEFT JOIN ai_agent_reports rep ON rep.run_id = r.id
        LEFT JOIN (
          SELECT
            metadata->>'agentRunId' AS run_id,
            COUNT(*) FILTER (WHERE metadata->>'proposalDecision' = 'accepted') AS accepted_count,
            COUNT(*) FILTER (WHERE metadata->>'proposalDecision' = 'rejected') AS rejected_count,
            COUNT(*) FILTER (WHERE metadata->>'proposalDecision' = 'edited') AS edited_count,
            COUNT(*) FILTER (WHERE metadata->>'proposalDecision' = 'ignored') AS ignored_count
          FROM campaign_action_log
          WHERE metadata->>'source' = 'spend_controller_agent'
            AND metadata->>'agentRunId' IS NOT NULL
          GROUP BY metadata->>'agentRunId'
        ) action_counts ON action_counts.run_id = r.id::text
        GROUP BY r.id, action_counts.accepted_count, action_counts.rejected_count, action_counts.edited_count, action_counts.ignored_count
        ORDER BY r.created_at DESC
        LIMIT 25
      `),
    ])

    const summary = summaryRows[0]
    const totalRuns = toNumber(summary?.total_runs)
    const failedRuns = toNumber(summary?.failed_runs)

    return {
      available: true,
      reason: null,
      summary: {
        totalRuns,
        completedRuns: toNumber(summary?.completed_runs),
        failedRuns,
        runningRuns: toNumber(summary?.running_runs),
        orchestratorReadToolRuns: toNumber(summary?.orchestrator_read_tool_runs),
        orchestratorReadToolFailures: toNumber(summary?.orchestrator_read_tool_failures),
        platformAgentRuns: toNumber(summary?.platform_agent_runs),
        platformAgentFailures: toNumber(summary?.platform_agent_failures),
        platformAgentProposedActions: toNumber(summary?.platform_agent_proposed_actions),
        platformAgentBlockedActions: toNumber(summary?.platform_agent_blocked_actions),
        platformAgentAcceptedProposals: toNumber(summary?.platform_agent_accepted_proposals),
        platformAgentRejectedProposals: toNumber(summary?.platform_agent_rejected_proposals),
        platformAgentEditedProposals: toNumber(summary?.platform_agent_edited_proposals),
        platformAgentIgnoredProposals: toNumber(summary?.platform_agent_ignored_proposals),
        totalReports: toNumber(summary?.total_reports),
        totalFindings: toNumber(summary?.total_findings),
        totalNotifications: toNumber(summary?.total_notifications),
        avgDurationMs: Math.round(toNumber(summary?.avg_duration_ms)),
        lastRunAt: summary?.last_run_at ?? null,
        failureRate: totalRuns > 0 ? failedRuns / totalRuns : 0,
      },
      recent: recentRows.map((row) => {
        const summary = summaryObject(row.summary)
        return {
          id: row.id,
          runType: row.run_type,
          status: row.status,
          statusBucket: statusBucket(row.status),
          startedAt: row.started_at,
          completedAt: row.completed_at,
          durationMs: toNumber(row.duration_ms),
          checksPerformed: toNumber(row.checks_performed),
          findingsCount: toNumber(row.findings_count),
          notificationsSent: toNumber(row.notifications_sent),
          reportCount: toNumber(row.report_count),
          unreadReportCount: toNumber(row.unread_report_count),
          errorCount: errorCount(row.errors),
          source: typeof summary.source === 'string' ? summary.source : null,
          agentType: typeof summary.agentType === 'string' ? summary.agentType : null,
          featureKey: typeof summary.featureKey === 'string' ? summary.featureKey : null,
          proposedActionCount: toNumber(summary.proposedActionCount),
          blockedActionCount: toNumber(summary.blockedActionCount),
          proposalDecisionCounts: {
            accepted: toNumber(row.proposal_accepted_count),
            rejected: toNumber(row.proposal_rejected_count),
            edited: toNumber(row.proposal_edited_count),
            ignored: toNumber(row.proposal_ignored_count),
          },
          summary,
          createdAt: row.created_at,
        }
      }),
    }
  } catch (error) {
    if (isMissingAgentRunsError(error)) {
      return unavailable('Run migration 015-ai-agent.sql to enable AI agent run telemetry.')
    }

    console.error('[Admin AI Model Ops Agent Runs] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load AI agent run telemetry'
    })
  }
})
