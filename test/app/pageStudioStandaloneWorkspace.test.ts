import { describe, expect, it } from 'vitest'
import { standaloneWorkspacePages, type StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'

const state: StandaloneSiteWorkspace['document'] = { id: 'site', site: { id: 'site', clientId: 'client', name: 'Website', route: 'website' }, document: null, pageLimit: 100, revision: 1, updatedAt: null }
describe('standalone saved page presentation', () => {
  it('preserves checkpoint pages and forms without creating a writable document', () => {
    const pages = [{ id: 'home', title: 'Home', route: '/', visibility: 'public' as const, seo: {}, forms: [{ id: 'contact' }] }]
    expect(standaloneWorkspacePages({ ...state, studio: { checkpointId: 'saved', pages } })).toBe(pages)
  })
  it('shows legacy saved pages with nested routes, SEO and draft status', () => {
    const page = { id: 'home', parentId: null, title: 'Home', slug: '', visibility: 'visible' as const, seoTitle: 'Our website', seoDescription: 'Welcome', blocks: [] }
    const document = { schemaVersion: 1 as const, pages: [page, { ...page, id: 'services', slug: 'services', title: 'Services', parentId: 'home' }, { ...page, id: 'weddings', slug: 'weddings', title: 'Weddings', parentId: 'services', status: 'draft' as const }] }
    expect(standaloneWorkspacePages({ ...state, document })).toEqual([
      { id: 'home', title: 'Home', route: '/', visibility: 'public', seo: { title: 'Our website', description: 'Welcome' }, forms: [] },
      { id: 'services', title: 'Services', route: '/services', visibility: 'public', seo: { title: 'Our website', description: 'Welcome' }, forms: [] },
      { id: 'weddings', title: 'Weddings', route: '/services/weddings', visibility: 'draft', seo: { title: 'Our website', description: 'Welcome' }, forms: [] }
    ])
    expect(document.pages[2]?.slug).toBe('weddings')
  })
})
