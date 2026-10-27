import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
const toast = vi.fn()
vi.stubGlobal('useToast', () => ({ add: toast }))
const fetcher = vi.fn()
vi.stubGlobal('$fetch', fetcher)
const images = new Map<string, { width: number, height: number } | null>()
class TestImage {
  onload?: () => void
  onerror?: () => void
  naturalWidth = 0
  naturalHeight = 0
  set src(url: string) {
    queueMicrotask(() => {
      const dims = images.get(url)
      if (!dims) return this.onerror?.()
      this.naturalWidth = dims.width
      this.naturalHeight = dims.height
      this.onload?.()
    })
  }
}
vi.stubGlobal('Image', TestImage)
const { useDecompose } = await import('../../app/composables/useDecompose')
const studio = useBannerStudio()
const project = () => ({ id: 'p1', name: 'Artwork', canvasData: { mrec: { layers: [
  { id: 1, type: 'image', name: 'Source', src: '/source.png', x: 17, y: 29, w: 180, h: 90, rotation: 13, fit: 'cover', focalX: 20, focalY: 70, imageCrop: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }, zIndex: 2, opacity: 1, animIn: 'none', animOut: 'none', startTime: 0, endTime: 5 },
  { id: 2, type: 'text', name: 'Overlay', text: 'Approved', x: 0, y: 0, w: 100, h: 40, zIndex: 3, opacity: 1 }
] }, skyscraper: { layers: [] } } } as BannerProject)
const response = () => ({ layers: [
  { name: 'Layer 1', url: '/a.png', r2Key: 'a', width: 1000, height: 500 },
  { name: 'Layer 2', url: '/b.png', r2Key: 'b', width: 1000, height: 500 }
], pptxUrl: null, zipUrl: null })
beforeEach(() => {
  studio.loadProject(project())
  fetcher.mockReset().mockResolvedValue(response())
  toast.mockReset()
  images.clear()
  for (const url of ['/source.png', '/a.png', '/b.png']) images.set(url, { width: 1000, height: 500 })
})

describe('Qwen raster layer import', () => {
  it.each([
    { opacity: 0.5 }, { mixBlendMode: 'multiply' as const }, { visualFilter: 'blur(2px)' as const },
    { animIn: 'fadeIn' as const }, { animOut: 'fadeOut' as const },
    { keyframes: { opacity: [{ time: 0, value: 0, easing: 'none' }, { time: 1, value: 1, easing: 'none' }] } }
  ])('rejects aggregate compositing effects before inference: %j', async (props) => {
    studio.updateLayer(1, props)
    const original = studio.getCanvasData()
    expect(await useDecompose().decomposeFromUrl('/source.png', 'Source', 1, 'layer')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(studio.getCanvasData()).toEqual(original)
    expect(toast.mock.calls.at(-1)?.[0].description).toMatch(/opacity|blend|filter|animation/i)
  })

  it('registers output layers to the source, preserves overlays and restores the whole edit in one undo', async () => {
    const original = studio.getCanvasData()
    expect(await useDecompose().decomposeFromUrl('/source.png', 'Source', 1, 'layer')).toBe(true)
    const layers = studio.activeLayers.value
    expect(layers.find(l => l.id === 1)?.hidden).toBe(true)
    const outputs = layers.filter(l => l.src === '/a.png' || l.src === '/b.png')
    expect(outputs).toHaveLength(2)
    for (const layer of outputs) expect(layer).toMatchObject({ type: 'image', x: 17, y: 29, w: 180, h: 90, rotation: 13, fit: 'cover', focalX: 20, focalY: 70, imageCrop: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 } })
    expect(outputs[0]!.zIndex).toBeLessThan(outputs[1]!.zIndex)
    expect(layers.find(l => l.id === 2)!.zIndex).toBeGreaterThan(outputs[1]!.zIndex)
    expect(toast.mock.calls.at(-1)?.[0].description).toMatch(/raster.*text.*pixels/i)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(original)
    studio.redo()
    expect(studio.activeLayers.value.filter(l => l.src === '/a.png' || l.src === '/b.png')).toHaveLength(2)
  })

  it('fits an asset frame into the artboard without changing its aspect or staggering layers', async () => {
    expect(await useDecompose().decomposeFromUrl('/source.png', 'Source', 'asset1', 'asset')).toBe(true)
    const outputs = studio.activeLayers.value.filter(l => l.src === '/a.png' || l.src === '/b.png')
    expect(outputs.map(l => ({ x: l.x, y: l.y, w: l.w, h: l.h }))).toEqual([
      { x: 0, y: 50, w: 300, h: 150 }, { x: 0, y: 50, w: 300, h: 150 }
    ])
    expect(studio.activeLayers.value.find(l => l.id === 1)?.hidden).not.toBe(true)
  })

  it.each(['missing', 'different-frame', 'partial'])('leaves the entire canvas unchanged for %s output', async (failure) => {
    if (failure === 'missing') images.set('/b.png', null)
    if (failure === 'different-frame') images.set('/b.png', { width: 600, height: 500 })
    if (failure === 'partial') fetcher.mockResolvedValue({ ...response(), status: 'partial' })
    const original = studio.getCanvasData()
    expect(await useDecompose().decomposeFromUrl('/source.png', 'Source', 1, 'layer')).toBe(false)
    expect(studio.getCanvasData()).toEqual(original)
  })

  it.each(['project', 'artboard', 'away-back', 'source', 'edit-undo', 'deleted'])('rejects responses after %s changes', async (change) => {
    let resolve!: (result: unknown) => void
    fetcher.mockReturnValue(new Promise((r) => {
      resolve = r
    }))
    const pending = useDecompose().decomposeFromUrl('/source.png', 'Source', 1, 'layer')
    // The source preload may finish before the API is requested.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    if (change === 'project') studio.loadProject(project())
    if (change === 'artboard' || change === 'away-back') studio.state.activeKey = 'skyscraper'
    if (change === 'away-back') studio.state.activeKey = 'mrec'
    if (change === 'source' || change === 'edit-undo') studio.updateLayer(1, { x: 50 })
    if (change === 'edit-undo') studio.undo()
    if (change === 'deleted') studio.removeLayer(1)
    const changed = studio.getCanvasData()
    resolve(response())
    expect(await pending).toBe(false)
    expect(studio.getCanvasData()).toEqual(changed)
  })
})

it('blocks decomposition of a protected artboard before loading pixels or sending a request', async () => {
  studio.state.sets.mrec!.dissectionSource = { jobId: '11111111-1111-4111-8111-111111111111', sourceSha256: 'a'.repeat(64) }
  expect(await useDecompose().decomposeFromUrl('/source.png', 'Source', 1, 'layer')).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
  expect(toast.mock.calls.at(-1)?.[0].title).toBe('Protected artwork')
})
