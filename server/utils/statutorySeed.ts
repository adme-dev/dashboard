/**
 * Statutory obligation seed set for the commitment register.
 *
 * Source of truth for amounts/timing: the bookkeeper's 3 Aug 2026 sheet and
 * the PRD — Bookkeeper Process working doc (Monday doc 45543750). PAYGW and
 * BAS are deliberately ABSENT: the bookkeeper enters those as authorised
 * Xero bills, so they already reach the forecast through the bills path.
 */

export interface StatutorySeedDef {
  seedKey: string
  supplier: string
  description: string
  amountCents: number
  recurrence: 'weekly' | 'monthly'
  paymentAccount: 'NAB_BUSINESS' | 'NAB_TAX'
  confidence: 'committed' | 'provisional'
  anchor: (today: Date) => string
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function nextWeekday(today: Date, isoWeekday: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const current = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  let delta = (isoWeekday - current + 7) % 7
  if (delta === 0) delta = 7
  d.setUTCDate(d.getUTCDate() + delta)
  return iso(d)
}

export function nextMonthlyDay(today: Date, dayOfMonth: number): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const candidate = new Date(Date.UTC(y, m, dayOfMonth))
  if (candidate > today) return iso(candidate)
  return iso(new Date(Date.UTC(y, m + 1, dayOfMonth)))
}

export function seedNoteFor(def: StatutorySeedDef): string {
  return `seedKey:${def.seedKey} — seeded statutory obligation; edit amounts freely, the seeder never overwrites.`
}

export const STATUTORY_SEEDS: StatutorySeedDef[] = [
  {
    seedKey: 'wages-weekly',
    supplier: 'Wages — weekly pay run',
    description: 'Weekly staff wages, excl super and CP & PG (working figure from 3 Aug sheet)',
    amountCents: 1_650_000,
    recurrence: 'weekly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextWeekday(t, 5)
  },
  {
    seedKey: 'super-weekly',
    supplier: 'SuperChoice — employee super',
    description: 'Weekly employee super via SuperChoice clearing house (est.)',
    amountCents: 240_000,
    recurrence: 'weekly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextWeekday(t, 5)
  },
  {
    seedKey: 'sro-payroll-tax',
    supplier: 'SRO — payroll tax (monthly)',
    description: 'Victorian payroll tax, due 7th of following month; amount varies with monthly wages',
    amountCents: 50_000,
    recurrence: 'monthly',
    paymentAccount: 'NAB_TAX',
    confidence: 'provisional',
    anchor: t => nextMonthlyDay(t, 7)
  },
  {
    seedKey: 'ato-debt-instalment',
    supplier: 'ATO — debt instalment',
    description: 'ATO payment-arrangement instalment, direct debit ~13th monthly',
    amountCents: 600_000,
    recurrence: 'monthly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextMonthlyDay(t, 13)
  }
]
