import { requireAuth } from '~~/server/utils/auth'
import { generateReportSummary } from '~~/server/utils/socialReporting/aiSummary'

/**
 * POST /api/agency/social/reporting/ai-summary
 * Body: { clientName, periodLabel, kpis } — the KPI block the UI already fetched from /overview.
 * Returns a Groq narrative (or null on failure — never throws; the report stands without it).
 * KPIs are just numbers fed to the LLM (the caller's own data), so accepting them from the body
 * avoids re-running the aggregation; nothing security-sensitive is trusted here.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event).catch(() => ({}))
  const { clientName, periodLabel, kpis } = body || {}
  if (!kpis || typeof kpis !== 'object') throw createError({ statusCode: 400, statusMessage: 'kpis required' })
  const summary = await generateReportSummary(String(clientName || 'this client'), String(periodLabel || 'the period'), kpis)
  return { summary }
})
