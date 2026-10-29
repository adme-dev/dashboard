import type { BannerFolder, BannerProject } from '~/types/banner-studio'

export function bannerFolderPath(folders: BannerFolder[], id: string): BannerFolder[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const path: BannerFolder[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

export function bannerFolderRows(folders: BannerFolder[], expanded: Set<string>, search = '') {
  const query = search.trim().toLocaleLowerCase()
  const matching = new Set<string>()
  if (query) for (const folder of folders) {
    if (bannerFolderPath(folders, folder.id).map(f => f.name).join(' / ').toLocaleLowerCase().includes(query)) {
      for (const ancestor of bannerFolderPath(folders, folder.id)) matching.add(ancestor.id)
    }
  }
  const result: { folder: BannerFolder, depth: number, hasChildren: boolean }[] = []
  const seen = new Set<string>()
  function walk(parentId: string | null, depth: number) {
    for (const folder of folders.filter(f => f.parentId === parentId)) {
      if (seen.has(folder.id) || (query && !matching.has(folder.id))) continue
      seen.add(folder.id)
      const hasChildren = folders.some(child => child.parentId === folder.id)
      result.push({ folder, depth, hasChildren })
      if (query || expanded.has(folder.id)) walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

export function bannerProjectInFolder(project: BannerProject, id: string, folders: BannerFolder[]): boolean {
  if (id === 'all') return true
  if (id === 'unfiled') return !project.folderId && !(project.tags || []).some(tag => tag.startsWith('source-folder:'))
  if (project.folderId) return bannerFolderPath(folders, project.folderId).some(folder => folder.id === id)
  // Newly imported legacy packages retain their exact source path until assigned a folder.
  const matches = folders.filter(folder => folder.sourcePath && project.tags?.includes(`source-folder:${folder.sourcePath.join('/')}`))
  return matches.length === 1 && bannerFolderPath(folders, matches[0]!.id).some(parent => parent.id === id)
}
