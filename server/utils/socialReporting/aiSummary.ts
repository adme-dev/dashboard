// server/utils/socialReporting/aiSummary.ts
// Groq narrative over a reporting period's KPIs. Fail-safe: returns null on any error so a report
// never breaks because the LLM is unavailable (same posture as the anomalies/digest narratives).
import { generateGroqInsight } from '~~/server/utils/groqClient'

interface Kpi { value: number; deltaPct: number | null }
interface OverviewKpis {
  posts: Kpi; impressions: Kpi; reach: Kpi; engagements: Kpi; clicks: Kpi; engagementRate: Kpi
}

/** Build the prompt (pure — testable without calling Groq). */
export function buildSummaryPrompt(clientName: string, periodLabel: string, k: OverviewKpis): string {
  const d = (kpi: Kpi) => kpi.deltaPct == null ? 'no prior baseline' : `${kpi.deltaPct >= 0 ? '+' : ''}${kpi.deltaPct}% vs prior`
  return [
    `Write a 2-3 sentence plain-English summary of ${clientName}'s organic social performance for ${periodLabel}.`,
    `Be specific and lead with what changed. Metrics:`,
    `- Posts: ${k.posts.value} (${d(k.posts)})`,
    `- Impressions: ${k.impressions.value} (${d(k.impressions)})`,
    `- Reach: ${k.reach.value} (${d(k.reach)})`,
    `- Engagements: ${k.engagements.value} (${d(k.engagements)})`,
    `- Engagement rate: ${k.engagementRate.value}% (${d(k.engagementRate)})`,
    `- Link clicks: ${k.clicks.value} (${d(k.clicks)})`,
    `Do not invent numbers beyond these. No preamble.`,
  ].join('\n')
}

export async function generateReportSummary(clientName: string, periodLabel: string, k: OverviewKpis): Promise<string | null> {
  try {
    const text = await generateGroqInsight(buildSummaryPrompt(clientName, periodLabel, k), {
      maxTokens: 220,
      systemPrompt: 'You are a social media analyst. Write concise, factual performance summaries for agency clients.',
    })
    const trimmed = (text || '').trim()
    return trimmed && trimmed !== 'Unable to generate insight' ? trimmed : null
  } catch {
    return null
  }
}
