// server/api/client-portal/social/reporting/ai-summary.post.ts — Groq narrative for the client's report.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { generateReportSummary } from '~~/server/utils/socialReporting/aiSummary'

/**
 * POST /api/client-portal/social/reporting/ai-summary  body { periodLabel, kpis }
 * The client's own KPI block → a Groq narrative. clientName is taken from the session (not the body)
 * so it always reflects the authenticated client. Fail-safe → { summary: null }.
 */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const body = await readBody(event).catch(() => ({}))
  const { periodLabel, kpis } = body || {}
  if (!kpis || typeof kpis !== 'object') throw createError({ statusCode: 400, statusMessage: 'kpis required' })
  const summary = await generateReportSummary(client.clientName || 'your brand', String(periodLabel || 'the period'), kpis)
  return { summary }
})
