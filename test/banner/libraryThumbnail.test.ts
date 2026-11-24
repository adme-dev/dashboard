// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch, type App } from 'vue'
import type { ArtboardState } from '../../app/types/banner-studio'
import LibraryThumbnail from '../../app/components/banner/LibraryThumbnail.vue'

let app: App | undefined
let intersect: (entries: { isIntersecting: boolean }[]) => void
const fetchPreview = vi.fn()
const canvas = (id: number) => ({ fb_sq: { layers: [{ id }] } }) as Record<string, ArtboardState>

beforeEach(() => {
  fetchPreview.mockReset()
  for (const [key, value] of Object.entries({ computed, ref, watch, $fetch: fetchPreview })) vi.stubGlobal(key, value)
  vi.stubGlobal('useIntersectionObserver', (_target, callback) => {
    intersect = callback
    return { stop: vi.fn() }
  })
})
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})

function mount(props: InstanceType<typeof LibraryThumbnail>['$props']) {
  const host = document.createElement('div')
  app = createApp({ render: () => h(LibraryThumbnail, props) })
  app.config.globalProperties.safeMediaUrl = (url: string) => url
  app.component('UIcon', { render: () => h('span', 'No preview') })
  app.component('LazyBannerThumbnail', {
    props: ['canvasData'],
    setup: p => () => h('div', { 'data-native-preview': true, 'data-layer-id': p.canvasData.fb_sq.layers[0].id }, 'Saved canvas')
  })
  app.mount(host)
  return host
}
it('shows saved artwork near the viewport, releases offscreen previews and handles broken imported images', async () => {
  const props = reactive({ thumbnailUrl: '/old.png', canvasData: canvas(1) })
  const host = mount(props)
  expect(host.querySelector('img')).toBeNull()
  expect(host.textContent).toBe('No preview')
  intersect([{ isIntersecting: true }])
  await nextTick()
  expect(host.querySelector('[data-native-preview]')).not.toBeNull()
  intersect([{ isIntersecting: false }])
  await nextTick()
  expect(host.querySelector('[data-native-preview]')).toBeNull()
  expect(fetchPreview).not.toHaveBeenCalled()

  props.canvasData = {}
  await nextTick()
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/old.png')
  host.querySelector('img')!.dispatchEvent(new Event('error'))
  await nextTick()
  expect(host.querySelector('img')).toBeNull()
  props.thumbnailUrl = '/replacement.png'
  await nextTick()
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/replacement.png')
})
