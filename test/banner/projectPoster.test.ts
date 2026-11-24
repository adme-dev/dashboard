// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, onBeforeUnmount, ref, type App } from 'vue'
import ProjectPoster from '../../app/components/banner/ProjectPoster.vue'

const apps = new Set<App>()
let observers: ((entries: { isIntersecting: boolean }[]) => void)[]
beforeEach(() => {
  observers = []
  for (const [key, value] of Object.entries({ ref, onBeforeUnmount })) vi.stubGlobal(key, value)
  vi.stubGlobal('useIntersectionObserver', (_el, cb) => observers.push(cb))
})
afterEach(() => {
  for (const app of apps) app.unmount()
  apps.clear()
  vi.unstubAllGlobals()
})

function mount(id: string, hasLayouts?: boolean, thumbnailUrl?: string) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ProjectPoster, { projectId: id, hasLayouts, version: 'v1', thumbnailUrl }) })
  app.component('UIcon', { render: () => h('span') })
  apps.add(app)
  app.mount(host)
  const intersect = observers.at(-1)!
  return {
    host,
    visible: (isIntersecting: boolean) => intersect([{ isIntersecting }]),
    unmount: () => {
      app.unmount()
      apps.delete(app)
    }
  }
}

it('requests a still JPEG only near the viewport and retains it when scrolling back', async () => {
  const tile = mount('p', true)
  expect(tile.host.querySelector('img')).toBeNull()
  tile.visible(true)
  await nextTick()
  const img = tile.host.querySelector('img')!
  expect(img.getAttribute('src')).toMatch(/^\/api\/agency\/banner-studio\/projects\/p\/image\?size=gallery&/)
  img.dispatchEvent(new Event('load'))
  tile.visible(false)
  tile.visible(true)
  await nextTick()
  expect(tile.host.querySelector('img')).toBe(img)
  expect(tile.host.querySelector('iframe,video,canvas')).toBeNull()
})

it('limits simultaneous requests, skips scrolled-away tiles and releases slots on error and unmount', async () => {
  const tiles = Array.from({ length: 7 }, (_, i) => mount(String(i), true))
  for (const t of tiles) t.visible(true)
  await nextTick()
  const started = () => tiles.map(t => !!t.host.querySelector('img'))
  expect(started()).toEqual([true, true, true, true, false, false, false])
  tiles[4]!.visible(false)
  tiles[0]!.host.querySelector('img')!.dispatchEvent(new Event('error'))
  tiles[1]!.unmount()
  await nextTick()
  expect(started()).toEqual([false, false, true, true, false, true, true])
})

it('falls back once to a supplied image and leaves a placeholder for missing or invalid artwork', async () => {
  const tile = mount('p', true, '/imported.jpg')
  tile.visible(true)
  await nextTick()
  tile.host.querySelector('img')!.dispatchEvent(new Event('error'))
  await nextTick()
  expect(tile.host.querySelector('img')!.getAttribute('src')).toBe('/imported.jpg')
  tile.host.querySelector('img')!.dispatchEvent(new Event('error'))
  tile.visible(false)
  tile.visible(true)
  await nextTick()
  expect(tile.host.querySelector('img,iframe')).toBeNull()
  const empty = mount('empty', undefined, 'javascript:alert(1)')
  empty.visible(true)
  await nextTick()
  expect(empty.host.querySelector('img,iframe')).toBeNull()
})
