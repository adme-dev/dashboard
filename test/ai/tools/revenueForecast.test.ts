import { describe, it, expect, vi } from 'vitest'
import { forecastRevenue, type ForecastDeps } from '~~/server/utils/ai/tools/revenueForecast'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: { headers: {} } as any }

// Mirrors server/api/xero/get-out/forecast.get.ts return shape.
const forecastResp = {
  target: 200000,
  layers: { invoiced: 120000, arCollectible: 40000, recurring: 25000, quotesProbable: 10000 },
  leakage: { total: 5000, creditNotes: 3000, creditNotesCount: 2, voidedInvoices: 2000 },
  totalProjected: 190000, gap: 10000, surplus: 0, onTrack: false,
}
// Mirrors server/api/xero/get-out/pipeline-coverage.get.ts return shape.
const coverageResp = {
  quarterlyTarget: 600000,
  pipeline: { totalFace: 900000, totalWeighted: 720000 },
  coverage: { face: 1.5, weighted: 1.2, band: 'low' },
}
const deps = (over: Partial<ForecastDeps> = {}): ForecastDeps => ({
  fetchForecast: vi.fn().mockResolvedValue(forecastResp),
  fetchCoverage: vi.fn().mockResolvedValue(coverageResp),
  ...over,
})

describe('forecast_revenue', () => {
  it('month (default): maps the month-end landing layers', async () => {
    const res = await forecastRevenue({ horizon: 'month' }, ctx, deps())
    const d = (res as any).data
    expect(d.horizon).toBe('month')
    expect(d.projected).toBe(190000)
    expect(d.invoiced).toBe(120000)
    expect(d.quotesProbable).toBe(10000)
    expect(d.leakage).toBe(5000)
    expect(d.onTrack).toBe(false)
  })

  it('quarter: maps pipeline coverage', async () => {
    const res = await forecastRevenue({ horizon: 'quarter' }, ctx, deps())
    const d = (res as any).data
    expect(d.horizon).toBe('quarter')
    expect(d.coverageWeighted).toBe(1.2)
    expect(d.band).toBe('low')
    expect(d.quarterlyTarget).toBe(600000)
  })

  it('Xero failure → recoverable error', async () => {
    const res = await forecastRevenue({ horizon: 'month' }, ctx, deps({ fetchForecast: vi.fn().mockRejectedValue(new Error('xero down')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/forecast/i)
  })
})
