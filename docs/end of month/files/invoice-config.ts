/**
 * ADME Advertising — Invoice Generation Configuration
 *
 * Settings for generating Xero-compatible invoices from Monday.com data.
 * Covers: date rules, invoice numbering, CSV format, Xero API batch settings,
 * margin calculations, and EOM workflow.
 *
 * Source: xero-invoicing.md + SalesInvoiceTemplate.csv + Kellie White requirements
 */

import type { COACode, GSTType } from './coa-map'

// ── Invoice Date Rules ──────────────────────────────────────────────────────

/**
 * InvoiceDate = last day of the month being invoiced
 * DueDate = InvoiceDate + paymentTermDays
 */
export function getInvoiceDate(year: number, month: number): string {
  // Last day of month (DD/MM/YYYY for Xero CSV, YYYY-MM-DD for API)
  const lastDay = new Date(year, month, 0) // month is 1-indexed here
  return lastDay
}

export function formatDateForCSV(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

export function formatDateForAPI(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${y}-${m}-${d}`
}

export function getDueDate(invoiceDate: Date, paymentTermDays: 7 | 14): Date {
  const due = new Date(invoiceDate)
  due.setDate(due.getDate() + paymentTermDays)
  return due
}

// ── Invoice Numbering ───────────────────────────────────────────────────────

/**
 * ADME uses plain sequential integers (e.g. 18401, 18402, 18403...)
 * No prefix. Each line item on the same invoice shares the same number.
 * Multiple line items for a client = same InvoiceNumber = one invoice in Xero.
 *
 * Before generating, query Xero for the last invoice number:
 * GET /Invoices?Type=ACCREC&order=InvoiceNumber+DESC&pageSize=1
 */
export interface InvoiceNumbering {
  lastInvoiceNumber: number   // from Xero query
  nextInvoiceNumber: number   // lastInvoiceNumber + 1
  currentNumber: number       // tracks assignment during generation
}

export function createNumberingSequence(lastNumber: number): InvoiceNumbering {
  return {
    lastInvoiceNumber: lastNumber,
    nextInvoiceNumber: lastNumber + 1,
    currentNumber: lastNumber + 1,
  }
}

// ── Xero CSV Format (27 columns) ───────────────────────────────────────────

export const XERO_CSV_HEADERS = [
  '*ContactName',
  'EmailAddress',
  'POAddressLine1',
  'POAddressLine2',
  'POAddressLine3',
  'POAddressLine4',
  'POCity',
  'PORegion',
  'POPostalCode',
  'POCountry',
  '*InvoiceNumber',
  'Reference',
  '*InvoiceDate',
  '*DueDate',
  'InventoryItemCode',
  '*Description',
  '*Quantity',
  '*UnitAmount',
  'Discount',
  '*AccountCode',
  '*TaxType',
  'TrackingName1',
  'TrackingOption1',
  'TrackingName2',
  'TrackingOption2',
  'Currency',
  'BrandingTheme',
] as const

export interface XeroCSVRow {
  contactName: string
  emailAddress?: string
  invoiceNumber: string
  reference: string           // MM/YYYY format
  invoiceDate: string         // DD/MM/YYYY
  dueDate: string             // DD/MM/YYYY
  description: string
  quantity: number             // always 1
  unitAmount: number           // ex-GST
  accountCode: COACode
  taxType: GSTType
  trackingOption1: string      // media category
  trackingOption2: string      // client name (Xero legal entity)
  currency: 'AUD'
  brandingTheme: 'ADME'
}

export function rowToCSV(row: XeroCSVRow): string {
  const values = [
    csvEscape(row.contactName),       // *ContactName
    row.emailAddress || '',           // EmailAddress
    '', '', '', '',                    // POAddress lines
    '', '', '', '',                    // POCity/Region/PostalCode/Country
    csvEscape(row.invoiceNumber),      // *InvoiceNumber
    csvEscape(row.reference),          // Reference
    csvEscape(row.invoiceDate),        // *InvoiceDate
    csvEscape(row.dueDate),            // *DueDate
    '',                                // InventoryItemCode
    csvEscape(row.description),        // *Description
    String(row.quantity),              // *Quantity
    String(row.unitAmount),            // *UnitAmount
    '',                                // Discount
    row.accountCode,                   // *AccountCode
    row.taxType,                       // *TaxType
    'Media',                           // TrackingName1
    csvEscape(row.trackingOption1),    // TrackingOption1
    'Client',                          // TrackingName2
    csvEscape(row.trackingOption2),    // TrackingOption2
    row.currency,                      // Currency
    row.brandingTheme,                 // BrandingTheme
  ]
  return values.join(',')
}

function csvEscape(val: string | null | undefined): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// ── Xero API Batch Format ───────────────────────────────────────────────────

export interface XeroAPIInvoice {
  Type: 'ACCREC'
  Contact: { Name: string }
  InvoiceNumber: string
  Reference: string
  Date: string              // YYYY-MM-DD
  DueDate: string           // YYYY-MM-DD
  Status: 'DRAFT'           // ALWAYS DRAFT — Rob approves before sending
  LineAmountTypes: 'Exclusive'
  CurrencyCode: 'AUD'
  LineItems: XeroAPILineItem[]
}

export interface XeroAPILineItem {
  Description: string
  Quantity: number
  UnitAmount: number
  AccountCode: string
  TaxType: string
  Tracking: Array<{ Name: string; Option: string }>
}

// ── Margin Calculations ─────────────────────────────────────────────────────

/**
 * Media (220): Bill at cost × 1.10 (10% margin)
 *   If Monday shows $10,000 radio buy → invoice client $11,000
 *   The $10,000 cost is a separate purchase
 *
 * PPC Passthrough (330): Bill exact spend, no markup
 *   UnitAmount = exact ad spend from Budget Hawk
 *
 * All other (205-219, 225): 100% margin — UnitAmount is the full fee
 */
export function calculateBillAmount(costOrFee: number, coaCode: COACode): number {
  switch (coaCode) {
    case '220':
      return Math.round(costOrFee * 1.10 * 100) / 100  // 10% margin
    case '330':
      return costOrFee  // passthrough, no markup
    default:
      return costOrFee  // 100% margin — amount IS the fee
  }
}

// ── Xero API Settings ───────────────────────────────────────────────────────

export const XERO_CONFIG = {
  apiBaseUrl: 'https://api.xero.com/api.xro/2.0',
  maxBatchSize: 50,           // max invoices per POST request
  rateLimit: {
    perMinute: 60,
    perDay: 5000,
  },
  tokenExpiryMinutes: 30,     // OAuth token expires every 30 min
  defaultStatus: 'DRAFT' as const,  // NEVER auto-authorise
  currency: 'AUD' as const,
  brandingTheme: 'ADME',
}

// ── Monday.com Settings ─────────────────────────────────────────────────────

export const MONDAY_CONFIG = {
  apiUrl: 'https://api.monday.com/v2',
  jobsBoardId: '3199166934',  // Jobs / Proof-to-be-Billed board
  apiVersion: '2024-01',
  // Column IDs to look for (will vary per board — Claude Code should auto-detect)
  expectedColumns: {
    client: ['client', 'contact', 'customer'],
    amount: ['amount', 'budget', 'price', 'value', 'cost'],
    status: ['status', 'stage'],
    description: ['description', 'name', 'job', 'task'],
    date: ['date', 'month', 'period'],
    tracking: ['tracking', 'media', 'category', 'type'],
    accountManager: ['account manager', 'owner', 'person'],
  },
  billableStatuses: ['Done', 'Proof to be Billed', 'Complete', 'Completed'],
}

// ── EOM Workflow Checklist ──────────────────────────────────────────────────

export const EOM_CHECKLIST = [
  { step: 1, task: 'Confirm all jobs for the month are marked Done/Proof in Monday', owner: 'Kellie/Hannah' },
  { step: 2, task: 'Check Xero OAuth token is valid (refresh if expired)', owner: 'System' },
  { step: 3, task: 'Get last invoice number from Xero', owner: 'System' },
  { step: 4, task: 'Pull completed jobs from Monday.com jobs board', owner: 'System' },
  { step: 5, task: 'Pull actual PPC spend from Budget Hawk (Facebook + Google)', owner: 'System' },
  { step: 6, task: 'Generate invoice lines with COA mapping + GST classification', owner: 'System' },
  { step: 7, task: 'Validate contact names against 161 Xero customers', owner: 'System' },
  { step: 8, task: 'Review totals — expect ~$250-280K typical month', owner: 'Kellie' },
  { step: 9, task: 'Spot-check 5-10 rows: client name, COA, GST type, amount', owner: 'Kellie' },
  { step: 10, task: 'PPC budget vs actual spend check', owner: 'Kellie/Hannah' },
  { step: 11, task: 'Upload to Xero as DRAFT invoices', owner: 'System' },
  { step: 12, task: 'Review and AUTHORISE invoices in Xero', owner: 'Rob' },
  { step: 13, task: 'Archive CSV to storage', owner: 'System' },
] as const

// ── Typical Monthly Ranges (for sanity checks) ─────────────────────────────

export const SANITY_CHECKS = {
  expectedMonthlyTotal: { min: 200_000, max: 350_000 },  // ex-GST
  expectedInvoiceCount: { min: 100, max: 200 },
  expectedLineItems: { min: 300, max: 800 },
  maxSingleInvoice: 100_000,  // flag anything over this for review
  gstBreakdown: {
    gstOnIncome: 0.65,      // ~65% of lines should be GST on Income
    gstFreeExpenses: 0.15,  // ~15% Facebook passthrough
    gstOnExpenses: 0.20,    // ~20% Google passthrough
  },
}
