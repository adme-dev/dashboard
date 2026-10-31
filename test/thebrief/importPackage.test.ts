import { describe, expect, it } from 'vitest'
import { clientFromHint, parseTheBriefPackage, suggestImportClient, importTags, sameImportedCanvas } from '../../app/utils/thebrief-import'

const fixture = () => ({
  kind: 'xeroflow-thebrief-import', version: 1, name: 'DriveAgent News Update',
  source: { designHash: 'abc123', sha256: 'a'.repeat(64), folder: 'Social Media Templates/Updates', duration: 4, loopCount: 0 },
  canvasData: { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Title', text: 'Hello', x: 0, y: 0, w: 300, h: 50, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 4, value: 1 }] } }] } },
  warnings: [], assets: [], fonts: []
})

describe('reviewed TheBrief native package', () => {
  it('preserves editable keyframes and original source identity', () => {
    const result = parseTheBriefPackage(fixture())
    expect(result.canvasData.custom_300x250.layers[0].keyframes.opacity).toHaveLength(2)
    expect(importTags(result)).toContain('source-folder:Social Media Templates/Updates')
    expect(importTags(result)).toContain('import:needs-review')
  })

  it('retains only a verified calendar creation date as provenance', () => {
    const input = fixture()
    Object.assign(input.source, { createdDate: '2021-04-09' })
    const result = parseTheBriefPackage(input)
    expect(importTags(result)).toContain('source-created-date:2021-04-09')
    expect(importTags(parseTheBriefPackage(fixture())).some(tag => tag.startsWith('source-created-date:'))).toBe(false)
    Object.assign(input.source, { createdDate: '2021-02-30' })
    expect(() => parseTheBriefPackage(input)).toThrow()
  })

  it('accepts a linked multi-size design and validates every board', () => {
    const input = fixture()
    const first = input.canvasData.custom_300x250.layers[0]
    Object.assign(first, { linkId: 'source:1' })
    Object.assign(input.canvasData, { custom_1200x1200: { layers: [{ ...first, x: 100, w: 900 }] } })
    const parsed = parseTheBriefPackage(input)
    expect(Object.keys(parsed.canvasData)).toEqual(['custom_300x250', 'custom_1200x1200'])
    input.canvasData.custom_1200x1200.layers[0].endTime = 5
    expect(() => parseTheBriefPackage(input)).toThrow(/timing/)
  })

  it('rejects unsafe CSS, external assets and unsupported layers', () => {
    for (const change of [{ color: 'red;position:fixed' }, { src: 'https://example.com/a.png' }, { type: 'html' }]) {
      const input = fixture()
      Object.assign(input.canvasData.custom_300x250.layers[0], change)
      expect(() => parseTheBriefPackage(input)).toThrow()
    }
  })

  it('rejects missing assets and mismatched format dimensions', () => {
    const input = fixture()
    Object.assign(input.canvasData.custom_300x250.layers[0], { type: 'image', src: './missing.png' })
    expect(() => parseTheBriefPackage(input)).toThrow(/asset/i)
    const invalid = fixture()
    invalid.canvasData = { custom_99999x250: invalid.canvasData.custom_300x250 } as typeof invalid.canvasData
    expect(() => parseTheBriefPackage(invalid)).toThrow()
  })

  it('does not map overlapping or multiple client names to a shorter client', () => {
    const clients = [{ id: 'a', name: 'DriveAgent' }, { id: 'b', name: 'DriveAgent News' }, { id: 'c', name: 'Other Motors' }]
    expect(suggestImportClient('DriveAgent News Update', clients)).toBe('b')
    expect(suggestImportClient('DriveAgent News / Other Motors Update', clients)).toBeNull()
    expect(suggestImportClient('Unknown update', clients)).toBeNull()
    expect(suggestImportClient('DriveAgent News Update', [clients[0]])).toBeNull()
  })
})

describe('persisted canvas verification', () => {
  it('accepts database key ordering but rejects missing or reordered layer data', () => {
    expect(sameImportedCanvas({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true)
    expect(sameImportedCanvas({ a: 1, b: [1, 2] }, { a: 1, b: [2, 1] })).toBe(false)
    expect(sameImportedCanvas({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})

describe('upload contract and playback boundaries', () => {
  it('rejects noncanonical formats and source/playback mismatches', () => {
    const input = fixture()
    input.canvasData = { custom_0300x250: input.canvasData.custom_300x250 } as typeof input.canvasData
    expect(() => parseTheBriefPackage(input)).toThrow(/dimensions/)
    const mismatched = fixture()
    Object.assign(mismatched.canvasData.custom_300x250, { playback: { duration: 3, loopCount: 0 } })
    expect(() => parseTheBriefPackage(mismatched)).toThrow(/Playback/)
  })
  it('rejects font names, weights, formats and sizes the upload endpoint would alter or reject', () => {
    const font = { path: './fonts/a.ttf', fileName: 'a.ttf', sha256: 'b'.repeat(64), base64: 'AAAA', mimeType: 'font/ttf', family: 'Brand', weight: 400, style: 'normal', format: 'truetype' }
    for (const change of [{ family: 'a'.repeat(101) }, { weight: 0 }, { weight: 1001 }, { weight: 325.5 }, { fileName: 'a.woff' }, { base64: 'A'.repeat(6990512) }]) {
      expect(() => parseTheBriefPackage({ ...fixture(), fonts: [{ ...font, ...change }] })).toThrow()
    }
    expect(parseTheBriefPackage({ ...fixture(), fonts: [font] }).fonts).toHaveLength(1)
  })
  it.each([1, 325, 950, 1000])('retains exact custom font and layer weight %s', (weight) => {
    const input = fixture()
    Object.assign(input.canvasData.custom_300x250.layers[0], { fontFamily: 'Brand', fontWeight: weight })
    const font = { path: './fonts/a.ttf', fileName: 'a.ttf', sha256: 'b'.repeat(64), base64: 'AAAA', mimeType: 'font/ttf', family: 'Brand', weight, style: 'normal', format: 'truetype' }
    const result = parseTheBriefPackage({ ...input, fonts: [font] })
    expect(result.fonts[0]?.weight).toBe(weight)
    expect(result.canvasData.custom_300x250.layers[0].fontWeight).toBe(weight)
  })
})

it('preserves explicit slide metadata and rejects missing identities, mismatched totals and crossing artwork', () => {
  const input = fixture()
  const board = input.canvasData.custom_300x250
  const slides = [{ id: 'source-slide:1', name: 'Slide 1', duration: 4 }]
  Object.assign(board, { slides })
  const item = Object.assign(board.layers[0], { slideId: 'source-slide:1' })
  const parsed = parseTheBriefPackage(input)
  expect(parsed.canvasData.custom_300x250!.slides).toEqual(slides)
  expect(parsed.canvasData.custom_300x250!.layers[0]!.slideId).toBe('source-slide:1')
  item.slideId = 'missing'
  expect(() => parseTheBriefPackage(input)).toThrow('missing slide')
  item.slideId = 'source-slide:1'
  slides[0]!.duration = 3
  expect(() => parseTheBriefPackage(input)).toThrow('source timing')
  slides.push({ id: 'source-slide:2', name: 'Slide 2', duration: 1 })
  expect(() => parseTheBriefPackage(input)).toThrow('crosses its slide')
})

describe('migration ledger hints and undated imports', () => {
  it('preselects only one exactly named client from the package hint', () => {
    const clients = [{ id: 'a', name: 'Brighton Auto Group' }, { id: 'b', name: 'Brighton GWM' }, { id: 'c', name: 'Twin' }, { id: 'd', name: 'twin' }]
    expect(clientFromHint('Brighton Auto Group', clients)).toBe('a')
    expect(clientFromHint('brighton  auto group', clients)).toBe('a')
    expect(clientFromHint('Brighton', clients)).toBeNull()
    expect(clientFromHint('Twin', clients)).toBeNull()
    expect(clientFromHint(undefined, clients)).toBeNull()
  })

  it('tags an undated import for backfill without inventing a source date', () => {
    const pkg = parseTheBriefPackage(fixture())
    expect(importTags(pkg, '', { datePending: true })).toContain('import:created-date-pending')
    expect(importTags(pkg, '2021-04-09', { datePending: true })).not.toContain('import:created-date-pending')
    expect(importTags(pkg).some(tag => tag.startsWith('source-created-date:') || tag === 'import:created-date-pending')).toBe(false)
  })

  it('accepts one rgb or rgba text shadow and rejects unsafe shadow values', () => {
    const withShadow = (textShadow: string) => {
      const input = fixture()
      const board = Object.values(input.canvasData)[0] as { layers: Array<Record<string, unknown>> }
      board.layers.find(layer => layer.type === 'text')!.textShadow = textShadow
      return input
    }
    expect(() => parseTheBriefPackage(withShadow('2px 2px 22px rgba(98,29,0,0.83)'))).not.toThrow()
    expect(() => parseTheBriefPackage(withShadow('2px 2px 22px rgb(98,29,0)'))).not.toThrow()
    for (const bad of ['2px 2px 22px rgba(98,29,0,2)', '2px 2px 22px rgba(98,29,0,.5);color:red', '2px 2px 22px red', '1px 1px 1px #fff, 2px 2px 2px #000']) {
      expect(() => parseTheBriefPackage(withShadow(bad))).toThrow()
    }
  })
})
