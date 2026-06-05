/**
 * AI Agent Runner
 * Main orchestration for generating personalized digest reports
 */

import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { runAllAnalyzers, type AnalysisResult, type AnalysisFinding } from '~~/server/utils/aiAgentAnalyzer'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { createNotification } from '~~/server/utils/notifications'
import { getAppUrl } from '~~/server/utils/appUrl'
import { sendAiDigestEmail } from '~~/server/utils/email'
import type { AgentRunType } from '~/types'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  ai_agent_preferences: Record<string, any> | null
}

/**
 * Filter findings relevant to a user's role
 */
function filterFindingsForRole(
  allResults: AnalysisResult[],
  role: string
): { results: AnalysisResult[]; totalFindings: number } {
  let filtered: AnalysisResult[]

  switch (role) {
    case 'owner':
    case 'admin':
      // Owners/admins see financial anomalies + ad spend + EOM + key task signals
      filtered = allResults.filter(r =>
        ['financial_anomalies', 'ad_spend_anomalies', 'eom_status',
         'overdue_tasks', 'deadline_risks', 'blocked_items'].includes(r.type)
      )
      break

    case 'project_manager':
    case 'producer':
    case 'account_manager':
      // PMs see project/team/deadline items, not financial
      filtered = allResults.filter(r =>
        ['overdue_tasks', 'stale_briefs', 'blocked_items', 'deadline_risks',
         'team_workload', 'unassigned_work'].includes(r.type)
      )
      break

    case 'media_buyer':
      // Media buyers see ad spend + their tasks
      filtered = allResults.filter(r =>
        ['ad_spend_anomalies', 'overdue_tasks', 'deadline_risks'].includes(r.type)
      )
      break

    case 'finance':
    case 'accountant':
      // Finance sees financial anomalies + EOM + ad spend
      filtered = allResults.filter(r =>
        ['financial_anomalies', 'ad_spend_anomalies', 'eom_status'].includes(r.type)
      )
      break

    default:
      // Regular members see task-related findings only
      filtered = allResults.filter(r =>
        ['overdue_tasks', 'blocked_items', 'deadline_risks', 'unassigned_work'].includes(r.type)
      )
      break
  }

  // Remove empty result sets
  filtered = filtered.filter(r => r.count > 0)

  const totalFindings = filtered.reduce((sum, r) => sum + r.count, 0)
  return { results: filtered, totalFindings }
}

/**
 * Build a Groq prompt for personalized report generation
 */
function buildReportPrompt(
  userName: string,
  userRole: string,
  runType: AgentRunType,
  results: AnalysisResult[]
): string {
  const findingsSummary = results.map(r => {
    const items = r.findings.slice(0, 5).map(f =>
      `  - [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`
    ).join('\n')
    return `### ${formatAnalysisType(r.type)} (${r.count} found)\n${items}`
  }).join('\n\n')

  const isWeekly = runType === 'weekly_report'

  return `Generate a ${isWeekly ? 'weekly' : 'daily'} digest report for ${userName} (role: ${userRole}).

Here are the findings from today's analysis:

${findingsSummary}

Write a personalized markdown report with these sections:
1. **Summary** - A 2-3 sentence overview of the most important items needing attention
2. **Action Items** - Prioritized list of things ${userName} should address ${isWeekly ? 'this week' : 'today'}, with the most critical first
3. **Insights** - ${isWeekly ? 'Weekly trends and patterns' : 'Quick observations'} relevant to their role as ${userRole}

Keep the tone professional but friendly. Be specific and actionable. Use markdown formatting.
Do NOT include a title/heading — the system will add one.
Limit to 400 words maximum.`
}

/**
 * Format analysis type into a human-readable label
 */
function formatAnalysisType(type: string): string {
  const labels: Record<string, string> = {
    overdue_tasks: 'Overdue Tasks',
    stale_briefs: 'Stale Briefs',
    blocked_items: 'Blocked Items',
    deadline_risks: 'Deadline Risks',
    ad_spend_anomalies: 'Ad Spend Anomalies',
    financial_anomalies: 'Financial Anomalies',
    eom_status: 'EOM Status',
    team_workload: 'Team Workload',
    unassigned_work: 'Unassigned Work'
  }
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Main entry point: run the full agent digest pipeline
 */
export async function runAgentDigest(runType: AgentRunType): Promise<{ runId: string; reportCount: number }> {
  const startTime = Date.now()

  // 1. Create run record
  const run = await queryOne(`
    INSERT INTO ai_agent_runs (run_type, status)
    VALUES ($1, 'running')
    RETURNING id
  `, [runType])

  if (!run) {
    throw new Error('Failed to create agent run record')
  }

  const runId = run.id
  let reportCount = 0
  let notificationsSent = 0
  let findingsCount = 0
  const errors: Array<{ user?: string; error: string }> = []

  try {
    // 2. Run all analyzers in parallel
    const allResults = await runAllAnalyzers()
    findingsCount = allResults.reduce((sum, r) => sum + r.count, 0)

    // 3. Fetch active team members
    const teamMembers = await queryRows<TeamMember>(`
      SELECT id, name, email, role, ai_agent_preferences
      FROM team_members
      WHERE is_active = true
    `)

    // 4. Generate personalized reports for each user
    for (const member of teamMembers) {
      try {
        const prefs = member.ai_agent_preferences || {}

        // Check if user wants this type of digest (default: enabled)
        if (runType === 'daily_digest' && prefs.dailyDigest === false) continue
        if (runType === 'weekly_report' && prefs.weeklyReport === false) continue

        // Filter findings relevant to this user's role
        const { results: userResults, totalFindings } = filterFindingsForRole(allResults, member.role)

        // Skip if no relevant findings
        if (totalFindings === 0) continue

        // Build prompt and generate report via Groq
        const prompt = buildReportPrompt(member.name, member.role, runType, userResults)
        const reportContent = await generateGroqInsight(prompt, {
          model: GROQ_MODELS.LLAMA_70B,
          temperature: 0.3,
          maxTokens: 1500,
          systemPrompt: 'You are an AI operations assistant for a digital marketing agency. Generate clear, actionable digest reports in markdown format. Be concise and specific.'
        })

        const reportTitle = runType === 'weekly_report'
          ? `Weekly Report - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
          : `Daily Digest - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`

        // Build sections metadata from findings
        const sections = userResults.map(r => ({
          title: formatAnalysisType(r.type),
          content: r.findings.map(f => `[${f.severity}] ${f.title}`).join('\n'),
          type: 'findings' as const,
          severity: r.findings.some(f => f.severity === 'critical') ? 'critical' as const
            : r.findings.some(f => f.severity === 'warning') ? 'warning' as const
            : 'info' as const
        }))

        // Save report
        const report = await queryOne(`
          INSERT INTO ai_agent_reports (run_id, user_id, report_type, title, content, sections)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [runId, member.id, runType, reportTitle, reportContent, JSON.stringify(sections)])

        if (!report) continue

        reportCount++

        // Create notification
        const notification = await createNotification({
          userId: member.id,
          type: 'ai_digest' as any,
          title: reportTitle,
          message: `${totalFindings} finding${totalFindings === 1 ? '' : 's'} need your attention`,
          link: `/agency/ai/reports/${report.id}`,
          metadata: {
            reportId: report.id,
            runId,
            findingsCount: totalFindings,
            runType
          }
        })

        // Update report with notification ID
        if (notification?.id) {
          await execute(`
            UPDATE ai_agent_reports SET notification_id = $1 WHERE id = $2
          `, [notification.id, report.id])
        }

        notificationsSent++

        // Send email digest
        try {
          await sendAiDigestEmail({
            to: member.email,
            name: member.name,
            reportTitle,
            reportSummary: reportContent.substring(0, 300) + (reportContent.length > 300 ? '...' : ''),
            findingsCount: totalFindings,
            reportUrl: `${getAppUrl()}/agency/ai/reports/${report.id}`
          })
        } catch (emailErr) {
          console.error(`[AI Agent] Failed to send email to ${member.email}:`, emailErr)
        }
      } catch (userErr) {
        const errMsg = userErr instanceof Error ? userErr.message : String(userErr)
        console.error(`[AI Agent] Failed to generate report for ${member.name}:`, errMsg)
        errors.push({ user: member.name, error: errMsg })
      }
    }

    // 5. Update run record as completed
    const durationMs = Date.now() - startTime
    await execute(`
      UPDATE ai_agent_runs
      SET status = 'completed',
          completed_at = NOW(),
          duration_ms = $1,
          checks_performed = $2,
          findings_count = $3,
          notifications_sent = $4,
          errors = $5,
          summary = $6
      WHERE id = $7
    `, [
      durationMs,
      allResults.length,
      findingsCount,
      notificationsSent,
      JSON.stringify(errors),
      JSON.stringify({
        reportCount,
        teamMembersProcessed: teamMembers.length,
        analyzerResults: allResults.map(r => ({ type: r.type, count: r.count }))
      }),
      runId
    ])

    return { runId, reportCount }
  } catch (err) {
    // Mark run as failed
    const durationMs = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)

    await execute(`
      UPDATE ai_agent_runs
      SET status = 'failed',
          completed_at = NOW(),
          duration_ms = $1,
          checks_performed = 0,
          findings_count = $2,
          notifications_sent = $3,
          errors = $4
      WHERE id = $5
    `, [durationMs, findingsCount, notificationsSent, JSON.stringify([{ error: errMsg }]), runId])

    console.error('[AI Agent] Run failed:', errMsg)
    throw err
  }
}
