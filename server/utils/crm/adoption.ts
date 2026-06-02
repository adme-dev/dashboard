// server/utils/crm/adoption.ts
// Pure CRM-adoption metric math for the Insights "Adoption" card (P4.0b).
// The endpoint runs the SQL counts; this function turns them into the
// success-metrics the Phase 1–3 PRD never instrumented. Framework-free, TDD.

export interface AdoptionInput {
  /** Active (open, not-deleted) opportunities. */
  activeOpps: number
  /** Of those, how many have ≥1 open (pending/in_progress) task. */
  activeOppsWithOpenTask: number
  /** Active (not-deleted) people. */
  people: number
  /** Of those, how many have at least one score row. */
  peopleWithScore: number
  /** Saved views (crm_views) for the client. */
  views: number
  /** Distinct users who have saved ≥1 view. */
  viewUsers: number
  /** Active contact records (people + companies) — the dup-rate base. */
  contacts: number
  /** Duplicate records merged away (crm_merge_log rows). */
  merges: number
}

export interface AdoptionMetrics {
  /** % of active opps with at least one open task — "no deal sits without a next step". */
  oppTaskCoveragePct: number
  /** % of people carrying a score. */
  peopleScoredPct: number
  /** Average saved views per active view-user. */
  savedViewsPerUser: number
  /** % of contact records that turned out to be duplicates and were merged away. */
  duplicateRatePct: number
  /** Raw counts, echoed for display. */
  raw: AdoptionInput
}

/** Percentage rounded to one decimal; 0 when the denominator is 0 (no NaN). */
function pct(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 1000) / 10
}

export function computeAdoption(input: AdoptionInput): AdoptionMetrics {
  return {
    oppTaskCoveragePct: pct(input.activeOppsWithOpenTask, input.activeOpps),
    peopleScoredPct: pct(input.peopleWithScore, input.people),
    savedViewsPerUser: input.viewUsers > 0 ? Math.round((input.views / input.viewUsers) * 10) / 10 : 0,
    duplicateRatePct: pct(input.merges, input.contacts + input.merges),
    raw: input,
  }
}
