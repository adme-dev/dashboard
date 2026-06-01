// server/utils/crm/lineItems.ts
// F14 — pure helpers for opportunity line-items + the value roll-up rule.
// line_total itself is a generated column in the DB; these mirror it for the
// derive-vs-manual decision applied after every line-item mutation.

export interface LineItemLike { quantity: number, unit_price: number }

export function lineTotal(quantity: number, unitPrice: number): number {
  return round2((Number(quantity) || 0) * (Number(unitPrice) || 0))
}

export function sumLineTotals(items: LineItemLike[]): number {
  return round2(items.reduce((s, i) => s + lineTotal(i.quantity, i.unit_price), 0))
}

/**
 * Roll-up rule: an opportunity's value is DERIVED from its line-items when any
 * exist; with no line-items the existing manual `amount` is kept (deleting the
 * last line-item therefore leaves the value untouched for manual editing).
 */
export function deriveOppValue(items: LineItemLike[], currentAmount: number | null): number | null {
  if (!items.length) return currentAmount
  return sumLineTotals(items)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
