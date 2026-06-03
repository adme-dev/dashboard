/**
 * Split a month's Xero ACCREC invoices into GST-inclusive, GST-exclusive, and
 * GST components.
 *
 * Why: the "Get Out" target (`wages + expenses + extras`) is a GST-exclusive
 * cash obligation. Measuring it against the GST-inclusive invoice total
 * overstates coverage by the GST portion (in AU, 1/11 of a tax-inclusive
 * total) — i.e. it credits the ATO's money toward survival. This helper lets
 * the scorecard compare like-for-like on an ex-GST basis while still surfacing
 * the gross figure and the GST set-aside.
 *
 * Field preference (most accurate → fallback), per invoice:
 *   exGst  = subTotal ?? (total - totalTax) ?? total / 1.1
 *   gst    = totalTax ?? (total - subTotal) ?? total / 11
 *   inclGst = total
 * Real `subTotal`/`totalTax` correctly handle GST-free and partially-taxable
 * invoices; the 1/11 split is only used when neither field is present.
 */

export interface InvoiceLike {
  total?: unknown
  subTotal?: unknown
  totalTax?: unknown
}

export interface InvoiceTotals {
  inclGst: number
  exGst: number
  gst: number
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function splitInvoiceTotals(invoices: InvoiceLike[]): InvoiceTotals {
  let inclGst = 0
  let exGst = 0
  let gst = 0

  for (const inv of invoices) {
    const total = num(inv?.total) ?? 0
    const subTotal = num(inv?.subTotal)
    const totalTax = num(inv?.totalTax)

    inclGst += total

    if (subTotal != null) {
      exGst += subTotal
      gst += totalTax != null ? totalTax : (total - subTotal)
    } else if (totalTax != null) {
      exGst += total - totalTax
      gst += totalTax
    } else {
      // AU fallback: GST is 1/11 of a tax-inclusive total.
      exGst += total / 1.1
      gst += total / 11
    }
  }

  return {
    inclGst: Math.round(inclGst * 100) / 100,
    exGst: Math.round(exGst * 100) / 100,
    gst: Math.round(gst * 100) / 100,
  }
}
