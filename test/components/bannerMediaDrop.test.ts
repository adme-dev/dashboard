// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, ref } from 'vue'
import Canvas from '../../app/components/banner/Canvas.client.vue'
import { BANNER_MEDIA_DRAG_TYPE, startBannerMediaDrag, type BannerMediaDragSource } from '../../app/utils/banner-media-drag'
import type { BannerAsset } from '../../app/types/banner-studio'

let app: ReturnType<typeof createApp> | undefined
const asset = { id: 'car', name: 'Vehicle', url: '/car.png', mimeType: 'image/png' } as BannerAsset
afterEach(() => { app?.unmount(); app = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })

async function setup(fetcher = vi.fn(async () => ({ asset }))) {
  const state = reactive({ project: { id: 'project-a' }, setKeys: ['mrec'], activeKey: 'mrec', layoutView: 'single', wsScale: 0.5, activeTool: 'select' })
  const addMediaToLayouts = vi.fn(() => 1)
  const toast = vi.fn()
  vi.stubGlobal('useBannerStudio', () => ({ state, currentSlide: ref({ id: 'slide-a' }), addMediaToLayouts, zoomToFitFormat: vi.fn(), setLayoutView: vi.fn(), setActiveArtboard: vi.fn(), selectLayer: vi.fn(), addBrandGuideButton: vi.fn() }))
  vi.stubGlobal('useBannerProjectBrand', () => ({ kit: ref(null) }))
  vi.stubGlobal('useBannerRealtime', () => ({ sendCursorMove: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('$fetch', fetcher)
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Canvas)
  for (const name of ['BannerArtboard', 'BannerCollaborationCursors', 'BannerCommentOverlay', 'UButton']) app.component(name, { template: '<div />' })
  app.mount(host)
  await nextTick()
  const target = host.querySelector('[data-layout-key="mrec"] > div') as HTMLElement
  function drop(source: BannerMediaDragSource) {
    const data = new Map<string, string>()
    const transfer = { types: [BANNER_MEDIA_DRAG_TYPE], setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || '' }
    startBannerMediaDrag({ dataTransfer: transfer } as unknown as DragEvent, source, 'project-a')
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperties(event, { dataTransfer: { value: transfer }, clientX: { value: 50 }, clientY: { value: 40 } })
    target.dispatchEvent(event)
  }
  return { state, addMediaToLayouts, toast, drop, fetcher }
}

it('drops library media at zoom-adjusted coordinates without a remote import', async () => {
  const test = await setup()
  test.drop({ kind: 'library', asset })
  expect(test.addMediaToLayouts).toHaveBeenCalledWith(asset, 'mrec', { x: 100, y: 80 }, false)
  expect(test.fetcher).not.toHaveBeenCalled()
})

it('imports a MotorStack selection before placing it, and refuses a stale project', async () => {
  let resolve!: (value: { asset: BannerAsset }) => void
  const test = await setup(vi.fn(() => new Promise(done => { resolve = done })))
  test.drop({ kind: 'motorstack', brandId: 'subaru', model: 'BRZ', assetId: 'a'.repeat(64) })
  expect(test.addMediaToLayouts).not.toHaveBeenCalled()
  test.state.project = { id: 'project-b' }
  resolve({ asset })
  await nextTick()
  expect(test.addMediaToLayouts).not.toHaveBeenCalled()
  expect(test.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Design selection changed' }))
})

it('does not insert after the editor unmounts during an import', async () => {
  let resolve!: (value: { asset: BannerAsset }) => void
  const test = await setup(vi.fn(() => new Promise(done => { resolve = done })))
  test.drop({ kind: 'motorstack', brandId: 'subaru', assetId: 'b'.repeat(64) })
  app!.unmount(); app = undefined
  resolve({ asset })
  await nextTick()
  expect(test.addMediaToLayouts).not.toHaveBeenCalled()
})
