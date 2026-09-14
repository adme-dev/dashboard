/**
 * Treasury policy layer — derives dated forecast lines from small config
 * objects instead of hand-keyed commitment rows (spreadsheet retirement W3).
 *
 * Two policy types:
 *
 *  tax_transfer — "$16k every Monday, skip the 1st Monday of the month,
 *  amount varies by month". An INTERNAL transfer: cash moves NAB Business →
 *  NAB Tax but never leaves the org, so derived lines are tagged
 *  internal and MUST NOT be added to org-level outflow. Per-account views
 *  subtract from the source account and add to the destination.
 *
 *  amex_paydown — statement-balance tranches Kellie schedules ("$50k on the
 *  13th, remainder by the 22nd"). Real cash outflows: the underlying
 *  supplier charges were already settled from the Amex facility in Xero, so
 *  the paydown is the only cash event the forecast should count.
 */

import { queryOne } from './db'

export interface TaxTransferMonth {
  /** Weekly transfer amount for this calendar month, in cents. */
  weeklyAmountCents: number
  /**
   * 1-based Mondays of the month to skip (Kellie's "skip 1st Monday of the
   * month" rule → [1]). Omit for no skips.
   */
  skipMondays?: number[]
}

export interface TaxTransferConfig {
  fromAccount: string
  toAccount: string
  /** Per-month overrides keyed 'YYYY-MM'. */
  months: Record<string, TaxTransferMonth>
  /** Fallback for months without an entry. No fallback → no transfers. */
  default?: TaxTransferMonth
}

export interface AmexTranche {
  date: string // YYYY-MM-DD
  amountCents: number
  label?: string
}

export interface AmexPaydownConfig {
  payFromAccount: string
  tranches: AmexTranche[]
}

export interface PolicyLine {
  date: string // YYYY-MM-DD
  amountCents: number
  kind: 'internal_transfer' | 'amex_paydown'
  fromAccount: string
  toAccount?: string
  label: string
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** All Mondays of the month containing `ym` ('YYYY-MM'), as Dates (UTC). */
function mondaysOfMonth(ym: string): Date[] {
  const [y, m] = ym.split('-').map(Number)
  const out: Date[] = []
  const d = new Date(Date.UTC(y, m - 1, 1))
  while (d.getUTCMonth() === m - 1) {
    if (d.getUTCDay() === 1) out.push(new Date(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * Derive transfer lines for [start, end). Pure — exported for tests.
 */
export function deriveTaxTransferLines(
  config: TaxTransferConfig,
  start: Date,
  end: Date,
): PolicyLine[] {
  const lines: PolicyLine[] = []
  // Iterate every month the horizon touches.
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cursor < end) {
    const ym = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    const month = config.months[ym] ?? config.default
    if (month && month.weeklyAmountCents > 0) {
      const skips = new Set(month.skipMondays ?? [])
      mondaysOfMonth(ym).forEach((monday, i) => {
        if (skips.has(i + 1)) return
        if (monday < start || monday >= end) return
        lines.push({
          date: toDateOnly(monday),
          amountCents: month.weeklyAmountCents,
          kind: 'internal_transfer',
          fromAccount: config.fromAccount,
          toAccount: config.toAccount,
          label: `Transfer ${config.fromAccount} → ${config.toAccount}`,
        })
      })
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return lines
}

/** Derive Amex paydown lines within [start, end). Pure — exported for tests. */
export function deriveAmexPaydownLines(
  config: AmexPaydownConfig,
  start: Date,
  end: Date,
): PolicyLine[] {
  const startStr = toDateOnly(start)
  const endStr = toDateOnly(end)
  return (config.tranches ?? [])
    .filter(t => t.amountCents > 0 && t.date >= startStr && t.date < endStr)
    .map(t => ({
      date: t.date,
      amountCents: t.amountCents,
      kind: 'amex_paydown' as const,
      fromAccount: config.payFromAccount,
      label: t.label ?? 'Amex statement paydown',
    }))
}

/** Load active policies and derive all lines for the horizon. */
export async function derivePolicyLines(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<PolicyLine[]> {
  const lines: PolicyLine[] = []

  const transfer = await queryOne<{ config: TaxTransferConfig }>(
    `SELECT config FROM treasury_policies
     WHERE tenant_id = $1 AND policy_type = 'tax_transfer' AND active`,
    [tenantId],
  )
  if (transfer?.config) lines.push(...deriveTaxTransferLines(transfer.config, start, end))

  const amex = await queryOne<{ config: AmexPaydownConfig }>(
    `SELECT config FROM treasury_policies
     WHERE tenant_id = $1 AND policy_type = 'amex_paydown' AND active`,
    [tenantId],
  )
  if (amex?.config) lines.push(...deriveAmexPaydownLines(amex.config, start, end))

  return lines.sort((a, b) => a.date.localeCompare(b.date))
}
