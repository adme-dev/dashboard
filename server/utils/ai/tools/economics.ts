import type { H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export type EconomicsPeriod = 'mtd' | 'ytd'

export interface PeriodBounds {
  /** inclusive ISO date 'YYYY-MM-DD' */
  start: string
  end: string
  /** media_spend.period values ('YYYY-MM') covering the window */
  mediaPeriods: string[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const ym = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, '0')}`

export function periodBounds(period: EconomicsPeriod, now: Date = new Date()): PeriodBounds {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  if (period === 'ytd') {
    return {
      start: iso(new Date(Date.UTC(y, 0, 1))),
      end: iso(now),
      mediaPeriods: Array.from({ length: m + 1 }, (_, i) => ym(y, i)),
    }
  }
  return {
    start: iso(new Date(Date.UTC(y, m, 1))),
    end: iso(new Date(Date.UTC(y, m + 1, 0))),
    mediaPeriods: [ym(y, m)],
  }
}

export interface NameMatch<T> { match?: T, candidates: T[] }

/** Resolve a model-supplied name against already-fetched rows: exact wins, else unique substring, else ambiguous/none. */
export function resolveByName<T extends { name: string | null }>(rows: T[], query: string): NameMatch<T> {
  const q = query.trim().toLowerCase()
  if (!q) return { candidates: [] }
  const exact = rows.filter(r => (r.name ?? '').toLowerCase() === q)
  if (exact.length === 1) return { match: exact[0], candidates: exact }
  const contains = rows.filter(r => (r.name ?? '').toLowerCase().includes(q))
  if (contains.length === 1) return { match: contains[0], candidates: contains }
  return { candidates: contains }
}

// ── Postgres data functions (default-deps source; covered via tool tests with mock deps) ──

export interface ClientEconomicsRow {
  clientId: string
  name: string
  revenueCents: number
  passthroughCents: number
  /** Present on the canonical portfolio adapter; optional for rollout compatibility with older callers. */
  agiCents?: number
  laborCents: number
  /** Present on the canonical portfolio adapter; optional for rollout compatibility with older callers. */
  projectExpenseCents?: number
  /** Present on the canonical portfolio adapter; optional for rollout compatibility with older callers. */
  xeroSupplierCostCents?: number
  /** Present on the canonical portfolio adapter; optional for rollout compatibility with older callers. */
  deliveryCostCents?: number
  /** Present on the canonical portfolio adapter; optional for rollout compatibility with older callers. */
  deliveryMarginPct?: number | null
  hours: number
}

export interface PortfolioClientEconomicsRow extends ClientEconomicsRow {
  agiCents: number
  projectExpenseCents: number
  xeroSupplierCostCents: number
  deliveryCostCents: number
  deliveryMarginPct: number | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function cents(v: unknown, label: string): number {
  const value = typeof v === 'number' ? v : Number(v)
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be represented as integer cents`)
  return value
}

function addCents(left: number, right: number, label: string): number {
  const total = left + right
  if (!Number.isSafeInteger(total)) throw new Error(`${label} exceeds the safe integer range`)
  return total
}

function subtractCents(left: number, right: number, label: string): number {
  return addCents(left, -right, label)
}

function normalizedInvoiceId(value: string | null): string | null {
  const normalized = value?.trim().toLocaleLowerCase('en-AU')
  return normalized || null
}

interface ExpenseSourceRow {
  client_id: string
  expense_id: string
  amount_cents: string
  xero_invoice_id: string | null
}

interface SupplierSourceRow {
  client_id: string
  line_item_id: string
  invoice_id: string
  invoice_type: string
  invoice_date: string | Date
  account_code: string | null
  description: string | null
  amount_cents: string
  source_fingerprint: string
}

function sourceDate(value: string | Date, label: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date`)
    return value.toISOString().slice(0, 10)
  }
  const normalized = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} must use YYYY-MM-DD format`)
  return normalized
}

async function supplierFingerprint(tenantId: string, row: SupplierSourceRow, amountCents: number): Promise<string> {
  const source = [
    tenantId,
    row.line_item_id,
    row.invoice_id,
    row.invoice_type,
    sourceDate(row.invoice_date, `Xero line ${row.line_item_id} date`),
    row.account_code ?? '',
    amountCents,
    row.description ?? '',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Canonical per-client portfolio economics for the period.
 *
 * Each source is loaded once for the whole portfolio. Revenue and agency-paid
 * media remain client-level totals regardless of project allocation. Xero
 * supplier costs require a current, valid project allocation and a
 * DIRECTCOSTS account, matching the client financial facade's project model.
 */
export async function fetchPortfolioClientEconomics(
  event: H3Event,
  period: EconomicsPeriod,
): Promise<PortfolioClientEconomicsRow[]> {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) return []
  const bounds = periodBounds(period)
  // The legacy helper exposes a calendar-month end for older tools. The
  // canonical client facade defines MTD as first-of-month through today.
  const start = bounds.start
  const end = period === 'mtd' ? iso(new Date()) : bounds.end
  const mediaPeriods = bounds.mediaPeriods

  const [revenue, passthrough, labor, projectExpenses, supplierCosts] = await Promise.all([
    queryRows<{ client_id: string, name: string, revenue_cents: string }>(
      `SELECT ac.id AS client_id, ac.name AS name,
              COALESCE(SUM(line.line_ex_gst_cents), 0)::bigint::text AS revenue_cents
         FROM agency_clients ac
         LEFT JOIN xero_invoices_cache invoice
           ON invoice.tenant_id = $1
          AND ac.xero_contact_id IS NOT NULL
          AND invoice.contact_id = ac.xero_contact_id
         LEFT JOIN xero_invoice_lines_cache line
           ON line.tenant_id = invoice.tenant_id
          AND line.invoice_id = invoice.invoice_id
          AND UPPER(line.invoice_type) = 'ACCREC'
          AND UPPER(line.invoice_status) NOT IN ('DRAFT', 'VOIDED', 'DELETED')
          AND line.invoice_date BETWEEN $2::date AND $3::date
        GROUP BY ac.id, ac.name`,
      [tenantId, start, end],
    ),
    queryRows<{ client_id: string, passthrough_cents: string }>(
      `SELECT spend.client_id,
              COALESCE(ROUND(SUM(
                CASE
                  WHEN daily.row_count > 0 THEN daily.total_spend
                  ELSE COALESCE(spend.actual_spend, 0)
                END
              ) * 100), 0)::bigint::text AS passthrough_cents
         FROM media_spend spend
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(day.spend), 0) AS total_spend,
                  COUNT(*) AS row_count
             FROM daily_spend day
            WHERE day.media_spend_id = spend.id
              AND day.spend_date BETWEEN $2::date AND $3::date
         ) daily ON TRUE
        WHERE spend.period = ANY($1::text[])
        GROUP BY spend.client_id`,
      [mediaPeriods, start, end],
    ),
    queryRows<{ client_id: string, labor_cents: string, hours: string }>(
      `SELECT p.client_id,
              COALESCE(ROUND(SUM(te.hours * te.hourly_rate) * 100), 0)::bigint::text AS labor_cents,
              COALESCE(SUM(te.hours), 0)::text AS hours
         FROM time_entries te
         JOIN projects p ON te.project_id = p.id
        WHERE te.date BETWEEN $1::date AND $2::date
        GROUP BY p.client_id`,
      [start, end],
    ),
    queryRows<ExpenseSourceRow>(
      `SELECT project.client_id,
              expense.id AS expense_id,
              ROUND(expense.amount * 100)::bigint::text AS amount_cents,
              expense.xero_invoice_id
         FROM project_expenses expense
         JOIN projects project
           ON project.id = expense.project_id
        WHERE expense.date BETWEEN $1::date AND $2::date`,
      [start, end],
    ),
    queryRows<SupplierSourceRow>(
      `SELECT mapping.client_id,
              line.line_item_id,
              line.invoice_id,
              line.invoice_type,
              line.invoice_date,
              line.account_code,
              line.description,
              line.line_ex_gst_cents::bigint::text AS amount_cents,
              allocation.source_fingerprint
         FROM agency_client_xero_tracking_mappings mapping
         JOIN agency_clients client
           ON client.id = mapping.client_id
         JOIN xero_invoice_lines_cache line
           ON line.tenant_id = mapping.tenant_id
          AND UPPER(line.invoice_type) = 'ACCPAY'
          AND UPPER(line.invoice_status) NOT IN ('DRAFT', 'VOIDED', 'DELETED')
          AND LOWER(line.tracking_client) = LOWER(mapping.tracking_option_name)
         JOIN xero_accounts_cache account
           ON account.tenant_id = line.tenant_id
          AND account.code = line.account_code
          AND UPPER(account.type) = 'DIRECTCOSTS'
         JOIN xero_project_allocations allocation
           ON allocation.tenant_id = line.tenant_id
          AND allocation.line_item_id = line.line_item_id
          AND allocation.client_id = mapping.client_id
          AND allocation.invoice_id = line.invoice_id
          AND UPPER(allocation.source_invoice_type) = UPPER(line.invoice_type)
          AND allocation.source_invoice_date = line.invoice_date
          AND allocation.source_account_code IS NOT DISTINCT FROM line.account_code
          AND allocation.source_description IS NOT DISTINCT FROM line.description
          AND allocation.source_ex_gst_cents = line.line_ex_gst_cents
         JOIN projects project
           ON project.id = allocation.project_id
          AND project.client_id = mapping.client_id
        WHERE mapping.tenant_id = $1
          AND line.invoice_date BETWEEN $2::date AND $3::date`,
      [tenantId, start, end],
    ),
  ])
  const ptMap = new Map(passthrough.map(r => [r.client_id, cents(r.passthrough_cents, `Client ${r.client_id} pass-through`)]))
  const laborMap = new Map(labor.map(r => [r.client_id, {
    cents: cents(r.labor_cents, `Client ${r.client_id} labour`),
    hours: num(r.hours),
  }]))
  const representedSupplierInvoices = new Map<string, Set<string>>()
  const supplierMap = new Map<string, number>()
  const currentSupplierCosts = (await Promise.all(supplierCosts.map(async (row) => {
    const amountCents = cents(row.amount_cents, `Client ${row.client_id} Xero supplier cost`)
    const currentFingerprint = await supplierFingerprint(tenantId, row, amountCents)
    return { row, amountCents, isCurrent: currentFingerprint === row.source_fingerprint }
  }))).filter(source => source.isCurrent)
  for (const { row, amountCents } of currentSupplierCosts) {
    supplierMap.set(
      row.client_id,
      addCents(
        supplierMap.get(row.client_id) ?? 0,
        amountCents,
        `Client ${row.client_id} Xero supplier cost`,
      ),
    )
    const invoiceId = normalizedInvoiceId(row.invoice_id)
    if (!invoiceId) continue
    const represented = representedSupplierInvoices.get(row.client_id) ?? new Set<string>()
    represented.add(invoiceId)
    representedSupplierInvoices.set(row.client_id, represented)
  }
  const expenseMap = new Map<string, number>()
  for (const row of projectExpenses) {
    const invoiceId = normalizedInvoiceId(row.xero_invoice_id)
    if (invoiceId && representedSupplierInvoices.get(row.client_id)?.has(invoiceId)) continue
    expenseMap.set(
      row.client_id,
      addCents(
        expenseMap.get(row.client_id) ?? 0,
        cents(row.amount_cents, `Project expense ${row.expense_id}`),
        `Client ${row.client_id} project expenses`,
      ),
    )
  }

  return revenue.map((row) => {
    const revenueCents = cents(row.revenue_cents, `Client ${row.client_id} revenue`)
    const passthroughCents = ptMap.get(row.client_id) ?? 0
    const laborCents = laborMap.get(row.client_id)?.cents ?? 0
    const projectExpenseCents = expenseMap.get(row.client_id) ?? 0
    const xeroSupplierCostCents = supplierMap.get(row.client_id) ?? 0
    const agiCents = subtractCents(revenueCents, passthroughCents, `Client ${row.client_id} AGI`)
    const deliveryCostCents = addCents(
      addCents(laborCents, projectExpenseCents, `Client ${row.client_id} delivery cost`),
      xeroSupplierCostCents,
      `Client ${row.client_id} delivery cost`,
    )
    const deliveryProfitCents = subtractCents(agiCents, deliveryCostCents, `Client ${row.client_id} delivery profit`)
    return {
      clientId: row.client_id,
      name: row.name,
      revenueCents,
      passthroughCents,
      agiCents,
      laborCents,
      projectExpenseCents,
      xeroSupplierCostCents,
      deliveryCostCents,
      deliveryMarginPct: agiCents > 0
        ? Math.round((deliveryProfitCents / agiCents) * 10_000) / 100
        : null,
      hours: laborMap.get(row.client_id)?.hours ?? 0,
    }
  })
}

/** Compatibility alias for existing AI tools and module mocks during rollout. */
export const fetchClientEconomics = fetchPortfolioClientEconomics

export interface RetainerRow { clientId: string, name: string, capDollars: number, billingType: string }

/** Clients on a retainer/hybrid plan with a positive cap. The cap is the v1 scope baseline. */
export async function fetchRetainerCaps(): Promise<RetainerRow[]> {
  const rows = await queryRows<{ client_id: string, name: string, cap: string, billing_type: string }>(
    `SELECT id AS client_id, name, COALESCE(retainer_amount, 0)::text AS cap, billing_type
       FROM agency_clients
      WHERE billing_type IN ('retainer','hybrid') AND COALESCE(retainer_amount, 0) > 0`,
  )
  return rows.map(r => ({ clientId: r.client_id, name: r.name, capDollars: num(r.cap), billingType: r.billing_type }))
}

export interface ProjectLaborRow { project: string, deliveredValue: number }

/** Labor $ by project for one client over the period — powers the over-servicing deep-dive. */
export async function fetchClientProjectLabor(clientId: string, period: EconomicsPeriod): Promise<ProjectLaborRow[]> {
  const { start, end } = periodBounds(period)
  const rows = await queryRows<{ project_name: string, labor_dollars: string }>(
    `SELECT p.name AS project_name,
            COALESCE(SUM(te.hours * te.hourly_rate), 0)::text AS labor_dollars
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
      WHERE p.client_id = $1 AND te.date BETWEEN $2::date AND $3::date
      GROUP BY p.name
      ORDER BY 2 DESC`,
    [clientId, start, end],
  )
  return rows.map(r => ({ project: r.project_name, deliveredValue: Math.round(num(r.labor_dollars) * 100) / 100 }))
}
