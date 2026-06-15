import { evaluateBudgetGuardrails } from '~~/server/utils/budgetGuardrails'

export interface ExecutionContext {
  platform: 'meta' | 'google'
  flagEnabled: boolean
  currentDaily: number
  recommendedDaily: number
  platformMinimum: number
  maxMultiple: number
  monthlyBudget: number
  mtdSpend: number
  monthDaysRemaining: number
  monthlyMarginPct: number
  alreadyAppliedToday: boolean
  override: boolean
}

export interface ExecutionDecision {
  proceed: boolean
  finalDaily: number
  clamped: boolean
  clampReasons: string[]
  reason?: string
}

export function decideExecution(ctx: ExecutionContext): ExecutionDecision {
  if (!ctx.flagEnabled) {
    return { proceed: false, finalDaily: ctx.currentDaily, clamped: false, clampReasons: [], reason: 'writes_disabled' }
  }
  const g = evaluateBudgetGuardrails({
    currentDaily: ctx.currentDaily,
    recommendedDaily: ctx.recommendedDaily,
    platformMinimum: ctx.platformMinimum,
    maxMultiple: ctx.maxMultiple,
    monthlyBudget: ctx.monthlyBudget,
    mtdSpend: ctx.mtdSpend,
    monthDaysRemaining: ctx.monthDaysRemaining,
    monthlyMarginPct: ctx.monthlyMarginPct,
    alreadyAppliedToday: ctx.alreadyAppliedToday,
    override: ctx.override,
  })
  if (g.blocked) {
    return { proceed: false, finalDaily: ctx.currentDaily, clamped: g.clamped, clampReasons: g.clampReasons, reason: g.blockReason }
  }
  return { proceed: true, finalDaily: g.finalDaily, clamped: g.clamped, clampReasons: g.clampReasons }
}
