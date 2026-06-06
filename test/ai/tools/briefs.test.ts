import { describe, it, expect, vi } from 'vitest'
import { getBriefs, type BriefsDeps } from '~~/server/utils/ai/tools/briefs'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

describe('get_briefs', () => {
  it('applies the status filter (passes status to the query layer)', async () => {
    const query = vi.fn().mockResolvedValue([])
    await getBriefs({ status: 'in_review' }, ctx, { query })
    expect(query).toHaveBeenCalledTimes(1)
    const passed = (query as any).mock.calls[0][0]
    expect(passed.status).toBe('in_review')
  })

  it('applies the clientName filter (escapes ILIKE metacharacters)', async () => {
    const query = vi.fn().mockResolvedValue([])
    await getBriefs({ clientName: '50%_off' }, ctx, { query })
    const passed = (query as any).mock.calls[0][0]
    // % and _ must be escaped so they are matched literally in ILIKE
    expect(passed.clientName).toBe('50\\%\\_off')
  })

  it('returns a compact { title, status, client } projection', async () => {
    const query = vi.fn().mockResolvedValue([
      { title: 'Spring Campaign', status: 'draft', client: 'Acme', id: 'b1', extra: 'noise' },
    ])
    const res = await getBriefs({}, ctx, { query })
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.briefs).toHaveLength(1)
    expect(data.briefs[0]).toEqual({ title: 'Spring Campaign', status: 'draft', client: 'Acme' })
  })

  it('caps the projection at 20 and reports the remainder as `more`', async () => {
    const rows = Array.from({ length: 27 }, (_, i) => ({
      title: `Brief ${i}`, status: 'draft', client: 'Acme', id: `b${i}`,
    }))
    const query = vi.fn().mockResolvedValue(rows)
    const res = await getBriefs({}, ctx, { query })
    const data = (res as any).data
    expect(data.briefs).toHaveLength(20)
    expect(data.more).toBe(7)
  })

  it('returns a recoverable error (never throws) when the deps reject', async () => {
    const query = vi.fn().mockRejectedValue(new Error('db down'))
    const res = await getBriefs({}, ctx, { query })
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/brief/i)
  })
})
