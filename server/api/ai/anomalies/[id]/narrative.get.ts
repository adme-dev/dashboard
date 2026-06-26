// server/api/ai/anomalies/[id]/narrative.get.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, execute } from '~~/server/utils/db'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import type { AnomalyRow, AnomalyMetric } from '~~/server/utils/anomalyDetection/types'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await queryOne<AnomalyRow>(
    `SELECT * FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Anomaly not found' })

  // Return cached narrative if present
  if (row.driver_narrative && row.driver_narrative_at) {
    return {
      narrative: row.driver_narrative,
      generatedAt: row.driver_narrative_at,
      cached: true,
    }
  }

  // Generate via Groq
  const prompt = buildPrompt(row)
  let narrative: string
  try {
    narrative = await generateModelRoutedGroqInsight(prompt, {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      maxTokens: 600,
      featureKey: 'anomaly_driver_narrative',
      clientId: tenantId,
      requestId: id,
      metadata: {
        route: '/api/ai/anomalies/:id/narrative',
        tenantId,
        anomalyId: id,
        anomalyType: row.type,
        severity: row.severity,
        status: row.status,
        hasMetric: Boolean(row.metric),
        hasComparison: Boolean(row.comparison),
        hasContext: Boolean(row.context),
        hasRecommendation: Boolean(row.recommendation),
        tagCount: row.tags?.length || 0,
      },
      systemPrompt: 'You are a senior FP&A analyst at a digital marketing agency. Be direct, practical, and specific. No fluff or buzzwords.',
    })
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Narrative generation failed: ${err?.message || 'unknown'}`,
    })
  }

  // Persist narrative on the anomaly row
  await execute(
    `UPDATE anomalies SET driver_narrative = $1, driver_narrative_at = NOW() WHERE id = $2`,
    [narrative, id],
  )

  // Write audit event
  await execute(
    `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, 'narrative-generated')`,
    [id],
  )

  return {
    narrative,
    generatedAt: new Date().toISOString(),
    cached: false,
  }
})

function buildPrompt(a: AnomalyRow): string {
  const metric = a.metric ? `${a.metric.label}: ${formatVal(a.metric.value, a.metric.format)}` : ''
  const comparison = a.comparison
    ? `${a.comparison.label}: ${formatVal(a.comparison.value, a.comparison.format)}`
    : ''
  const ctx = a.context
    ? Object.entries(a.context)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('; ')
    : ''

  return `In 3 short paragraphs, explain to the agency owner what likely caused this anomaly and what they should investigate first. Be direct and practical — no fluff, no buzzwords. End with a "Investigate next:" bullet list of 3 specific actions.

ANOMALY
- Title: ${a.title}
- Description: ${a.description}
- Severity: ${a.severity}${metric ? `\n- Metric: ${metric}` : ''}${comparison ? `\n- Comparison: ${comparison}` : ''}${ctx ? `\n- Context: ${ctx}` : ''}${a.recommendation ? `\n- Existing recommendation: ${a.recommendation}` : ''}${a.tags?.length ? `\n- Tags: ${a.tags.join(', ')}` : ''}`
}

function formatVal(v: number, format: AnomalyMetric['format']): string {
  if (format === 'currency') return `$${Math.round(v).toLocaleString()}`
  if (format === 'percent') return `${(v * 100).toFixed(1)}%`
  return String(v)
}
