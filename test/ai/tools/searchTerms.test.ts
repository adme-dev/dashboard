import { describe, expect, it, vi } from 'vitest'
import { getSearchTerms, searchTermsTool, type SearchTermsDeps } from '~~/server/utils/ai/tools/searchTerms'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'media_buyer', source: 'mcp', event: {} as any } as ToolContext
const target = {
  mediaSpendId: 'ms-1', campaignId: '123', campaignName: 'July Drive Away', campaignType: 'SEARCH',
  platform: 'google' as const, clientId: 'client-1', clientName: 'Geelong Kia', connectionId: 'conn-1',
}
const snapshot = {
  coverage: 'full' as const,
  coverageReason: 'Google campaign search-term view coverage for this campaign type.',
  asOf: '2026-08-24T00:00:00Z',
  lastAttemptedAt: '2026-08-24T00:00:00Z',
  lastError: null,
  sourceTotal: 3,
  truncatedAtSource: false,
  terms: [
    { searchTerm: 'cheap suv', matchType: 'BROAD', targetingStatus: 'NONE', impressions: 100, clicks: 2, cost: 20 },
    { searchTerm: 'kia dealer', matchType: 'EXACT', targetingStatus: 'ADDED', impressions: 50, clicks: 5, cost: 10 },
    { searchTerm: 'kia sale', matchType: 'PHRASE', targetingStatus: 'NONE', impressions: 20, clicks: 1, cost: 3 },
  ],
}

const deps = (over: Partial<SearchTermsDeps> = {}): SearchTermsDeps => ({
  resolve: vi.fn().mockResolvedValue(target),
  load: vi.fn().mockResolvedValue(snapshot),
  sync: vi.fn().mockResolvedValue(snapshot),
  now: () => new Date('2026-08-24T12:00:00Z'),
  ...over,
})

describe('get_search_terms', () => {
  it('is a MEDIA_BUYING read-only untrusted tool', () => {
    expect(searchTermsTool.requiredPermission).toBe('MEDIA_BUYING')
    expect(searchTermsTool.returnsUntrusted).toBe(true)
    expect(searchTermsTool.mutates).toBeFalsy()
  })

  it('returns top terms by cost with CPC and cursor pagination', async () => {
    const first = (await getSearchTerms({ campaignId: '123', sortBy: 'cost', limit: 2 }, ctx, deps()) as any).data
    expect(first).toMatchObject({ coverage: 'full', dataStatus: 'fresh', total: 3, more: 1, appliedLimit: 2 })
    expect(first.terms).toEqual([
      expect.objectContaining({ searchTerm: 'cheap suv', cost: 20, cpc: 10 }),
      expect.objectContaining({ searchTerm: 'kia dealer', cost: 10, cpc: 2 }),
    ])
    const second = (await getSearchTerms({ campaignId: '123', sortBy: 'cost', limit: 2, cursor: first.nextCursor }, ctx, deps()) as any).data
    expect(second.terms).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
  })

  it('marks a failed refresh over cached data stale instead of unavailable or healthy', async () => {
    const stale = {
      ...snapshot,
      coverage: 'limited' as const,
      lastAttemptedAt: '2026-08-24T11:00:00Z',
      lastError: 'Provider timeout',
    }
    const data = (await getSearchTerms({ campaignId: '123', refresh: true }, ctx, deps({
      load: vi.fn().mockResolvedValue(snapshot),
      sync: vi.fn().mockResolvedValue(stale),
    })) as any).data
    expect(data).toMatchObject({ coverage: 'limited', dataStatus: 'stale', unavailableReason: 'Provider timeout' })
    expect(data.refresh).toEqual({ attempted: true, succeeded: false, error: 'Provider timeout' })
  })

  it('returns unsupported coverage honestly for Meta without terms', async () => {
    const unsupported = { ...snapshot, coverage: 'unsupported' as const, coverageReason: 'Google only', terms: [], sourceTotal: 0 }
    const data = (await getSearchTerms({ campaignName: 'Meta campaign' }, ctx, deps({
      resolve: vi.fn().mockResolvedValue({ ...target, platform: 'meta', campaignType: null }),
      load: vi.fn().mockResolvedValue(unsupported),
    })) as any).data
    expect(data).toMatchObject({ coverage: 'unsupported', dataStatus: 'unsupported', terms: [] })
  })
})
