/**
 * Pure proportional daily-budget split for multi-ABO Meta campaigns (Phase 1.5).
 * Distributes an approved campaign-level daily total across participating ad sets
 * in proportion to their current daily budgets, rounding to cents and pushing the
 * rounding drift onto the largest-current ad set so the parts sum EXACTLY to the
 * total. Blocks (never silently bumps) when a share would fall below the per-ad-set
 * minimum — bumping would exceed the guardrail-approved total and risk overspend.
 * No network / DB — fully unit-testable.
 */

export interface SplitParticipant {
  id: string
  currentDailyMajor: number
}

export type SplitResult =
  | { ok: true; splits: Array<{ id: string; newDailyMajor: number }>; reason?: undefined }
  | { ok: false; reason: 'adset_share_below_min' | 'no_participants' | 'zero_current_total' }

const round2 = (n: number) => Math.round(n * 100) / 100

export function splitDailyBudget(
  participants: SplitParticipant[],
  finalDailyTotal: number,
  perAdsetMin: number,
): SplitResult {
  if (participants.length === 0) return { ok: false, reason: 'no_participants' }
  const sumCurrent = participants.reduce((s, p) => s + p.currentDailyMajor, 0)
  if (sumCurrent <= 0) return { ok: false, reason: 'zero_current_total' }

  const splits = participants.map(p => ({
    id: p.id,
    newDailyMajor: round2(finalDailyTotal * (p.currentDailyMajor / sumCurrent)),
  }))

  // Exact-sum reconciliation: push the rounding drift onto the largest-current ad
  // set (ties resolve to the first such ad set by index — deterministic).
  const drift = round2(finalDailyTotal - splits.reduce((s, x) => s + x.newDailyMajor, 0))
  if (drift !== 0) {
    let largestIdx = 0
    for (let i = 1; i < participants.length; i++) {
      if (participants[i].currentDailyMajor > participants[largestIdx].currentDailyMajor) largestIdx = i
    }
    splits[largestIdx].newDailyMajor = round2(splits[largestIdx].newDailyMajor + drift)
  }

  if (splits.some(s => s.newDailyMajor < perAdsetMin)) {
    return { ok: false, reason: 'adset_share_below_min' }
  }
  return { ok: true, splits }
}
