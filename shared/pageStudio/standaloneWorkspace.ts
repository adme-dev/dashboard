import type { PageStudioDocument } from './document'
import type { PageStudioSavedPages } from './savedPages'

export interface StandaloneSiteWorkspace {
  canEdit: boolean
  document: {
    id: string
    site: { id: string, clientId: string, name: string, route: string }
    imported?: { checkpointId: string, routes: string[], readOnly: true }
    studio?: PageStudioSavedPages
    document: PageStudioDocument | null
    pageLimit: number
    revision: number
    updatedAt: string | null
  }
  assets: Array<{ id: string, altText: string | null, mediaType: string, publicationStatus: string, previewAvailable: boolean, fileName: string | null, size: number | null }>
}

/** Imported websites are view-only until the editor supports their saved format. */
export function standaloneWorkspaceCanLaunch(state: StandaloneSiteWorkspace | null | undefined, editorOrigin: string | null | undefined): boolean {
  return Boolean(state?.canEdit && editorOrigin && !state.document.imported)
}

/** Read-only page summary for saved formats; never creates a checkpoint. */
export function standaloneWorkspacePages(state: StandaloneSiteWorkspace['document']): PageStudioSavedPages['pages'] {
  if (state.imported) return state.imported.routes.map(route => ({
    id: route, title: route, route, visibility: 'public', seo: {}, forms: []
  }))
  if (state.studio) return state.studio.pages
  const pages = state.document?.pages ?? []
  const byId = new Map(pages.map(page => [page.id, page]))
  return pages.map((page) => {
    const segments: string[] = []
    const visited = new Set<string>()
    let current: typeof page | undefined = page
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      if (current.slug) segments.unshift(current.slug)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return {
      id: page.id,
      title: page.title,
      route: `/${segments.join('/')}`,
      visibility: page.status === 'archived' || page.status === 'draft' ? page.status : page.visibility === 'hidden' ? 'hidden' : 'public',
      seo: { title: page.seoTitle, description: page.seoDescription },
      forms: []
    }
  })
}
