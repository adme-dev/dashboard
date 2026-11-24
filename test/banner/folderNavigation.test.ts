import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { bannerFolderPath, bannerFolderRouteId, bannerFolderUrl } from '../../app/utils/banner-folders'

const root = { id: '21901eae-5ee3-4213-a75e-4388a4eb95ab', parentId: null, name: 'FNQ / Brighton', position: 0 }
const child = { id: 'e5ebe864-d465-4ed6-816d-2c89dd18c7fb', parentId: root.id, name: 'Été 2026', position: 1 }

describe.each(['agency', 'creative'])('%s folder navigation', surface => {
  it('round-trips deep links, browser history and existing editor routes', async () => {
    const base = `/${surface}/banner-studio`
    const page = readFileSync(`app/pages${base}/index.vue`, 'utf8')
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { name: 'library', path: page.match(/path: '([^']+)'/)![1]!, component: {} },
      { name: 'editor', path: `${base}/:id`, component: {} }
    ] })
    const path = bannerFolderUrl(base, [root, child])
    expect(path).toBe(`${base}/folders/fnq-brighton/ete-2026~${child.id}`)
    for (const target of [base, `${base}/folders`, path]) {
      await router.push(target)
      expect(router.currentRoute.value.name).toBe('library')
      expect(router.currentRoute.value.path).toBe(target)
    }
    const id = bannerFolderRouteId(router.currentRoute.value.params.trail)
    expect(id).toBe(child.id)
    const moved = { ...child, name: 'Autumn', parentId: null }
    const canonical = bannerFolderUrl(base, bannerFolderPath([root, moved], id))
    await router.replace(canonical)
    expect(router.currentRoute.value.path).toBe(`${base}/folders/autumn~${child.id}`)
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`${base}/folders`))
    expect(bannerFolderRouteId(router.currentRoute.value.params.trail)).toBe('all')
    router.forward()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(canonical))
    expect(router.resolve(`${base}/new`).name).toBe('editor')
    expect(router.resolve(`${base}/${child.id}`).name).toBe('editor')
    expect(bannerFolderRouteId('folders/unknown')).toBe('missing')
  })
})
