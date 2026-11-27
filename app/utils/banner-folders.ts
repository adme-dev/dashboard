import type { BannerFolder, BannerProject } from '~/types/banner-studio'

function pathFromIndex(byId: Map<string, BannerFolder>, id: string): BannerFolder[] {
  const parts: BannerFolder[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.push(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return parts.reverse()
}

export function indexBannerFolders(folders: BannerFolder[]) {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const children = new Map<string | null, BannerFolder[]>()
  for (const folder of folders) {
    const siblings = children.get(folder.parentId)
    if (siblings) siblings.push(folder)
    else children.set(folder.parentId, [folder])
  }
  function subtree(id: string) {
    const result = new Set<string>()
    const stack = byId.has(id) ? [id] : []
    while (stack.length) {
      const next = stack.pop()!
      if (result.has(next)) continue
      result.add(next)
      for (const child of children.get(next) || []) stack.push(child.id)
    }
    return result
  }
  return { path: (id: string) => pathFromIndex(byId, id), children, subtree }
}

export function bannerFolderPath(folders: BannerFolder[], id: string) {
  return pathFromIndex(new Map(folders.map(folder => [folder.id, folder])), id)
}

/** Source paths are provenance; only an exact, unique path can suggest placement. */
export function bannerFolderForSource(folders: BannerFolder[], sourceFolder: string): string | null {
  const matches = folders.filter(folder => folder.sourcePath?.join('/') === sourceFolder)
  return matches.length === 1 ? matches[0]!.id : null
}

export function bannerProjectFolderId(project: Pick<BannerProject, 'folderId'>, folders: BannerFolder[]): string | null {
  return project.folderId && folders.some(folder => folder.id === project.folderId) ? project.folderId : null
}

export function bannerFolderRows(folders: BannerFolder[], expanded: Set<string>, search = '', index = indexBannerFolders(folders)) {
  const query = search.trim().toLocaleLowerCase()
  const matching = new Set<string>()
  if (query) for (const folder of folders) {
    const path = index.path(folder.id)
    if (path.map(f => f.name).join(' / ').toLocaleLowerCase().includes(query)) {
      for (const ancestor of path) matching.add(ancestor.id)
    }
  }
  const result: { folder: BannerFolder, depth: number, hasChildren: boolean }[] = []
  const seen = new Set<string>()
  function walk(parentId: string | null, depth: number) {
    for (const folder of index.children.get(parentId) || []) {
      if (seen.has(folder.id) || (query && !matching.has(folder.id))) continue
      seen.add(folder.id)
      const hasChildren = index.children.has(folder.id)
      result.push({ folder, depth, hasChildren })
      if (query || expanded.has(folder.id)) walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

export function bannerProjectInFolder(project: Pick<BannerProject, 'folderId'>, id: string, folders: BannerFolder[]): boolean {
  if (id === 'all') return true
  if (id === 'unfiled') return !project.folderId
  if (project.folderId) return bannerFolderPath(folders, project.folderId).some(folder => folder.id === id)
  return false
}

export function bannerFolderUrl(base: string, path: BannerFolder[]) {
  const slugs = path.map(folder => folder.name.normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'folder')
  if (!slugs.length) return `${base}/folders`
  // The last segment carries identity so old links survive moves and renames.
  return `${base}/folders/${slugs.map(encodeURIComponent).join('/')}~${path.at(-1)!.id}`
}

export function bannerFolderRouteId(trail: string | string[] | undefined) {
  const last = Array.isArray(trail) ? trail.at(-1) : trail?.split('/').at(-1)
  if (!last || trail === 'folders') return 'all'
  return last.match(/~([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i)?.[1]?.toLowerCase() || 'missing'
}
