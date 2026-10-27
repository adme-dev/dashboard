import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { useBannerLetteringRepair } = await import('../../app/composables/useBannerLetteringRepair')
const studio = useBannerStudio(), fetcher = vi.fn(), inspect = vi.fn()
const revision = '2026-10-26T00:00:00.000Z', sourceHash = 'a'.repeat(64), outputHash = 'b'.repeat(64)
const response = () => ({
  proposalId: 'repair-1', projectId: 'project-1', sourceRevision: revision, formatKey: 'mrec', layerId: 1,
  region: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 }, pixelRegion: { x: 30, y: 25, w: 240, h: 50 },
  sourceWording: 'OLD WORDS', wording: 'NEW WORDS', sourceAssetId: 'source', sourceImageHash: sourceHash,
  backgroundAsset: { id: 'repaired', url: '/repaired.png', width: 300, height: 250, sha256: outputHash },
  evidence: { provider: 'fixture', model: 'fixture', requestId: 'provider-request-1', cost: null }, warnings: ['Review background'], verification: 'review-required'
})
beforeEach(() => {
  studio.loadProject({ id: 'project-1', updatedAt: revision, canvasData: { mrec: { layers: [
    { id: 1, type: 'image', name: 'Flat source', src: '/source.png', x: 0, y: 0, w: 300, h: 250, zIndex: 1, opacity: 1, animIn: 'none', animOut: 'none' },
    { id: 2, type: 'text', name: 'Protected footer', text: 'Approved wording', copyLocked: true, x: 0, y: 210, w: 200, h: 30, zIndex: 3, opacity: 1, animOut: 'none' }
  ] }, leaderboard: { layers: [] } } } as unknown as BannerProject)
  studio.selectLayer(1)
  studio.state.isDirty = false
  fetcher.mockReset().mockResolvedValue(response())
  inspect.mockReset().mockImplementation(async (url: string) => ({ width: 300, height: 250, sha256: url === '/source.png' ? sourceHash : outputHash }))
})
function setup() {
  const api = useBannerLetteringRepair(fetcher as unknown as typeof $fetch, inspect)
  api.open(studio.selectedLayer.value!)
  api.region.value = { x: 0.1, y: 0.1, w: 0.8, h: 0.2 }
  api.sourceWording.value = 'OLD WORDS'
  api.wording.value = 'NEW WORDS'
  api.regionReviewed.value = true
  return api
}

describe('flat-image lettering repair', () => {
  it('previews full background and native text, applies one atomic undo, and survives save/reopen', async () => {
    const api = setup(), before = studio.getCanvasData()
    expect(api.candidate.value).toBeNull()
    expect(api.previewLayers.value).toBeNull()
    await api.generate()
    expect(api.error.value).toBe('')
    expect(api.candidate.value?.background.src).toBe('/repaired.png')
    expect(api.candidate.value?.text).toMatchObject({ type: 'text', text: 'NEW WORDS', x: 30, y: 25, w: 240, h: 50, fontFamily: 'Arial' })
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
    expect(api.apply()).toBe(false)
    api.reviewed.value = true
    expect(api.apply()).toBe(true)
    const after = studio.getCanvasData()
    expect(after.mrec.layers).toHaveLength(3)
    const { warnings: _warnings, ...proposal } = response()
    const provenance = { ...proposal, version: 1, sourceUrl: '/source.png', backgroundLayerId: 1, textLayerId: 3 }
    expect(after.mrec.layers[0]!.letteringRepair).toEqual(provenance)
    expect(after.mrec.layers[2]!.letteringRepair).toEqual(provenance)
    expect(after.mrec.layers[0]!.letteringRecipe).toBeUndefined()
    expect(after.mrec.layers[2]!.letteringRecipe).toBeUndefined()
    expect(after.mrec.layers[1]).toEqual(before.mrec.layers[1])
    expect(after.leaderboard).toEqual(before.leaderboard)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(after)
    const save = vi.fn().mockResolvedValue({ id: 'project-1', updatedAt: '2026-10-27T00:00:00.000Z' })
    vi.stubGlobal('$fetch', save)
    await studio.saveProject()
    expect(studio.state.isDirty).toBe(false)
    const persisted = JSON.parse(JSON.stringify(save.mock.calls[0]![1].body.canvasData))
    expect(persisted).toEqual(after)
    studio.loadProject({ ...studio.state.project!, canvasData: persisted })
    expect(studio.getCanvasData()).toEqual(after)
    expect(studio.activeLayers.value.at(-1)?.text).toBe('NEW WORDS')
    expect(studio.activeLayers.value[0]!.letteringRepair).toEqual(provenance)
    expect(studio.activeLayers.value.at(-1)!.letteringRepair).toEqual(provenance)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains only bounded repair evidence, without copying opaque provider payloads or nested history', async () => {
    const api = setup(), result = response()
    Object.assign(result, { history: { previousProposal: result.proposalId } })
    Object.assign(result.backgroundAsset, { raw: 'not provenance' })
    Object.assign(result.evidence, { raw: 'not provenance' })
    fetcher.mockResolvedValue(result)
    await api.generate()
    api.reviewed.value = true
    expect(api.apply()).toBe(true)
    const record = studio.activeLayers.value[0]!.letteringRepair!
    expect(record).not.toHaveProperty('history')
    expect(record.backgroundAsset).not.toHaveProperty('raw')
    expect(record.evidence).not.toHaveProperty('raw')
  })
  it.each(['sourceUrl', 'outputUrl', 'proposalId', 'provider', 'requestId'])('rejects oversized %s provenance without truncating evidence', async (field) => {
    const api = setup(), result = response()
    if (field === 'sourceUrl') {
      studio.activeLayers.value[0]!.src = '/' + 's'.repeat(8192)
      inspect.mockResolvedValueOnce({ width: 300, height: 250, sha256: sourceHash })
    }
    if (field === 'outputUrl') result.backgroundAsset.url = '/' + 'o'.repeat(8192)
    if (field === 'proposalId') result.proposalId = 'p'.repeat(257)
    if (field === 'provider') result.evidence.provider = 'p'.repeat(257)
    if (field === 'requestId') result.evidence.requestId = 'r'.repeat(1025)
    fetcher.mockResolvedValue(result)
    await api.generate()
    expect(api.candidate.value).toBeNull()
    expect(api.apply()).toBe(false)
  })
  it.each(['cancel', 'selection', 'project', 'revision', 'edit', 'region', 'source', 'wording', 'instruction', 'review'])('rejects late response after %s', async (action) => {
    const api = setup()
    let resolve!: (value: unknown) => void
    fetcher.mockReturnValue(new Promise((r) => {
      resolve = r
    }))
    const pending = api.generate()
    await Promise.resolve()
    if (action === 'cancel') api.close()
    if (action === 'selection') studio.selectLayer(2)
    if (action === 'project') studio.state.project = { ...studio.state.project! }
    if (action === 'revision') studio.state.project!.updatedAt = 'new revision'
    if (action === 'edit') studio.updateLayer(1, { x: 2 })
    if (action === 'region') api.region.value.x = 0.2
    if (action === 'source') api.sourceWording.value = 'Different source'
    if (action === 'wording') api.wording.value = 'Different wording'
    if (action === 'instruction') api.instruction.value = 'Different instructions'
    if (action === 'review') api.regionReviewed.value = false
    resolve(response())
    await pending
    expect(api.candidate.value).toBeNull()
    expect(api.apply()).toBe(false)
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  })
  it.each([
    { locked: true }, { platformQr: {} }, { copyLocked: true }, { imageCrop: { x: 0, y: 0, w: 1, h: 1 } },
    { isLogo: true }, { skewX: 1 }, { borderRadius: 3 }, { borderWidth: 1 }, { fit: 'invalid' },
    { rotation: 1 }, { opacity: 0.9 }, { mixBlendMode: 'multiply' }, { animIn: 'fadeIn' },
    { animOut: 'fadeOut', outDur: 1 }, { motionPath: [{ x: 0, y: 0 }] }, { keyframes: { x: [{ time: 1, value: 1 }] } }, { isMask: true }, { feedBindings: [{ property: 'src' }] }
  ])('rejects unsupported source %j before API', async (patch) => {
    const api = setup()
    Object.assign(studio.selectedLayer.value!, patch)
    studio.state.isDirty = false
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.candidate.value).toBeNull()
  })
  it('rejects mask targets, protected overlap, protected transcription and unsaved revisions', async () => {
    const api = setup()
    studio.activeLayers.value[1]!.maskTargetIds = [1]
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    delete studio.activeLayers.value[1]!.maskTargetIds
    api.region.value = { x: 0, y: 0.8, w: 0.8, h: 0.2 }
    api.regionReviewed.value = true
    await api.generate()
    expect(api.error.value).toContain('overlaps a protected')
    api.region.value = { x: 0.1, y: 0.1, w: 0.8, h: 0.2 }
    api.sourceWording.value = '$100'
    api.regionReviewed.value = true
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    api.sourceWording.value = 'OLD WORDS'
    api.regionReviewed.value = true
    studio.state.isDirty = true
    await api.generate()
    expect(api.error.value).toContain('Save')
  })
  it.each(['rotation', 'malformed'])('rejects %s protected sibling geometry without requesting repair', async (kind) => {
    const api = setup()
    if (kind === 'rotation') studio.activeLayers.value[1]!.rotation = 45
    else studio.activeLayers.value[1]!.w = Number.NaN
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.error.value).toContain('cannot be safely mapped')
  })
  it.each(['hash', 'dimensions', 'wording', 'region', 'pixelRegion', 'evidence', 'warnings'])('rejects malformed %s response', async (field) => {
    const api = setup(), result = response()
    if (field === 'hash') result.sourceImageHash = 'c'.repeat(64)
    if (field === 'dimensions') result.backgroundAsset.width = 299
    if (field === 'wording') result.wording = 'WRONG'
    if (field === 'region') result.region.x = 0.2
    if (field === 'pixelRegion') result.pixelRegion.w = 100
    if (field === 'evidence') result.evidence.model = ''
    if (field === 'warnings') result.warnings = [42] as unknown as string[]
    fetcher.mockResolvedValue(result)
    await api.generate()
    expect(api.candidate.value).toBeNull()
    expect(api.error.value).toContain('mismatched')
  })
  it('rejects output hash mismatch and incompatible source aspect ratio', async () => {
    const api = setup()
    inspect.mockResolvedValue({ width: 300, height: 250, sha256: sourceHash })
    await api.generate()
    expect(api.error.value).toContain('reviewed asset')
    inspect.mockResolvedValue({ width: 300, height: 300, sha256: sourceHash })
    await api.generate()
    expect(api.error.value).toContain('aspect ratio')
  })
  it('blocks clipped text and rejects late image inspection after cancellation', async () => {
    const api = setup()
    await api.generate()
    api.fontSize.value = 512
    api.reviewed.value = true
    expect(api.textFits.value).toBe(false)
    expect(api.apply()).toBe(false)
    api.discard()
    let resolve!: (value: unknown) => void
    inspect.mockReturnValue(new Promise((r) => {
      resolve = r
    }))
    const pending = api.generate()
    api.close()
    resolve({ width: 300, height: 250, sha256: sourceHash })
    await pending
    expect(api.candidate.value).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('resets review on font changes and original comparison; changing source blocks reviewed apply', async () => {
    const api = setup()
    await api.generate()
    api.reviewed.value = true
    api.fontSize.value = 18
    expect(api.reviewed.value).toBe(false)
    api.reviewed.value = true
    api.showOriginal.value = true
    expect(api.previewLayers.value).toBeNull()
    expect(api.apply()).toBe(false)
    api.showOriginal.value = false
    api.reviewed.value = true
    studio.activeLayers.value[0]!.src = '/changed.png'
    expect(api.candidate.value).toBeNull()
    expect(api.apply()).toBe(false)
  })
})
