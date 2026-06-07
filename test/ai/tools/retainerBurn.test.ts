import { describe, it, expect, vi } from 'vitest'
import { monitorRetainerBurn, type RetainerBurnDeps } from '~~/server/utils/ai/tools/retainerBurn'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow, RetainerRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: {} as any }

const retainers: RetainerRow[] = [
  { clientId: 'a', name: 'Acme', capDollars: 10000, billingType: 'retainer' },
  { clientId: 'b', name: 'Globex', capDollars: 5000, billingType: 'hybrid' },
]
const econ: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 0, passthroughCents: 0, laborCents: 4000_00, hours: 80 },  // 40% burn
  { clientId: 'b', name: 'Globex', revenueCents: 0, passthroughCents: 0, laborCents: 6000_00, hours: 90 }, // 120% burn → over
]
const deps = (over: Partial<RetainerBurnDeps> = {}): RetainerBurnDeps => ({
  fetchRetainers: vi.fn().mockResolvedValue(retainers),
  fetchEconomics: vi.fn().mockResolvedValue(econ),
  elapsedFraction: vi.fn().mockReturnValue(0.5), // halfway through the month
  ...over,
})

describe('monitor_retainer_burn', () => {
  it('portfolio: surfaces over-pace clients', async () => {
    const res = await monitorRetainerBurn({ period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.summary.count).toBe(2)
    expect(d.summary.overCount).toBe(1)
    expect(d.atRisk.find((x: any) => x.client === 'Globex').pace).toBe('over')
  })

  it('deep-dive: burn %, pace and projected end-of-period', async () => {
    const res = await monitorRetainerBurn({ clientName: 'acme', period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Acme')
    expect(d.burnPct).toBe(40)
    expect(d.pace).toBe('under')               // 40% spent at 50% elapsed
    expect(d.projectedEndOfPeriod).toBe(8000)  // 4000 / 0.5
    expect(d.hoursLogged).toBe(80)
  })

  it('named client with no retainer → ok note', async () => {
    const res = await monitorRetainerBurn({ clientName: 'initech' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no active retainer/i)
  })

  it('source failure → recoverable error', async () => {
    const res = await monitorRetainerBurn({}, ctx, deps({ fetchRetainers: vi.fn().mockRejectedValue(new Error('x')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/retainer/i)
  })
})
