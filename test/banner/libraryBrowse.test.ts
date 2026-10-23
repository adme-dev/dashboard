import { describe, expect, it } from 'vitest'
import type { BannerProject } from '../../app/types/banner-studio'
import { bannerDimensions, bannerLibraryFacets, filterBannerProjects, libraryDate, sortLibrary } from '../../app/utils/banner-library'

const project = (id: string, clientId: string | null, tags: string[] = []): BannerProject => ({
  id, name: `Banner ${id}`, clientId, clientName: clientId === 'news' ? 'DriveAgent News' : 'DriveAgent', tags,
  canvasData: { custom_1080x1080: { layers: [] } }, thumbnailUrl: null, status: 'draft', createdBy: 'test',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z'
})
const filters = { client: 'all', tag: 'all', status: 'all', search: '' }

describe('banner library browsing', () => {
  it('filters clients by identity even when names and source folders overlap', () => {
    const items = [project('one', 'driveagent', ['source-folder:Updates', 'category:Updates']), project('two', 'news', ['source-folder:Updates', 'category:Updates']), project('three', null)]
    expect(filterBannerProjects(items, { ...filters, client: 'news', tag: 'category:Updates' }).map(p => p.id)).toEqual(['two'])
    expect(filterBannerProjects(items, { ...filters, client: 'unassigned' }).map(p => p.id)).toEqual(['three'])
  })

  it('derives folder and category facets only from the selected client and hides internal tags', () => {
    const items = [project('one', 'driveagent', ['source-folder:Offers', 'category:Sales', 'summer', 'source:thebrief', 'import:needs-review', 'source-hash:abc']), project('two', 'news', ['source-folder:Editorial', 'category:News'])]
    expect(bannerLibraryFacets(filterBannerProjects(items, { ...filters, client: 'driveagent' }))).toEqual({ folders: ['source-folder:Offers'], categories: ['category:Sales', 'summer'] })
  })

  it('combines status, tag and case-insensitive trimmed searches', () => {
    const items = [project('one', 'news', ['category:Updates']), { ...project('two', 'news', ['category:Updates']), status: 'published' as const }]
    expect(filterBannerProjects(items, { ...filters, search: '  NEWS ', tag: 'category:Updates', status: 'published' }).map(p => p.id)).toEqual(['two'])
    expect(filterBannerProjects(items, { ...filters, search: '1080 × 1080' })).toHaveLength(2)
  })

  it('keeps custom dimensions and deduplicates matching size variants', () => {
    expect(bannerDimensions({ fb_sq: { layers: [] }, custom_1080x1080: { layers: [] }, leader: { layers: [] } })).toBe('1080 × 1080 · 728 × 90')
    expect(bannerDimensions(undefined, ['custom_1234x567'])).toBe('1234 × 567')
    expect(bannerDimensions()).toBe('Size not recorded')
  })

  it('sorts by actual update time or recorded creation time without mutating the input', () => {
    const items = [{ name: 'Banner 10', createdAt: '2026-10-04' }, { name: 'Banner 2', createdAt: '2026-10-01', updatedAt: '2026-10-05' }]
    expect(sortLibrary(items, 'modified').map(p => p.name)).toEqual(['Banner 2', 'Banner 10'])
    expect(sortLibrary(items, 'name').map(p => p.name)).toEqual(['Banner 2', 'Banner 10'])
    expect(items[0].name).toBe('Banner 10')
    expect(libraryDate('invalid')).toBe('Date unavailable')
  })
})
