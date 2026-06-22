import { describe, it, expect, vi } from 'vitest'
import { searchCrm, searchCrmTool, type CrmSearchDeps, type CrmSearchHit } from '~~/server/utils/ai/tools/searchCrm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const found = { resolveClient: vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' }) }
const hits = (n: number): CrmSearchHit[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'person', id: `p${i}`, title: `Person ${i}`, subtitle: `note ${i}`, rank: 1 }))

describe('search_crm', () => {
  it('resolves the client and returns a compact, capped result list', async () => {
    const deps: CrmSearchDeps = { ...found, search: vi.fn().mockResolvedValue({ results: hits(8) }) }
    const res = await searchCrm({ clientName: 'Acme', query: 'jo', limit: 5 }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.client).toBe('Acme')
    expect(data.results).toHaveLength(5)
    expect(data.more).toBe(3)
    expect(Object.keys(data.results[0]).sort()).toEqual(['id', 'subtitle', 'title', 'type'])
    expect((deps.search as any).mock.calls[0][0]).toBe('c1')
  })

  it('fails without calling search when the client is unknown', async () => {
    const search = vi.fn()
    const deps: CrmSearchDeps = { resolveClient: vi.fn().mockResolvedValue(null), search }
    const res = await searchCrm({ clientName: 'Nope', query: 'x', limit: 20 }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(search).not.toHaveBeenCalled()
  })

  it('returns a recoverable error (never throws) when search rejects', async () => {
    const deps: CrmSearchDeps = { ...found, search: vi.fn().mockRejectedValue(new Error('db down')) }
    const res = await searchCrm({ clientName: 'Acme', query: 'x', limit: 20 }, ctx, deps)
    expect(res.ok).toBe(false)
  })

  it('is read-only, untrusted, and requires CLIENTS', () => {
    expect(searchCrmTool.mutates).toBeUndefined()
    expect(searchCrmTool.returnsUntrusted).toBe(true)
    expect(searchCrmTool.requiredPermission).toBe('CLIENTS')
  })
})
