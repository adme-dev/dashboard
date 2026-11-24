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
async function settle() {
  await Promise.resolve()
  await nextTick()
  await nextTick()
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

it('fetches just the selected layout on visibility and reuses it when the tile re-enters the viewport', async () => {
  let resolve!: (value: unknown) => void
  fetchPreview.mockReturnValue(new Promise((done) => {
    resolve = done
  }))
  const host = mount({ projectId: 'project', previewKey: 'fb_sq' })
  expect(fetchPreview).not.toHaveBeenCalled()
  intersect([{ isIntersecting: true }])
  await nextTick()
  expect(fetchPreview).toHaveBeenCalledExactlyOnceWith('/api/agency/banner-studio/projects/project', { query: { previewFormat: 'fb_sq' } })
  intersect([{ isIntersecting: false }])
  await nextTick()
  intersect([{ isIntersecting: true }])
  await nextTick()
  expect(fetchPreview).toHaveBeenCalledTimes(1)
  resolve({ canvasData: canvas(2) })
  await settle()
  expect(host.querySelector('[data-layer-id]')?.getAttribute('data-layer-id')).toBe('2')
  intersect([{ isIntersecting: false }])
  await nextTick()
  expect(host.querySelector('[data-native-preview]')).toBeNull()
  intersect([{ isIntersecting: true }])
  await nextTick()
  expect(host.querySelector('[data-native-preview]')).not.toBeNull()
  expect(fetchPreview).toHaveBeenCalledTimes(1)
})

it('refreshes saved revisions and ignores an older preview response arriving afterwards', async () => {
  let resolveOld!: (value: unknown) => void
  fetchPreview.mockReturnValueOnce(new Promise((done) => {
    resolveOld = done
  }))
    .mockResolvedValueOnce({ canvasData: canvas(3) })
  const props = reactive({ projectId: 'project', previewKey: 'fb_sq', previewVersion: 'before' })
  const host = mount(props)
  intersect([{ isIntersecting: true }])
  await nextTick()
  props.previewVersion = 'after'
  await settle()
  expect(fetchPreview).toHaveBeenCalledTimes(2)
  expect(host.querySelector('[data-layer-id]')?.getAttribute('data-layer-id')).toBe('3')
  resolveOld({ canvasData: canvas(1) })
  await settle()
  expect(host.querySelector('[data-layer-id]')?.getAttribute('data-layer-id')).toBe('3')
})

it('keeps an image fallback when a preview request fails', async () => {
  fetchPreview.mockRejectedValue(new Error('unavailable'))
  const host = mount({ projectId: 'project', previewKey: 'fb_sq', thumbnailUrl: '/fallback.png' })
  intersect([{ isIntersecting: true }])
  await settle()
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/fallback.png')
  expect(host.querySelector('[data-native-preview]')).toBeNull()
})
