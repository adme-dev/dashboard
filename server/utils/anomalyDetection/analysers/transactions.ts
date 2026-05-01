// server/utils/anomalyDetection/analysers/transactions.ts
//
// DEFERRED — per-line-item z-score within an account.
//
// The original plan called for porting the per-transaction outlier detection
// from server/api/ai/anomaly-detection.get.ts (which fetched up to 5,000 Xero
// invoices and ran z-score within each account category). The port requires
// invoice line items that the existing /api/xero/expenses endpoint doesn't
// expose — only aggregates.
//
// Two implementation paths when this lands:
//   1. Extend /api/xero/expenses to optionally return line items (?withLines=1).
//      Cleanest — keeps shared-data discipline.
//   2. Add a dedicated /api/xero/expenses/lines endpoint and fetch it from
//      sharedData.ts under the `invoiceLines` slot.
//
// Until then, the existing expensesAnalyser already covers daily and vendor
// z-score at the aggregated level — most of the legacy endpoint's value is
// preserved.
//
// When implemented, fingerprint shape: 'transactions:outlier-{accountSlug}-{periodMonth}'.

import type { Analyser } from '../types'
export const transactionsAnalyser: Analyser = async () => []
