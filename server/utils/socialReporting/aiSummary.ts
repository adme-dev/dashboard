// server/utils/socialReporting/aiSummary.ts
// Groq narrative over a reporting period's KPIs. Fail-safe: returns null on any error so a report
// never breaks because the LLM is unavailable (same posture as the anomalies/digest narratives).
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'

interface Kpi { value: number | null; deltaPct: number | null }
interface OverviewKpis {
  posts: Kpi; impressions: Kpi; reach: Kpi; engagements: Kpi; clicks: Kpi; engagementRate: Kpi
}
interface SummaryTelemetryOptions {
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  source?: 'agency' | 'portal' | 'cron' | 'preview' | string
}

/** Build the prompt (pure — testable without calling Groq). */
export function buildSummaryPrompt(clientName: string, periodLabel: string, k: OverviewKpis): string {
  const value = (kpi: Kpi, suffix = '') => kpi.value == null ? 'unavailable' : `${kpi.value}${suffix}`
  const d = (kpi: Kpi) => kpi.deltaPct == null ? 'no prior baseline' : `${kpi.deltaPct >= 0 ? '+' : ''}${kpi.deltaPct}% vs prior`
  return [
    `Write a 2-3 sentence plain-English summary of ${clientName}'s organic social performance for ${periodLabel}.`,
    `Be specific and lead with what changed. Metrics:`,
    `- Posts: ${value(k.posts)} (${d(k.posts)})`,
    `- Impressions: ${value(k.impressions)} (${d(k.impressions)})`,
    `- Reach: ${value(k.reach)} (${d(k.reach)})`,
    `- Engagements: ${value(k.engagements)} (${d(k.engagements)})`,
    `- Engagement rate: ${value(k.engagementRate, '%')} (${d(k.engagementRate)})`,
    `- Link clicks: ${value(k.clicks)} (${d(k.clicks)})`,
    `Do not interpret unavailable metrics as zero or a decline. Only compare metrics with a known baseline.`,
    `Do not invent numbers beyond these. No preamble.`,
  ].join('\n')
}

export async function generateReportSummary(
  clientName: string,
  periodLabel: string,
  k: OverviewKpis,
  telemetry: SummaryTelemetryOptions = {}
): Promise<string | null> {
  try {
    const text = await generateModelRoutedGroqInsight(buildSummaryPrompt(clientName, periodLabel, k), {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      maxTokens: 220,
      featureKey: 'social_reporting_ai_summary',
      userId: telemetry.userId ?? null,
      clientId: telemetry.clientId ?? null,
      requestId: telemetry.requestId ?? null,
      metadata: {
        source: telemetry.source ?? 'unknown',
        periodLabel,
        postCount: k.posts.value,
        hasPriorBaseline: Object.values(k).some(metric => metric.deltaPct != null),
      },
      systemPrompt: 'You are a social media analyst. Write concise, factual performance summaries for agency clients.',
    })
    const trimmed = (text || '').trim()
    return trimmed && trimmed !== 'Unable to generate insight' ? trimmed : null
  } catch {
    return null
  }
}
