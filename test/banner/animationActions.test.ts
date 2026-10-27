import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const remoteLocked = new Set<number>()
vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: (id: number) => remoteLocked.has(id) }))
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const studio = useBannerStudio()
vi.stubGlobal('useBannerStudio', useBannerStudio)
const { useBannerInspector } = await import('../../app/composables/useBannerInspector')
const heading = (extra: Partial<Layer> = {}) => ({ id: 1, name: 'Lifestyle heading', type: 'text', text: 'A new chapter starts here', x: 20, y: 40, w: 500, h: 70, opacity: 1, zIndex: 1, startTime: 0, endTime: 4, ...extra }) as Layer
function load(layers = [heading()]) {
  studio.loadProject({ id: 'animation-proof', name: 'Lifestyle artwork', canvasData: { custom_1000x1000: { layers } } } as BannerProject)
}

beforeEach(() => {
  remoteLocked.clear()
  load()
})

describe('native animation actions', () => {
  it.each([{ type: 'bg' }, { type: 'audio' }, { isMask: true }])('preserves existing presence and animation editing for %j', (extra) => {
    load([heading(extra as Partial<Layer>)])
    studio.updateLayer(1, { startTime: 1, endTime: 5 })
    expect(studio.activeLayers.value[0]).toMatchObject({ startTime: 1, endTime: 5 })
    studio.undo()
    expect(studio.activeLayers.value[0]).toMatchObject({ startTime: 0, endTime: 4 })
  })

  it('preserves legacy motion path editing for masks and masked targets without exposing new menu actions', () => {
    const path = [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    load([heading({ isMask: true, motionPath: path, maskTargetIds: [2] }), heading({ id: 2, motionPath: path })])
    for (const id of [1, 2]) {
      expect(studio.captureAnimationTarget(studio.activeLayers.value.find(layer => layer.id === id)!)).toBeNull()
      studio.addMotionPathTween(id)
      expect(studio.activeLayers.value.find(layer => layer.id === id)!.motionPathTweens).toHaveLength(2)
      studio.updatePathPoint(id, 1, 90, 20)
      expect(studio.activeLayers.value.find(layer => layer.id === id)!.motionPath![1]).toEqual({ x: 90, y: 20 })
    }
  })

  it('rejects existing animation control writes when a local/remote lock arrives after selection', () => {
    studio.addMotionPathTween(1)
    const layer = studio.activeLayers.value[0]!
    for (const lock of [() => {
      layer.locked = true
    }, () => {
      layer.locked = false
      remoteLocked.add(1)
    }]) {
      lock()
      const before = studio.getCanvasData()
      studio.updatePathPoint(1, 1, 500, 500)
      studio.updateMotionPathTween(1, 0, { endTime: 3 })
      studio.updateLayer(1, { animIn: 'slideL', startTime: 1 })
      expect(studio.getCanvasData()).toEqual(before)
    }
  })

  it.each([
    { x: [{ time: 0, value: 10 }], y: [{ time: 0, value: 20 }] },
    { x: [{ time: 0, value: 10 }, { time: 2, value: 10 }], y: [{ time: 1, value: 20 }] }
  ])('adds nonzero path without rewriting mismatched or identical position keyframes', (keyframes) => {
    load([heading({ keyframes })])
    studio.addMotionPathTween(1)
    expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
    expect(studio.activeLayers.value[0]!.motionPath).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  })

  it('does not split an existing tiny tween into a zero-length half or create history', () => {
    load([heading({ motionPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }], motionPathTweens: [{ startTime: 0.01, endTime: 0.06, pathStart: 0, pathEnd: 1 }] })])
    const before = studio.getCanvasData()
    studio.addMotionPathTween(1)
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
  })
  it('Animate selects the exact target and opens Animation without creating history or changing the document', () => {
    load([heading(), heading({ id: 2 })])
    studio.selectLayer(2)
    const before = studio.getCanvasData()
    const target = studio.captureAnimationTarget(studio.activeLayers.value[0]!)
    const inspector = useBannerInspector()
    inspector.openAnimation(target)
    expect(studio.state.selectedLayerId).toBe(1)
    expect(inspector.inspectorTab.value).toBe('animation')
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
    expect(studio.state.isDirty).toBe(false)
  })

  it('rejects captured menu targets after format, project, layer replacement or eligibility changes', () => {
    const layer = studio.activeLayers.value[0]!
    const target = studio.captureAnimationTarget(layer)
    studio.state.sets.custom_500x500 = { layers: [heading()] }
    studio.state.activeKey = 'custom_500x500'
    expect(studio.resolveAnimationTarget(target)).toBeNull()
    studio.state.activeKey = 'custom_1000x1000'
    layer.locked = true
    expect(studio.resolveAnimationTarget(target)).toBeNull()
    layer.locked = false
    remoteLocked.add(1)
    expect(studio.resolveAnimationTarget(target)).toBeNull()
    remoteLocked.clear()
    studio.state.sets.custom_1000x1000!.layers[0] = heading()
    expect(studio.resolveAnimationTarget(target)).toBeNull()
    load()
    expect(studio.resolveAnimationTarget(target)).toBeNull()
    expect(studio.canUndo.value).toBe(false)
  })

  it('clears tween/keyframe/solo state on selection, format and project changes', () => {
    for (const change of [() => studio.selectLayer(2), () => studio.setActiveArtboard('custom_1000x1000'), () => load()]) {
      studio.state.selectedTween = { layerId: 1, tweenIndex: 1 }
      studio.state.selectedKeyframe = { layerId: 1, property: 'x', index: 0 }
      studio.state.soloMotionPath = true
      change()
      expect(studio.state.selectedTween).toBeNull()
      expect(studio.state.selectedKeyframe).toBeNull()
      expect(studio.state.soloMotionPath).toBe(false)
    }
  })
  it('creates useful editable motion in one undo and retains native wording, appearance and keyframes through reload', () => {
    load([heading({ keyframes: { opacity: [{ time: 0, value: 1 }, { time: 4, value: 0.8 }] }, animIn: 'fadeIn' }), heading({ id: 2 })])
    const before = studio.getCanvasData()
    studio.addMotionPathTween(1)
    const layer = studio.activeLayers.value[0]!
    expect(layer.motionPath).toHaveLength(2)
    expect(layer.motionPath![1]).not.toEqual(layer.motionPath![0])
    expect(layer.motionPathTweens).toEqual([{ startTime: 0, endTime: 4, pathStart: 0, pathEnd: 1, ease: 'power2.inOut' }])
    const { motionPath, motionPathTweens, motionPathCurviness, ...unchanged } = layer
    expect(unchanged).toEqual(before.custom_1000x1000!.layers[0])
    expect(studio.activeLayers.value[1]).toEqual(before.custom_1000x1000!.layers[1])
    const after = studio.getCanvasData()
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(after)
    studio.loadProject({ id: 'animation-proof', name: 'Reopened', canvasData: after } as BannerProject)
    expect(studio.getCanvasData()).toEqual(after)
  })

  it.each([{ locked: true }, { type: 'bg' }, { type: 'audio' }, { platformQr: { qrCodeId: 'qr' } }])('does not change ineligible layer %j', (extra) => {
    load([heading({ motionPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }], ...extra } as Partial<Layer>)])
    const before = studio.getCanvasData()
    studio.addMotionPathTween(1)
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
  })

  it('does not mutate remote-locked layers or mask targets', () => {
    load([heading({ motionPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] })])
    remoteLocked.add(1)
    const before = studio.getCanvasData()
    studio.addMotionPathTween(1)
    expect(studio.getCanvasData()).toEqual(before)
    remoteLocked.clear()
    load([heading(), heading({ id: 2, isMask: true, maskTargetIds: [1] })])
    studio.addMotionPathTween(1)
    expect(studio.canUndo.value).toBe(false)
  })

  it('keeps existing waypoints and earlier tweens while splitting the last full-path tween', () => {
    const path = [{ x: 0, y: 0 }, { x: 20, y: 40 }, { x: 100, y: 0 }]
    const first = { startTime: 0, endTime: 1, pathStart: 0, pathEnd: 0.3, ease: 'none' }
    load([heading({ motionPath: path, motionPathTweens: [first, { startTime: 1, endTime: 3, pathStart: 0.3, pathEnd: 1, ease: 'power2.out' }] })])
    studio.addMotionPathTween(1)
    expect(studio.activeLayers.value[0]!.motionPath).toEqual(path)
    expect(studio.activeLayers.value[0]!.motionPathTweens).toEqual([first, { startTime: 1, endTime: 2, pathStart: 0.3, pathEnd: 0.65, ease: 'power2.out' }, { startTime: 2, endTime: 3, pathStart: 0.65, pathEnd: 1, ease: 'power2.out' }])
  })

  it('appends only when remaining time and path can produce movement', () => {
    const first = { startTime: 0, endTime: 2, pathStart: 0, pathEnd: 0.5, ease: 'none' }
    load([heading({ motionPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }], motionPathTweens: [first] })])
    studio.addMotionPathTween(1)
    expect(studio.activeLayers.value[0]!.motionPathTweens).toEqual([first, { startTime: 2, endTime: 3, pathStart: 0.5, pathEnd: 1, ease: 'power2.inOut' }])
  })

  it.each([{ startTime: 4, endTime: 4 }, { startTime: 4, endTime: 2 }, { startTime: 0, endTime: 0.04 }, { startTime: NaN, endTime: 4 }])('does not add undo for invalid/too-short presence %j', (timing) => {
    load([heading(timing)])
    const before = studio.getCanvasData()
    studio.addMotionPathTween(1)
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
  })
})
