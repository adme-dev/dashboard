import { describe, it, expect, vi } from 'vitest'
import { flagOverServicing, type OverServicingDeps } from '~~/server/utils/ai/tools/overServicing'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow, RetainerRow, ProjectLaborRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: {} as any }

const retainers: RetainerRow[] = [
  { clientId: 'a', name: 'Acme', capDollars: 10000, billingType: 'retainer' },
  { clientId: 'b', name: 'Globex', capDollars: 5000, billingType: 'retainer' },
]
const econ: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 0, passthroughCents: 0, laborCents: 8000_00, hours: 100 },  // 80% util
  { clientId: 'b', name: 'Globex', revenueCents: 0, passthroughCents: 0, laborCents: 6500_00, hours: 90 },  // 130% util → over
]
const deps = (over: Partial<OverServicingDeps> = {}): OverServicingDeps => ({
  fetchRetainers: vi.fn().mockResolvedValue(retainers),
  fetchEconomics: vi.fn().mockResolvedValue(econ),
  fetchProjectLabor: vi.fn<[string, any], Promise<ProjectLaborRow[]>>().mockResolvedValue([{ project: 'Retainer BAU', deliveredValue: 6500 }]),
  ...over,
})

describe('flag_over_servicing', () => {
  it('portfolio: flags clients over the threshold (default 100% of scope)', async () => {
    const res = await flagOverServicing({}, ctx, deps())
    const d = (res as any).data
    expect(d.flagged.map((f: any) => f.client)).toEqual(['Globex'])
    expect(d.flagged[0].overByPct).toBe(30) // 130% - 100%
  })

  it('custom threshold widens the flag set', async () => {
    const res = await flagOverServicing({ thresholdPct: 75 }, ctx, deps())
    const d = (res as any).data
    expect(d.flagged.map((f: any) => f.client)).toEqual(['Globex', 'Acme']) // sorted by overage desc
  })

  it('deep-dive: scope vs delivered + top projects', async () => {
    const res = await flagOverServicing({ clientName: 'globex' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Globex')
    expect(d.scopeValue).toBe(5000)
    expect(d.deliveredValue).toBe(6500)
    expect(d.overByAmount).toBe(1500)
    expect(d.topProjects[0].project).toBe('Retainer BAU')
  })

  it('named client with no scope baseline → ok note', async () => {
    const res = await flagOverServicing({ clientName: 'initech' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no scope baseline/i)
  })

  it('source failure → recoverable error', async () => {
    const res = await flagOverServicing({}, ctx, deps({ fetchEconomics: vi.fn().mockRejectedValue(new Error('x')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/over-servicing/i)
  })

  it('invalid args (out-of-range threshold) → recoverable error, never throws', async () => {
    const res = await flagOverServicing({ thresholdPct: 9999 } as any, ctx, deps())
    expect(res.ok).toBe(false)
  })
})
