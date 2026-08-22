import { describe, it, expect, vi } from 'vitest'
import { getClientProfitability, profitabilityTool, type ProfitabilityDeps } from '~~/server/utils/ai/tools/profitability'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }

const rows: ClientEconomicsRow[] = [
  {
    clientId: 'a',
    name: 'Acme',
    revenueCents: 602000,
    passthroughCents: 259282,
    agiCents: 342718,
    laborCents: 30000,
    projectExpenseCents: 25000,
    xeroSupplierCostCents: 35000,
    deliveryCostCents: 90000,
    deliveryMarginPct: 73.73,
    hours: 100,
  },
  {
    clientId: 'b',
    name: 'Globex',
    revenueCents: 5000_00,
    passthroughCents: 0,
    agiCents: 5000_00,
    laborCents: 4000_00,
    projectExpenseCents: 250_00,
    xeroSupplierCostCents: 250_00,
    deliveryCostCents: 4500_00,
    deliveryMarginPct: 10,
    hours: 120,
  },
  {
    clientId: 'c',
    name: 'Initech',
    revenueCents: 0,
    passthroughCents: 0,
    agiCents: 0,
    laborCents: 0,
    projectExpenseCents: 0,
    xeroSupplierCostCents: 0,
    deliveryCostCents: 0,
    deliveryMarginPct: null,
    hours: 0,
  },
]
const deps = (over: Partial<ProfitabilityDeps> = {}): ProfitabilityDeps => ({
  fetchEconomics: vi.fn().mockResolvedValue(rows),
  ...over,
})

describe('get_client_profitability', () => {
  it('portfolio: ranks by delivery margin and reports concentration', async () => {
    const res = await getClientProfitability({ period: 'mtd' }, ctx, deps())
    expect(res.ok).toBe(true)
    const d = (res as any).data
    // Acme AGI=$3,427.18, margin=($3,427.18-$900)/$3,427.18=73.7%; Globex=10%.
    expect(d.topByMargin[0].client).toBe('Acme')
    expect(d.topByMargin[0].marginPct).toBe(73.7)
    expect(d.topByMargin[0].deliveryCost).toBe(900)
    expect(d.bottomByMargin[0].client).toBe('Globex')
    expect(d.agencyConcentration.top5Pct).toBe(100) // 3 clients → all share
  })

  it('deep-dive: a named client returns canonical AGI and total delivery-cost detail', async () => {
    const res = await getClientProfitability({ clientName: 'acme', period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Acme')
    expect(d.revenue).toBe(6020)
    expect(d.passthrough).toBe(2592.82)
    expect(d.agi).toBe(3427.18)
    expect(d.laborCost).toBe(300)
    expect(d.deliveryCost).toBe(900)
    expect(d.deliveryMarginPct).toBe(73.7)
  })

  it('ambiguous name → disambiguation list, no numbers leaked', async () => {
    const amb: ClientEconomicsRow[] = [
      { clientId: 'a', name: 'Acme Corp', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
      { clientId: 'b', name: 'Acme Media', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
    ]
    const res = await getClientProfitability({ clientName: 'acme' }, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue(amb) }))
    const d = (res as any).data
    expect(d.disambiguation).toEqual(['Acme Corp', 'Acme Media'])
  })

  it('no match → ok note (not an error)', async () => {
    const res = await getClientProfitability({ clientName: 'zzz' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no client/i)
  })

  it('no data (no Xero tenant) → ok note', async () => {
    const res = await getClientProfitability({}, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue([]) }))
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no/i)
  })

  it('source failure → recoverable error, never throws', async () => {
    const res = await getClientProfitability({}, ctx, deps({ fetchEconomics: vi.fn().mockRejectedValue(new Error('db down')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/profitab/i)
  })

  it('rejects non-finite economics instead of returning NaN', async () => {
    const invalid: ClientEconomicsRow[] = [{
      ...rows[0]!,
      deliveryCostCents: Number.NaN,
    }]
    const res = await getClientProfitability({}, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue(invalid) }))

    expect(res.ok).toBe(false)
    expect(JSON.stringify(res)).not.toContain('NaN')
  })

  it('describes the complete canonical delivery-cost model', () => {
    expect(profitabilityTool.description).toContain('labor, project expenses, and allocated Xero supplier costs')
  })

  it('loss-making clients (AGI <= 0) appear in bottomByMargin as the worst, with marginPct null', async () => {
    const lossRows: ClientEconomicsRow[] = [
      rows[0]!,
      rows[1]!,
      {
        clientId: 'l', name: 'LossCo', revenueCents: 5000_00, passthroughCents: 8000_00,
        agiCents: -3000_00, laborCents: 1000_00, projectExpenseCents: 100_00,
        xeroSupplierCostCents: 0, deliveryCostCents: 1100_00, deliveryMarginPct: null, hours: 40,
      },
      {
        clientId: 'z', name: 'ZeroAgiCo', revenueCents: 2000_00, passthroughCents: 2000_00,
        agiCents: 0, laborCents: 100_00, projectExpenseCents: 0,
        xeroSupplierCostCents: 0, deliveryCostCents: 100_00, deliveryMarginPct: null, hours: 2,
      },
    ]
    const res = await getClientProfitability({ period: 'mtd' }, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue(lossRows) }))
    const d = (res as any).data
    expect(d.bottomByMargin[0].client).toBe('LossCo')   // loss-maker is the worst
    expect(d.bottomByMargin[0].marginPct).toBeNull()
    expect(d.bottomByMargin[0].agi).toBe(-3000)
    expect(d.bottomByMargin[1]).toMatchObject({ client: 'ZeroAgiCo', agi: 0, marginPct: null })
    expect(d.topByMargin.map((c: any) => c.client)).not.toContain('LossCo') // never shown as "top"
    expect(d.topByMargin.map((c: any) => c.client)).not.toContain('ZeroAgiCo')
  })

  it('more counts only active clients shown in neither list (not a raw length - 5)', async () => {
    // 2 active clients, both shown across top+bottom → more must be 0 (was incorrectly reported as a negative-clamped count)
    const res = await getClientProfitability({ period: 'mtd' }, ctx, deps())
    expect((res as any).data.more).toBe(0)
  })

  it('carries an as-of for every figure and declares the basis + list cap (P-01/P-03/P-04)', async () => {
    const asOf = { lastSyncedAt: '2026-08-19T08:13:47Z', oldestSyncedAt: '2026-08-19T03:20:00Z', staleRowCount: 0, stalenessThresholdHours: 48, freshness: 'fresh', xeroCacheSyncedAt: '2026-08-19T03:20:00Z', mediaSpendSyncedAt: '2026-08-19T08:13:47Z', basis: 'xero_invoice_cache+media_spend_sync' } as any
    const res = await getClientProfitability({ period: 'mtd' }, ctx, deps({ fetchAsOf: vi.fn().mockResolvedValue(asOf) }))
    expect(res.ok).toBe(true)
    const d = (res as any).data
    expect(d.asOf).toEqual(asOf)
    expect(d.basis.marginPct).toMatch(/revenue/)
    expect(d.limit).toBe(5)
    expect(typeof d.rankedClientCount).toBe('number')
  })
})
