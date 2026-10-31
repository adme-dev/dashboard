import { describe, expect, it } from 'vitest'
import { BANNER_CATALOG_PRESETS, buildPresetCanvas } from '../../app/utils/banner-format-catalog'
import { resolveBannerFormat, TEMPLATES } from '../../app/utils/banner-constants'

const preset = (id: string) => BANNER_CATALOG_PRESETS.find(item => item.id === id)!

describe('banner format catalog', () => {
  it('provides five sets and individually selectable formats across all categories', () => {
    const sets = BANNER_CATALOG_PRESETS.filter(item => item.formats.length > 1)
    expect(sets.map(item => [item.id, item.formats.length])).toEqual([
      ['display-set', 23], ['performance-max-set', 3], ['social-campaign-set', 8], ['social-posts-set', 5], ['video-set', 6]
    ])
    expect(new Set(BANNER_CATALOG_PRESETS.map(item => item.id)).size).toBe(BANNER_CATALOG_PRESETS.length)
    expect(new Set(BANNER_CATALOG_PRESETS.filter(item => item.formats.length === 1).map(item => item.category))).toEqual(new Set(['display', 'social', 'print', 'digital', 'video']))
  })

  it('uses persisted custom keys resolved by the editor and export path, with no repeated set dimensions', () => {
    for (const item of BANNER_CATALOG_PRESETS) {
      expect(new Set(item.formats.map(format => format.key)).size).toBe(item.formats.length)
      for (const format of item.formats) {
        expect(format.key).toBe(`custom_${format.w}x${format.h}`)
        expect(resolveBannerFormat(format.key)).toMatchObject({ w: format.w, h: format.h })
      }
    }
  })

  it('matches all 23 observed display dimensions without dropping narrow formats', () => {
    expect(preset('display-set').formats.map(item => `${item.w}x${item.h}`)).toEqual([
      '200x200', '240x400', '250x250', '250x360', '300x250', '336x280', '580x400',
      '120x600', '160x600', '300x600', '300x1050', '468x60', '728x90', '930x180',
      '970x90', '970x250', '980x120', '300x50', '320x50', '320x100', '234x60', '120x240', '180x150'
    ])
  })

  it('keeps the digital formats distinct by purpose and states their timeline limitation', () => {
    const digital = BANNER_CATALOG_PRESETS.filter(item => item.category === 'digital')
    expect(digital.map(item => [item.name, item.formats[0]!.key])).toEqual([
      ['Presentation', 'custom_1920x1080'], ['Logo', 'custom_800x800'], ['Slideshow', 'custom_960x720'],
      ['FHD Slideshow', 'custom_1920x1080'], ['HD Video', 'custom_1280x720'], ['eBook Cover', 'custom_1600x2400']
    ])
    expect(digital.filter(item => /presentation|slideshow/i.test(item.name)).every(item => item.note?.includes('single canvas'))).toBe(true)
    expect(preset('social-campaign-set').note).toContain('XeroFlow selection')
    expect(BANNER_CATALOG_PRESETS.filter(item => item.category === 'print').every(item => item.note?.includes('not a print-ready CMYK'))).toBe(true)
  })

  it('creates white native backgrounds visible for the complete six-second cycle', () => {
    const item = preset('display-set')
    const canvas = buildPresetCanvas(item)
    expect(Object.keys(canvas)).toHaveLength(23)
    for (const format of item.formats) {
      const board = canvas[format.key]!
      expect(board.playback).toEqual({ duration: 6, loopCount: 0 })
      expect(board.bgColor).toBe('#ffffff')
      expect(board.layers).toHaveLength(1)
      expect(board.layers[0]).toMatchObject({
        type: 'bg', w: format.w, h: format.h, x: 0, y: 0, opacity: 1,
        bgColor: '#ffffff', startTime: 0, endTime: 6, animIn: 'none', animOut: 'none', animInDur: 0, outDur: 0
      })
    }
  })

  it('keeps project instances, boards, playback and catalog formats independent', () => {
    const item = preset('social-campaign-set')
    const originalCatalog = structuredClone(item)
    const first = buildPresetCanvas(item, 'automotive')
    const second = buildPresetCanvas(item, 'automotive')
    const boards = Object.values(first)
    const changed = boards[0]!
    changed.layers[0]!.bgColor = '#ff0000'
    changed.layers[2]!.text = 'Changed headline'
    changed.playback!.duration = 12
    expect(Object.values(second)[0]!.layers[2]!.text).toBe('DRIVE AWAY')
    expect(boards[1]!.layers[2]!.text).toBe('DRIVE AWAY')
    expect(boards[1]!.playback).toEqual({ duration: 6, loopCount: 0 })
    expect(item).toEqual(originalCatalog)
    expect(preset('social-posts-set').formats[0]).not.toBe(item.formats[0])
  })

  it.each(TEMPLATES.map(item => item.id))('links matching %s content across sizes with distinct numeric layer identities', (styleId) => {
    const boards = Object.values(buildPresetCanvas(preset('video-set'), styleId))
    const layers = boards.flatMap(board => board.layers)
    expect(new Set(layers.map(layer => layer.id)).size).toBe(layers.length)
    const first = boards[0]!
    for (const board of boards) {
      expect(board.layers.map(layer => layer.linkId)).toEqual(first.layers.map(layer => layer.linkId))
      expect(new Set(board.layers.map(layer => layer.linkId)).size).toBe(board.layers.length)
      expect(board.playback).toEqual({ duration: 6, loopCount: 0 })
      expect(board.layers.every(layer => Number.isFinite(layer.startTime) && layer.endTime > layer.startTime)).toBe(true)
    }
    const expected = TEMPLATES.find(item => item.id === styleId)!.layers(preset('video-set').formats[0]!)
    expect(first.layers.map(layer => layer.startTime)).toEqual(expected.map(layer => layer.startTime ?? layer.delay ?? 0))
    expect(first.layers.map(layer => layer.animInDur)).toEqual(expected.map(layer => layer.animInDur ?? layer.dur))
  })

  it('rejects unknown styles and duplicate artboards instead of silently dropping user choices', () => {
    expect(() => buildPresetCanvas(preset('display-set'), 'missing')).toThrow('Unknown banner style')
    const item = preset('digital-presentation')
    expect(() => buildPresetCanvas({ ...item, formats: [...item.formats, ...item.formats] })).toThrow('Duplicate format')
  })
})
