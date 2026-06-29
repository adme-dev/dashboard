/**
 * Campaign health scoring — pure, deterministic, explainable.
 * Combines the metrics we already store against a client's KPI target.
 * v1 weights/thresholds are tunable constants below; logic stays fixed.
 */

// ── Tunable v1 constants ──────────────────────────────────────────
const BASELINE = 50
const EFFICIENCY_BANDS = { great: 0.7, good: 1.0, near: 1.3, poor: 2.0 } // costPerResult / target
const EFFICIENCY_POINTS = { great: 40, good: 20, near: 0, poor: -25, awful: -40 }
const CONFIDENCE_RESULTS = { high: 30, med: 8 }
const ZERO_RESULT_SPEND_MULT = 3
const FATIGUE = { high: 4.5, med: 3.0, healthy: 2.0 }
const VERDICT_BANDS = { scale: 70, cut: 35 }
const RELEVANCE_CAP = 15

export interface HealthInput {
  platform: string
  costPerResult: number | null
  resultCount: number
  spend: number
  ctr: number | null
  frequency: number | null
  qualityRanking?: string | null
  engagementRateRanking?: string | null
  conversionRateRanking?: string | null
  impressionShare?: number | null
  socialFeedbackCount?: number | null
  negativeSocialFeedbackCount?: number | null
  target: { targetCostPerResult: number, targetCtr?: number | null, maxFrequency?: number | null } | null
}

export interface CampaignHealthResult {
  score: number | null
  verdict: 'scale' | 'hold' | 'cut' | 'insufficient' | 'no-target'
  confidence: 'low' | 'med' | 'high'
  reasons: string[]
}

const money = (n: number) => `$${n.toFixed(2)}`

function socialFeedbackReason(count: number): string {
  return `${count} negative social ${count === 1 ? 'comment/review' : 'comments/reviews'} linked to this campaign`
}

export function scoreCampaignHealth(input: HealthInput): CampaignHealthResult {
  const target = input.target
  const negativeSocialFeedbackCount = Math.max(0, Math.trunc(input.negativeSocialFeedbackCount ?? 0))
  if (!target || !(target.targetCostPerResult > 0)) {
    if (negativeSocialFeedbackCount > 0) {
      return {
        score: 40,
        verdict: 'hold',
        confidence: 'low',
        reasons: [socialFeedbackReason(negativeSocialFeedbackCount), 'No KPI target set for this result type']
      }
    }
    return { score: null, verdict: 'no-target', confidence: 'low', reasons: ['No KPI target set for this result type'] }
  }

  const results = input.resultCount || 0
  const confidence: CampaignHealthResult['confidence']
    = results >= CONFIDENCE_RESULTS.high ? 'high' : results >= CONFIDENCE_RESULTS.med ? 'med' : 'low'

  // Hard case: spending with nothing to show
  if (results === 0 && input.spend >= ZERO_RESULT_SPEND_MULT * target.targetCostPerResult) {
    return {
      score: 10,
      verdict: 'cut',
      confidence: 'high',
      reasons: [
        `Spent ${money(input.spend)} with zero results`,
        ...(negativeSocialFeedbackCount > 0 ? [socialFeedbackReason(negativeSocialFeedbackCount)] : [])
      ]
    }
  }
  if (confidence === 'low') {
    if (negativeSocialFeedbackCount > 0) {
      return {
        score: 40,
        verdict: 'hold',
        confidence,
        reasons: [socialFeedbackReason(negativeSocialFeedbackCount), `Not enough results yet (under ${CONFIDENCE_RESULTS.med})`]
      }
    }
    return { score: null, verdict: 'insufficient', confidence, reasons: [`Not enough results yet (under ${CONFIDENCE_RESULTS.med})`] }
  }

  let score = BASELINE
  const reasons: Array<{ text: string, weight: number }> = []

  // Efficiency (primary signal)
  const cpr = input.costPerResult
  if (cpr != null && cpr > 0) {
    const ratio = cpr / target.targetCostPerResult
    let pts: number
    if (ratio <= EFFICIENCY_BANDS.great) pts = EFFICIENCY_POINTS.great
    else if (ratio <= EFFICIENCY_BANDS.good) pts = EFFICIENCY_POINTS.good
    else if (ratio <= EFFICIENCY_BANDS.near) pts = EFFICIENCY_POINTS.near
    else if (ratio <= EFFICIENCY_BANDS.poor) pts = EFFICIENCY_POINTS.poor
    else pts = EFFICIENCY_POINTS.awful
    score += pts
    const pct = Math.round((ratio - 1) * 100)
    reasons.push({ text: `Cost/result ${money(cpr)} vs ${money(target.targetCostPerResult)} target (${pct >= 0 ? '+' : ''}${pct}%)`, weight: Math.abs(pts) + 1 })
  }

  // Engagement (only when a CTR target is set)
  if (target.targetCtr != null && input.ctr != null) {
    if (input.ctr < target.targetCtr) {
      score -= 15
      reasons.push({ text: `CTR ${input.ctr.toFixed(2)}% below ${target.targetCtr.toFixed(2)}% target`, weight: 15 })
    } else {
      score += 5
    }
  }

  // Fatigue (Meta)
  if (input.frequency != null) {
    if (input.frequency > FATIGUE.high) {
      score -= 15
      reasons.push({ text: `Frequency ${input.frequency.toFixed(1)} — heavy creative fatigue`, weight: 14 })
    } else if (input.frequency > FATIGUE.med) {
      score -= 10
      reasons.push({ text: `Frequency ${input.frequency.toFixed(1)} — creative fatigue`, weight: 9 })
    } else if (input.frequency <= FATIGUE.healthy) {
      score += 5
    }
  }

  // Relevance: Meta rankings
  let relevance = 0
  const rankings: Array<[string, string | null | undefined]> = [
    ['Quality', input.qualityRanking],
    ['Engagement', input.engagementRateRanking],
    ['Conversion', input.conversionRateRanking]
  ]
  for (const [label, r] of rankings) {
    if (!r) continue
    const u = r.toUpperCase()
    if (u.includes('ABOVE_AVERAGE')) relevance += 5
    else if (u.includes('BELOW_AVERAGE')) {
      relevance -= 5
      reasons.push({ text: `${label} ranking below average`, weight: 6 })
    }
  }
  relevance = Math.max(-RELEVANCE_CAP, Math.min(RELEVANCE_CAP, relevance))
  score += relevance

  // Google: impression share as a relevance proxy
  if (input.impressionShare != null) {
    if (input.impressionShare >= 70) score += 8
    else if (input.impressionShare < 30) {
      score -= 8
      reasons.push({ text: `Low impression share ${input.impressionShare.toFixed(0)}%`, weight: 8 })
    }
  }

  if (negativeSocialFeedbackCount > 0) {
    const penalty = Math.min(25, 8 + negativeSocialFeedbackCount * 4)
    score -= penalty
    reasons.push({ text: socialFeedbackReason(negativeSocialFeedbackCount), weight: penalty + 2 })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  // Verdict
  const efficiencyNonNeg = cpr == null || cpr <= target.targetCostPerResult * EFFICIENCY_BANDS.near
  let verdict: CampaignHealthResult['verdict']
  if (score >= VERDICT_BANDS.scale && efficiencyNonNeg) verdict = 'scale'
  else if (score <= VERDICT_BANDS.cut) verdict = 'cut'
  else verdict = 'hold'
  if (verdict === 'scale' && confidence === 'med') verdict = 'hold' // never upgrade on medium confidence
  if (verdict === 'scale' && negativeSocialFeedbackCount > 0) verdict = 'hold'

  reasons.sort((a, b) => b.weight - a.weight)
  return { score, verdict, confidence, reasons: reasons.slice(0, 3).map(r => r.text) }
}
