import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { bannerDimensions, bannerLibraryFacets, filterBannerProjects, sortLibrary } from '../../app/utils/banner-library'

const source = readFileSync('app/pages/agency/banner-studio/index.vue', 'utf8')
const projection = source.slice(source.indexOf('const allProjects ='), source.indexOf('watch([searchQuery'))
const actions = source.slice(source.indexOf('function newProject()'), source.indexOf('const hasActiveFilters'))
function library(rows: any[]) {
  const env = {
    computed, ref, bannerDimensions, bannerLibraryFacets, filterBannerProjects, sortLibrary,
    projectsData: ref(rows), clientFilter: ref('all'), tagFilter: ref('all'), statusFilter: ref('all'),
    searchQuery: ref(''), folderFilter: ref('all'), sort: ref('modified'), page: ref(1), pageSize: 36,
    router: { push: vi.fn() }, apiFetch: vi.fn().mockResolvedValue({}), duplicateIdempotencyKeys: new Map(),
    crypto: { randomUUID: () => 'synthetic-key' }, toast: { add: vi.fn() }, refresh: vi.fn(),
    isAmbiguousApiFailure: () => false, deleteTarget: ref(null), showDeleteModal: ref(false),
  }
  const compiled = transpileModule(`${projection}\n${actions}\nreturn { libraryItems, clients, dropdownItems, editProject, duplicateProject, doDelete };`, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
  }).outputText
  return { ...env, ...new Function(...Object.keys(env), compiled)(...Object.values(env)) }
}
const restricted = { id: 'restricted-project', name: 'Restricted artwork', status: 'restricted', restricted: true }
const ordinary = { id: 'ordinary-project', name: 'Ordinary', status: 'draft', canvasData: {}, tags: [], clientId: null }
describe('restricted project library rows', () => {
  it('renders the minimal server projection without reading omitted content or offering navigation', () => {
    const page = library([restricted, ordinary])
    expect(page.libraryItems.value).toHaveLength(2)
    const item = page.libraryItems.value.find((row: any) => row.id === restricted.id)
    expect(item).toMatchObject({ name: 'Restricted artwork', client: 'Restricted', category: 'restricted' })
    expect(item.to).toBeUndefined()
    expect(item.canvasData).toBeUndefined()
    expect(item.thumbnailUrl).toBeUndefined()
    expect(page.clients.value).toEqual([{ id: 'unassigned', name: 'Unassigned', count: 1 }])
  })
  it('offers only deletion for a restricted row and blocks direct edit/duplicate actions', async () => {
    const page = library([restricted])
    const actions = page.dropdownItems(restricted).flat()
    expect(actions.map((action: any) => action.label)).toEqual(['Delete'])
    page.editProject(restricted)
    await page.duplicateProject(restricted)
    expect(page.router.push).not.toHaveBeenCalled()
    expect(page.apiFetch).not.toHaveBeenCalled()
    actions[0].onSelect()
    expect(page.showDeleteModal.value).toBe(true)
    await page.doDelete()
    expect(page.apiFetch).toHaveBeenCalledWith(`/api/agency/banner-studio/projects/${restricted.id}`, { method: 'DELETE' })
  })
  it('preserves ordinary project navigation and actions', () => {
    const page = library([ordinary])
    expect(page.libraryItems.value[0].to).toBe(`/agency/banner-studio/${ordinary.id}`)
    expect(page.dropdownItems(ordinary).flat().map((action: any) => action.label)).toEqual(['Edit', 'Duplicate', 'Delete'])
    page.editProject(ordinary)
    expect(page.router.push).toHaveBeenCalledWith(`/agency/banner-studio/${ordinary.id}`)
  })
})
