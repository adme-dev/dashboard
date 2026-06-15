/**
 * Pure guardrail engine for AI pacing budget changes. No I/O.
 * All budgets in major currency units (e.g. dollars/AUD). Caller converts to
 * minor units (cents) / micros for the platform API.
 */
export interface GuardrailInput {
  currentDaily: number
  recommendedDaily: number
  platformMinimum: number
  maxMultiple: number
  monthlyBudget: number      // 0 when unknown → monthly check skipped
  mtdSpend: number
  monthDaysRemaining: number // clamped to >= 1 by the caller
  monthlyMarginPct: number   // e.g. 0.1 = allow 10% over monthly budget
  alreadyAppliedToday: boolean
  override: boolean          // skips ±20% + relative caps; NOT minimum or rate-limit
}

export interface GuardrailResult {
  finalDaily: number
  clamped: boolean
  clampReasons: string[]
  blocked: boolean
  blockReason?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function evaluateBudgetGuardrails(input: GuardrailInput): GuardrailResult {
  const clampReasons: string[] = []

  // Rate limit is absolute — override does not bypass it.
  if (input.alreadyAppliedToday) {
    return { finalDaily: input.currentDaily, clamped: false, clampReasons: [], blocked: true, blockReason: 'rate_limited_today' }
  }

  let target = input.recommendedDaily

  if (!input.override) {
    // ±20% learning-phase clamp
    const maxStep = input.currentDaily * 1.2
    const minStep = input.currentDaily * 0.8
    if (target > maxStep) { target = maxStep; clampReasons.push('learning_phase_+20pct') }
    else if (target < minStep) { target = minStep; clampReasons.push('learning_phase_-20pct') }

    // Relative cap: multiple of current
    const capByMultiple = input.currentDaily * input.maxMultiple
    if (target > capByMultiple) { target = capByMultiple; clampReasons.push('max_multiple') }

    // Relative cap: monthly-budget margin
    if (input.monthlyBudget > 0) {
      const allowed = input.monthlyBudget * (1 + input.monthlyMarginPct) - input.mtdSpend
      const daysLeft = Math.max(1, input.monthDaysRemaining)
      const maxDailyByMonth = allowed / daysLeft
      if (maxDailyByMonth < target) { target = maxDailyByMonth; clampReasons.push('monthly_margin') }
    }
  }

  // Platform minimum is absolute (applies even with override).
  if (target < input.platformMinimum) {
    target = input.platformMinimum
    if (!clampReasons.includes('platform_minimum')) clampReasons.push('platform_minimum')
  }

  // Conflict: raising to the minimum breached a hard relative cap → cannot satisfy both.
  if (!input.override) {
    const capByMultiple = input.currentDaily * input.maxMultiple
    if (target > capByMultiple) {
      return { finalDaily: input.currentDaily, clamped: false, clampReasons, blocked: true, blockReason: 'minimum_exceeds_cap' }
    }
  }

  const finalDaily = round2(target)
  return {
    finalDaily,
    clamped: clampReasons.length > 0,
    clampReasons,
    blocked: false,
  }
}

/** Meta/Google daily minimum by optimization goal (account-currency major units). */
export function platformDailyMinimum(optimizationGoal: string | null | undefined): number {
  const goal = (optimizationGoal || '').toUpperCase()
  const conversionGoals = ['OFFSITE_CONVERSIONS', 'CONVERSIONS', 'LEAD_GENERATION', 'PURCHASE', 'VALUE']
  return conversionGoals.some(g => goal.includes(g)) ? 5 : 1
}
