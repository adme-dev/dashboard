import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

// Vendor name normalization — trim, remove payment method suffixes, title-case
function normalizeVendor(name: string): string {
  let v = (name || 'Unknown').trim()
  // Remove common suffixes: " - amex", " - visa", " - eft", etc.
  v = v.replace(/\s*-\s*(amex|visa|eft|bank|direct debit|dd|mastercard|mc|bpay)$/i, '')
  return v.trim()
}

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

function dateStr(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

interface AccountInfo {
  name: string
  code: string
  classType: string // EXPENSE, OVERHEADS, DIRECTCOSTS, REVENUE, etc.
}

async function fetchAllInvoices(client: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string, whereExpr: string, dedupPrefix: string) {
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
          100
        )
        return body
      }
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

async function fetchAllBankTransactions(client: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string, whereExpr: string) {
  const results: any[] = []
  let page = 1
  for (;;) {
    const body = await dedupedXeroCall(
      `expenses-banktx:${tenantId}:p${page}`,
      'expenses-banktx',
      async () => {
        const { body } = await client.accountingApi.getBankTransactions(
          tenantId,
          undefined,
          whereExpr,
          'Date DESC',
          page,
          undefined,
          100
        )
        return body
      }
    )
    const list = body?.bankTransactions || []
    if (!list.length) break
    results.push(...list)
    if (list.length < 100) break
    page += 1
    if (page > 50) break
  }
  return results
}

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

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const q = getQuery(event)
  const toInput = typeof q.to === 'string' ? q.to
    : typeof q.toDate === 'string' ? q.toDate
      : typeof q['range[to]'] === 'string' ? q['range[to]']
        : undefined
  const fromInput = typeof q.from === 'string' ? q.from
    : typeof q.fromDate === 'string' ? q.fromDate
      : typeof q['range[from]'] === 'string' ? q['range[from]']
        : undefined

  const toCandidate = toInput ? new Date(toInput) : null
  const fromCandidate = fromInput ? new Date(fromInput) : null

  const hasValidTo = !!(toCandidate && !Number.isNaN(toCandidate.valueOf()))
  const hasValidFrom = !!(fromCandidate && !Number.isNaN(fromCandidate.valueOf()))

  const today = hasValidTo ? toCandidate! : new Date()
  const from = hasValidFrom ? fromCandidate! : new Date(today)

  if (!hasValidFrom) {
    const days = Number(q.days || 90)
    from.setDate(today.getDate() - (Number.isFinite(days) ? days : 90))
  }

  if (from > today) {
    const temp = new Date(from)
    from.setTime(today.getTime())
    today.setTime(temp.getTime())
  }

  const cacheKey = `xero:expenses:v2:${tenantId}:${from.getTime()}:${today.getTime()}`

  return cachedFetch(event, cacheKey, 300, async () => {
  const client = await createXeroClient({ tokenSet: token, event })

  // Fetch chart of accounts — extended to include class type
  const accountsMap = new Map<string, string>()
  const accountsInfo = new Map<string, AccountInfo>()
  try {
    const acctBody = await dedupedXeroCall(
      `expenses-accounts:${tenantId}`,
      'expenses-accounts',
      async () => {
        const { body } = await client.accountingApi.getAccounts(tenantId)
        return body
      }
    )
    const accounts = acctBody?.accounts || []
    for (const account of accounts) {
      if (account.accountID && account.name) {
        const info: AccountInfo = {
          name: account.name,
          code: account.code || '',
          classType: account.class || account.type || '',
        }
        accountsMap.set(account.accountID, account.name)
        accountsInfo.set(account.accountID, info)
        if (account.code) {
          accountsMap.set(account.code, account.name)
          accountsInfo.set(account.code, info)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch chart of accounts:', err)
  }

  // Fetch current period invoices
  let all: any[] = []
  let lastError: any = null
  try {
    const whereAuth = `Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    const wherePaid = `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    const authList = await fetchAllInvoices(client, tenantId, whereAuth, 'expenses-inv-auth')
    const paidList = await fetchAllInvoices(client, tenantId, wherePaid, 'expenses-inv-paid')
    all = ([] as any[]).concat(authList, paidList)
  } catch (err) {
    lastError = err
  }

  if (!all.length) {
    const whereAny = `Type=="ACCPAY"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    try {
      all = await fetchAllInvoices(client, tenantId, whereAny, 'expenses-inv-any')
    } catch (err) {
      lastError = err
    }
  }

  // BankTransactions fallback (SPEND)
  let bankTx: any[] = []
  if (!all.length) {
    const whereSpend = `Type=="SPEND"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    try {
      bankTx = await fetchAllBankTransactions(client, tenantId, whereSpend)
    } catch (err) {
      lastError = err
    }
  }

  // --- Fetch previous period invoices for MoM comparison ---
  const daySpan = Math.max(Math.ceil((today.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)), 1)
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - daySpan)

  let prevAll: any[] = []
  try {
    const wherePrevAuth = `Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=${dtExpr(prevFrom)}&&Date<=${dtExpr(prevTo)}`
    const wherePrevPaid = `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(prevFrom)}&&Date<=${dtExpr(prevTo)}`
    const prevAuth = await fetchAllInvoices(client, tenantId, wherePrevAuth, 'expenses-prev-auth')
    const prevPaid = await fetchAllInvoices(client, tenantId, wherePrevPaid, 'expenses-prev-paid')
    prevAll = ([] as any[]).concat(prevAuth, prevPaid)
  } catch {
    // Previous period is best-effort
  }

  // --- Process data ---
  const byCategory = new Map<string, number>()
  const byVendor = new Map<string, number>()
  const dailyMap = new Map<string, number>()
  const taxByType = new Map<string, { amount: number, tax: number }>()
  let totalGross = 0
  let totalTax = 0
  const fixedCategories = new Map<string, number>()
  const variableCategories = new Map<string, number>()
  const vendorFrequency = new Map<string, number>() // for subscription detection
  const subscriptionVendors = new Map<string, { amount: number, department?: string }>()
  const transactions: any[] = []
  const transactionDedup = new Set<string>()

  const items = all.length ? all : bankTx

  for (const inv of items) {
    const vendor = inv?.contact?.name || 'Unknown'
    const total = toAmount(inv?.total)
    const invDate = inv?.date ? new Date(inv.date) : null
    const invDateStr = invDate ? dateStr(invDate) : null
    const invoiceNumber = inv?.invoiceNumber || inv?.bankTransactionID || ''
    const status = inv?.status || ''

    byVendor.set(vendor, (byVendor.get(vendor) || 0) + total)
    vendorFrequency.set(vendor, (vendorFrequency.get(vendor) || 0) + 1)

    if (invDateStr) {
      dailyMap.set(invDateStr, (dailyMap.get(invDateStr) || 0) + total)
    }

    // Detect subscriptions via repeatingInvoiceID
    if (inv?.repeatingInvoiceID) {
      const existing = subscriptionVendors.get(vendor)
      if (!existing || total > existing.amount) {
        const firstLineAccount = inv?.lineItems?.[0]?.accountCode || inv?.lineItems?.[0]?.accountID
        const acctInfo = firstLineAccount ? accountsInfo.get(firstLineAccount) : null
        const dept = acctInfo ? DEPARTMENT_ACCOUNT_MAPPING[acctInfo.name] : undefined
        subscriptionVendors.set(vendor, { amount: total, department: dept })
      }
    }

    const lines = inv?.lineItems || []
    if (lines.length) {
      for (const li of lines) {
        const accountKey = li?.accountCode || li?.accountID
        const acctInfo = accountKey ? accountsInfo.get(accountKey) : null
        const categoryName = acctInfo?.name || (accountKey && accountsMap.has(accountKey)
          ? accountsMap.get(accountKey)!
          : (accountKey || 'Uncategorized'))
        const amount = toAmount(li?.lineAmount)
        byCategory.set(categoryName, (byCategory.get(categoryName) || 0) + amount)

        // Tax
        const taxType = li?.taxType || 'NONE'
        const taxAmount = toAmount(li?.taxAmount)
        const entry = taxByType.get(taxType) || { amount: 0, tax: 0 }
        entry.amount += amount
        entry.tax += taxAmount
        taxByType.set(taxType, entry)
        totalGross += amount + taxAmount
        totalTax += taxAmount

        // Fixed vs Variable classification
        const classType = acctInfo?.classType?.toUpperCase() || ''
        if (classType === 'EXPENSE' || classType === 'OVERHEADS' || classType === 'FIXED') {
          fixedCategories.set(categoryName, (fixedCategories.get(categoryName) || 0) + amount)
        } else {
          variableCategories.set(categoryName, (variableCategories.get(categoryName) || 0) + amount)
        }
      }
    } else {
      byCategory.set('Uncategorized', (byCategory.get('Uncategorized') || 0) + total)
      variableCategories.set('Uncategorized', (variableCategories.get('Uncategorized') || 0) + total)
      totalGross += total
    }

    // Build transaction record — skip zero-amount, normalize vendor, clean description
    if (total > 0) {
      const firstLine = lines[0]
      const txAccountKey = firstLine?.accountCode || firstLine?.accountID
      const txCategory = txAccountKey && accountsMap.has(txAccountKey)
        ? accountsMap.get(txAccountKey)!
        : (txAccountKey || 'Uncategorized')
      const cleanVendor = normalizeVendor(vendor)
      let desc = (firstLine?.description || '').trim()
      // Strip internal reference codes (e.g. "REF:12345" or "#INV-123")
      desc = desc.replace(/\b(REF|ref|Ref):\s*\S+/g, '').trim()
      if (desc.length > 200) desc = desc.slice(0, 200)

      // Deduplicate: same vendor + same date + same amount (Xero returns AUTHORISED + PAID for same bill)
      const dedupKey = `${invoiceNumber || cleanVendor}|${invDateStr}|${total.toFixed(2)}`
      if (!transactionDedup.has(dedupKey)) {
        transactionDedup.add(dedupKey)
        transactions.push({
          date: invDateStr || '',
          vendor: cleanVendor,
          category: txCategory,
          amount: total,
          invoiceNumber,
          status,
          taxType: firstLine?.taxType || 'NONE',
          taxAmount: toAmount(firstLine?.taxAmount),
          description: desc,
        })
      }
    }
  }

  if (!all.length && !bankTx.length && lastError) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to fetch expenses from Xero'
    })
  }

  // --- Build results ---
  const categories = Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount }))
  const vendors = Array.from(byVendor.entries()).map(([name, amount]) => ({ name, amount }))
  categories.sort((a, b) => b.amount - a.amount)
  vendors.sort((a, b) => b.amount - a.amount)

  // Transactions — top 50 most recent
  transactions.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const topTransactions = transactions.slice(0, 50)

  // Tax summary
  const taxSummary = {
    totalGross: Math.round(totalGross * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalNet: Math.round((totalGross - totalTax) * 100) / 100,
    byTaxType: Array.from(taxByType.entries())
      .map(([taxType, v]) => ({
        taxType,
        amount: Math.round(v.amount * 100) / 100,
        tax: Math.round(v.tax * 100) / 100,
      }))
      .sort((a, b) => b.tax - a.tax),
  }

  // Month over Month
  const currentTotal = categories.reduce((sum, c) => sum + c.amount, 0)
  const prevTotal = prevAll.reduce((sum, inv) => sum + toAmount(inv?.total), 0)
  const changeAmount = currentTotal - prevTotal
  const changePercent = prevTotal > 0 ? ((changeAmount / prevTotal) * 100) : 0
  const monthOverMonth = {
    current: { total: Math.round(currentTotal * 100) / 100, from: dateStr(from), to: dateStr(today) },
    previous: { total: Math.round(prevTotal * 100) / 100, from: dateStr(prevFrom), to: dateStr(prevTo) },
    change: Math.round(changePercent * 10) / 10,
    changeAmount: Math.round(changeAmount * 100) / 100,
  }

  // Daily totals
  const dailyTotals = Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Fixed vs Variable
  const fixedTotal = Array.from(fixedCategories.values()).reduce((s, v) => s + v, 0)
  const variableTotal = Array.from(variableCategories.values()).reduce((s, v) => s + v, 0)
  const fixedVsVariable = {
    fixed: {
      total: Math.round(fixedTotal * 100) / 100,
      categories: Array.from(fixedCategories.entries())
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
    },
    variable: {
      total: Math.round(variableTotal * 100) / 100,
      categories: Array.from(variableCategories.entries())
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
    },
  }

  // Subscriptions — combine repeatingInvoiceID-detected + high-frequency vendors
  const subscriptionItems: { vendor: string, amount: number, frequency: string, department?: string }[] = []
  for (const [vendor, info] of subscriptionVendors) {
    subscriptionItems.push({
      vendor,
      amount: Math.round(info.amount * 100) / 100,
      frequency: 'monthly',
      department: info.department,
    })
  }
  // Also detect non-repeating but monthly-consistent vendors (appear 2+ times)
  for (const [vendor, count] of vendorFrequency) {
    if (count >= 2 && !subscriptionVendors.has(vendor)) {
      const vendorTotal = byVendor.get(vendor) || 0
      const avgAmount = vendorTotal / count
      const firstLineAccount = items.find((i: any) => i?.contact?.name === vendor)?.lineItems?.[0]?.accountCode
      const acctInfo = firstLineAccount ? accountsInfo.get(firstLineAccount) : null
      const dept = acctInfo ? DEPARTMENT_ACCOUNT_MAPPING[acctInfo.name] : undefined
      subscriptionItems.push({
        vendor,
        amount: Math.round(avgAmount * 100) / 100,
        frequency: count >= 4 ? 'weekly' : 'monthly',
        department: dept,
      })
    }
  }
  subscriptionItems.sort((a, b) => b.amount - a.amount)
  const subscriptions = {
    total: Math.round(subscriptionItems.reduce((s, i) => s + i.amount, 0) * 100) / 100,
    items: subscriptionItems,
  }

  const toStr = dateStr(today)
  const fromStr = dateStr(from)

  return {
    range: { from: fromStr, to: toStr },
    categories,
    vendors,
    transactions: topTransactions,
    taxSummary,
    monthOverMonth,
    dailyTotals,
    fixedVsVariable,
    subscriptions,
  }
  }) // end cachedFetch
})
