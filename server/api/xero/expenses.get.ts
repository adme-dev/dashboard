import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  if (!token?.access_token) throw createError({ statusCode: 401, statusMessage: 'Not connected' })
  const tenantId = getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 90)

  // Fetch ACCPAY (bills) approved and paid.
  const base = 'https://api.xero.com/api.xro/2.0/Invoices'
  const headers = { Authorization: `Bearer ${token.access_token}`, 'xero-tenant-id': tenantId } as const

  const [authorised, paid] = await Promise.all([
    $fetch<any>(`${base}?where=Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=DateTime(${toISO(from)})&order=Date%20DESC&page=1`, { headers }),
    $fetch<any>(`${base}?where=Type=="ACCPAY"&&Status=="PAID"&&Date>=DateTime(${toISO(from)})&order=Date%20DESC&page=1`, { headers })
  ])

  const all = ([] as any[]).concat(authorised?.Invoices || [], paid?.Invoices || [])

  const byCategory = new Map<string, number>()
  const byVendor = new Map<string, number>()

  for (const inv of all) {
    const vendor = inv?.Contact?.Name || 'Unknown'
    const total = inv?.Total ?? 0

    // Aggregate by vendor
    byVendor.set(vendor, (byVendor.get(vendor) || 0) + total)

    // Aggregate by account/category from line items if available
    const lines = inv?.LineItems || []
    if (lines.length) {
      for (const li of lines) {
        const cat = li?.AccountCode || li?.AccountID || 'Uncategorized'
        const amount = li?.LineAmount ?? 0
        byCategory.set(cat, (byCategory.get(cat) || 0) + amount)
      }
    } else {
      byCategory.set('Uncategorized', (byCategory.get('Uncategorized') || 0) + total)
    }
  }

  const categories = Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount }))
  const vendors = Array.from(byVendor.entries()).map(([name, amount]) => ({ name, amount }))

  // Sort descending
  categories.sort((a, b) => b.amount - a.amount)
  vendors.sort((a, b) => b.amount - a.amount)

  return { range: { from: toISO(from), to: toISO(today) }, categories, vendors }
})
