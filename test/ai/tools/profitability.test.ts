import { describe, it, expect, vi } from 'vitest'
import { getClientProfitability, type ProfitabilityDeps } from '~~/server/utils/ai/tools/profitability'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }

const rows: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 10000_00, passthroughCents: 2000_00, laborCents: 3000_00, hours: 100 },
  { clientId: 'b', name: 'Globex', revenueCents: 5000_00, passthroughCents: 0, laborCents: 4500_00, hours: 120 },
  { clientId: 'c', name: 'Initech', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
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
    // Acme AGI=8000, margin=(8000-3000)/8000=62.5 ; Globex AGI=5000, margin=(5000-4500)/5000=10
    expect(d.topByMargin[0].client).toBe('Acme')
    expect(d.topByMargin[0].marginPct).toBe(62.5)
    expect(d.bottomByMargin[0].client).toBe('Globex')
    expect(d.agencyConcentration.top5Pct).toBe(100) // 3 clients → all share
  })

  it('deep-dive: a named client returns its margin breakdown', async () => {
    const res = await getClientProfitability({ clientName: 'acme', period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Acme')
    expect(d.revenue).toBe(10000)
    expect(d.agi).toBe(8000)
    expect(d.deliveryMarginPct).toBe(62.5)
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
})
