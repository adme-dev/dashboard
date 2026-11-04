import { describe, expect, it } from 'vitest'
import type { ArtboardState, BannerProject } from '../../app/types/banner-studio'
import { bannerDimensions, preferredBannerPreviewKey, hasBannerPreview, bannerLibraryFacets, filterBannerProjects, libraryDate, sortLibrary, theBriefCreatedDate } from '../../app/utils/banner-library'

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

  it('recognizes usable native thumbnails without relying on a stale image URL', () => {
    expect(hasBannerPreview()).toBe(false)
    expect(hasBannerPreview({ mrec: { layers: [] } })).toBe(false)
    expect(hasBannerPreview({ unknown: { layers: [{ id: 1 }] } } as unknown as Record<string, ArtboardState>)).toBe(false)
    expect(hasBannerPreview({ unknown: { layers: [{ id: 1 }] }, custom_1200x1200: { layers: [{ id: 2 }] } } as unknown as Record<string, ArtboardState>)).toBe(true)
  })

  it('finds a project by its imported folder while retaining the client scope', () => {
    const items = [project('one', 'driveagent', ['source-folder:JAC']), project('two', 'news', ['source-folder:JAC'])]
    expect(filterBannerProjects(items, { ...filters, client: 'driveagent', search: 'jac' }).map(p => p.id)).toEqual(['one'])
  })

  it('sorts by actual update time or recorded creation time without mutating the input', () => {
    const items = [{ name: 'Banner 10', createdAt: '2026-10-04' }, { name: 'Banner 2', createdAt: '2026-10-01', updatedAt: '2026-10-05' }]
    expect(sortLibrary(items, 'modified').map(p => p.name)).toEqual(['Banner 2', 'Banner 10'])
    expect(sortLibrary(items, 'name').map(p => p.name)).toEqual(['Banner 2', 'Banner 10'])
    expect(items[0].name).toBe('Banner 10')
    expect(libraryDate('invalid')).toBe('Date unavailable')
  })

  it('shows the original TheBrief date only when its provenance tag is valid', () => {
    expect(theBriefCreatedDate(['source:thebrief', 'source-created-date:2019-07-08'])).toBe('2019-07-08')
    expect(theBriefCreatedDate(['source:thebrief'])).toBeNull()
    expect(theBriefCreatedDate(['source-created-date:2019-02-30'])).toBeNull()
    expect(theBriefCreatedDate(['source-created-date:2019-07-08', 'source-created-date:2019-07-09'])).toBeNull()
    expect(libraryDate('2019-07-08')).toBe('8 July 2019')
    const recentImport = { ...project('recent', 'driveagent', ['source:thebrief', 'source-created-date:2021-01-01']), updatedAt: '2026-10-31T00:00:00Z' }
    const oldImport = { ...project('old', 'driveagent', ['source:thebrief', 'source-created-date:2018-01-01']), updatedAt: '2026-10-31T00:00:00Z' }
    const unknownImport = project('unknown', 'driveagent', ['source:thebrief'])
    expect(sortLibrary([recentImport, unknownImport, oldImport], 'created').map(item => item.id)).toEqual(['old', 'recent', 'unknown'])
  })
})

describe('square-first banner previews', () => {
  const populated = { layers: [{ id: 1 }] } as ArtboardState
  it('finds imported squares by dimensions regardless of insertion order or preset name', () => {
    const canvas = { custom_1080x1920: populated, mrec: populated, custom_1200x1200: populated, fb_sq: populated }
    expect(preferredBannerPreviewKey(canvas)).toBe('custom_1200x1200')
    expect(Object.keys(canvas)[0]).toBe('custom_1080x1920')
    expect(preferredBannerPreviewKey({ ig_story: populated, li_sq: populated })).toBe('li_sq')
  })
  it('uses the closest populated aspect ratio when no square artwork exists', () => {
    expect(preferredBannerPreviewKey({ leader: populated, ig_story: populated, mrec: populated })).toBe('mrec')
    expect(preferredBannerPreviewKey({ fb_sq: { layers: [] }, ig_story: populated })).toBe('ig_story')
    expect(preferredBannerPreviewKey({ custom_1080x1920: populated })).toBe('custom_1080x1920')
  })
  it('handles empty, malformed and unrecognized artboards', () => {
    expect(preferredBannerPreviewKey()).toBeUndefined()
    expect(preferredBannerPreviewKey({ unknown: populated, fb_sq: null } as unknown as Record<string, ArtboardState>)).toBeUndefined()
    expect(preferredBannerPreviewKey({ leader: { layers: [] }, fb_sq: { layers: [] } })).toBe('fb_sq')
  })
})
