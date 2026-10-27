import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
const { useBannerLettering }
  = await import('../../app/composables/useBannerLettering')
const studio = useBannerStudio(),
  fetcher = vi.fn()
const revision = '2026-10-26T00:00:00.000Z'
const response = () => ({
  proposalId: 'proposal',
  projectId: 'project-1',
  sourceRevision: revision,
  formatKey: 'mrec',
  layerId: 1,
  mode: 'native',
  wording: 'GRAND OPENING',
  nativeStyle: { fontFamily: 'Impact', fontSize: 32 },
  evidence: { provider: 'test', model: 'test', cost: null },
  warnings: ['Check fit'],
  verification: 'review-required'
})
beforeEach(() => {
  studio.loadProject({
    id: 'project-1',
    updatedAt: revision,
    canvasData: {
      mrec: {
        layers: [
          {
            id: 1,
            type: 'text',
            name: 'Headline',
            text: 'RELOCATION SALE',
            x: 10,
            y: 20,
            w: 200,
            h: 60,
            zIndex: 1,
            opacity: 1,
            textStroke: '2px blue'
          },
          {
            id: 2,
            type: 'rect',
            name: 'Protected artwork',
            x: 0,
            y: 0,
            w: 300,
            h: 250,
            zIndex: 0,
            opacity: 1
          }
        ]
      }
    }
  } as BannerProject)
  studio.selectLayer(1)
  studio.state.isDirty = false
  fetcher.mockReset()
})
function setup() {
  const api = useBannerLettering(fetcher as unknown as typeof $fetch)
  api.discard()
  api.wording.value = 'GRAND OPENING'
  api.mode.value = 'native'
  return api
}
describe('Lettering proposal safety', () => {
  it('previews without mutation, applies one target with persisted recipe and restores complete undo/redo state', async () => {
    const api = setup(),
      original = studio.getCanvasData()
    fetcher.mockResolvedValue(response())
    await api.generate()
    expect(api.error.value).toBe('')
    expect(api.candidate.value?.text).toBe('GRAND OPENING')
    expect(studio.getCanvasData()).toEqual(original)
    expect(api.apply()).toBe(false)
    api.reviewed.value = true
    expect(api.apply()).toBe(true)
    expect(studio.activeLayers.value[1]).toEqual(original.mrec.layers[1])
    expect(studio.activeLayers.value[0]).toMatchObject({
      text: 'GRAND OPENING',
      textStroke: '2px blue',
      letteringRecipe: { wording: 'GRAND OPENING', mode: 'native' }
    })
    const applied = studio.getCanvasData()
    studio.undo()
    expect(studio.getCanvasData()).toEqual(original)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(applied)
    api.dispose()
  })
  it.each([
    'cancel',
    'selection',
    'edit',
    'project',
    'wording',
    'instruction',
    'mode'
  ])('rejects late response after %s', async (action) => {
    const api = setup()
    let resolve!: (v: unknown) => void
    fetcher.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    const pending = api.generate()
    if (action === 'cancel') api.discard()
    if (action === 'wording') api.wording.value = 'Changed'
    if (action === 'instruction') api.instruction.value = 'Changed'
    if (action === 'mode') api.mode.value = 'raster'
    if (action === 'selection') studio.selectLayer(2)
    if (action === 'edit') studio.updateLayer(1, { x: 11 })
    if (action === 'project')
      studio.state.project = { ...studio.state.project! }
    resolve(response())
    await pending
    expect(api.candidate.value).toBeNull()
    expect(api.apply()).toBe(false)
    api.dispose()
  })
  it('rejects arbitrary patch fields, incorrect wording and incomplete proposals', async () => {
    const api = setup()
    fetcher.mockResolvedValue({ ...response(), wording: 'WRONG' })
    await api.generate()
    expect(api.candidate.value).toBeNull()
    fetcher.mockResolvedValue({
      ...response(),
      nativeStyle: { fontFamily: 'Impact', fontSize: 32, x: 9999, src: 'bad' }
    })
    await api.generate()
    expect(api.candidate.value?.x).toBe(10)
    expect(api.candidate.value?.src).toBeUndefined()
    api.discard()
    api.dispose()
  })
  it('supports a first-use isolated raster with reviewed source wording and owned candidate', async () => {
    class DecodedImage {
      naturalWidth = 30
      naturalHeight = 10
      crossOrigin = ''
      src = ''
      async decode() {}
    }
    vi.stubGlobal('Image', DecodedImage)
    studio.updateLayer(1, {
      type: 'image',
      text: undefined,
      src: '/owned-source.png'
    })
    studio.state.isDirty = false
    const inspect = vi.fn().mockResolvedValue(undefined)
    const api = useBannerLettering(fetcher as unknown as typeof $fetch, inspect)
    api.discard()
    api.sourceWording.value = 'RELOCATION SALE'
    api.wording.value = 'GRAND OPENING'
    api.mode.value = 'raster'
    api.isolationConfirmed.value = true
    fetcher.mockResolvedValue({
      ...response(),
      mode: 'raster',
      asset: {
        id: 'owned-result',
        url: '/owned-result.png',
        width: 30,
        height: 10
      }
    })
    await api.generate()
    expect(api.error.value).toBe('')
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1].body).toMatchObject({
      sourceWording: 'RELOCATION SALE',
      isolationConfirmed: true
    })
    expect(api.candidate.value?.fit).toBe('contain')
    expect(api.candidate.value?.letteringRecipe).toMatchObject({
      sourceWording: 'RELOCATION SALE',
      reference: '/owned-source.png'
    })
    api.discard()
    api.dispose()
  })
  it('clears latent image text effects when recreating native lettering', async () => {
    class DecodedImage {
      naturalWidth = 30
      naturalHeight = 10
      crossOrigin = ''
      src = ''
      async decode() {}
    }
    vi.stubGlobal('Image', DecodedImage)
    studio.updateLayer(1, {
      type: 'image',
      text: undefined,
      src: '/owned.png',
      textTransform: 'uppercase',
      textTexture: '/old.png',
      lineBoxFontSize: 900,
      bgColor: '#ff0000'
    })
    studio.state.isDirty = false
    const api = useBannerLettering(
      fetcher as unknown as typeof $fetch,
      vi.fn().mockResolvedValue(undefined)
    )
    api.discard()
    api.sourceWording.value = 'RELOCATION SALE'
    api.wording.value = 'GRAND OPENING'
    api.mode.value = 'native'
    api.isolationConfirmed.value = true
    fetcher.mockResolvedValue(response())
    await api.generate()
    expect(api.candidate.value).toMatchObject({
      type: 'text',
      textTransform: 'none',
      text: 'GRAND OPENING'
    })
    for (const key of [
      'textTexture',
      'textDepth',
      'textShadow',
      'textStroke',
      'bgColor',
      'lineBoxFontSize'
    ])
      expect((api.candidate.value as unknown as Record<string, unknown>)?.[key]).toBeUndefined()
    api.discard()
    api.dispose()
  })
  it('preserves approved copy and refuses unsaved source revisions', async () => {
    const api = setup()
    studio.updateLayer(1, { copyLocked: true })
    studio.state.isDirty = false
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    studio.updateLayer(1, { copyLocked: false })
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    api.dispose()
  })
})

describe('Raster decode boundary', () => {
  it('rejects opaque, empty and clipped outputs while allowing an isolated transparent cutout', async () => {
    const { validateLetteringImage }
      = await import('../../app/composables/useBannerLettering')
    class DecodedImage {
      naturalWidth = 3
      naturalHeight = 3
      crossOrigin = ''
      src = ''
      async decode() {}
    }
    vi.stubGlobal('Image', DecodedImage)
    let pixels = new Uint8ClampedArray(36).fill(255)
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: pixels })
        })
      })
    })
    await expect(validateLetteringImage('/owned.png', 3, 3)).rejects.toThrow(
      'transparent background'
    )
    pixels = new Uint8ClampedArray(36)
    await expect(validateLetteringImage('/owned.png', 3, 3)).rejects.toThrow(
      'empty'
    )
    pixels[3] = 255
    pixels[19] = 255
    await expect(validateLetteringImage('/owned.png', 3, 3)).rejects.toThrow(
      'clipped'
    )
    pixels[3] = 0
    await expect(
      validateLetteringImage('/owned.png', 3, 3)
    ).resolves.toBeUndefined()
    await expect(validateLetteringImage('/owned.png', 4, 3)).rejects.toThrow(
      'dimensions differ'
    )
  })
})
