interface Env {
  API_URL: string
  INTERNAL_API_KEY: string
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const dayOfWeek = new Date().getUTCDay()
    const hour = new Date().getUTCHours()

    // 6 UTC daily → spend sync (all platforms + breakdowns + creatives)
    if (hour === 6) {
      console.log('[AI Agent Worker] Triggering spend sync')
      const res = await fetch(`${env.API_URL}/api/internal/sync-spend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })
      if (!res.ok) {
        console.error(`[AI Agent Worker] Spend sync failed (${res.status}):`, await res.text())
      } else {
        const result = await res.json() as Record<string, unknown>
        console.log('[AI Agent Worker] Spend sync completed:', JSON.stringify(result))
      }
      return
    }

    // Sunday at 22 UTC = Monday 9am AEDT → weekly report
    // Every day at 21 UTC = 8am AEDT → daily digest
    const runType = (dayOfWeek === 0 && hour === 22) ? 'weekly_report' : 'daily_digest'
    const endpoint = runType === 'weekly_report' ? 'weekly-report' : 'daily-digest'

    console.log(`[AI Agent Worker] Triggering ${runType}`)

    const response = await fetch(`${env.API_URL}/api/internal/ai-agent/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.INTERNAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[AI Agent Worker] ${runType} failed (${response.status}):`, errorText)
    } else {
      const result = await response.json() as { runId: string; reportCount: number }
      console.log(`[AI Agent Worker] ${runType} completed: ${result.reportCount} reports generated (run: ${result.runId})`)
    }
  }
} satisfies ExportedHandler<Env>
