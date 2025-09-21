import { $fetch } from 'ofetch'
import { getSelectedTenant } from '../utils/session'
import { getCached, setCached } from '../utils/cache'

export default eventHandler(async (event) => {
  const tenantId = getSelectedTenant(event)
  const cacheKey = tenantId ? `kpis:${tenantId}` : 'kpis:anon'

  const cached = await getCached<any[]>(cacheKey)
  if (cached) return cached

  try {
    const pnl = await $fetch<any>('/api/xero/reports/pnl', { headers: event.headers })

    const kpis = [
      {
        title: 'Revenue',
        icon: 'i-lucide-circle-dollar-sign',
        value: pnl.revenueTotal,
        variation: 0
      },
      {
        title: 'Expenses',
        icon: 'i-lucide-wallet',
        value: pnl.expensesTotal,
        variation: 0
      },
      {
        title: 'Profit',
        icon: 'i-lucide-piggy-bank',
        value: pnl.netProfit,
        variation: 0
      },
      {
        title: 'Profit Margin',
        icon: 'i-lucide-percent',
        value: Math.round((pnl.profitMargin || 0) * 100),
        variation: 0,
        formatter: (v: number) => `${v}%`
      }
    ]

    await setCached(cacheKey, kpis, 15 * 60 * 1000)
    return kpis
  } catch {
    return []
  }
})
