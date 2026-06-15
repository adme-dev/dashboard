export type AiConfidence = 'low' | 'medium' | 'high'

export interface AiAnalysisInput {
  campaignName: string
  platform: 'meta' | 'google'
  issueType: string
  monthlyBudget: number
  mtdSpend: number
  currentDailyBudget: number
  deterministicDailyBudget: number
  pacingRatio: number
  projectedMonthEnd: number
  daysRemaining: number
  performance: {
    impressions: number
    clicks: number
    conversions: number
    ctr: number | null
    cpc: number | null
    costPerConversion: number | null
  }
}

export interface AiAnalysisResult {
  ok: boolean
  proposedDailyBudget: number | null
  rationale: string
  confidence: AiConfidence
  riskFlags: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildAnalysisPrompt(input: AiAnalysisInput): string {
  const p = input.performance
  return [
    `You are reviewing one ${input.platform.toUpperCase()} advertising campaign for monthly budget pacing.`,
    `Campaign: ${input.campaignName}`,
    `Detected issue: ${input.issueType}`,
    `Monthly budget: ${input.monthlyBudget}`,
    `Month-to-date spend: ${input.mtdSpend}`,
    `Current daily budget: ${input.currentDailyBudget}`,
    `Days remaining in month: ${input.daysRemaining}`,
    `Pacing ratio (spend pace / time pace): ${input.pacingRatio}`,
    `Projected month-end spend at current pace: ${input.projectedMonthEnd}`,
    `Deterministic recommended daily budget (rule-based baseline): ${input.deterministicDailyBudget}`,
    `Performance — impressions: ${p.impressions}, clicks: ${p.clicks}, conversions: ${p.conversions}, CTR: ${p.ctr ?? 'n/a'}, CPC: ${p.cpc ?? 'n/a'}, cost/conversion: ${p.costPerConversion ?? 'n/a'}`,
    '',
    `Recommend a new daily budget that lands the campaign on its monthly budget while respecting performance.`,
    `Respond ONLY with a JSON object of the form:`,
    `{"proposedDailyBudget": number, "rationale": string, "confidence": "low"|"medium"|"high", "riskFlags": string[]}`,
  ].join('\n')
}

export function parseAnalysisResult(raw: string, baseline: { currentDailyBudget: number }): AiAnalysisResult {
  const fail: AiAnalysisResult = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low', riskFlags: [] }
  if (!raw || typeof raw !== 'string') return fail

  let jsonText = raw.trim()
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1].trim()
  const brace = jsonText.match(/\{[\s\S]*\}/)
  if (brace) jsonText = brace[0]

  let parsed: any
  try { parsed = JSON.parse(jsonText) } catch { return fail }
  if (!parsed || typeof parsed !== 'object') return fail

  const num = Number(parsed.proposedDailyBudget ?? parsed.proposed_daily_budget)
  if (!Number.isFinite(num) || num < 0) return fail

  const ceiling = Math.max(1, baseline.currentDailyBudget) * 10
  const proposedDailyBudget = round2(Math.min(num, ceiling))

  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 2000) : ''
  const confRaw = String(parsed.confidence ?? '').toLowerCase()
  const confidence: AiConfidence = (confRaw === 'high' || confRaw === 'low' || confRaw === 'medium') ? confRaw : 'medium'
  const flagsRaw = parsed.riskFlags ?? parsed.risk_flags
  const riskFlags = Array.isArray(flagsRaw) ? flagsRaw.filter((x: any) => typeof x === 'string').slice(0, 10) : []

  return { ok: true, proposedDailyBudget, rationale, confidence, riskFlags }
}

export interface AnalysisResponse {
  deterministic: { dailyBudget: number, action: string }
  ai: { proposedDailyBudget: number, rationale: string, confidence: AiConfidence, riskFlags: string[] } | null
  dataFreshness: { syncedAt: string | null, refreshed: boolean, refreshError?: string }
  modelId: string
}

export function buildAnalysisResponse(args: {
  deterministicDaily: number
  deterministicAction: string
  ai: AiAnalysisResult
  syncedAt: string | null
  refreshed: boolean
  refreshError?: string
  modelId: string
}): AnalysisResponse {
  const ai = args.ai.ok && args.ai.proposedDailyBudget != null
    ? { proposedDailyBudget: args.ai.proposedDailyBudget, rationale: args.ai.rationale, confidence: args.ai.confidence, riskFlags: args.ai.riskFlags }
    : null
  const dataFreshness: AnalysisResponse['dataFreshness'] = { syncedAt: args.syncedAt, refreshed: args.refreshed }
  if (args.refreshError) dataFreshness.refreshError = args.refreshError
  return {
    deterministic: { dailyBudget: args.deterministicDaily, action: args.deterministicAction },
    ai,
    dataFreshness,
    modelId: args.modelId,
  }
}
