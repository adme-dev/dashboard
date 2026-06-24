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
  laborCents: number
  hours: number
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Per-client revenue − pass-through + labor for the period. Returns [] if no Xero tenant is selected. */
export async function fetchClientEconomics(event: H3Event, period: EconomicsPeriod): Promise<ClientEconomicsRow[]> {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) return []
  const { start, end, mediaPeriods } = periodBounds(period)

  const [revenue, passthrough, labor] = await Promise.all([
    queryRows<{ client_id: string, name: string, revenue_cents: string }>(
      `SELECT ac.id AS client_id, ac.name AS name,
              COALESCE(SUM(ic.total_cents), 0)::text AS revenue_cents
         FROM agency_clients ac
         LEFT JOIN xero_invoices_cache ic
           ON ic.contact_id = ac.xero_contact_id
          AND ic.tenant_id = $1
          AND ic.type = 'ACCREC'
          AND ic.status NOT IN ('VOIDED','DRAFT','DELETED')
          AND ic.date BETWEEN $2::date AND $3::date
        GROUP BY ac.id, ac.name`,
      [tenantId, start, end],
    ),
    queryRows<{ client_id: string, passthrough_cents: string }>(
      `SELECT client_id, COALESCE(SUM(actual_spend) * 100, 0)::bigint::text AS passthrough_cents
         FROM media_spend
        WHERE period = ANY($1::text[])
        GROUP BY client_id`,
      [mediaPeriods],
    ),
    queryRows<{ client_id: string, labor_cents: string, hours: string }>(
      `SELECT p.client_id,
              COALESCE(SUM(te.hours * te.hourly_rate) * 100, 0)::bigint::text AS labor_cents,
              COALESCE(SUM(te.hours), 0)::text AS hours
         FROM time_entries te
         JOIN projects p ON te.project_id = p.id
        WHERE te.date BETWEEN $1::date AND $2::date
        GROUP BY p.client_id`,
      [start, end],
    ),
  ])
  const ptMap = new Map(passthrough.map(r => [r.client_id, num(r.passthrough_cents)]))
  const laborMap = new Map(labor.map(r => [r.client_id, { cents: num(r.labor_cents), hours: num(r.hours) }]))

  return revenue.map(r => ({
    clientId: r.client_id,
    name: r.name,
    revenueCents: num(r.revenue_cents),
    passthroughCents: ptMap.get(r.client_id) ?? 0,
    laborCents: laborMap.get(r.client_id)?.cents ?? 0,
    hours: laborMap.get(r.client_id)?.hours ?? 0,
  }))
}

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
