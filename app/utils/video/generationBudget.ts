// Content-free budget explanation for the AI video composer. Amounts come from
// GET /api/agency/video/generation/models (`budget`) or a 402 refusal's `data.budget`.

export interface GenerationBudgetBucket {
  jobs: number
  cents: number
}

export interface GenerationBudgetStatus {
  capCents: number
  committedCents: number
  availableCents: number
  reported: GenerationBudgetBucket
  reserved: GenerationBudgetBucket
  uncertain: GenerationBudgetBucket
}

export interface GenerationBudgetNotice {
  title: string
  description: string
}

const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`
const jobsLabel = (count: number) => (count === 1 ? '1 earlier job' : `${count} earlier jobs`)

export function isGenerationBudgetStatus(value: unknown): value is GenerationBudgetStatus {
  const v = value as Partial<GenerationBudgetStatus> | null
  return !!v && typeof v === 'object'
    && [v.capCents, v.committedCents, v.availableCents].every(n => typeof n === 'number' && Number.isFinite(n))
    && !!v.uncertain && typeof v.uncertain.cents === 'number' && typeof v.uncertain.jobs === 'number'
}

/** Returns a notice only when this estimate cannot fit the remaining budget. */
export function generationBudgetNotice(budget: GenerationBudgetStatus | null | undefined, estimateCents: number): GenerationBudgetNotice | null {
  if (!budget || !(estimateCents > budget.availableCents)) return null
  const parts = [`${dollars(budget.availableCents)} of the ${dollars(budget.capCents)} generation limit is available; this request is estimated at ${dollars(estimateCents)}.`]
  if (budget.uncertain.cents > 0) {
    parts.push(`${dollars(budget.uncertain.cents)} is held for ${jobsLabel(budget.uncertain.jobs)} whose provider charges have not been confirmed. This is not a confirmed charge, but it counts against the limit until an administrator reconciles those jobs or changes the limit.`)
  } else if (budget.reserved.cents > 0) {
    parts.push(`${dollars(budget.reserved.cents)} is reserved for requests that are still in progress.`)
  }
  return { title: 'Not enough generation budget for this request', description: parts.join(' ') }
}

/** Short availability text for the cost tooltip. */
export function generationBudgetSummary(budget: GenerationBudgetStatus | null | undefined): string {
  if (!budget) return ''
  const held = budget.uncertain.cents > 0 ? `, ${dollars(budget.uncertain.cents)} unconfirmed` : ''
  return ` · ${dollars(budget.availableCents)} of ${dollars(budget.capCents)} available${held}`
}
