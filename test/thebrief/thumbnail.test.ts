// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableIframePageLoading":true,"enableJavaScriptEvaluation":false}}
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type App } from 'vue'
import Thumbnail from '../../app/components/banner/Thumbnail.client.vue'
import type { ArtboardState } from '../../app/types/banner-studio'

const fonts = ref<{ family: string, url: string, format: string, weight: number }[]>([])
const fetchFonts = vi.fn(async () => {
  fonts.value = [{ family: 'Example Brand', url: 'https://media.example.com/brand.ttf', format: 'truetype', weight: 300 }]
})
let app: App | undefined
let host: HTMLDivElement

beforeEach(() => {
  fonts.value = []
  fetchFonts.mockClear()
  for (const [name, value] of Object.entries({ computed, ref, watch, onMounted, onBeforeUnmount })) vi.stubGlobal(name, value)
  vi.stubGlobal('useBannerFonts', () => ({ fetchCustomFonts: fetchFonts, getExportCustomFonts: () => fonts.value }))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(180)
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  app?.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('renders custom imported dimensions with managed fonts inside a script-disabled thumbnail', async () => {
  const artboard: ArtboardState = { bgColor: '#fff', layers: [{ id: 1, name: 'Headline', type: 'text', text: 'Imported headline', fontFamily: 'Example Brand', fontWeight: 300, x: 0, y: 0, w: 1080, h: 100, opacity: 1, zIndex: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5 }] }
  const canvasData = ref({ custom_1080x1080: artboard } as Record<string, ArtboardState>)
  app = createApp({ render: () => h(Thumbnail, { canvasData: canvasData.value }) })
  app.component('UIcon', { render: () => h('span') })
  app.mount(host)
  await nextTick()
  await nextTick()
  const frame = host.querySelector('iframe')!
  expect(frame).not.toBeNull()
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(frame.width).toBe('1080')
  expect(frame.height).toBe('1080')
  expect(frame.srcdoc).toContain('Imported headline')
  expect(frame.srcdoc).toContain('src: url(\'https://media.example.com/brand.ttf\')')
  expect(frame.srcdoc).not.toContain('<script')
  expect(fetchFonts).toHaveBeenCalledOnce()
  expect(frame.style.transform).toBe('translate(-50%, -50%) scale(0.16666666666666666)')

  canvasData.value = { custom_1200x600: artboard }
  await nextTick()
  await nextTick()
  expect(frame.width).toBe('1200')
  expect(frame.style.transform).toBe('translate(-50%, -50%) scale(0.26666666666666666)')
})
