import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function toParts(d: Date) { return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() } }
function dtExpr(d: Date) {
  const { y, m, day } = toParts(d)
  const mm = String(m).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `DateTime(${y},${mm},${dd})`
}

function toAmount(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Account name -> department mapping */
const DEPARTMENT_ACCOUNT_MAPPING: Record<string, string> = {
  'Software & Subscriptions': 'Technology',
  'Computer Equipment': 'Technology',
  'Rent': 'Shared',
  'Electricity': 'Shared',
  'Insurance': 'Shared',
  'Telephone & Internet': 'Technology',
  'Advertising': 'Marketing',
  'Travel': 'Operations',
  'Professional Fees': 'Finance',
  'Accounting & Legal': 'Finance',
  'Office Expenses': 'Operations',
  'Cleaning': 'Shared',
  'Staff Training': 'People',
  'Recruitment': 'People',
}

/** Account classes that count as fixed overhead */
const FIXED_CLASSES = new Set(['EXPENSE', 'OVERHEADS'])

/* ------------------------------------------------------------------ */
/*  Xero data fetching                                                */
/* ------------------------------------------------------------------ */

async function fetchAllInvoices(
  client: Awaited<ReturnType<typeof createXeroClient>>,
  tenantId: string,
  whereExpr: string,
  dedupPrefix: string,
) {
  const results: any[] = []
  let page = 1
  for (;;) {
    const body = await dedupedXeroCall(
      `${dedupPrefix}:${tenantId}:p${page}`,
      dedupPrefix,
      async () => {
        const { body } = await (client.accountingApi.getInvoices as any)(
          tenantId,
          undefined,
          whereExpr,
          'Date DESC',
          undefined,
          undefined,
          undefined,
          undefined,
          page,
          undefined,
          undefined,
          undefined,
          100,
        )
        return body
      },
    )
    const list = body?.invoices || []
    if (!list.length) break
    results.push(...list)
    if (list.length < 100) break
    page += 1
    if (page > 50) break
  }
  return results
}

interface AccountInfo {
  name: string
  code: string
  classType: string // e.g. EXPENSE, DIRECTCOSTS, OVERHEADS, REVENUE
}

async function fetchAccountsMap(
  client: Awaited<ReturnType<typeof createXeroClient>>,
  tenantId: string,
): Promise<Map<string, AccountInfo>> {
  const map = new Map<string, AccountInfo>()
  try {
    const acctBody = await dedupedXeroCall(
      `overheads-accounts:${tenantId}`,
      'overheads-accounts',
      async () => {
        const { body } = await client.accountingApi.getAccounts(tenantId)
        return body
      },
    )
    const accounts = acctBody?.accounts || []
    for (const account of accounts) {
      const info: AccountInfo = {
        name: account.name || 'Unknown',
        code: account.code || '',
        classType: account.class || account.type || '',
      }
      if (account.accountID) map.set(account.accountID, info)
      if (account.code) map.set(account.code, info)
    }
  } catch (err) {
    console.warn('[overheads] Failed to fetch chart of accounts:', err)
  }
  return map
}

/* ------------------------------------------------------------------ */
/*  Month range helpers                                               */
/* ------------------------------------------------------------------ */

function monthRange(year: number, month: number) {
  // month is 1-based
  const from = new Date(Date.UTC(year, month - 1, 1))
  // Last day of the month
  const to = new Date(Date.UTC(year, month, 0))
  return { from, to }
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/* ------------------------------------------------------------------ */
/*  Process invoices for a single month                               */
/* ------------------------------------------------------------------ */

interface MonthResult {
  fixed: number
  variable: number
  byCategory: { name: string; amount: number; accountCode: string; isSubscription: boolean }[]
  byDepartment: Map<string, { total: number; items: Map<string, number> }>
  subscriptions: { vendor: string; amount: number; frequency: string; department?: string }[]
}

function processInvoices(invoices: any[], accountsMap: Map<string, AccountInfo>): MonthResult {
  let fixed = 0
  let variable = 0

  const categoryMap = new Map<string, { amount: number; accountCode: string; isSubscription: boolean }>()
  const deptMap = new Map<string, { total: number; items: Map<string, number> }>()
  const subsMap = new Map<string, { vendor: string; amount: number; frequency: string; department?: string }>()

  for (const inv of invoices) {
    const vendor = inv?.contact?.name || 'Unknown'
    const isSubscription = !!inv?.repeatingInvoiceID

    const lines = inv?.lineItems || []
    if (!lines.length) {
      // No line items — treat entire invoice as uncategorized
      const total = toAmount(inv?.total)
      accumulateCategory(categoryMap, 'Uncategorized', '', total, isSubscription)
      accumulateDepartment(deptMap, 'Uncategorized', 'Other', total)
      fixed += total // default to fixed when unknown
      if (isSubscription) {
        accumulateSubscription(subsMap, vendor, total, 'Uncategorized')
      }
      continue
    }

    for (const li of lines) {
      const accountKey = li?.accountCode || li?.accountID || ''
      const accountInfo = accountKey ? accountsMap.get(accountKey) : undefined
      const categoryName = accountInfo?.name || accountKey || 'Uncategorized'
      const accountCode = accountInfo?.code || (typeof accountKey === 'string' ? accountKey : '')
      const classType = (accountInfo?.classType || '').toUpperCase()
      const amount = toAmount(li?.lineAmount)

      const isFixed = FIXED_CLASSES.has(classType) || !classType
      if (isFixed) {
        fixed += amount
      } else {
        variable += amount
      }

      accumulateCategory(categoryMap, categoryName, accountCode, amount, isSubscription)

      const dept = DEPARTMENT_ACCOUNT_MAPPING[categoryName] || 'Other'
      accumulateDepartment(deptMap, categoryName, dept, amount)

      if (isSubscription) {
        accumulateSubscription(subsMap, vendor, amount, categoryName)
      }
    }
  }

  // Build byCategory array
  const byCategory = Array.from(categoryMap.entries())
    .map(([name, data]) => ({
      name,
      amount: Math.round(data.amount * 100) / 100,
      accountCode: data.accountCode,
      isSubscription: data.isSubscription,
    }))
    .sort((a, b) => b.amount - a.amount)

  // Build subscriptions array
  const subscriptions = Array.from(subsMap.values())
    .sort((a, b) => b.amount - a.amount)

  return {
    fixed: Math.round(fixed * 100) / 100,
    variable: Math.round(variable * 100) / 100,
    byCategory,
    byDepartment: deptMap,
    subscriptions,
  }
}

function accumulateCategory(
  map: Map<string, { amount: number; accountCode: string; isSubscription: boolean }>,
  name: string,
  accountCode: string,
  amount: number,
  isSubscription: boolean,
) {
  const existing = map.get(name)
  if (existing) {
    existing.amount += amount
    if (isSubscription) existing.isSubscription = true
  } else {
    map.set(name, { amount, accountCode, isSubscription })
  }
}

function accumulateDepartment(
  map: Map<string, { total: number; items: Map<string, number> }>,
  categoryName: string,
  dept: string,
  amount: number,
) {
  const existing = map.get(dept)
  if (existing) {
    existing.total += amount
    existing.items.set(categoryName, (existing.items.get(categoryName) || 0) + amount)
  } else {
    const items = new Map<string, number>()
    items.set(categoryName, amount)
    map.set(dept, { total: amount, items })
  }
}

function accumulateSubscription(
  map: Map<string, { vendor: string; amount: number; frequency: string; department?: string }>,
  vendor: string,
  amount: number,
  categoryName: string,
) {
  const existing = map.get(vendor)
  if (existing) {
    existing.amount += amount
  } else {
    map.set(vendor, {
      vendor,
      amount,
      frequency: 'monthly', // Xero repeating invoices are typically monthly
      department: DEPARTMENT_ACCOUNT_MAPPING[categoryName] || undefined,
    })
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                           */
/* ------------------------------------------------------------------ */

export default eventHandler(async (event) => {
  await requireAuth(event)

  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const q = getQuery(event)
  const now = new Date()
  const month = Math.min(12, Math.max(1, Number(q.month) || (now.getUTCMonth() + 1)))
  const year = Number(q.year) || now.getUTCFullYear()

  const cacheKey = `xero:overheads:${tenantId}:${year}:${month}`

  return cachedFetch(event, cacheKey, 300, async () => {
    const client = await createXeroClient({ tokenSet: token, event })

    // Fetch chart of accounts for classification
    const accountsMap = await fetchAccountsMap(client, tenantId)

    // Build date ranges for trend (current month + 5 previous)
    const trendMonths: { year: number; month: number }[] = []
    let ty = year
    let tm = month
    for (let i = 0; i < 6; i++) {
      trendMonths.push({ year: ty, month: tm })
      const prev = prevMonth(ty, tm)
      ty = prev.year
      tm = prev.month
    }
    // Reverse so oldest is first
    trendMonths.reverse()

    // Fetch invoices for each month sequentially to respect rate limits
    const monthInvoices: Map<string, any[]> = new Map()
    for (const m of trendMonths) {
      const { from, to } = monthRange(m.year, m.month)
      const key = `${m.year}-${m.month}`
      const whereAuth = `Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(to)}`
      const wherePaid = `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(to)}`

      let invoices: any[] = []
      try {
        const authList = await fetchAllInvoices(client, tenantId, whereAuth, `overheads-auth-${key}`)
        const paidList = await fetchAllInvoices(client, tenantId, wherePaid, `overheads-paid-${key}`)
        invoices = ([] as any[]).concat(authList, paidList)
      } catch (err) {
        // If a specific month fails, try without status filter
        try {
          const whereAny = `Type=="ACCPAY"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(to)}`
          invoices = await fetchAllInvoices(client, tenantId, whereAny, `overheads-any-${key}`)
        } catch {
          // Skip this month in the trend if it fails entirely
          console.warn(`[overheads] Failed to fetch invoices for ${key}`)
        }
      }
      monthInvoices.set(key, invoices)
    }

    // Process current month
    const currentKey = `${year}-${month}`
    const currentInvoices = monthInvoices.get(currentKey) || []
    const current = processInvoices(currentInvoices, accountsMap)

    // Build byDepartment response
    const byDepartment = Array.from(current.byDepartment.entries())
      .map(([department, data]) => ({
        department,
        total: Math.round(data.total * 100) / 100,
        items: Array.from(data.items.entries())
          .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.total - a.total)

    // Build trend
    const trend = trendMonths.map((m) => {
      const key = `${m.year}-${m.month}`
      const invoices = monthInvoices.get(key) || []
      const result = processInvoices(invoices, accountsMap)
      return {
        month: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
        fixed: result.fixed,
        variable: result.variable,
      }
    })

    // Previous month comparison
    const prevM = prevMonth(year, month)
    const prevKey = `${prevM.year}-${prevM.month}`
    const prevInvoices = monthInvoices.get(prevKey) || []
    const prevResult = processInvoices(prevInvoices, accountsMap)
    const prevTotal = prevResult.fixed + prevResult.variable
    const currentTotal = current.fixed + current.variable
    const change = prevTotal > 0
      ? Math.round(((currentTotal - prevTotal) / prevTotal) * 10000) / 100
      : 0

    // Overhead ratio: fixed / (fixed + variable)
    const totalAll = current.fixed + current.variable
    const overheadRatio = totalAll > 0
      ? Math.round((current.fixed / totalAll) * 10000) / 100
      : 0

    return {
      period: `${MONTH_NAMES[month - 1]} ${year}`,
      totalFixed: current.fixed,
      totalVariable: current.variable,
      overheadRatio,
      byCategory: current.byCategory,
      byDepartment,
      subscriptions: current.subscriptions.map((s) => ({
        ...s,
        amount: Math.round(s.amount * 100) / 100,
      })),
      trend,
      previousMonth: {
        total: Math.round(prevTotal * 100) / 100,
        change,
      },
    }
  }) // end cachedFetch
})
