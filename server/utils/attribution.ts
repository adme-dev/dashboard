// server/utils/attribution.ts
/**
 * Rule-based, auditable multi-touch attribution. Pure functions over an ordered
 * list of touchpoints (one conversion's journey); credit always sums to 1 per
 * conversion. These are deterministic RULE-based models (not a black-box
 * data-driven model) so channel credit is fully explainable.
 *
 * The engine is journey-data agnostic: feed it real per-user touchpoints when
 * they exist (Phase 3.1 richer GA4 ingestion / a future touchpoint table). With
 * a single-touch journey every model returns 100% to that touch — which is
 * correct, not a bug.
 */

export type AttributionModel = 'last' | 'first' | 'linear' | 'position' | 'time_decay'

export const ATTRIBUTION_MODELS: AttributionModel[] = ['last', 'first', 'linear', 'position', 'time_decay']

export interface Touchpoint {
  channel: string
  timestamp: number // epoch ms; the conversion is taken at the last touch's time
}

const DAY_MS = 86_400_000

/** Per-touch credit weights (parallel to the sorted touches), summing to 1. */
function touchWeights(n: number, model: AttributionModel, sorted: Touchpoint[], halfLifeDays: number): number[] {
  if (n === 0) return []
  if (n === 1) return [1]

  switch (model) {
    case 'last': {
      const w = new Array(n).fill(0)
      w[n - 1] = 1
      return w
    }
    case 'first': {
      const w = new Array(n).fill(0)
      w[0] = 1
      return w
    }
    case 'linear': {
      return new Array(n).fill(1 / n)
    }
    case 'position': {
      // 40% first, 40% last, 20% split across the middle. Two touches → 50/50.
      if (n === 2) return [0.5, 0.5]
      const w = new Array(n).fill(0)
      w[0] = 0.4
      w[n - 1] = 0.4
      const mid = 0.2 / (n - 2)
      for (let i = 1; i < n - 1; i++) w[i] = mid
      return w
    }
    case 'time_decay': {
      // Exponential decay toward the conversion (last touch). weight = 2^(-Δdays/halfLife).
      const convTime = sorted[n - 1].timestamp
      const raw = sorted.map(t => Math.pow(2, -((convTime - t.timestamp) / DAY_MS) / halfLifeDays))
      const sum = raw.reduce((a, b) => a + b, 0)
      return sum > 0 ? raw.map(r => r / sum) : new Array(n).fill(1 / n)
    }
  }
}

/**
 * Distribute one conversion's credit across its touchpoint channels.
 * @returns channel -> credit fraction (sums to 1; {} for an empty journey)
 */
export function attributeCredit(
  touches: Touchpoint[],
  model: AttributionModel,
  opts: { halfLifeDays?: number } = {}
): Record<string, number> {
  if (touches.length === 0) return {}
  const halfLifeDays = opts.halfLifeDays ?? 7
  const sorted = [...touches].sort((a, b) => a.timestamp - b.timestamp)
  const weights = touchWeights(sorted.length, model, sorted, halfLifeDays)

  const credit: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    if (weights[i] === 0) continue // don't emit zero-credit channels
    credit[sorted[i].channel] = (credit[sorted[i].channel] || 0) + weights[i]
  }
  return credit
}

/**
 * Aggregate credit across many conversions (each its own journey).
 * @returns channel -> total credit (≈ conversion count when each journey is non-empty)
 */
export function attributeConversions(
  journeys: Touchpoint[][],
  model: AttributionModel,
  opts: { halfLifeDays?: number } = {}
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const journey of journeys) {
    const credit = attributeCredit(journey, model, opts)
    for (const [channel, value] of Object.entries(credit)) {
      totals[channel] = (totals[channel] || 0) + value
    }
  }
  return totals
}

export function isAttributionModel(value: unknown): value is AttributionModel {
  return typeof value === 'string' && (ATTRIBUTION_MODELS as string[]).includes(value)
}
