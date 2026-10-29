// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch, type App } from 'vue'
import LibraryThumbnail from '../../app/components/banner/LibraryThumbnail.vue'

let app: App | undefined
afterEach(() => { app?.unmount(); vi.unstubAllGlobals() })

it('lazily shows the saved canvas instead of a stale imported image and handles broken image-only previews', async () => {
  for (const [key, value] of Object.entries({ computed, ref, watch })) vi.stubGlobal(key, value)
  let intersect!: (entries: { isIntersecting: boolean }[]) => void
  const stop = vi.fn()
  vi.stubGlobal('useIntersectionObserver', (_target, callback) => {
    intersect = callback
    return { stop }
  })
  const props = reactive<any>({ thumbnailUrl: '/old.png', canvasData: { mrec: { layers: [{ id: 1 }] } } })
  const host = document.createElement('div')
  app = createApp({ render: () => h(LibraryThumbnail, props) })
  app.config.globalProperties.safeMediaUrl = (url: string) => url
  app.component('UIcon', { render: () => h('span', 'No preview') })
  app.component('BannerThumbnail', { render: () => h('div', { 'data-native-preview': true }, 'Saved canvas') })
  app.mount(host)
  expect(host.querySelector('img')).toBeNull()
  expect(host.textContent).toBe('No preview')
  intersect([{ isIntersecting: true }])
  await nextTick()
  expect(host.querySelector('[data-native-preview]')).not.toBeNull()
  expect(stop).toHaveBeenCalledOnce()

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
