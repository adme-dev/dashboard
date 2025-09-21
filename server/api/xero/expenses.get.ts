import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

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

async function fetchAllInvoices(client: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string, whereExpr: string) {
  const results: any[] = []
  let page = 1
  for (;;) {
    const { body } = await client.accountingApi.getInvoices(
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
    const { body } = await client.accountingApi.getBankTransactions(
      tenantId,
      undefined,
      whereExpr,
      'Date DESC',
      page,
      undefined,
      100
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

  const client = await createXeroClient({ tokenSet: token })

  let all: any[] = []
  let lastError: any = null
  try {
    const whereAuth = `Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    const wherePaid = `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    const [authList, paidList] = await Promise.all([
      fetchAllInvoices(client, tenantId, whereAuth),
      fetchAllInvoices(client, tenantId, wherePaid)
    ])
    all = ([] as any[]).concat(authList, paidList)
  } catch (err) {
    lastError = err
  }

  if (!all.length) {
    const whereAny = `Type=="ACCPAY"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`
    try {
      all = await fetchAllInvoices(client, tenantId, whereAny)
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

  const byCategory = new Map<string, number>()
  const byVendor = new Map<string, number>()

  for (const inv of all) {
    const vendor = inv?.contact?.name || 'Unknown'
    const total = toAmount(inv?.total)
    byVendor.set(vendor, (byVendor.get(vendor) || 0) + total)
    const lines = inv?.lineItems || []
    if (lines.length) {
      for (const li of lines) {
        const cat = li?.accountCode || li?.accountID || 'Uncategorized'
        const amount = toAmount(li?.lineAmount)
        byCategory.set(cat, (byCategory.get(cat) || 0) + amount)
      }
    } else {
      byCategory.set('Uncategorized', (byCategory.get('Uncategorized') || 0) + total)
    }
  }

  // Fold in bank spend if invoices empty
  if (!byVendor.size && bankTx.length) {
    for (const tx of bankTx) {
      const vendor = tx?.contact?.name || 'Unknown'
      const total = toAmount(tx?.total)
      byVendor.set(vendor, (byVendor.get(vendor) || 0) + total)
      const lines = tx?.lineItems || []
      if (lines.length) {
        for (const li of lines) {
          const cat = li?.accountCode || li?.accountID || 'Uncategorized'
          const amount = toAmount(li?.lineAmount)
          byCategory.set(cat, (byCategory.get(cat) || 0) + amount)
        }
      } else {
        byCategory.set('Uncategorized', (byCategory.get('Uncategorized') || 0) + total)
      }
    }
  }

  if (!all.length && !bankTx.length && lastError) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to fetch expenses from Xero'
    })
  }

  const categories = Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount }))
  const vendors = Array.from(byVendor.entries()).map(([name, amount]) => ({ name, amount }))

  categories.sort((a, b) => b.amount - a.amount)
  vendors.sort((a, b) => b.amount - a.amount)

  const toStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
  const fromStr = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`

  return { range: { from: fromStr, to: toStr }, categories, vendors }
})
