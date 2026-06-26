import { execute, queryRows } from '~~/server/utils/db'

export type PlatformAgentType =
  | 'spend_controller'
  | 'publishing_planner'
  | 'financial_watch'
  | 'traffic_controller'
  | 'office_watch'

export type PlatformAgentMode = 'read_only' | 'read_propose' | 'draft_only'

export interface StartPlatformAgentRunInput {
  agentType: PlatformAgentType
  featureKey: string
  mode: PlatformAgentMode
  userId?: string | null
  clientId?: string | null
  route?: string | null
  prompt?: string | null
  context?: Record<string, unknown>
}

export interface CompletePlatformAgentRunInput {
  runId: string
  startedAtMs: number
  toolCallCount?: number
  findingCount?: number
  proposedActionCount?: number
  blockedActionCount?: number
  notificationCount?: number
  summary?: Record<string, unknown>
}

export interface FailPlatformAgentRunInput {
  runId: string
  startedAtMs: number
  error: unknown
  toolCallCount?: number
  findingCount?: number
}

interface InsertedRunRow {
  id: string
}

function durationSince(startedAtMs: number) {
  const duration = Date.now() - startedAtMs
  return Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : 0
}

function compactPrompt(prompt: string | null | undefined) {
  const clean = String(prompt || '').trim().replace(/\s+/g, ' ')
  return clean ? clean.slice(0, 240) : null
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || 'Unknown platform agent error')
}

export function platformAgentRunType(agentType: PlatformAgentType) {
  return `platform_agent_${agentType}`
}

export async function startPlatformAgentRun(input: StartPlatformAgentRunInput): Promise<
  | { ok: true, runId: string }
  | { ok: false, reason: string }
> {
  const summary = {
    source: 'platform_agent',
    agentType: input.agentType,
    featureKey: input.featureKey,
    mode: input.mode,
    userId: input.userId ?? null,
    clientId: input.clientId ?? null,
    route: input.route ?? null,
    promptPreview: compactPrompt(input.prompt),
    context: input.context ?? {},
  }

  try {
    const rows = await queryRows<InsertedRunRow>(`
      INSERT INTO ai_agent_runs (
        run_type,
        status,
        checks_performed,
        findings_count,
        notifications_sent,
        errors,
        summary
      )
      VALUES ($1, 'running', 0, 0, 0, '[]'::jsonb, $2::jsonb)
      RETURNING id::text
    `, [
      platformAgentRunType(input.agentType),
      JSON.stringify(summary),
    ])

    const runId = rows[0]?.id
    if (!runId) return { ok: false, reason: 'Platform agent run insert returned no id.' }
    return { ok: true, runId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message }
  }
}

export async function completePlatformAgentRun(input: CompletePlatformAgentRunInput) {
  const summary = {
    ...(input.summary ?? {}),
    proposedActionCount: input.proposedActionCount ?? 0,
    blockedActionCount: input.blockedActionCount ?? 0,
  }

  await execute(`
    UPDATE ai_agent_runs
    SET status = 'completed',
        completed_at = NOW(),
        duration_ms = $1,
        checks_performed = $2,
        findings_count = $3,
        notifications_sent = $4,
        summary = COALESCE(summary, '{}'::jsonb) || $5::jsonb
    WHERE id = $6
  `, [
    durationSince(input.startedAtMs),
    input.toolCallCount ?? 0,
    input.findingCount ?? 0,
    input.notificationCount ?? 0,
    JSON.stringify(summary),
    input.runId,
  ])
}

export async function failPlatformAgentRun(input: FailPlatformAgentRunInput) {
  await execute(`
    UPDATE ai_agent_runs
    SET status = 'failed',
        completed_at = NOW(),
        duration_ms = $1,
        checks_performed = $2,
        findings_count = $3,
        notifications_sent = 0,
        errors = $4::jsonb
    WHERE id = $5
  `, [
    durationSince(input.startedAtMs),
    input.toolCallCount ?? 0,
    input.findingCount ?? 0,
    JSON.stringify([{ error: errorMessage(input.error) }]),
    input.runId,
  ])
}
