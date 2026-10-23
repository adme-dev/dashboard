import { computed, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
const state = reactive<{ project: { id: string, clientId: string } | null }>({ project: { id: 'project-one', clientId: 'client-one' } })
const addLayer = vi.fn()
const fetchMock = vi.fn()
vi.stubGlobal('useBannerStudio', () => ({ state, addLayer, activeFormat: ref({ w: 1080, h: 1350 }) }))
vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
vi.stubGlobal('$fetch', fetchMock)
const { useAiImageGenerate } = await import('../../app/composables/useAiImageGenerate')

describe('Banner Studio generated image review', () => {
  beforeEach(() => {
    state.project = { id: 'project-one', clientId: 'client-one' }
    fetchMock.mockReset()
    addLayer.mockReset()
    useAiImageGenerate().openGenerate()
  })
  it('does not add an image whose quality review failed', async () => {
    const ai = useAiImageGenerate()
    ai.generatePrompt.value = 'A showroom background'
    fetchMock.mockResolvedValue({ url: 'https://assets.example/image.png', status: 'review_blocked' })
    await ai.submitGenerate()
    ai.applyGenerate()
    expect(addLayer).not.toHaveBeenCalled()
    expect(ai.generateError.value).toContain('quality review')
  })
  it('adds a reviewed background at canvas dimensions with the explicit supported model', async () => {
    const ai = useAiImageGenerate()
    ai.generatePrompt.value = 'A showroom background'
    fetchMock.mockResolvedValue({ url: 'https://assets.example/image.png', status: 'ready' })
    await ai.submitGenerate()
    ai.applyGenerate(true)
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.objectContaining({ modelId: 'aigateway/recraft-offer-card', subjectType: 'non_vehicle' }) }))
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ type: 'bg', w: 1080, h: 1350, fit: 'cover' }))
  })
  it('allows a reviewed image on a new unsaved canvas', async () => {
    state.project = null
    const ai = useAiImageGenerate()
    ai.openGenerate()
    ai.generatePrompt.value = 'A showroom background'
    fetchMock.mockResolvedValue({ url: 'https://assets.example/image.png', status: 'ready' })
    await ai.submitGenerate()
    ai.applyGenerate(true)
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ type: 'bg', src: 'https://assets.example/image.png' }))
  })
  it('discards late responses after changing projects', async () => {
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const ai = useAiImageGenerate()
    ai.generatePrompt.value = 'A showroom background'
    const request = ai.submitGenerate()
    state.project = { id: 'project-two', clientId: 'client-two' }
    finish({ url: 'https://assets.example/image.png', status: 'ready' })
    await request
    ai.applyGenerate()
    expect(addLayer).not.toHaveBeenCalled()
    expect(ai.generatePreviewUrl.value).toBeNull()
  })
  it('discards late responses after reassigning the same project to another client', async () => {
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const ai = useAiImageGenerate()
    ai.generatePrompt.value = 'A showroom background'
    const request = ai.submitGenerate()
    state.project!.clientId = 'client-two'
    finish({ url: 'https://assets.example/image.png', status: 'ready' })
    await request
    ai.applyGenerate()
    expect(addLayer).not.toHaveBeenCalled()
    expect(ai.generatePreviewUrl.value).toBeNull()
  })
  it('does not apply an existing preview after changing its client', async () => {
    const ai = useAiImageGenerate()
    ai.generatePrompt.value = 'A showroom background'
    fetchMock.mockResolvedValue({ url: 'https://assets.example/image.png', status: 'ready' })
    await ai.submitGenerate()
    state.project!.clientId = 'client-two'
    ai.applyGenerate()
    expect(addLayer).not.toHaveBeenCalled()
  })
})
