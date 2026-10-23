import type { ArtboardState, BannerProject } from '~/types/banner-studio'
import { resolveBannerFormat } from '~/utils/banner-constants'

export type LibrarySort = 'modified' | 'name' | 'oldest'
export interface BannerLibraryItem {
  id: string
  name: string
  client: string
  category?: string
  dimensions: string
  type: string
  date?: string
  dateLabel?: string
  thumbnailUrl?: string | null
  canvasData?: Record<string, ArtboardState>
  to?: string
}

export function bannerDimensions(canvasData?: Record<string, ArtboardState>, formats?: string[]): string {
  const keys = canvasData && Object.keys(canvasData).length ? Object.keys(canvasData) : formats || []
  if (!keys.length) return 'Size not recorded'
  return [...new Set(keys.map((key) => {
    const format = resolveBannerFormat(key)
    return format ? `${format.w} × ${format.h}` : key
  }))].join(' · ')
}

export function sortLibrary<T extends { name: string, createdAt?: string, updatedAt?: string }>(items: T[], sort: LibrarySort): T[] {
  const timestamp = (item: T) => Date.parse(item.updatedAt || item.createdAt || '') || 0
  return [...items].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    : (sort === 'oldest' ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a)) || a.name.localeCompare(b.name))
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
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Facets are derived after client filtering; internal provenance tags are never categories. */
export function bannerLibraryFacets(items: BannerProject[]) {
  const tags = [...new Set(items.flatMap(project => project.tags || []))]
  return {
    folders: tags.filter(tag => tag.startsWith('source-folder:') && tag.length > 14).sort(),
    categories: tags.filter(tag => (tag.startsWith('category:') && tag.length > 9) || (tag.length > 0 && !tag.includes(':'))).sort()
  }
}
