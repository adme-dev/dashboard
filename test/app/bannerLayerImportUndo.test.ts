import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'
import type { BannerLayerImportResult } from '../../shared/bannerLayerImport'
import { buildImportedLayers } from '../../app/utils/banner-layer-import'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
vi.stubGlobal('$fetch', vi.fn())
const sendLayerAdd = vi.fn()
vi.stubGlobal('useBannerRealtime', () => ({ sendLayerAdd, sendLayerUpdate: vi.fn(), sendLayerRemove: vi.fn(), isLayerLockedByOther: () => false }))
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

const existing = { id: 1, type: 'text', name: 'Existing copy', text: 'Keep me', x: 0, y: 0, w: 100, h: 20, zIndex: 7, opacity: 1, animIn: 'none', animInDur: 0.6, startTime: 0, endTime: 5 }
const project = () => ({ id: 'one', name: 'one', canvasData: { mrec: { layers: [existing] }, billboard: { layers: [] } } }) as unknown as BannerProject

const imported: BannerLayerImportResult = {
  width: 600,
  height: 500,
  base: { assetId: 'base', url: 'https://app.test/base.png', width: 600, height: 500 },
  layers: [
    { assetId: 'car', url: 'https://app.test/car.png', name: 'Red car', kind: 'product', z: 1, bbox: { x: 200, y: 200, width: 300, height: 200 }, width: 300, height: 200, text: null },
    { assetId: 'head', url: 'https://app.test/head.png', name: 'Headline', kind: 'text', z: 2, bbox: { x: 40, y: 40, width: 400, height: 72 }, width: 400, height: 72,
      text: { text: 'SUMMER SALE', lines: 1, fontGuess: null, fontCategory: 'sans', fontWeight: 800, italic: false, uppercase: true, align: 'left', color: '#ffcc00', letterSpacing: 'normal' } },
    { assetId: 'logo', url: 'https://app.test/logo.png', name: 'Dealer logo', kind: 'logo', z: 3, bbox: { x: 480, y: 20, width: 100, height: 40 }, width: 100, height: 40, text: null }
  ],
  skipped: [],
  costUsd: 0.12,
  latencyMs: 50000
}

function importIntoActiveCanvas() {
  const studio = useBannerStudio()
  const built = buildImportedLayers(imported, { w: 300, h: 250 }, { jobId: 'job-1', groupId: 'group-1', groupName: 'Imported: promo.jpg' })
  return { studio, added: studio.addLayerSet(built.layers) }
}

describe('adding an imported picture to the canvas', () => {
  beforeEach(() => {
    sendLayerAdd.mockReset()
    useBannerStudio().loadProject(project())
  })

  it('adds every layer above what is already there, in order', () => {
    const { studio, added } = importIntoActiveCanvas()
    expect(studio.state.activeKey).toBe('mrec')
    const layers = studio.state.sets.mrec.layers
    expect(layers).toHaveLength(6)
    expect(added.map(layer => [layer.name, layer.zIndex])).toEqual([
      ['Background', 8], ['Red car', 9], ['Headline (original picture)', 10], ['Headline', 11], ['Dealer logo', 12]
    ])
    // The existing layer keeps its place underneath.
    expect(layers[0]).toMatchObject({ name: 'Existing copy', zIndex: 7 })
    expect(new Set(added.map(layer => layer.id)).size).toBe(5)
  })

  it('places each element at its box, scaled from source pixels to the canvas', () => {
    const { added } = importIntoActiveCanvas()
    // 600 x 500 onto 300 x 250 is exactly half size.
    expect(added[0]).toMatchObject({ x: 0, y: 0, w: 300, h: 250 })
    expect(added[1]).toMatchObject({ x: 100, y: 100, w: 150, h: 100 })
    expect(added[4]).toMatchObject({ x: 240, y: 10, w: 50, h: 20, isLogo: true })
  })

  it('leaves every imported layer editable: move, resize, hide and delete', () => {
    const { studio, added } = importIntoActiveCanvas()
    const car = added[1]!
    studio.updateLayer(car.id, { x: 20, y: 30, w: 80, h: 60, hidden: true })
    expect(studio.state.sets.mrec.layers.find(layer => layer.id === car.id)).toMatchObject({ x: 20, y: 30, w: 80, h: 60, hidden: true })
    studio.removeLayer(car.id)
    expect(studio.state.sets.mrec.layers.some(layer => layer.id === car.id)).toBe(false)
    expect(studio.state.sets.mrec.layers).toHaveLength(5)
  })

  it('keeps live text selected and its original lettering hidden', () => {
    const { studio, added } = importIntoActiveCanvas()
    expect(added[2]).toMatchObject({ type: 'image', hidden: true })
    expect(added[3]).toMatchObject({ type: 'text', text: 'SUMMER SALE' })
    // The top visible layer is selected, ready to edit.
    expect(studio.state.selectedLayerId).toBe(added[4]!.id)
  })

  it('groups the import and tells collaborators about every layer', () => {
    const { added } = importIntoActiveCanvas()
    expect(added.every(layer => layer.timelineGroup?.id === 'group-1')).toBe(true)
    expect(sendLayerAdd).toHaveBeenCalledTimes(5)
    expect(sendLayerAdd).toHaveBeenCalledWith(added[0], 'mrec')
  })

  it('removes the whole import with one undo and brings it back with one redo', () => {
    const { studio, added } = importIntoActiveCanvas()
    expect(studio.state.isDirty).toBe(true)

    studio.undo()
    expect(studio.state.sets.mrec.layers.map(layer => layer.name)).toEqual(['Existing copy'])
    expect(studio.canUndo.value).toBe(false)

    studio.redo()
    expect(studio.state.sets.mrec.layers.map(layer => layer.id)).toEqual([1, ...added.map(layer => layer.id)])
  })

  it('undoes only the import, not the edit before it', () => {
    const studio = useBannerStudio()
    studio.updateLayer(1, { text: 'Edited first' })
    importIntoActiveCanvas()
    studio.undo()
    expect(studio.state.sets.mrec.layers).toHaveLength(1)
    expect(studio.state.sets.mrec.layers[0]!.text).toBe('Edited first')
    expect(studio.canUndo.value).toBe(true)
  })

  it('adds to a named canvas and leaves the others alone', () => {
    const studio = useBannerStudio()
    const built = buildImportedLayers(imported, { w: 970, h: 250 }, { jobId: 'job-1', groupId: 'group-1', groupName: 'Imported: promo.jpg' })
    studio.addLayerSet(built.layers, 'billboard')
    expect(studio.state.sets.billboard.layers).toHaveLength(5)
    expect(studio.state.sets.mrec.layers).toHaveLength(1)
    expect(studio.state.activeKey).toBe('billboard')
  })

  it('refuses a canvas that is not in the design', () => {
    expect(() => useBannerStudio().addLayerSet([{ type: 'image', name: 'x' }], 'not-a-canvas')).toThrow(/available canvas/)
  })
})
