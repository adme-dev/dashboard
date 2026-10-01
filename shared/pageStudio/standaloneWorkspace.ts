import type { PageStudioDocument } from './document'
import type { PageStudioSavedPages } from './savedPages'

export interface StandaloneSiteWorkspace {
  canEdit: boolean
  document: {
    id: string
    site: { id: string, clientId: string, name: string, route: string }
    studio?: PageStudioSavedPages
    document: PageStudioDocument | null
    pageLimit: number
    revision: number
    updatedAt: string | null
  }
  assets: Array<{ id: string, altText: string | null, mediaType: string, publicationStatus: string, fileName: string | null, size: number | null }>
}

/** Read-only page summary for both saved formats; never creates a checkpoint. */
export function standaloneWorkspacePages(state: StandaloneSiteWorkspace['document']): PageStudioSavedPages['pages'] {
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
