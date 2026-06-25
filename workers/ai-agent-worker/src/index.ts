interface Env {
  API_URL: string
  INTERNAL_API_KEY: string
}

export type AgentRunType = 'daily_digest' | 'weekly_report'

export interface AgentTriggerResult {
  runId: string
  reportCount: number
}

export function selectScheduledRunType(now = new Date()): AgentRunType {
  const dayOfWeek = now.getUTCDay()
  const hour = now.getUTCHours()
  return dayOfWeek === 0 && hour === 22 ? 'weekly_report' : 'daily_digest'
}

export function endpointForRunType(runType: AgentRunType): string {
  return runType === 'weekly_report' ? 'weekly-report' : 'daily-digest'
}

export async function triggerAgentRun(
  env: Env,
  runType: AgentRunType,
  fetcher: typeof fetch = fetch,
): Promise<AgentTriggerResult> {
  const apiUrl = env.API_URL.replace(/\/+$/, '')
  const endpoint = endpointForRunType(runType)
  const response = await fetcher(`${apiUrl}/api/internal/ai-agent/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.INTERNAL_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${runType} failed (${response.status}): ${errorText}`)
  }

  return await response.json() as AgentTriggerResult
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // NOTE: the daily ad-spend sync moved to the pages-cron worker
    // (0 6 UTC → /api/cron/sync-spend, CRON_SECRET-auth, non-blocking). The old
    // synchronous /api/internal/sync-spend path here never completed.

    // Sunday at 22 UTC = Monday 9am AEDT → weekly report
    // Every day at 21 UTC = 8am AEDT → daily digest
    const runType = selectScheduledRunType(new Date())

    console.log(`[AI Agent Worker] Triggering ${runType}`)

    try {
      const result = await triggerAgentRun(env, runType)
      console.log(`[AI Agent Worker] ${runType} completed: ${result.reportCount} reports generated (run: ${result.runId})`)
    } catch (error) {
      console.error(`[AI Agent Worker] ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} satisfies ExportedHandler<Env>
