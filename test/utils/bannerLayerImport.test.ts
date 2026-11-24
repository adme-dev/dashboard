import { describe, expect, it } from 'vitest'
import {
  buildImportedLayers,
  fitSourceToCanvas,
  importTextMetrics,
  layerImportView,
  mapBoxToCanvas,
  matchImportFont
} from '~/utils/banner-layer-import'
import {
  LAYER_IMPORT_MAX_ELEMENTS,
  LAYER_IMPORT_MAX_JOB_USD,
  layerImportMaxCostUsd,
  type BannerLayerImportResult,
  type BannerLayerImportText
} from '~~/shared/bannerLayerImport'
import { DEFAULT_MAX_COST_USD, DEFAULT_MAX_LAYERS, estimateDecomposeCostUsd } from '~~/server/utils/image-layers/decompose'
import { TEXT_READ_ESTIMATE_USD } from '~~/server/utils/image-layers/readText'

const text = (over: Partial<BannerLayerImportText> = {}): BannerLayerImportText => ({
  text: 'SUMMER SALE', lines: 1, fontGuess: null, fontCategory: 'sans', fontWeight: 800, italic: false,
  uppercase: true, align: 'left', color: '#ffcc00', letterSpacing: 'normal', ...over
})

const catalogue = [
  { family: 'Inter', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Montserrat', category: 'sans-serif', weights: [300, 400, 700, 900] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 700] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 700] },
  { family: 'Dealer Sans', category: 'custom', weights: [400, 700] }
]

function result(over: Partial<BannerLayerImportResult> = {}): BannerLayerImportResult {
  return {
    width: 1200,
    height: 628,
    base: { assetId: 'base-1', url: 'https://app.test/base.png', width: 1200, height: 628 },
    layers: [
      { assetId: 'a-car', url: 'https://app.test/car.png', name: 'Red car', kind: 'product', z: 1, bbox: { x: 600, y: 200, width: 500, height: 300 }, width: 500, height: 300, text: null },
      { assetId: 'a-head', url: 'https://app.test/head.png', name: 'Headline', kind: 'text', z: 3, bbox: { x: 60, y: 80, width: 480, height: 72 }, width: 480, height: 72, text: text() },
      { assetId: 'a-logo', url: 'https://app.test/logo.png', name: 'Dealer logo', kind: 'logo', z: 2, bbox: { x: 1000, y: 30, width: 150, height: 60 }, width: 150, height: 60, text: null }
    ],
    skipped: [],
    costUsd: 0.12,
    latencyMs: 48000,
    ...over
  }
}

const options = { jobId: 'job-1', groupId: 'group-1', groupName: 'Imported: promo.jpg', catalogue }

describe('placing a source picture on a canvas', () => {
  it('scales source pixels into a canvas of the same shape', () => {
    const fit = fitSourceToCanvas({ width: 1200, height: 628 }, { w: 600, h: 314 })
    expect(fit).toMatchObject({ scale: 0.5, offsetX: 0, offsetY: 0, width: 600, height: 314 })
    expect(mapBoxToCanvas({ x: 600, y: 200, width: 500, height: 300 }, fit)).toEqual({ x: 300, y: 100, w: 250, h: 150 })
  })

  it('shows the whole picture and centres it when the shapes differ', () => {
    // A 2:1 picture on a square canvas: full width, letterboxed top and bottom.
    const fit = fitSourceToCanvas({ width: 1000, height: 500 }, { w: 300, h: 300 })
    expect(fit).toMatchObject({ scale: 0.3, offsetX: 0, offsetY: 75, width: 300, height: 150 })
    expect(mapBoxToCanvas({ x: 100, y: 100, width: 200, height: 50 }, fit)).toEqual({ x: 30, y: 105, w: 60, h: 15 })
  })

  it('fills the canvas and lets the long side overflow in cover mode', () => {
    const fit = fitSourceToCanvas({ width: 1000, height: 500 }, { w: 300, h: 300 }, 'cover')
    expect(fit).toMatchObject({ scale: 0.6, offsetX: -150, offsetY: 0 })
    expect(mapBoxToCanvas({ x: 500, y: 0, width: 100, height: 500 }, fit)).toEqual({ x: 150, y: 0, w: 60, h: 300 })
  })

  it('enlarges a small picture onto a bigger canvas', () => {
    const fit = fitSourceToCanvas({ width: 300, height: 250 }, { w: 600, h: 500 })
    expect(mapBoxToCanvas({ x: 10, y: 20, width: 30, height: 40 }, fit)).toEqual({ x: 20, y: 40, w: 60, h: 80 })
  })

  it('never makes a layer thinner than one pixel', () => {
    const fit = fitSourceToCanvas({ width: 4000, height: 4000 }, { w: 100, h: 100 })
    expect(mapBoxToCanvas({ x: 0, y: 0, width: 8, height: 8 }, fit)).toMatchObject({ w: 1, h: 1 })
  })

  it('refuses a picture or canvas with no size', () => {
    expect(() => fitSourceToCanvas({ width: 0, height: 10 }, { w: 10, h: 10 })).toThrow(/no size/)
  })
})

describe('building the layers for an import', () => {
  it('stacks the background first, then every element in its original order', () => {
    const built = buildImportedLayers(result(), { w: 1200, h: 628 }, options)
    // Car (z1), logo (z2), then the headline's hidden cut-out with live text directly above it (z3).
    expect(built.layers.map(layer => layer.name)).toEqual([
      'Background', 'Red car', 'Dealer logo', 'Headline (original picture)', 'Headline'
    ])
    expect(built.layers.map(layer => layer.importedFrom?.role)).toEqual(['base', 'element', 'element', 'text-source', 'text'])
  })

  it('places the background over the picture area and each element at its box', () => {
    const built = buildImportedLayers(result(), { w: 600, h: 314 }, options)
    expect(built.layers[0]).toMatchObject({ type: 'image', src: 'https://app.test/base.png', x: 0, y: 0, w: 600, h: 314, fit: 'fill' })
    expect(built.layers[1]).toMatchObject({ type: 'image', src: 'https://app.test/car.png', x: 300, y: 100, w: 250, h: 150 })
  })

  it('puts every layer in one named group, visible and editable', () => {
    const built = buildImportedLayers(result(), { w: 1200, h: 628 }, options)
    expect(new Set(built.layers.map(layer => layer.timelineGroup?.id))).toEqual(new Set(['group-1']))
    expect(built.layers.every(layer => layer.timelineGroup?.name === 'Imported: promo.jpg')).toBe(true)
    expect(built.layers.every(layer => !layer.locked)).toBe(true)
    expect(built.layers.filter(layer => layer.hidden).map(layer => layer.name)).toEqual(['Headline (original picture)'])
  })

  it('rebuilds lettering as live text over its hidden cut-out', () => {
    const built = buildImportedLayers(result(), { w: 1200, h: 628 }, options)
    const [raster, live] = built.layers.slice(3)
    expect(raster).toMatchObject({ type: 'image', hidden: true, src: 'https://app.test/head.png', x: 60, y: 80, w: 480, h: 72 })
    expect(live).toMatchObject({
      type: 'text', text: 'SUMMER SALE', fontFamily: 'Inter', fontWeight: 800, color: '#ffcc00', textAlign: 'left', textTransform: 'none', fontStyle: 'normal'
    })
    // One line of capitals 72px tall is set at 72 / 0.72 = 100px.
    expect(live!.fontSize).toBe(100)
    // The frame starts at the lettering's left edge and never wraps the line.
    expect(live!.x).toBe(60)
    expect(live!.w).toBeGreaterThan(480)
    expect(built.textCount).toBe(1)
  })

  it('never rebuilds a logo as text, and marks it for replacing', () => {
    const withWordmark = result()
    withWordmark.layers[2]!.text = text({ text: 'ACME MOTORS' })
    const built = buildImportedLayers(withWordmark, { w: 1200, h: 628 }, options)
    const logo = built.layers.find(layer => layer.name === 'Dealer logo')!
    expect(logo).toMatchObject({ type: 'image', isLogo: true, fit: 'contain' })
    expect(logo.importedFrom).toMatchObject({ kind: 'logo', logoPlaceholder: true })
    expect(built.layers.filter(layer => layer.type === 'text')).toHaveLength(1)
    expect(built.logoCount).toBe(1)
  })

  it('adds only the elements when the background did not come back', () => {
    const built = buildImportedLayers(result({ base: null }), { w: 1200, h: 628 }, options)
    expect(built.layers[0]!.name).toBe('Red car')
    expect(built.layers.some(layer => layer.importedFrom?.role === 'base')).toBe(false)
  })

  it('keeps a text element as a picture when its words could not be read', () => {
    const unread = result()
    unread.layers[1]!.text = null
    const built = buildImportedLayers(unread, { w: 1200, h: 628 }, options)
    expect(built.layers.map(layer => layer.type)).toEqual(['image', 'image', 'image', 'image'])
    expect(built.layers.every(layer => !layer.hidden)).toBe(true)
    expect(built.textCount).toBe(0)
  })
})

describe('choosing a font for rebuilt text', () => {
  const brandFonts = [
    { role: 'heading' as const, family: 'Dealer Sans', weights: [400, 700], assets: [{ id: 'font-700', weight: 700 }, { id: 'font-400', weight: 400 }] },
    { role: 'body' as const, family: 'Montserrat', weights: [400, 700] }
  ]

  it('uses the font the model named when Banner Studio has it', () => {
    expect(matchImportFont(text({ fontGuess: 'montserrat', fontWeight: 800 }), { catalogue }))
      .toEqual({ fontFamily: 'Montserrat', fontWeight: 900, matchedBy: 'named' })
  })

  it('prefers the brand\'s own file for a named font, with the exact uploaded face', () => {
    expect(matchImportFont(text({ fontGuess: 'Dealer Sans', fontWeight: 600 }), { catalogue, brandFonts }))
      .toEqual({ fontFamily: 'Dealer Sans', fontWeight: 700, fontAssetId: 'font-700', matchedBy: 'named' })
  })

  it('falls back to the brand heading font for the headline and the body font for the rest', () => {
    expect(matchImportFont(text({ fontGuess: 'Gotham' }), { catalogue, brandFonts, headline: true }))
      .toMatchObject({ fontFamily: 'Dealer Sans', matchedBy: 'brand' })
    expect(matchImportFont(text({ fontGuess: 'Gotham', fontWeight: 400 }), { catalogue, brandFonts, headline: false }))
      .toMatchObject({ fontFamily: 'Montserrat', fontWeight: 400, matchedBy: 'brand' })
  })

  it('does not set script lettering in a sans brand font', () => {
    expect(matchImportFont(text({ fontCategory: 'script', fontWeight: 400 }), { catalogue, brandFonts, headline: false }))
      .toEqual({ fontFamily: 'Dancing Script', fontWeight: 400, matchedBy: 'style' })
  })

  it('uses a stand-in of the same style when nothing else fits', () => {
    expect(matchImportFont(text({ fontCategory: 'serif', fontWeight: 600 }), { catalogue }))
      .toEqual({ fontFamily: 'Playfair Display', fontWeight: 700, matchedBy: 'style' })
    expect(matchImportFont(text({ fontCategory: 'mono', fontWeight: 400 }), { catalogue: [] }))
      .toEqual({ fontFamily: 'Roboto Mono', fontWeight: 400, matchedBy: 'style' })
  })
})

describe('sizing rebuilt text', () => {
  const font = { fontFamily: 'Inter', fontWeight: 800, italic: false }
  const box = { x: 100, y: 50, w: 400, h: 36 }

  it('sizes one line from the height of its capitals', () => {
    const metrics = importTextMetrics(text(), box, font)
    expect(metrics.fontSize).toBe(50)
    expect(metrics.lineHeight).toBe(1.1)
    // The frame starts above the box so the capitals land on it.
    expect(metrics.frame.y).toBeLessThan(50)
    expect(metrics.frame.y).toBeCloseTo(50 - 50 * (0.05 + 0.18), 1)
  })

  it('shares the height between the lines of a paragraph', () => {
    const metrics = importTextMetrics(text({ text: 'SUMMER\nSALE', lines: 2 }), { ...box, h: 93.5 }, font)
    // (2 - 1) x 1.15 + 0.72 = 1.87 em of ink.
    expect(metrics.fontSize).toBe(50)
    expect(metrics.frame.h).toBeGreaterThanOrEqual(2 * 1.15 * 50)
  })

  it('allows for descenders in mixed-case lettering', () => {
    expect(importTextMetrics(text({ text: 'Spring pricing', uppercase: false }), { ...box, h: 46.5 }, font).fontSize).toBe(50)
  })

  it('nudges the size so the widest line is as wide as the original', () => {
    // At 100px the line measures 1000px, so 400px wide needs 40px; height alone said 50px.
    const metrics = importTextMetrics(text(), box, font, () => 1000)
    expect(metrics.fontSize).toBe(40)
  })

  it('limits the width correction to a quarter either way', () => {
    expect(importTextMetrics(text(), box, font, () => 4000).fontSize).toBe(37.5)
    expect(importTextMetrics(text(), box, font, () => 100).fontSize).toBe(62.5)
  })

  it('sizes by height alone when the font cannot be measured yet', () => {
    expect(importTextMetrics(text(), box, font, () => null).fontSize).toBe(50)
  })

  it('keeps centred and right-aligned text on its box', () => {
    const centred = importTextMetrics(text({ align: 'center' }), box, font)
    expect(centred.frame.x + centred.frame.w / 2).toBeCloseTo(300, 1)
    const right = importTextMetrics(text({ align: 'right' }), box, font)
    expect(right.frame.x + right.frame.w).toBeCloseTo(500, 1)
  })

  it('carries wide and tight letter spacing', () => {
    expect(importTextMetrics(text({ letterSpacing: 'wide' }), box, font).letterSpacing).toBe('0.08em')
    expect(importTextMetrics(text({ letterSpacing: 'tight' }), box, font).letterSpacing).toBe('-0.02em')
    expect(importTextMetrics(text(), box, font).letterSpacing).toBe('0')
  })
})

describe('what the person sees while an import runs', () => {
  it('says the job is queued, then that it is still queued', () => {
    expect(layerImportView(null, 0)).toMatchObject({ phase: 'waiting', title: 'Waiting to start' })
    expect(layerImportView({ status: 'queued', error: null, result: null }, 60_000).detail).toMatch(/Still in the queue/)
  })

  it('shows progress that grows but never claims to be finished', () => {
    const early = layerImportView({ status: 'running', error: null, result: null }, 5_000)
    const late = layerImportView({ status: 'running', error: null, result: null }, 600_000)
    expect(early.phase).toBe('working')
    expect(late.progress!).toBeGreaterThan(early.progress!)
    expect(late.progress!).toBeLessThanOrEqual(95)
    expect(late.detail).toMatch(/longer than usual/)
  })

  it('gives the reason a job failed', () => {
    expect(layerImportView({ status: 'failed', error: 'No separate elements were found in this picture.', result: null }, 0))
      .toMatchObject({ phase: 'failed', detail: 'No separate elements were found in this picture.', progress: null })
  })

  it('treats a finished job with nothing in it as a failure', () => {
    expect(layerImportView({ status: 'succeeded', error: null, result: result({ layers: [], base: null }) }, 0).phase).toBe('failed')
    expect(layerImportView({ status: 'succeeded', error: null, result: null }, 0).phase).toBe('failed')
  })

  it('says when everything came back', () => {
    expect(layerImportView({ status: 'succeeded', error: null, result: result() }, 0))
      .toMatchObject({ phase: 'done', detail: '3 elements and the background came back.', progress: 100 })
  })

  it('says when parts are missing', () => {
    const skipped = [{ name: 'Price badge', step: 'extract', reason: 'The model returned nothing.' }]
    expect(layerImportView({ status: 'succeeded', error: null, result: result({ skipped }) }, 0).phase).toBe('partial')
    expect(layerImportView({ status: 'succeeded', error: null, result: result({ base: null }) }, 0).phase).toBe('partial')
  })
})

describe('the cost shown before an import starts', () => {
  it('covers the Worker\'s own estimate for the largest job it will run', () => {
    const worker = estimateDecomposeCostUsd({ layers: DEFAULT_MAX_LAYERS, includeBase: true, vision: true, framePixels: 1280 * 720 }) + TEXT_READ_ESTIMATE_USD
    expect(LAYER_IMPORT_MAX_ELEMENTS).toBe(DEFAULT_MAX_LAYERS)
    expect(layerImportMaxCostUsd()).toBeGreaterThanOrEqual(worker)
    expect(layerImportMaxCostUsd() - worker).toBeLessThan(0.01)
  })

  it('states the same job limit the Worker enforces', () => {
    expect(LAYER_IMPORT_MAX_JOB_USD).toBe(DEFAULT_MAX_COST_USD)
    expect(layerImportMaxCostUsd()).toBeLessThanOrEqual(LAYER_IMPORT_MAX_JOB_USD)
  })
})
