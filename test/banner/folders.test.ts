import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bannerFolderPath, bannerFolderRows, bannerProjectInFolder } from '../../app/utils/banner-folders'
import type { BannerFolder, BannerProject } from '../../app/types/banner-studio'

const folders: BannerFolder[] = [
  { id: 'root', name: 'Social Media Templates', parentId: null, position: 0, sourcePath: ['Social Media Templates'] },
  { id: 'archive', name: 'Archived Templates', parentId: 'root', position: 1, sourcePath: ['Social Media Templates', 'Archived Templates'] },
  { id: 'old', name: 'Updates', parentId: 'archive', position: 2, sourcePath: ['Social Media Templates', 'Archived Templates', 'Updates'] },
  { id: 'new', name: 'Updates', parentId: 'root', position: 3, sourcePath: ['Social Media Templates', 'Updates'] },
  { id: 'empty', name: 'Empty folder', parentId: null, position: 4, sourcePath: ['Empty folder'] }
]
const project = (folderId?: string, tags: string[] = []) => ({ folderId, tags }) as BannerProject

describe('persistent Banner Studio folders', () => {
  it('keeps empty folders and expands only the selected branch', () => {
    expect(bannerFolderRows(folders, new Set()).map(r => r.folder.id)).toEqual(['root', 'empty'])
    expect(bannerFolderRows(folders, new Set(['root'])).map(r => [r.folder.id, r.depth])).toEqual([['root', 0], ['archive', 1], ['new', 1], ['empty', 0]])
  })
  it('finds nested folders and retains their ancestors', () => {
    expect(bannerFolderRows(folders, new Set(), 'updates').map(r => r.folder.id)).toEqual(['root', 'archive', 'old', 'new'])
    expect(bannerFolderPath(folders, 'old').map(r => r.id)).toEqual(['root', 'archive', 'old'])
  })
  it('keeps same-name folders distinct and includes descendants in parent browsing', () => {
    expect(bannerProjectInFolder(project('old'), 'root', folders)).toBe(true)
    expect(bannerProjectInFolder(project('old'), 'new', folders)).toBe(false)
    expect(bannerProjectInFolder(project(undefined, ['source-folder:Social Media Templates/Archived Templates/Updates']), 'archive', folders)).toBe(true)
    expect(bannerProjectInFolder(project(undefined, ['source-folder:Social Media Templates/Archived Templates/Updates']), 'new', folders)).toBe(false)
    expect(bannerProjectInFolder(project(), 'all', folders)).toBe(true)
  })
  it('bounds traversal if a corrupt record creates a cycle', () => {
    expect(bannerFolderPath([{ ...folders[0]!, parentId: 'archive' }, folders[1]!], 'archive')).toHaveLength(2)
  })
  it('captures exactly the complete source tree and preserves slashes within folder names', () => {
    const inventory = JSON.parse(readFileSync('docs/migrations/thebrief-folders-20261030.json', 'utf8'))
    expect(inventory.folders).toHaveLength(101)
    expect(inventory.folders.filter(f => f.path.length === 1)).toHaveLength(88)
    expect(inventory.folders.filter(f => f.path.length > 1)).toHaveLength(13)
    expect(inventory.folders.find(f => f.name === 'FNQ / Brighton Motor Group').path).toEqual(['FNQ / Brighton Motor Group'])
    expect(new Set(inventory.folders.map(f => JSON.stringify(f.path))).size).toBe(101)
  })
})
