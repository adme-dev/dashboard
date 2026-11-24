import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYER_MOTION_TIMING,
  GENERATED_MOTION_LABEL,
  LAYER_MOTION_PRESETS,
  applyGeneratedLayerMotion,
  applyLayerMotionPreset,
  autoMotionPresetFor,
  buildLayerComposition,
  defaultLayerFit,
  entranceStartSec,
  generatedMotionBackdrop,
  hasGeneratedLayerMotion,
  layerCompositionFormatKey,
  layerMotionCostCents,
  layerMotionFeatherPx,
  layerMotionPresetOf,
  layerMotionRegion,
  layerPackagesFromDerivatives,
  placeBox,
  presetKeyframes,
  sourceToFrameTransform,
  type CompositionLayerInput,
  type LayerDerivativeInput
} from '~~/app/utils/video/layerAnimation'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'

const folder = 'video-asset-derivatives/agency/p1/job1'
const derivatives: LayerDerivativeInput[] = [
  { id: 'pkg', sourceAssetId: 'asset1', kind: 'layer-package', r2Key: `${folder}/layers.json`, width: 1600, height: 900, metadata: { title: '3 layers and a base', partial: false } },
  { id: 'price', kind: 'foreground-png', r2Key: `${folder}/layer-03-price.png`, metadata: { layerName: 'Price badge', layerKind: 'badge', z: 3, bbox: { x: 1200, y: 100, width: 300, height: 200 } } },
  { id: 'car', kind: 'foreground-png', r2Key: `${folder}/layer-01-car.png`, metadata: { layerName: 'Red SUV', layerKind: 'subject', z: 1, bbox: { x: 300, y: 350, width: 1000, height: 450 } } },
  { id: 'headline', kind: 'foreground-png', r2Key: `${folder}/layer-02-headline.png`, metadata: { layerName: 'Headline', layerKind: 'text', z: 2, bbox: { x: 100, y: 60, width: 800, height: 120 } } },
  { id: 'base', kind: 'background-png', r2Key: `${folder}/base.png`, width: 1600, height: 900, metadata: { z: 0 } },
  // A different run, and a lifted cut-out with no manifest: neither belongs to the package.
  { id: 'other', kind: 'foreground-png', r2Key: 'video-asset-derivatives/agency/p1/job2/layer-01-x.png', metadata: { layerName: 'Lifted', bbox: { x: 0, y: 0, width: 10, height: 10 } } },
  { id: 'nobox', kind: 'foreground-png', r2Key: `${folder}/layer-04-broken.png`, metadata: { layerName: 'No box' } }
]

function compositionInputs(preset: CompositionLayerInput['preset'] = 'auto'): CompositionLayerInput[] {
  const [pkg] = layerPackagesFromDerivatives(derivatives)
  return [
    { src: 'https://app.test/a/base.png', name: 'Background', kind: 'background', role: 'base', bbox: { x: 0, y: 0, width: pkg!.width, height: pkg!.height }, preset },
    ...pkg!.layers.map(layer => ({ src: `https://app.test/a/${layer.derivativeId}.png`, name: layer.name, kind: layer.kind, role: 'layer' as const, bbox: layer.bbox, preset }))
  ]
}

describe('layer packages', () => {
  it('groups one run into a package, back to front, and leaves out layers without a box', () => {
    const packages = layerPackagesFromDerivatives(derivatives)
    expect(packages).toHaveLength(1)
    const pkg = packages[0]!
    expect(pkg).toMatchObject({ id: 'pkg', sourceAssetId: 'asset1', width: 1600, height: 900, base: { derivativeId: 'base' }, partial: false })
    expect(pkg.layers.map(layer => layer.derivativeId)).toEqual(['car', 'headline', 'price'])
  })

  it('ignores a manifest whose layers cannot be placed', () => {
    expect(layerPackagesFromDerivatives([{ id: 'pkg', kind: 'layer-package', r2Key: 'x/layers.json', width: 100, height: 100 }])).toEqual([])
  })
})

describe('bbox → frame placement', () => {
  it('scales a box into a frame of the same shape', () => {
    const t = sourceToFrameTransform({ width: 1600, height: 900 }, { width: 1920, height: 1080 }, 'cover')
    expect(t).toEqual({ scale: 1.2, offsetX: 0, offsetY: 0 })
    expect(placeBox({ x: 300, y: 350, width: 1000, height: 450 }, t)).toEqual({ x: 360, y: 420, w: 1200, h: 540 })
  })

  it('cover centres and crops the long side; contain letterboxes', () => {
    const source = { width: 1600, height: 900 }, frame = { width: 1080, height: 1920 }
    const cover = sourceToFrameTransform(source, frame, 'cover')
    expect(cover.scale).toBeCloseTo(1920 / 900)
    expect(cover.offsetY).toBe(0)
    expect(cover.offsetX).toBeCloseTo((1080 - 1600 * (1920 / 900)) / 2)
    const contain = sourceToFrameTransform(source, frame, 'contain')
    expect(contain.scale).toBeCloseTo(0.675)
    expect(contain.offsetX).toBe(0)
    expect(placeBox({ x: 0, y: 0, width: 1600, height: 900 }, contain)).toEqual({ x: 0, y: 656, w: 1080, h: 608 })
  })

  it('keeps neighbouring boxes flush after rounding', () => {
    const t = sourceToFrameTransform({ width: 1000, height: 1000 }, { width: 1080, height: 1080 }, 'cover')
    const left = placeBox({ x: 0, y: 0, width: 333, height: 1000 }, t)
    const right = placeBox({ x: 333, y: 0, width: 667, height: 1000 }, t)
    expect(left.x + left.w).toBe(right.x)
    expect(right.x + right.w).toBe(1080)
  })

  it('covers when the shapes are close and contains when they are not', () => {
    expect(defaultLayerFit({ width: 1600, height: 900 }, { width: 1920, height: 1080 })).toBe('cover')
    expect(defaultLayerFit({ width: 1024, height: 1024 }, { width: 1080, height: 1080 })).toBe('cover')
    expect(defaultLayerFit({ width: 1600, height: 900 }, { width: 1080, height: 1920 })).toBe('contain')
  })
})

describe('motion presets', () => {
  const frame = { width: 1920, height: 1080 }
  const placed = { x: 1440, y: 120, w: 360, h: 240 }
  const ctx = { placed, frame, timing: DEFAULT_LAYER_MOTION_TIMING, entranceIndex: 2 }

  it('auto picks by what the layer is', () => {
    expect(autoMotionPresetFor('anything', 'base')).toBe('bg-zoom')
    expect(autoMotionPresetFor('subject')).toBe('push-in')
    expect(autoMotionPresetFor('product')).toBe('push-in')
    expect(autoMotionPresetFor('badge')).toBe('pop')
    expect(autoMotionPresetFor('button')).toBe('pop')
    expect(autoMotionPresetFor('text')).toBe('slide-up')
    expect(autoMotionPresetFor('logo')).toBe('fade')
    expect(autoMotionPresetFor(undefined)).toBe('fade')
  })

  it('staggers entrances and never starts one past the end of the clip', () => {
    expect(entranceStartSec(0, DEFAULT_LAYER_MOTION_TIMING)).toBe(0.4)
    expect(entranceStartSec(2, DEFAULT_LAYER_MOTION_TIMING)).toBe(0.9)
    expect(entranceStartSec(99, DEFAULT_LAYER_MOTION_TIMING)).toBe(5.4)
  })

  it('every preset has an opacity track that starts at time zero and spans the clip', () => {
    for (const preset of LAYER_MOTION_PRESETS) {
      const frames = presetKeyframes(preset.id, ctx)
      const opacity = frames.opacity!
      expect(opacity.length, preset.id).toBeGreaterThanOrEqual(2)
      expect(opacity[0]!.time, preset.id).toBe(0)
      expect(opacity.at(-1)!.value, preset.id).toBe(1)
      for (const track of Object.values(frames)) {
        const times = track!.map(frame => frame.time)
        expect(times, preset.id).toEqual([...times].sort((a, b) => a - b))
        expect(Math.max(...times), preset.id).toBeLessThanOrEqual(DEFAULT_LAYER_MOTION_TIMING.durationSec)
        expect(track!.at(-1)!.time, preset.id).toBe(DEFAULT_LAYER_MOTION_TIMING.durationSec)
      }
    }
  })

  it('background zoom grows evenly across the whole clip', () => {
    const frames = presetKeyframes('bg-zoom', ctx)
    expect(frames.scaleX).toEqual([{ time: 0, value: 1, easing: 'none' }, { time: 6, value: 1.08 }])
    expect(frames.scaleY).toEqual(frames.scaleX)
    expect(frames.opacity!.every(frame => frame.value === 1)).toBe(true)
  })

  it('background drift stays inside the oversized picture', () => {
    const background = { x: 0, y: 0, w: 1920, h: 1080 }
    const frames = presetKeyframes('bg-drift', { ...ctx, placed: background })
    const scale = frames.scaleX![0]!.value
    const spare = background.w * (scale - 1) / 2
    expect(frames.x![0]!.value).toBeGreaterThan(0)
    expect(frames.x![1]!.value).toBe(-frames.x![0]!.value)
    expect(Math.abs(frames.x![0]!.value)).toBeLessThan(spare)
  })

  it('push in scales the subject about its centre for the whole clip', () => {
    const frames = presetKeyframes('push-in', ctx)
    expect(frames.scaleX!.map(frame => [frame.time, frame.value])).toEqual([[0, 1], [6, 1.06]])
    expect(frames.x).toBeUndefined()
  })

  it('slide up waits for its turn, then rises into place while fading in', () => {
    const frames = presetKeyframes('slide-up', ctx)
    expect(frames.opacity!.map(frame => [frame.time, frame.value])).toEqual([[0, 0], [0.9, 0], [1.5, 1], [6, 1]])
    expect(frames.y!.map(frame => [frame.time, frame.value])).toEqual([[0, 43], [0.9, 43], [1.5, 0], [6, 0]])
  })

  it('slide in comes from the nearer side', () => {
    const right = presetKeyframes('slide-side', ctx)
    expect(right.x![0]!.value).toBeGreaterThan(0)
    const left = presetKeyframes('slide-side', { ...ctx, placed: { x: 100, y: 100, w: 300, h: 100 } })
    expect(left.x![0]!.value).toBeLessThan(0)
    expect(left.x!.at(-1)!.value).toBe(0)
  })

  it('pop overshoots from small to full size', () => {
    const frames = presetKeyframes('pop', { ...ctx, entranceIndex: 0 })
    expect(frames.scaleX!.map(frame => [frame.time, frame.value])).toEqual([[0, 0.6], [0.4, 0.6], [1, 1], [6, 1]])
    expect(frames.scaleX![1]!.easing).toBe('back.out(2)')
    expect(frames.scaleY).toEqual(frames.scaleX)
  })

  it('an entrance that starts at zero has no duplicate first keyframe', () => {
    const frames = presetKeyframes('fade', { ...ctx, entranceIndex: 0, timing: { ...DEFAULT_LAYER_MOTION_TIMING, entranceDelaySec: 0 } })
    expect(frames.opacity!.map(frame => [frame.time, frame.value])).toEqual([[0, 0], [0.6, 1], [6, 1]])
  })
})

describe('generated motion follows the background', () => {
  it('copies a drifting background\'s x track too, and stays put over a still one', () => {
    const frame = { width: 1920, height: 1080 }
    const inputs = compositionInputs()
    inputs[0]!.preset = 'bg-drift'
    const drifting = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: inputs })
    const board = drifting.canvasData[drifting.formatKey]!
    const region = layerMotionRegion({ x: 360, y: 420, w: 1200, h: 540 }, frame)
    const moved = applyGeneratedLayerMotion(board.layers, 2, { src: 'https://app.test/a/car.mp4', region, durationSeconds: 10 }, { playback: board.playback })
    expect(moved[1]!.keyframes!.x).toEqual(board.layers[0]!.keyframes!.x)
    expect(moved[1]!.mediaLoop).toBe(false)

    inputs[0]!.preset = 'hold'
    const still = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: inputs })
    const stillBoard = still.canvasData[still.formatKey]!
    const placed = applyGeneratedLayerMotion(stillBoard.layers, 2, { src: 'https://app.test/a/car.mp4', region, durationSeconds: 5 }, { playback: stillBoard.playback })
    expect(Object.keys(placed[1]!.keyframes!)).toEqual(['opacity'])
    expect(placed[1]!.transformOrigin).toBeUndefined()
  })
})

describe('generated motion blends into the picture around it', () => {
  const frame = { width: 1920, height: 1080 }
  const composition = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: compositionInputs() })
  const board = composition.canvasData[composition.formatKey]!
  const region = layerMotionRegion({ x: 360, y: 420, w: 1200, h: 540 }, frame)

  it('finds the background behind the region, not a small layer under it', () => {
    expect(generatedMotionBackdrop(board.layers, 2, region)?.name).toBe('Background')
    // Nothing behind the lowest layer.
    expect(generatedMotionBackdrop(board.layers, 1, region)).toBeNull()
  })

  it('puts a windowed copy of the background directly above the clip, moving with it', () => {
    const next = applyGeneratedLayerMotion(board.layers, 2, { src: 'https://app.test/a/car.mp4', surroundSrc: 'https://app.test/a/surround.png', region, durationSeconds: 5 }, { playback: board.playback })
    expect(next.map(layer => [layer.name, layer.zIndex])).toEqual([
      ['Background', 1], ['Red SUV', 2], ['Background around Red SUV', 3], ['Headline', 4], ['Price badge', 5]
    ])
    const surround = next[2]!
    expect(surround).toMatchObject({ type: 'image', src: 'https://app.test/a/surround.png', x: 0, y: 0, w: 1920, h: 1080, locked: true })
    expect(surround.keyframes).toEqual(board.layers[0]!.keyframes)
    expect(new Set(next.map(layer => layer.id)).size).toBe(5)
    expect(new Set(next.map(layer => layer.zIndex)).size).toBe(5)
    // Layers that were above the car keep their own motion.
    expect(next[3]!.keyframes).toEqual(board.layers[2]!.keyframes)
    const html = buildBannerHTML(composition.formatKey, next, { playback: board.playback })
    expect(html.indexOf('car.mp4')).toBeLessThan(html.indexOf('surround.png'))
    expect(html.indexOf('surround.png')).toBeLessThan(html.indexOf(board.layers[2]!.src!))
  })

  it('feathers by a small share of the region', () => {
    expect(layerMotionFeatherPx({ x: 0, y: 0, w: 871, h: 490 })).toBe(29)
    expect(layerMotionFeatherPx({ x: 0, y: 0, w: 60, h: 60 })).toBe(8)
  })
})

describe('layer composition', () => {
  const frame = { width: 1920, height: 1080 }
  const composition = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: compositionInputs() })
  const layers = composition.canvasData[composition.formatKey]!.layers

  it('uses an artboard the size of the video frame', () => {
    expect(composition.formatKey).toBe('custom_1920x1080')
    expect(layerCompositionFormatKey({ width: 1080, height: 1920 })).toBe('custom_1080x1920')
    expect(resolveBannerFormat(composition.formatKey)).toMatchObject({ w: 1920, h: 1080 })
    expect(composition.canvasData[composition.formatKey]!.playback).toEqual({ duration: 6, loopCount: 1 })
  })

  it('stacks the base first and the layers above it in z-order', () => {
    expect(layers.map(layer => layer.name)).toEqual(['Background', 'Red SUV', 'Headline', 'Price badge'])
    expect(layers.map(layer => layer.zIndex)).toEqual([1, 2, 3, 4])
    expect(new Set(layers.map(layer => layer.id)).size).toBe(4)
  })

  it('places each layer at its box in the frame', () => {
    expect(layers[0]).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080, type: 'image', fit: 'fill' })
    expect(layers[1]).toMatchObject({ x: 360, y: 420, w: 1200, h: 540 })
    expect(layers[3]).toMatchObject({ x: 1440, y: 120, w: 360, h: 240 })
  })

  it('auto gives each layer the preset for its kind, with staggered entrances', () => {
    expect(layers.map(layerMotionPresetOf)).toEqual(['bg-zoom', 'push-in', 'slide-up', 'pop'])
    // The car's push-in runs for the whole clip, so the headline is the first entrance.
    expect(layers[2]!.animationClips).toEqual([{ start: 0.4, end: 1, label: 'Slide up' }])
    expect(layers[3]!.animationClips).toEqual([{ start: 0.65, end: 1.25, label: 'Pop' }])
    expect(layers[3]!.keyframes!.scaleX![1]!.time).toBe(0.65)
    expect(layers.every(layer => layer.startTime === 0 && layer.endTime === 6)).toBe(true)
  })

  it('renders through the existing overlay builder: one positioned node per layer and its keyframes on the timeline', () => {
    const html = buildBannerHTML(composition.formatKey, layers, { playback: composition.canvasData[composition.formatKey]!.playback })
    for (const layer of layers) {
      expect(html).toContain(`data-id="${layer.id}"`)
      expect(html).toContain(`src="${layer.src}"`)
    }
    // DOM order follows the stack: the base is painted first.
    const order = layers.map(layer => html.indexOf(`data-id="${layer.id}"`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(html).toContain('left:1440px')
    expect(html).toContain('width:360px')
    expect(html).toMatch(/tl\.to\('\[data-id="1"\]', \{ scaleX: 1\.08, duration: 6\.000/)
    expect(html).toMatch(/tl\.to\('\[data-id="4"\]', \{ scaleX: 1, duration: 0\.6[^}]*ease: 'back\.out\(2\)' \}, 0\.65\)/)
    expect(html).toMatch(/tl\.set\('\[data-id="3"\]', \{ opacity: 0 \}, 0\)/)
  })

  it('a chosen preset overrides auto, and hold leaves a still layer visible', () => {
    const held = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: compositionInputs('hold') })
    const stills = held.canvasData[held.formatKey]!.layers
    expect(stills.map(layerMotionPresetOf)).toEqual(['hold', 'hold', 'hold', 'hold'])
    expect(stills[1]!.keyframes).toEqual({ opacity: [{ time: 0, value: 1, easing: 'none' }, { time: 6, value: 1 }] })
  })

  it('contains a landscape picture inside a portrait frame without cropping its layers', () => {
    const portrait = buildLayerComposition({ source: { width: 1600, height: 900 }, frame: { width: 1080, height: 1920 }, layers: compositionInputs() })
    const placed = portrait.canvasData.custom_1080x1920!.layers
    expect(placed[0]).toMatchObject({ x: 0, y: 656, w: 1080, h: 608 })
    for (const layer of placed) {
      expect(layer.x).toBeGreaterThanOrEqual(0)
      expect(layer.x + layer.w).toBeLessThanOrEqual(1080)
    }
  })
})

describe('editing a composition afterwards', () => {
  const frame = { width: 1920, height: 1080 }
  const composition = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: compositionInputs() })
  const artboard = composition.canvasData[composition.formatKey]!

  it('changes one layer and leaves the others untouched', () => {
    const next = applyLayerMotionPreset(artboard.layers, 2, 'slide-side', frame, { playback: artboard.playback })
    expect(layerMotionPresetOf(next[1]!)).toBe('slide-side')
    expect(next[0]).toBe(artboard.layers[0])
    expect(next[2]).toBe(artboard.layers[2])
    expect(next[1]).toMatchObject({ x: 360, y: 420, w: 1200, h: 540, zIndex: 2 })
  })

  it('a new entrance takes its place in the stagger order', () => {
    // The car (layer 2) becomes the first entrance; nothing below it is an entrance.
    const next = applyLayerMotionPreset(artboard.layers, 2, 'fade', frame, { playback: artboard.playback })
    expect(next[1]!.animationClips![0]!.start).toBe(0.4)
    // The price badge sits above the headline entrance, so it stays second.
    const badge = applyLayerMotionPreset(artboard.layers, 4, 'fade', frame, { playback: artboard.playback })
    expect(badge[3]!.animationClips![0]!.start).toBe(0.65)
  })

  it('reads a hand-edited layer as custom', () => {
    expect(layerMotionPresetOf({ animationClips: [{ start: 0, end: 1, label: 'My move' }], keyframes: {} })).toBeNull()
    expect(layerMotionPresetOf({ keyframes: { x: [{ time: 0, value: 0 }, { time: 1, value: 5 }] } })).toBeNull()
    expect(layerMotionPresetOf({})).toBe('hold')
  })
})

describe('generated motion on one layer', () => {
  const frame = { width: 1920, height: 1080 }

  it('covers the layer with the tightest supported shape, inside the frame', () => {
    const region = layerMotionRegion({ x: 360, y: 420, w: 1200, h: 540 }, frame)
    expect(region.aspectRatio).toBe('16:9')
    expect(region.w / region.h).toBeCloseTo(16 / 9, 2)
    expect(region.x).toBeLessThanOrEqual(360)
    expect(region.y).toBeLessThanOrEqual(420)
    expect(region.x + region.w).toBeGreaterThanOrEqual(1560)
    expect(region.y + region.h).toBeGreaterThanOrEqual(960)
    expect(region.x).toBeGreaterThanOrEqual(0)
    expect(region.y + region.h).toBeLessThanOrEqual(1080)
  })

  it('picks a tall shape for a tall layer and a square for a square one', () => {
    expect(layerMotionRegion({ x: 400, y: 200, w: 200, h: 700 }, { width: 1080, height: 1920 }).aspectRatio).toBe('9:16')
    expect(layerMotionRegion({ x: 300, y: 300, w: 400, h: 400 }, frame).aspectRatio).toBe('1:1')
  })

  it('never leaves the frame when the layer touches an edge', () => {
    const region = layerMotionRegion({ x: 1500, y: 0, w: 420, h: 300 }, frame)
    expect(region.x + region.w).toBeLessThanOrEqual(1920)
    expect(region.y).toBe(0)
  })

  it('prices the clip by its length', () => {
    expect(layerMotionCostCents(5, 12)).toBe(60)
    expect(layerMotionCostCents(10, 12)).toBe(120)
  })

  it('puts the clip on its region, in the layer\'s place in the stack', () => {
    const composition = buildLayerComposition({ source: { width: 1600, height: 900 }, frame, layers: compositionInputs() })
    const artboard = composition.canvasData[composition.formatKey]!
    const region = layerMotionRegion({ x: 360, y: 420, w: 1200, h: 540 }, frame)
    const next = applyGeneratedLayerMotion(artboard.layers, 2, { src: 'https://app.test/a/car.mp4', region, durationSeconds: 5 }, { playback: artboard.playback })
    expect(next[1]).toMatchObject({ id: 2, zIndex: 2, type: 'video', srcType: 'video', src: 'https://app.test/a/car.mp4', x: region.x, y: region.y, w: region.w, h: region.h, mediaLoop: true, startTime: 0, endTime: 6 })
    expect(next[1]!.animationClips![0]!.label).toBe(GENERATED_MOTION_LABEL)
    expect(hasGeneratedLayerMotion(next[1]!)).toBe(true)
    expect(hasGeneratedLayerMotion(next[0]!)).toBe(false)
    expect(next[0]).toBe(artboard.layers[0])
    const html = buildBannerHTML(composition.formatKey, next, { playback: artboard.playback })
    expect(html).toContain('<video src="https://app.test/a/car.mp4"')
    // The clip carries its own patch of background, so it moves with the background: same zoom, same pivot.
    expect(next[1]!.keyframes!.scaleX).toEqual(artboard.layers[0]!.keyframes!.scaleX)
    expect(next[1]!.keyframes!.scaleY).toEqual(artboard.layers[0]!.keyframes!.scaleY)
    expect(next[1]!.transformOrigin).toEqual({ x: 960 - region.x, y: 540 - region.y })
    expect(next[1]!.keyframes!.opacity!.every(frame => frame.value === 1)).toBe(true)
    // Still between the background and the headline.
    expect(html.indexOf('data-id="1"')).toBeLessThan(html.indexOf('data-id="2"'))
    expect(html.indexOf('data-id="2"')).toBeLessThan(html.indexOf('data-id="3"'))
  })
})
