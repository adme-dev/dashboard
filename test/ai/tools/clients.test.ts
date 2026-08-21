import { describe, it, expect, vi } from 'vitest'
import { getClientOverview, type ClientsDeps } from '~~/server/utils/ai/tools/clients'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

describe('get_client_overview', () => {
  it('returns a compact overview on a single name match', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'Acme Corp', is_active: true, billing_type: 'retainer', aliases: ['Acme Motors'], parent_client_id: null, parent_client_name: null },
      ]),
      briefCount: vi.fn().mockResolvedValue(7),
      marginSnapshot: vi.fn().mockResolvedValue({ totalRevenue: 50000, grossProfit: 30000, grossMargin: 60 }),
    }
    const res = await getClientOverview({ clientName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data).toEqual({
      clientId: 'c1',
      name: 'Acme Corp',
      alternateNames: ['Acme Motors'],
      parentClient: null,
      active: true,
      billingType: 'retainer',
      briefCount: 7,
      marginSnapshot: { totalRevenue: 50000, grossProfit: 30000, grossMargin: 60 },
      dataStatus: 'populated',
      coverage: { expected: 2, withData: 2 },
    })
    // Resolution passed the matched client id, never trusted a model-supplied id.
    expect(deps.briefCount).toHaveBeenCalledWith('c1', ctx)
    expect(deps.marginSnapshot).toHaveBeenCalledWith('c1', ctx)
  })

  it('resolves an alternate name to its stable client and parent identity', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockResolvedValue([
        { id: 'frankston-kia', name: 'Frankston Kia', is_active: true, billing_type: 'retainer', aliases: ['FKG Kia'], parent_client_id: 'frankston-group', parent_client_name: 'Frankston Motor Group' },
      ]),
      briefCount: vi.fn().mockResolvedValue(2),
      marginSnapshot: vi.fn().mockResolvedValue(null),
    }
    const data = (await getClientOverview({ clientName: 'FKG Kia' }, ctx, deps) as any).data
    expect(data).toMatchObject({
      clientId: 'frankston-kia',
      name: 'Frankston Kia',
      alternateNames: ['FKG Kia'],
      parentClient: { id: 'frankston-group', name: 'Frankston Motor Group' },
    })
  })

  it('returns a disambiguation list when >1 client matches', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'Acme Corp', is_active: true, billing_type: 'retainer' },
        { id: 'c2', name: 'Acme Studios', is_active: false, billing_type: 'project' },
      ]),
      briefCount: vi.fn(),
      marginSnapshot: vi.fn(),
    }
    const res = await getClientOverview({ clientName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data).toEqual({
      disambiguation: [
        { id: 'c1', name: 'Acme Corp' },
        { id: 'c2', name: 'Acme Studios' },
      ],
      limit: 25,
      truncatedAtSource: false,
    })
    // No detail lookups when ambiguous.
    expect(deps.briefCount).not.toHaveBeenCalled()
    expect(deps.marginSnapshot).not.toHaveBeenCalled()
  })

  it('fails (no match) when zero clients resolve', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockResolvedValue([]),
      briefCount: vi.fn(),
      marginSnapshot: vi.fn(),
    }
    const res = await getClientOverview({ clientName: 'nobody' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/no client matching/i)
  })

  it('returns marginSnapshot: null when the profitability source is unavailable', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'Acme Corp', is_active: true, billing_type: 'retainer' },
      ]),
      briefCount: vi.fn().mockResolvedValue(0),
      marginSnapshot: vi.fn().mockResolvedValue(null),
    }
    const res = await getClientOverview({ clientName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.marginSnapshot).toBeNull()
    expect((res as any).data.dataStatus).toBe('partial')
  })

  it('returns a recoverable error (never throws) when a dep rejects', async () => {
    const deps: ClientsDeps = {
      findClients: vi.fn().mockRejectedValue(new Error('db down')),
      briefCount: vi.fn(),
      marginSnapshot: vi.fn(),
    }
    const res = await getClientOverview({ clientName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/client/i)
  })
})
