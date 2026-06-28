// Structured per-channel job budget — pure derivation helpers (brief→job P2).
// A job's budget is a set of typed allocations (campaign_type × platform), not a bare
// number. These pure functions turn a brief's existing budget fields into a *proposed*
// allocation the accounts manager confirms later — never an authoritative write.
// Grounds: docs/superpowers/specs/2026-06-28-structured-job-budget-model.md

export type BudgetPeriod = 'monthly' | 'total'
export type BudgetState = 'proposed' | 'active' | 'paused'
export type BudgetSource = 'brief' | 'manual' | 'ai'

export interface JobBudgetAllocation {
  campaignType: string | null
  platform: string | null
  amount: number
  currency: string
  period: BudgetPeriod
  month: string | null
  state: BudgetState
  source: BudgetSource
}

// Monday campaign codes are prefixed by platform: G_/M_/T_/S_.
const PLATFORM_BY_PREFIX: Record<string, string> = {
  G: 'Google',
  M: 'Meta',
  T: 'TikTok',
  S: 'Spotify',
}

/** Derive the ad platform from a Monday campaign-type code prefix (G_/M_/T_/S_). */
export function platformForCampaignType(code: string | null | undefined): string | null {
  if (!code || typeof code !== 'string') return null
  const prefix = code.trim().charAt(0).toUpperCase()
  return PLATFORM_BY_PREFIX[prefix] ?? null
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export interface DeriveBriefAllocationsInput {
  budgetMin?: number | null
  budgetMax?: number | null
  currency?: string | null
  campaignType?: string | null
  /** YYYY-MM supplied by the caller (kept pure — no Date here). */
  month: string | null
  period?: BudgetPeriod
}

/**
 * Bootstrap a single *proposed* allocation from the brief's existing budget range,
 * until the brief form captures structured allocations directly. Returns [] when the
 * brief carries no usable budget (nothing to propose — surface, don't invent).
 */
export function deriveBriefAllocations(input: DeriveBriefAllocationsInput): JobBudgetAllocation[] {
  // Prefer a positive max, else a positive min. A literal 0 (or negative) max must NOT
  // shadow a real min — `num(0) ?? num(min)` would wrongly keep 0 and drop the budget.
  const max = num(input.budgetMax)
  const min = num(input.budgetMin)
  const amount = (max != null && max > 0) ? max
    : (min != null && min > 0) ? min
      : null
  if (amount == null) return []

  const period: BudgetPeriod = input.period ?? 'monthly'
  return [{
    campaignType: clean(input.campaignType),
    platform: platformForCampaignType(input.campaignType),
    amount,
    currency: clean(input.currency) ?? 'AUD',
    period,
    month: period === 'monthly' ? (input.month ?? null) : null,
    state: 'proposed',
    source: 'brief',
  }]
}
