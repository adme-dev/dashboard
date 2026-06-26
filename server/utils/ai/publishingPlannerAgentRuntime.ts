import { queryRows } from '~~/server/utils/db'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} from '~~/server/utils/ai/platformAgentRuns'

export interface PublishingPlannerAgentRuntimeInput {
  prompt: string
  context?: Record<string, unknown>
  userId?: string | null
  route?: string
}

interface CountRow {
  key: string | null
  count: string | number | null
}

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function clientIdFromContext(context: Record<string, unknown>) {
  return typeof context.clientId === 'string' && context.clientId.trim()
    ? context.clientId.trim()
    : null
}

function statusCounts(rows: CountRow[]) {
  return Object.fromEntries(rows.map(row => [row.key || 'unknown', toNumber(row.count)]))
}

export async function runPublishingPlannerAgentRequest(input: PublishingPlannerAgentRuntimeInput) {
  const prompt = input.prompt.trim()
  const context = input.context && typeof input.context === 'object' ? input.context : {}
  const clientId = clientIdFromContext(context)
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  }

  const startedAtMs = Date.now()
  const run = await startPlatformAgentRun({
    agentType: 'publishing_planner',
    featureKey: 'agent_publishing_planner',
    mode: 'read_only',
    userId: input.userId ?? null,
    clientId,
    route: input.route ?? '/agency/social/publishing/planner',
    prompt,
    context: { clientId },
  })

  try {
    const [
      postStatusRows,
      platformRows,
      campaignStatusRows,
      queueRows,
      slotRows,
      accountRows,
      nextScheduledRows,
    ] = await Promise.all([
      queryRows<CountRow>(
        `SELECT status AS key, COUNT(*) AS count
         FROM social_posts
         WHERE client_id = $1
         GROUP BY status`,
        [clientId],
      ),
      queryRows<CountRow>(
        `SELECT platform AS key, COUNT(*) AS count
         FROM social_accounts
         WHERE client_id = $1 AND is_active = true
         GROUP BY platform`,
        [clientId],
      ),
      queryRows<CountRow>(
        `SELECT status AS key, COUNT(*) AS count
         FROM social_campaigns
         WHERE client_id = $1
         GROUP BY status`,
        [clientId],
      ),
      queryRows<{ count: string | number | null }>(
        `SELECT COUNT(*) AS count
         FROM social_posts
         WHERE client_id = $1
           AND queue_position IS NOT NULL
           AND status IN ('draft', 'scheduled')`,
        [clientId],
      ),
      queryRows<{ total_count: string | number | null, enabled_count: string | number | null }>(
        `SELECT COUNT(*) AS total_count,
                COUNT(*) FILTER (WHERE enabled = true) AS enabled_count
         FROM social_slot_schedules
         WHERE client_id = $1`,
        [clientId],
      ),
      queryRows<{ active_count: string | number | null, error_count: string | number | null }>(
        `SELECT COUNT(*) FILTER (WHERE is_active = true) AS active_count,
                COUNT(*) FILTER (WHERE last_error IS NOT NULL AND last_error <> '') AS error_count
         FROM social_accounts
         WHERE client_id = $1`,
        [clientId],
      ),
      queryRows<{ id: string, status: string, scheduled_at: string | null, platforms: string[] | null, content: string | null }>(
        `SELECT id::text, status, scheduled_at::text, platforms, content
         FROM social_posts
         WHERE client_id = $1
           AND scheduled_at IS NOT NULL
           AND status IN ('approved', 'scheduled')
         ORDER BY scheduled_at ASC
         LIMIT 5`,
        [clientId],
      ),
    ])

    const postsByStatus = statusCounts(postStatusRows)
    const connectedPlatforms = statusCounts(platformRows)
    const campaignsByStatus = statusCounts(campaignStatusRows)
    const queueCount = toNumber(queueRows[0]?.count)
    const totalSlots = toNumber(slotRows[0]?.total_count)
    const enabledSlots = toNumber(slotRows[0]?.enabled_count)
    const activeAccounts = toNumber(accountRows[0]?.active_count)
    const erroredAccounts = toNumber(accountRows[0]?.error_count)
    const scheduledCount = toNumber(postsByStatus.scheduled) + toNumber(postsByStatus.approved)
    const draftCount = toNumber(postsByStatus.draft)
    const findings = []

    if (activeAccounts === 0) {
      findings.push({
        severity: 'warning',
        title: 'No active publishing accounts are connected',
        detail: 'Connect at least one publishing account before planning scheduled content.',
      })
    }
    if (enabledSlots === 0) {
      findings.push({
        severity: 'warning',
        title: 'No enabled posting slots are configured',
        detail: 'Add recurring slots so plans can be matched to predictable publishing windows.',
      })
    }
    if (draftCount > 0 && queueCount === 0) {
      findings.push({
        severity: 'info',
        title: 'Drafts are not in the queue',
        detail: `${draftCount} draft post${draftCount === 1 ? '' : 's'} can be queued or assigned to slots.`,
      })
    }
    if (erroredAccounts > 0) {
      findings.push({
        severity: 'warning',
        title: 'Some publishing accounts have connection errors',
        detail: `${erroredAccounts} account${erroredAccounts === 1 ? '' : 's'} need attention before publishing.`,
      })
    }

    const response = {
      mode: 'read_only' as const,
      answer: `Publishing planner review found ${scheduledCount} approved/scheduled post${scheduledCount === 1 ? '' : 's'}, ${draftCount} draft${draftCount === 1 ? '' : 's'}, ${queueCount} queued item${queueCount === 1 ? '' : 's'}, and ${enabledSlots} enabled slot${enabledSlots === 1 ? '' : 's'}.`,
      summary: {
        clientId,
        postsByStatus,
        campaignsByStatus,
        connectedPlatforms,
        queueCount,
        totalSlots,
        enabledSlots,
        activeAccounts,
        erroredAccounts,
        nextScheduled: nextScheduledRows.map(row => ({
          id: row.id,
          status: row.status,
          scheduledAt: row.scheduled_at,
          platforms: row.platforms ?? [],
          contentPreview: String(row.content || '').slice(0, 120),
        })),
      },
      findings,
      recommendedActions: [
        activeAccounts === 0 ? 'Connect publishing accounts before generating or scheduling plans.' : null,
        enabledSlots === 0 ? 'Create enabled posting slots for the client.' : null,
        draftCount > 0 && queueCount === 0 ? 'Move ready drafts into the queue or assign scheduled dates.' : null,
        'Use Generate Plan only as a draft creation step; scheduling and publishing still require approval.',
      ].filter((value): value is string => Boolean(value)),
      proposedActions: [],
      audit: {
        modelFeatureKey: 'agent_publishing_planner',
        toolCallCount: 7,
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
