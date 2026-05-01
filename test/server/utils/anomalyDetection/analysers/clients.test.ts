import { describe, it, expect } from 'vitest'
import { clientsAnalyser } from '~~/server/utils/anomalyDetection/analysers/clients'

const ctx = (clientRevenue: any[] | null) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend: null, clientRevenue, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

const make = (overrides: Partial<{ client_id: string; client_name: string; invoiced: number; time_value: number }>) => ({
  client_id: 'c1', client_name: 'Acme',
  invoiced: 0, time_value: 0,
  period_start: '2026-04-01', period_end: '2026-04-30',
  ...overrides,
})

describe('clientsAnalyser', () => {
  it('flags scope creep when time tracked > 1.5× invoiced', async () => {
    const out = await clientsAnalyser(ctx([make({ invoiced: 5_000, time_value: 8_000 })]))
    const a = out.find(x => x.fingerprint === 'clients:scope-creep-c1')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })

  it('escalates scope creep to critical at >=2.5×', async () => {
    const out = await clientsAnalyser(ctx([make({ invoiced: 4_000, time_value: 12_000 })]))
    const a = out.find(x => x.fingerprint === 'clients:scope-creep-c1')
    expect(a?.severity).toBe('critical')
  })

  it('flags revenue concentration at >40% share', async () => {
    const out = await clientsAnalyser(ctx([
      make({ client_id: 'c1', client_name: 'Big', invoiced: 50_000, time_value: 0 }),
      make({ client_id: 'c2', client_name: 'Small', invoiced: 5_000, time_value: 0 }),
    ]))
    expect(out.find(x => x.fingerprint === 'clients:concentration-c1')).toBeDefined()
  })

  it('does NOT fire scope-creep when invoiced is <=$100 (avoids spurious flags on tiny clients)', async () => {
    const out = await clientsAnalyser(ctx([make({ invoiced: 50, time_value: 1_000 })]))
    expect(out.find(x => x.fingerprint === 'clients:scope-creep-c1')).toBeUndefined()
  })

  it('returns empty when there are no rows', async () => {
    expect(await clientsAnalyser(ctx([]))).toHaveLength(0)
    expect(await clientsAnalyser(ctx(null))).toHaveLength(0)
  })
})
