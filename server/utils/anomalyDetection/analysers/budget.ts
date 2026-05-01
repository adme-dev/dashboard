// server/utils/anomalyDetection/analysers/budget.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toCurrency = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

export async function budgetAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const budgetVariance = ctx.data.budgetVariance
  if (!budgetVariance) return []

  const out: DetectedAnomaly[] = []

  const summary = budgetVariance.summary
  const categoryAnalysis = budgetVariance.categoryAnalysis || []

  // Overall budget overspend
  if (summary && typeof summary.totalVariancePercent === 'number') {
    if (summary.totalVariancePercent > 50) {
      out.push({
        fingerprint: buildFingerprint('budget', 'overspend-critical'),
        type: 'budget',
        severity: 'critical',
        title: 'Budget significantly exceeded',
        description: `Total spending is ${summary.totalVariancePercent.toFixed(0)}% over budget ($${(summary.totalActual || 0).toFixed(0)} actual vs $${(summary.totalBudget || 0).toFixed(0)} budgeted).`,
        metric: { label: 'Total Variance', value: summary.totalVariancePercent / 100, format: 'percent' },
        comparison: { label: 'Budget', value: toCurrency(summary.totalBudget || 0), format: 'currency', trend: 'up' },
        recommendation: 'Immediately review and freeze discretionary spending. Identify the categories driving the overrun.',
        tags: ['budget', 'overspend'],
        dataSources: ['Budget Variance'],
      })
    } else if (summary.totalVariancePercent > 30) {
      out.push({
        fingerprint: buildFingerprint('budget', 'overspend-warning'),
        type: 'budget',
        severity: 'warning',
        title: 'Budget overrun',
        description: `Total spending is ${summary.totalVariancePercent.toFixed(0)}% over budget for the current period.`,
        metric: { label: 'Total Variance', value: summary.totalVariancePercent / 100, format: 'percent' },
        comparison: { label: 'Budget', value: toCurrency(summary.totalBudget || 0), format: 'currency', trend: 'up' },
        recommendation: 'Review spending by category and identify areas where budget can be reallocated or spending reduced.',
        tags: ['budget', 'overspend'],
        dataSources: ['Budget Variance'],
      })
    }
  }

  // Projected month-end overspend
  if (summary && typeof summary.projectedMonthEnd === 'number' && typeof summary.totalBudget === 'number' && summary.totalBudget > 0) {
    if (summary.projectedMonthEnd > summary.totalBudget * 1.15) {
      out.push({
        fingerprint: buildFingerprint('budget', 'projected-overspend'),
        type: 'budget',
        severity: 'warning',
        title: 'Projected to exceed budget by month-end',
        description: `At current run rate, spending will reach $${summary.projectedMonthEnd.toFixed(0)} by month-end — ${Math.round((summary.projectedMonthEnd / summary.totalBudget - 1) * 100)}% over the $${summary.totalBudget.toFixed(0)} budget.`,
        metric: { label: 'Projected Total', value: toCurrency(summary.projectedMonthEnd), format: 'currency' },
        comparison: { label: 'Budget', value: toCurrency(summary.totalBudget), format: 'currency', trend: 'up' },
        recommendation: 'Slow spending in over-budget categories for the remainder of the month.',
        tags: ['budget', 'forecast'],
        dataSources: ['Budget Variance'],
      })
    }
  }

  // Individual category overruns >30%
  for (const cat of categoryAnalysis) {
    if (cat.status === 'over' && typeof cat.variancePercent === 'number' && cat.variancePercent > 30) {
      out.push({
        fingerprint: buildFingerprint('budget', 'cat-' + (cat.category?.replace(/\s+/g, '-').toLowerCase().slice(0, 25) || 'unknown')),
        type: 'budget',
        severity: cat.variancePercent > 50 ? 'warning' : 'info',
        title: `${cat.category} over budget`,
        description: `${cat.category} is ${cat.variancePercent.toFixed(0)}% over budget ($${(cat.actual || 0).toFixed(0)} actual vs $${(cat.budgeted || 0).toFixed(0)} budgeted).`,
        metric: { label: 'Actual', value: toCurrency(cat.actual || 0), format: 'currency' },
        comparison: { label: 'Budgeted', value: toCurrency(cat.budgeted || 0), format: 'currency', trend: 'up' },
        context: { category: cat.category },
        recommendation: `Review ${cat.category} spending and determine if the budget needs revision or if spending can be reduced.`,
        tags: ['budget', 'category overrun'],
        dataSources: ['Budget Variance'],
      })
    }
  }

  // Multiple categories over budget
  const overBudgetCount = summary?.overBudgetCount || categoryAnalysis.filter((c: any) => c.status === 'over').length
  if (overBudgetCount >= 3) {
    out.push({
      fingerprint: buildFingerprint('budget', 'multiple-overruns'),
      type: 'budget',
      severity: 'info',
      title: 'Multiple categories over budget',
      description: `${overBudgetCount} expense categories are currently over budget — suggesting systemic underfunding or spending discipline issues.`,
      metric: { label: 'Over-Budget Categories', value: overBudgetCount, format: 'number' },
      recommendation: 'Conduct a full budget review. Consider if budgets are realistic or if organisation-wide spending controls are needed.',
      tags: ['budget', 'systemic'],
      dataSources: ['Budget Variance'],
    })
  }

  return out
}
