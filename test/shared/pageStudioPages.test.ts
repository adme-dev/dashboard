import { describe, expect, it } from 'vitest'

import { PageStudioDocumentSchema, type PageStudioDocument } from '../../shared/pageStudio/document'
import {
  flattenPageStudioPages,
  pageStudioDescendantIds,
  pageStudioPageRoute,
  setPageStudioHomepage,
  uniquePageStudioSlug
} from '../../shared/pageStudio/pages'

const HOME = '10000000-0000-4000-8000-000000000001'
const SERVICES = '10000000-0000-4000-8000-000000000002'
const SEO = '10000000-0000-4000-8000-000000000003'

function document(): PageStudioDocument {
  return {
    schemaVersion: 1,
    homepageId: HOME,
    redirects: [],
    pages: [
      { id: HOME, parentId: null, title: 'Home', slug: '', visibility: 'visible', status: 'visible', headerMode: 'inherit', footerMode: 'inherit', seoTitle: 'Home', seoDescription: '', blocks: [] },
      { id: SERVICES, parentId: null, title: 'Services', slug: 'services', visibility: 'visible', status: 'visible', headerMode: 'inherit', footerMode: 'inherit', seoTitle: 'Services', seoDescription: '', blocks: [] },
      { id: SEO, parentId: SERVICES, title: 'SEO', slug: 'seo', visibility: 'hidden', status: 'draft', headerMode: 'inherit', footerMode: 'inherit', seoTitle: 'SEO', seoDescription: '', blocks: [] }
    ]
  }
}

describe('Page Studio page management', () => {
  it('builds a hierarchical page tree with canonical routes', () => {
    const value = document()
    expect(flattenPageStudioPages(value).map(item => [item.page.id, item.depth, item.route])).toEqual([
      [HOME, 0, '/'],
      [SERVICES, 0, '/services'],
      [SEO, 1, '/services/seo']
    ])
    expect(pageStudioPageRoute(value.pages, SEO)).toBe('/services/seo')
    expect([...pageStudioDescendantIds(value.pages, SERVICES)]).toEqual([SEO])
  })

  it('selects a new homepage without leaving two root routes', () => {
    const updated = setPageStudioHomepage(document(), SERVICES)
    expect(updated.homepageId).toBe(SERVICES)
    expect(updated.pages.find(page => page.id === SERVICES)).toMatchObject({ parentId: null, slug: '', status: 'visible' })
    expect(updated.pages.find(page => page.id === HOME)?.slug).toBe('home')
    expect(PageStudioDocumentSchema.safeParse(updated).success).toBe(true)
  })

  it('generates unique sibling slugs', () => {
    expect(uniquePageStudioSlug(document().pages, null, 'Services')).toBe('services-2')
    expect(uniquePageStudioSlug(document().pages, SERVICES, 'Search & SEO')).toBe('search-seo')
  })

  it('rejects redirects that replace a live page route', () => {
    const value = document()
    value.redirects = [{ id: '10000000-0000-4000-8000-000000000010', fromPath: '/services', toPath: '/', statusCode: 301 }]
    expect(PageStudioDocumentSchema.safeParse(value).success).toBe(false)
  })
})
