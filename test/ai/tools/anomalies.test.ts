import { describe, it, expect, vi } from 'vitest'
import { getOpenAnomalies, resolveAnomalyTenant, type AnomaliesDeps, type AnomalyQuery } from '~~/server/utils/ai/tools/anomalies'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

function row(over: Partial<{ type: string; severity: string; title: string; description: string }> = {}) {
  return {
    type: over.type ?? 'expenses',
    severity: over.severity ?? 'warning',
    title: over.title ?? 'Unusual expense',
    description: over.description ?? 'Office supplies up 220% vs trailing average',
  }
}

describe('get_open_anomalies', () => {
  it('uses latest non-default anomaly tenant for cookie-less MCP reads', async () => {
    const selected = vi.fn().mockResolvedValue(undefined)
    const load = vi.fn().mockResolvedValue({ tenant_id: 'tenant-live' })
    await expect(resolveAnomalyTenant({ ...ctx, source: 'mcp' }, selected, load as any)).resolves.toBe('tenant-live')
    expect(String(load.mock.calls[0][0])).toContain("tenant_id <> '__default__'")
  })

  it('does not infer an anomaly tenant for ordinary browser chat', async () => {
    const load = vi.fn()
    await expect(resolveAnomalyTenant({ ...ctx, source: 'chat' }, vi.fn().mockResolvedValue(undefined), load as any)).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })
  it('requests OPEN-only rows (never resolved/dismissed) and passes filters through', async () => {
    const fetchAnomalies = vi.fn<[AnomalyQuery], Promise<any[]>>().mockResolvedValue([row()])
    const deps: AnomaliesDeps = { fetchAnomalies }

    const res = await getOpenAnomalies({ type: 'expenses', severity: 'critical' }, ctx, deps)

    expect(res.ok).toBe(true)
    expect(fetchAnomalies).toHaveBeenCalledTimes(1)
    const q = fetchAnomalies.mock.calls[0]![0]
    // (b) handler asks for open-only — explicitly excludes the closed statuses.
    expect(q.excludeStatuses).toEqual(expect.arrayContaining(['resolved', 'dismissed']))
    // (a) severity + type filters forwarded
    expect(q.severity).toBe('critical')
    expect(q.type).toBe('expenses')
  })

  it('returns the rule and evidence needed to explain a detection', async () => {
    const deps: AnomaliesDeps = {
      fetchAnomalies: vi.fn().mockResolvedValue([
        row({ type: 'cashflow', severity: 'critical', title: 'Low runway', description: '12 days of cash left' }),
      ]),
    }
    const res = await getOpenAnomalies({}, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.anomalies).toHaveLength(1)
    expect(data.anomalies[0]).toEqual({
      type: 'cashflow',
      rule: 'cashflow',
      severity: 'critical',
      title: 'Low runway',
      context: '12 days of cash left',
      recommendation: null,
      evidence: { metric: null, comparison: null, context: null },
    })
  })

  it('caps at 20 and reports the overflow count in `more`', async () => {
    const many = Array.from({ length: 27 }, (_, i) => row({ title: `A${i}` }))
    const deps: AnomaliesDeps = { fetchAnomalies: vi.fn().mockResolvedValue(many) }

    const res = await getOpenAnomalies({}, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.anomalies).toHaveLength(20)
    expect(data.more).toBe(7)
    expect(data.total).toBe(27)
    expect(data.nextCursor).toBeTruthy()
    expect(data.anomalies[0].title).toBe('A0')
  })

  it('distinguishes an engine that has never detected from a healthy empty result', async () => {
    const deps: AnomaliesDeps = {
      fetchAnomalies: vi.fn().mockResolvedValue([]),
      isConfigured: vi.fn().mockResolvedValue(false),
    }
    const data = (await getOpenAnomalies({}, ctx, deps) as any).data
    expect(data.anomalies).toEqual([])
    expect(data.dataStatus).toBe('not_configured')
  })

  it('uses engine readiness for coverage when a configured engine has no open incidents', async () => {
    const deps: AnomaliesDeps = {
      fetchAnomalies: vi.fn().mockResolvedValue([]),
      isConfigured: vi.fn().mockResolvedValue(true),
    }
    const data = (await getOpenAnomalies({}, ctx, deps) as any).data
    expect(data.dataStatus).toBe('populated')
    expect(data.coverage).toEqual({ expected: 1, withData: 1 })
    expect(data.anomalies).toEqual([])
  })

  it('reports zero `more` when under the cap', async () => {
    const deps: AnomaliesDeps = { fetchAnomalies: vi.fn().mockResolvedValue([row(), row()]) }
    const res = await getOpenAnomalies({}, ctx, deps)
    const data = (res as any).data
    expect(data.anomalies).toHaveLength(2)
    expect(data.more).toBe(0)
  })

  it('returns a recoverable error (never throws) when the source fails', async () => {
    const deps: AnomaliesDeps = {
      fetchAnomalies: vi.fn().mockRejectedValue(new Error('db down')),
    }
    const res = await getOpenAnomalies({}, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/anomal/i)
  })

  it('declares source truncation when the fetch cap is hit (P-03)', async () => {
    const { ANOMALY_FETCH_CAP } = await import('~~/server/utils/ai/tools/anomalies')
    const rows = Array.from({ length: ANOMALY_FETCH_CAP + 1 }, (_, i) => ({ fingerprint: `f${i}`, type: 'low_cash', severity: 'warning', title: 't', description: 'd' }))
    const res = await getOpenAnomalies({ limit: 5 } as any, ctx, { fetchAnomalies: vi.fn().mockResolvedValue(rows), isConfigured: async () => true } as any)
    const d = (res as any).data
    expect(d.truncatedAtSource).toBe(true)
    expect(d.total).toBe(ANOMALY_FETCH_CAP)
    expect(d.sourceCap).toBe(ANOMALY_FETCH_CAP)
  })
})
