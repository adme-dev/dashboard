import type { ArtboardState, BannerProject } from '~/types/banner-studio'
import { resolveBannerFormat } from '~/utils/banner-constants'

export type LibrarySort = 'modified' | 'name' | 'oldest' | 'created'
export interface BannerLibraryItem {
  id: string
  name: string
  client: string
  clientId?: string | null
  category?: string
  dimensions: string
  type: string
  date?: string
  dateLabel?: string
  sourceCreatedDate?: string | null
  thumbnailUrl?: string | null
  canvasData?: Record<string, ArtboardState>
  to?: string
}

/** Native saved canvas takes precedence over potentially stale imported thumbnails. */
export function hasBannerPreview(canvasData?: Record<string, ArtboardState>): boolean {
  return !!canvasData && Object.entries(canvasData).some(([key, board]) =>
    !!resolveBannerFormat(key) && Array.isArray(board?.layers) && board.layers.length > 0)
}

export function bannerDimensions(canvasData?: Record<string, ArtboardState>, formats?: string[]): string {
  const keys = canvasData && Object.keys(canvasData).length ? Object.keys(canvasData) : formats || []
  if (!keys.length) return 'Size not recorded'
  return [...new Set(keys.map((key) => {
    const format = resolveBannerFormat(key)
    return format ? `${format.w} × ${format.h}` : key
  }))].join(' · ')
}

export function sortLibrary<T extends { name: string, createdAt?: string, updatedAt?: string, tags?: string[] }>(items: T[], sort: LibrarySort): T[] {
  const timestamp = (item: T) => Date.parse(item.updatedAt || item.createdAt || '') || 0
  const created = (item: T) => {
    const date = item.tags?.includes('source:thebrief') ? theBriefCreatedDate(item.tags) : item.createdAt
    return date ? Date.parse(date) : Number.POSITIVE_INFINITY
  }
  return [...items].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    : (sort === 'created' ? created(a) - created(b) : sort === 'oldest' ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a)) || a.name.localeCompare(b.name))
}

export function filterBannerProjects(items: BannerProject[], filters: { client: string, tag: string, status: string, search: string }): BannerProject[] {
  const search = filters.search.trim().toLocaleLowerCase()
  return items.filter((project) => {
    if (filters.client === 'unassigned' ? Boolean(project.clientId) : filters.client !== 'all' && project.clientId !== filters.client) return false
    if (filters.tag !== 'all' && !project.tags?.includes(filters.tag)) return false
    if (filters.status !== 'all' && project.status !== filters.status) return false
    return !search || [project.name, project.clientName, ...project.tags || [], bannerDimensions(project.canvasData)]
      .some(value => value?.toLocaleLowerCase().includes(search))
  })
}

export function libraryDate(value?: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    ? new Date(Number(value!.slice(0, 4)), Number(value!.slice(5, 7)) - 1, Number(value!.slice(8, 10)))
    : new Date(value || '')
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function theBriefCreatedDate(tags: string[]): string | null {
  const dates = tags.filter(tag => tag.startsWith('source-created-date:'))
  if (dates.length !== 1) return null
  const value = dates[0]!.slice('source-created-date:'.length)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

/** Facets are derived after client filtering; internal provenance tags are never categories. */
export function bannerLibraryFacets(items: BannerProject[]) {
  const tags = [...new Set(items.flatMap(project => project.tags || []))]
  return {
    folders: tags.filter(tag => tag.startsWith('source-folder:') && tag.length > 14).sort(),
    categories: tags.filter(tag => (tag.startsWith('category:') && tag.length > 9) || (tag.length > 0 && !tag.includes(':'))).sort()
  }
}
