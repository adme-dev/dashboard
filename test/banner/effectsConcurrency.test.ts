// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createApp, computed, reactive, nextTick, type App } from 'vue'
import type { Layer } from '../../app/types/banner-studio'
import { useBannerEffects } from '../../app/composables/useBannerEffects'

vi.mock('../../app/utils/banner-artwork', async original => ({ ...await original<typeof import('../../app/utils/banner-artwork')>(), measureArtwork: vi.fn().mockResolvedValue({ width: 1024, height: 1024, crop: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } }) }))

const projectId = '11111111-1111-4111-8111-111111111111'
let app: App
let api: ReturnType<typeof useBannerEffects>
let state: { project: { id: string, clientId: string }, activeKey: string, layer: Layer, isDirty: boolean, sets?: Record<string, { layers: Layer[] }>, selectedLayerId?: number }
let fetcher: ReturnType<typeof vi.fn>
let add: ReturnType<typeof vi.fn>
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(async () => {
  state = reactive({ project: { id: projectId, clientId: 'client-1' }, activeKey: 'fb_sq', isDirty: false, layer: { id: 1, name: 'Headline', type: 'text', text: 'EOFY', color: '#fff', x: 0, y: 0, w: 300, h: 80, startTime: 0, endTime: 5 } as Layer })
  add = vi.fn()
  vi.stubGlobal('useBannerStudio', () => ({ state, activeFormat: computed(() => ({ w: 1000, h: 1000 })), selectedLayer: computed(() => state.layer), updateLayer: (id: number, values: Partial<Layer>) => {
    const layer = state.layer.id === id ? state.layer : state.sets?.[state.activeKey]?.layers.find(item => item.id === id)
    if (layer) Object.assign(layer, values)
  }, addLayer: add, withCanvasUndo: (change: () => void) => change() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  fetcher = vi.fn().mockResolvedValue({ presets: [] })
  vi.stubGlobal('$fetch', fetcher)
  app = createApp({ setup() {
    api = useBannerEffects()
    return () => null
  } })
  app.mount(document.createElement('div'))
  await nextTick()
  api.recipe.value.artworkMode = 'redraw'
})
afterEach(() => {
  app.unmount()
  vi.unstubAllGlobals()
})
describe('Effect request ownership', () => {
  it('converts older raster effects back onto the editable source and respects source locks', async () => {
    const source = { ...state.layer, hidden: true, locked: true, fontFamily: 'Imported Client Font' }
    state.sets = { fb_sq: { layers: [source] } }
    state.layer = { ...source, id: 8, type: 'image', locked: false, src: '/old.png', effectOrigin: { sourceLayerId: 1, text: 'EOFY', recipe: { style: {}, prompt: 'Chrome', modelId: 'aigateway/recraft-offer-card', referenceIds: [], referenceProjectId: null } } } as Layer
    expect(api.recipe.value.artworkMode).toBe('keep-font')
    expect(api.canGenerate.value).toBe(false)
    state.sets.fb_sq!.layers[0]!.locked = false
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/material.png', status: 'ready' })
    await api.generate()
    await api.applyArtwork()
    expect(state.layer.hidden).toBe(true)
    expect(state.sets.fb_sq!.layers[0]).toMatchObject({ id: 1, type: 'text', hidden: false, textTexture: 'https://example.com/material.png', fontFamily: 'Imported Client Font', w: 300, h: 80 })
    expect(state.selectedLayerId).toBe(1)
    expect(add).not.toHaveBeenCalled()
  })
  it('keeps native text, typography, geometry and animation when applying a reviewed texture', async () => {
    Object.assign(state.layer, { fontFamily: 'Imported Client Font', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textDepth: { size: 8, angle: 45, color: '#543515', bevel: 1, lightAngle: -45, shadow: 6, shadowOpacity: 0.4 } })
    const before = { ...state.layer }
    api.recipe.value.artworkMode = 'keep-font'
    api.recipe.value.prompt = 'Chrome material'
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/material.png', status: 'ready' })
    await api.generate()
    expect(fetcher.mock.lastCall?.[1].body.effect.mode).toBe('keep-font')
    await api.applyArtwork()
    expect(add).not.toHaveBeenCalled()
    expect(state.layer).toMatchObject({ ...before, hidden: false, textTexture: 'https://example.com/material.png' })
    state.layer.text = 'New offer'
    expect(state.layer.textTexture).toBe('https://example.com/material.png')
    api.removeTexture()
    expect(state.layer.textTexture).toBeUndefined()
    expect(state.layer.text).toBe('New offer')
  })
  it('restores dimensional settings with the original style', () => {
    api.recipe.value.style = { color: '#ff0000', textDepth: { size: 8, angle: 45, color: '#543515', bevel: 1, lightAngle: -45, shadow: 6, shadowOpacity: 0.4 } }
    api.applyStyle()
    expect(state.layer.textDepth?.size).toBe(8)
    api.restoreOriginal()
    expect(state.layer.textDepth).toBeUndefined()
    expect(state.layer.type).toBe('text')
  })
  it('keeps an unavailable preview and retries review without regenerating artwork', async () => {
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/held.png', assetId: projectId, status: 'review_blocked', review: { status: 'unavailable', message: 'Retry review.' } })
    api.recipe.value.prompt = 'Chrome text'
    await api.generate()
    expect(api.canRetryReview.value).toBe(true)
    expect(api.error.value).toBe('')
    fetcher.mockResolvedValueOnce({ assetId: projectId, status: 'ready', review: { status: 'passed', message: 'Passed' } })
    await api.retryReview()
    expect(fetcher.mock.lastCall?.[1].body.reviewAssetId).toBe(projectId)
    expect(api.preview.value?.url).toBe('https://example.com/held.png')
    await api.applyArtwork()
    expect(add).toHaveBeenCalledOnce()
  })
  it('discards a late review when the selected text changes', async () => {
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/held.png', assetId: projectId, status: 'review_blocked', review: { status: 'unavailable', message: 'Retry' } })
    api.recipe.value.prompt = 'Chrome text'
    await api.generate()
    const request = deferred()
    fetcher.mockReturnValueOnce(request.promise)
    const pending = api.retryReview()
    state.layer.text = 'Different text'
    request.resolve({ assetId: projectId, status: 'ready' })
    await pending
    await api.applyArtwork()
    expect(add).not.toHaveBeenCalled()
    expect(api.preview.value).toBeNull()
  })
  it('preserves an existing rgba colour when applying a filter-only recipe', () => {
    state.layer.color = 'rgba(255, 255, 255, 0.7)'
    api.recipe.value.style = { visualFilter: 'blur(2px)' }
    api.applyStyle()
    expect(state.layer.color).toBe('rgba(255, 255, 255, 0.7)')
    expect(state.layer.visualFilter).toBe('blur(2px)')
    api.restoreOriginal()
    expect(state.layer.color).toBe('rgba(255, 255, 255, 0.7)')
    expect(state.layer.visualFilter).toBeUndefined()
  })
  it('replaces the complete effect so omitted filters do not remain active', () => {
    state.layer.visualFilter = 'blur(2px)'
    state.layer.textShadow = '0px 0px 8px #ffffff'
    api.recipe.value.style = { color: '#ff0000' }
    api.applyStyle()
    expect(state.layer.visualFilter).toBeUndefined()
    expect(state.layer.textShadow).toBeUndefined()
    api.restoreOriginal()
    expect(state.layer.visualFilter).toBe('blur(2px)')
    expect(state.layer.textShadow).toBe('0px 0px 8px #ffffff')
  })
  it('restores exact legacy style and reactive restore state', () => {
    api.recipe.value.style = { color: '#ff0000', textShadow: '0px 0px 8px #ffffff' }
    api.applyStyle()
    expect(api.canRestore.value).toBe(true)
    api.restoreOriginal()
    expect(state.layer.color).toBe('#fff')
    expect(state.layer.textShadow).toBeUndefined()
    expect(api.canRestore.value).toBe(false)
  })
  it('discards late artwork when the brief changes', async () => {
    const request = deferred()
    fetcher.mockReturnValueOnce(request.promise)
    api.recipe.value.prompt = 'Chrome text'
    const pending = api.generate()
    api.recipe.value.prompt = 'Flame text'
    request.resolve({ url: 'https://example.com/old.png', status: 'ready' })
    await pending
    await api.applyArtwork()
    expect(api.preview.value).toBeNull()
    expect(add).not.toHaveBeenCalled()
  })
  it('invalidates previews synchronously on selection or client changes', async () => {
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/ready.png', status: 'ready' })
    api.recipe.value.prompt = 'Chrome text'
    await api.generate()
    state.layer = { ...state.layer, id: 2, text: 'Another headline' }
    state.project.clientId = 'client-2'
    await api.applyArtwork()
    expect(add).not.toHaveBeenCalled()
    expect(api.preview.value).toBeNull()
  })
  it('holds failed quality reviews without changing original text', async () => {
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/held.png', status: 'review_blocked' })
    api.recipe.value.prompt = 'Chrome text'
    await api.generate()
    await api.applyArtwork()
    expect(add).not.toHaveBeenCalled()
    expect(state.layer.text).toBe('EOFY')
    expect(api.error.value).toContain('quality review')
  })
  it('adds reviewed artwork with provenance and preserves the original', async () => {
    fetcher.mockResolvedValueOnce({ url: 'https://example.com/ready.png', status: 'ready' })
    api.recipe.value.prompt = 'Chrome text'
    await api.generate()
    await api.applyArtwork()
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ type: 'image', fit: 'fill', effectOrigin: expect.objectContaining({ sourceLayerId: 1, text: 'EOFY' }) }))
    expect(state.layer.text).toBe('EOFY')
  })
  it('requires saved text before generation', () => {
    api.recipe.value.prompt = 'Chrome text'
    state.isDirty = true
    expect(api.canGenerate.value).toBe(false)
  })
  it('keeps AI refinement available on an existing artwork layer and replaces that layer', async () => {
    const source = { ...state.layer }
    const savedRecipe = { style: {}, prompt: 'Chrome', modelId: 'aigateway/recraft-offer-card', referenceIds: [], referenceProjectId: null }
    Object.assign(state, { sets: { fb_sq: { layers: [source] } } })
    state.layer = { ...source, id: 8, type: 'image', src: '/old.png', effectOrigin: { sourceLayerId: 1, text: 'EOFY', recipe: savedRecipe } } as Layer
    api.recipe.value.prompt = 'Gold instead'
    api.recipe.value.artworkMode = 'redraw'
    expect(api.canGenerate.value).toBe(true)
    fetcher.mockResolvedValueOnce({ url: '/new.png', status: 'ready' })
    await api.generate()
    expect(fetcher.mock.lastCall?.[1].body.effect.layerId).toBe(1)
    await api.applyArtwork()
    expect(add).not.toHaveBeenCalled()
    expect(state.layer.src).toBe('/new.png')
    expect(state.layer.effectOrigin?.recipe.prompt).toBe('Gold instead')
  })
})
