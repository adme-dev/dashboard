import type { ArtboardState } from '../../app/types/banner-studio'
import { describe, expect, it } from 'vitest'
import { reconstructArtwork } from '../../shared/bannerReconstruction'
import copy from '../fixtures/banner/lifestyle-letter-copy.json'

const fixture = () => ({
  schemaVersion: 1, source: { sha256: 'a'.repeat(64), width: 2480, height: 3508 },
  canvas: { width: 2480, height: 3508, physical: { width: 210, height: 297, unit: 'mm' } },
  background: { status: 'clean', sha256: 'b'.repeat(64), method: 'repaired', reviewed: true },
  warnings: ['Font match requires review'],
  elements: [
    { role: 'background', provenance: 'repaired', layer: { id: 1, type: 'image', name: 'Clean background', src: '/clean.png', x: 0, y: 0, w: 2480, h: 3508, zIndex: 0, opacity: 1 } },
    ...Object.entries(copy).map(([role, text], i) => ({ role, provenance: 'approved-copy', layer: { id: i + 2, type: 'text', name: role, text, x: 150, y: 300 + i * 80, w: 2000, h: 70, zIndex: i + 1, opacity: 1, fontSize: 40, textDepth: { enabled: true, size: 2, angle: 45, color: '#112233' } } }))
  ]
})

describe('Curated native reconstruction contract', () => {
  it('preserves physical A4, stable IDs, stacking, exact approved text and native effects through JSON round-trip', () => {
    const canvas = reconstructArtwork(fixture(), copy, true)
    const saved = JSON.parse(JSON.stringify(canvas)) as Record<string, ArtboardState>
    const board = saved.custom_2480x3508
    expect(board.reconstruction.physical).toEqual({ width: 210, height: 297, unit: 'mm' })
    expect(board.layers.map(l => l.id)).toEqual(fixture().elements.map(e => e.layer.id))
    for (const [role, text] of Object.entries(copy)) {
      const id = board.reconstruction.elements.find(e => e.role === role).layerId
      expect(board.layers.find(l => l.id === id)).toMatchObject({ type: 'text', text, x: 150, textDepth: { size: 2 } })
    }
  })
  it('requires deliberate review and rejects source-as-background even when labelled clean', () => {
    expect(() => reconstructArtwork(fixture(), copy, false)).toThrow(/review/i)
    const sourceAsBackground = fixture()
    sourceAsBackground.background.sha256 = sourceAsBackground.source.sha256
    expect(() => reconstructArtwork(sourceAsBackground, copy, true)).toThrow(/background/i)
    for (const status of ['unresolved', 'needs_review']) {
      const input = fixture()
      input.background.status = status
      expect(() => reconstructArtwork(input, copy, true)).toThrow(/background/i)
    }
  })
  it('blocks missing, rasterised or altered required copy, duplicate IDs and malformed geometry', () => {
    const missing = fixture()
    missing.elements.pop()
    expect(() => reconstructArtwork(missing, copy, true)).toThrow(/copy/i)
    const altered = fixture()
    altered.elements.find(e => e.role === 'terms')!.layer.text = 'New terms'
    expect(() => reconstructArtwork(altered, copy, true)).toThrow(/copy/i)
    const flattened = fixture()
    flattened.elements[1].layer.type = 'image'
    expect(() => reconstructArtwork(flattened, copy, true)).toThrow()
    const dup = fixture()
    dup.elements[1].layer.id = 1
    expect(() => reconstructArtwork(dup, copy, true)).toThrow(/duplicate/i)
    const invalid = fixture()
    invalid.elements[1].layer.w = NaN
    expect(() => reconstructArtwork(invalid, copy, true)).toThrow()
  })
})
