/**
 * ADME Advertising — Invoicing Configuration Modules
 *
 * Drop this folder into /Users/paulgiurin/Documents/Projects/dashboard/src/lib/invoicing/
 * or wherever the dashboard keeps its business logic.
 *
 * These modules provide the complete data layer for the invoicing automation:
 *
 *   coa-map.ts             — Chart of Accounts keyword mapper (description → COA code + tracking)
 *   gst-rules.ts           — GST classification engine (BAS compliance layer)
 *   xero-clients.ts        — 161 Xero contacts with fuzzy matching + payment terms
 *   tracking-categories.ts — 62 media tracking dropdown options mapped to COA codes
 *   invoice-config.ts      — Date rules, numbering, CSV format, API settings, EOM workflow
 */

// COA mapping
export {
  mapToAccount,
  mapToAccountWithConfidence,
  trackingToCode,
  COA_ACCOUNTS,
  type COACode,
  type GSTType,
  type COAMapping,
  type MappingResult,
} from './coa-map'

// GST classification
export {
  classifyGST,
  calculateBASSummary,
  validateGSTClassification,
  type XeroTaxType,
  type GSTClassification,
  type BASLineItem,
  type BASSummary,
  type ValidationError,
} from './gst-rules'

// Xero clients
export {
  XERO_CLIENTS,
  DEALER_GROUPS,
  FOURTEEN_DAY_CLIENTS,
  getPaymentTermDays,
  matchClient,
  getClientByCode,
  type XeroClient,
} from './xero-clients'

// Tracking categories
export {
  TRACKING_CATEGORIES,
  getTrackingCategory,
  getCategoriesForCOA,
  getDropdownOptions,
  type TrackingCategory,
} from './tracking-categories'

// Invoice generation
export {
  getInvoiceDate,
  formatDateForCSV,
  formatDateForAPI,
  getDueDate,
  createNumberingSequence,
  rowToCSV,
  calculateBillAmount,
  XERO_CSV_HEADERS,
  XERO_CONFIG,
  MONDAY_CONFIG,
  EOM_CHECKLIST,
  SANITY_CHECKS,
  type InvoiceNumbering,
  type XeroCSVRow,
  type XeroAPIInvoice,
  type XeroAPILineItem,
} from './invoice-config'
