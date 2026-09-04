import type { PageStudioDocument, PageStudioPage } from './document'

export interface PageStudioFlatPage {
  depth: number
  page: PageStudioPage
  route: string
}

export function pageStudioHomepageId(document: PageStudioDocument): string {
  const explicit = document.homepageId && document.pages.some(page => page.id === document.homepageId)
  if (explicit) return document.homepageId as string
  return document.pages.find(page => page.parentId === null && page.slug === '')?.id || document.pages[0]!.id
}

export function pageStudioPageStatus(page: PageStudioPage): 'draft' | 'visible' | 'archived' {
  return page.status || (page.visibility === 'visible' ? 'visible' : 'draft')
}

export function pageStudioPageRoute(pages: PageStudioPage[], pageId: string): string {
  const byId = new Map(pages.map(page => [page.id, page]))
  const segments: string[] = []
  const visited = new Set<string>()
  let page = byId.get(pageId)
  while (page && !visited.has(page.id)) {
    visited.add(page.id)
    if (page.slug) segments.unshift(page.slug)
    page = page.parentId ? byId.get(page.parentId) : undefined
  }
  return segments.length ? `/${segments.join('/')}` : '/'
}

export function pageStudioDescendantIds(pages: PageStudioPage[], pageId: string): Set<string> {
  const descendants = new Set<string>()
  const pending = [pageId]
  while (pending.length) {
    const parentId = pending.shift()
    for (const page of pages) {
      if (page.parentId !== parentId || descendants.has(page.id)) continue
      descendants.add(page.id)
      pending.push(page.id)
    }
  }
  return descendants
}

export function flattenPageStudioPages(document: PageStudioDocument): PageStudioFlatPage[] {
  const children = new Map<string | null, PageStudioPage[]>()
  for (const page of document.pages) {
    const siblings = children.get(page.parentId) || []
    siblings.push(page)
    children.set(page.parentId, siblings)
  }
  const result: PageStudioFlatPage[] = []
  const visit = (parentId: string | null, depth: number) => {
    for (const page of children.get(parentId) || []) {
      result.push({ depth, page, route: pageStudioPageRoute(document.pages, page.id) })
      visit(page.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}

export function pageStudioSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page'
}

export function uniquePageStudioSlug(
  pages: PageStudioPage[],
  parentId: string | null,
  requested: string,
  excludeId?: string
): string {
  const base = pageStudioSlug(requested).slice(0, 72)
  const used = new Set(pages
    .filter(page => page.parentId === parentId && page.id !== excludeId)
    .map(page => page.slug))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function setPageStudioHomepage(document: PageStudioDocument, nextHomepageId: string): PageStudioDocument {
  const currentHomepageId = pageStudioHomepageId(document)
  if (currentHomepageId === nextHomepageId) return document
  const nextHomepage = document.pages.find(page => page.id === nextHomepageId)
  if (!nextHomepage) return document

  const pages = document.pages.map(page => ({ ...page }))
  const currentHomepage = pages.find(page => page.id === currentHomepageId)
  const replacement = pages.find(page => page.id === nextHomepageId)
  if (!currentHomepage || !replacement) return document

  currentHomepage.slug = uniquePageStudioSlug(pages, null, currentHomepage.title, currentHomepage.id)
  replacement.parentId = null
  replacement.slug = ''
  replacement.status = 'visible'
  replacement.visibility = 'visible'

  return { ...document, homepageId: replacement.id, pages }
}
