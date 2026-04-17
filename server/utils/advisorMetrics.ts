/**
 * Metric registry used by the Financial Advisor for impact attribution.
 *
 * When the LLM emits a recommendation it can declare a `target_metric`
 * (one of the keys below) and a `target_direction`. We persist the
 * baseline at generation time, and the nightly attribution cron
 * re-measures the metric 30/60/90 days after `acted_at` to quantify
 * impact.
 *
 * Each entry points at an internal endpoint and a JSON path — kept
 * small on purpose so it's obvious how to add another metric.
 */

import type { H3Event } from 'h3'

type Direction = 'up' | 'down'

type MetricEntry = {
  label: string
  endpoint: string
  query?: (toDate: string) => Record<string, string>
  path: string[]
  preferredDirection: Direction
  unit?: 'percent' | 'days' | 'currency' | 'ratio' | 'count'
}

export const METRIC_REGISTRY: Record<string, MetricEntry> = {
  netMarginMonth: {
    label: 'Net margin (month)',
    endpoint: '/api/xero/reports/pnl-detailed',
    query: (toDate) => ({ toDate }),
    path: ['summary', 'netMargin', 'month'],
    preferredDirection: 'up',
    unit: 'percent',
  },
  netProfitMonth: {
    label: 'Net profit (month)',
    endpoint: '/api/xero/reports/pnl-detailed',
    query: (toDate) => ({ toDate }),
    path: ['summary', 'netProfit', 'month'],
    preferredDirection: 'up',
    unit: 'currency',
  },
  netProfitYtd: {
    label: 'Net profit (YTD)',
    endpoint: '/api/xero/reports/pnl-detailed',
    query: (toDate) => ({ toDate }),
    path: ['summary', 'netProfit', 'ytd'],
    preferredDirection: 'up',
    unit: 'currency',
  },
  revenueMonth: {
    label: 'Revenue (month)',
    endpoint: '/api/xero/reports/pnl-detailed',
    query: (toDate) => ({ toDate }),
    path: ['summary', 'revenue', 'month'],
    preferredDirection: 'up',
    unit: 'currency',
  },
  debtorDays: {
    label: 'Debtor days',
    endpoint: '/api/xero/reports/executive-summary',
    query: (toDate) => ({ date: toDate }),
    path: ['metrics', 'debtorDays', 'latest'],
    preferredDirection: 'down',
    unit: 'days',
  },
  creditorDays: {
    label: 'Creditor days',
    endpoint: '/api/xero/reports/executive-summary',
    query: (toDate) => ({ date: toDate }),
    path: ['metrics', 'creditorDays', 'latest'],
    preferredDirection: 'up',
    unit: 'days',
  },
  grossProfitPercent: {
    label: 'Gross profit %',
    endpoint: '/api/xero/reports/executive-summary',
    query: (toDate) => ({ date: toDate }),
    path: ['metrics', 'grossProfitPercent', 'latest'],
    preferredDirection: 'up',
    unit: 'percent',
  },
  netProfitPercent: {
    label: 'Net profit %',
    endpoint: '/api/xero/reports/executive-summary',
    query: (toDate) => ({ date: toDate }),
    path: ['metrics', 'netProfitPercent', 'latest'],
    preferredDirection: 'up',
    unit: 'percent',
  },
  currentRatio: {
    label: 'Current ratio',
    endpoint: '/api/xero/reports/executive-summary',
    query: (toDate) => ({ date: toDate }),
    path: ['metrics', 'currentRatio', 'latest'],
    preferredDirection: 'up',
    unit: 'ratio',
  },
  top1Share: {
    label: 'Top-1 client share',
    endpoint: '/api/xero/client-concentration',
    path: ['summary', 'top1Share'],
    preferredDirection: 'down',
    unit: 'percent',
  },
  top3Share: {
    label: 'Top-3 client share',
    endpoint: '/api/xero/client-concentration',
    path: ['summary', 'top3Share'],
    preferredDirection: 'down',
    unit: 'percent',
  },
  mrr: {
    label: 'MRR',
    endpoint: '/api/xero/repeating-invoices',
    path: ['summary', 'mrr'],
    preferredDirection: 'up',
    unit: 'currency',
  },
  outstandingTotal: {
    label: 'Outstanding A/R',
    endpoint: '/api/xero/reports/aging',
    path: ['totalOutstanding'],
    preferredDirection: 'down',
    unit: 'currency',
  },
  overdueAmount: {
    label: 'Overdue A/R',
    endpoint: '/api/xero/reports/aging',
    path: ['criticalAmount'],
    preferredDirection: 'down',
    unit: 'currency',
  },
  totalUnearned: {
    label: 'Unearned revenue',
    endpoint: '/api/xero/prepayments-overpayments',
    path: ['summary', 'totalUnearned'],
    preferredDirection: 'up',
    unit: 'currency',
  },
}

export function getMetricEntry(name: string | null | undefined): MetricEntry | null {
  if (!name) return null
  return METRIC_REGISTRY[name] ?? null
}

export function metricNames(): string[] {
  return Object.keys(METRIC_REGISTRY)
}

/** Walk a JSON path, returning a finite number or null. */
function readPath(obj: any, path: string[]): number | null {
  let cur = obj
  for (const k of path) {
    if (cur == null) return null
    cur = cur[k]
  }
  if (typeof cur !== 'number' || !Number.isFinite(cur)) return null
  return cur
}

/**
 * Fetch the current numeric value for a registered metric.
 *
 * Called from two contexts:
 *  - User-session (passes the request's cookie)
 *  - Attribution cron (passes X-Internal-Cron-Secret to bypass auth)
 */
export async function fetchMetricValue(
  event: H3Event,
  metricName: string,
  toDate: string,
  extraHeaders?: Record<string, string>
): Promise<number | null> {
  const entry = METRIC_REGISTRY[metricName]
  if (!entry) return null

  try {
    const cookie = (event.node.req.headers.cookie as string) ?? ''
    const query = entry.query ? entry.query(toDate) : undefined
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) }
    if (cookie && !headers.cookie) headers.cookie = cookie
    const res = await $fetch(entry.endpoint, {
      headers: Object.keys(headers).length ? headers : undefined,
      query,
      baseURL: process.env.APP_BASE_URL || undefined,
    })
    return readPath(res, entry.path)
  } catch (err: any) {
    console.warn(`[advisorMetrics] failed to fetch ${metricName}:`, err?.message ?? err)
    return null
  }
}

/**
 * Decide whether a measured delta counts as "improvement" vs the
 * recommendation's target direction. Used by the UI to color outcomes.
 */
export function isImprovement(delta: number | null, direction: Direction | null | undefined): boolean | null {
  if (delta == null) return null
  const dir = direction ?? null
  if (!dir) return null
  if (dir === 'up') return delta > 0
  if (dir === 'down') return delta < 0
  return null
}
