// Brief→job gatekeeper — the "industry-standard" required-field contract for a job.
// Operating model (confirmed 2026-06-28): AI fills gaps, human confirms. So this NEVER
// hard-blocks conversion — it returns `gaps` (what's missing) + `proposals` (deterministic
// fills) for the accounts manager to confirm/edit. `ok` answers "could this convert with no
// required gap left unfilled?" — the UI confirm step uses it; the conversion records it.

import { deriveBriefAllocations, type JobBudgetAllocation } from './budgetAllocations'

export interface GatekeeperInput {
  templateSlug?: string | null
  /** Whether this brief maps onto a Monday campaign (i.e. is an ad job). */
  isAdTemplate: boolean
  /** Resolved Monday campaign code, or null when none resolved. */
  campaignType?: string | null
  /** Allocations already captured/derived for the job. */
  allocations: Array<{ amount: number }>
  budgetMin?: number | null
  budgetMax?: number | null
  currency?: string | null
  requestedDeadline?: string | null
  /** YYYY-MM for a proposed monthly allocation (kept pure — caller supplies). */
  month?: string | null
}

export type GapSeverity = 'required' | 'recommended'

export interface GatekeeperGap {
  field: string
  severity: GapSeverity
  message: string
}

export interface GatekeeperProposal {
  field: string
  proposedValue: unknown
  rationale: string
}

export interface GatekeeperResult {
  /** No REQUIRED gap left unfilled by a proposal. */
  ok: boolean
  gaps: GatekeeperGap[]
  proposals: GatekeeperProposal[]
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function validateBriefForConversion(input: GatekeeperInput): GatekeeperResult {
  const gaps: GatekeeperGap[] = []
  const proposals: GatekeeperProposal[] = []

  const hasBudget = (num(input.budgetMax) ?? 0) > 0 || (num(input.budgetMin) ?? 0) > 0
  const hasAllocation = Array.isArray(input.allocations) && input.allocations.some(a => a && a.amount > 0)

  if (input.isAdTemplate) {
    // 1. Channel / campaign type — required; we can't safely invent a Monday code.
    if (!clean(input.campaignType)) {
      gaps.push({
        field: 'campaignType',
        severity: 'required',
        message: 'No Monday campaign type resolved — pick the channel/objective so the job is tagged correctly.',
      })
    }

    // 2. Typed budget — required. Propose a single allocation if a budget range exists.
    if (!hasAllocation) {
      if (hasBudget) {
        const [alloc] = deriveBriefAllocations({
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          currency: input.currency,
          campaignType: input.campaignType,
          month: input.month ?? null,
        }) as JobBudgetAllocation[]
        gaps.push({
          field: 'budgetAllocation',
          severity: 'required',
          message: 'Budget is a bare number — no typed per-channel allocation captured.',
        })
        if (alloc) {
          proposals.push({
            field: 'budgetAllocation',
            proposedValue: alloc,
            rationale: 'Derived a single proposed allocation from the brief budget; confirm or split by channel.',
          })
        }
      } else {
        gaps.push({
          field: 'budget',
          severity: 'required',
          message: 'No budget on the brief — an ad job needs a spend figure before it runs.',
        })
      }
    }

    // 3. Deadline — recommended.
    if (!clean(input.requestedDeadline)) {
      gaps.push({
        field: 'requestedDeadline',
        severity: 'recommended',
        message: 'No requested deadline — confirm the campaign window with the client.',
      })
    }
  } else {
    // Non-ad job: looser — budget + deadline are recommended, nothing required.
    if (!hasAllocation && !hasBudget) {
      gaps.push({ field: 'budget', severity: 'recommended', message: 'No budget captured.' })
    }
    if (!clean(input.requestedDeadline)) {
      gaps.push({ field: 'requestedDeadline', severity: 'recommended', message: 'No requested deadline.' })
    }
  }

  const filled = new Set(proposals.map(p => p.field))
  const ok = !gaps.some(g => g.severity === 'required' && !filled.has(g.field))

  return { ok, gaps, proposals }
}
