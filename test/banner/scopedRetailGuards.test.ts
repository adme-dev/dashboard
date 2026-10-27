import { describe, expect, it } from 'vitest'
import type { ArtboardState, Layer } from '../../app/types/banner-studio'
import { assertScopedDesignSource, assertScopedDesignTransition, validateDesignScope } from '../../shared/bannerDesignScope'

const text = { id: 1, name: 'Heading', type: 'text', text: 'Welcome home', x: 10, y: 10, w: 200, h: 30, fontSize: 20, lineHeight: 1.2, zIndex: 1, opacity: 1, clipToBounds: true, animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: 5 } as Layer
const source = (): Record<string, ArtboardState> => ({ custom_600x800: { layers: [structuredClone(text)] } })
const scope = { formatKey: 'custom_600x800', layerIds: [1], region: { x: 0, y: 0, w: 600, h: 800 }, approvedCopy: [] }

describe('retail preservation regressions', () => {
  it.each(['selected text', 'new format', 'new layer', 'board background'])('binds the complete saved source: %s', (mutation) => {
    const saved = source(), submitted = structuredClone(saved)
    if (mutation === 'selected text') submitted.custom_600x800.layers[0]!.text = 'Changed'
    if (mutation === 'new format') submitted.fb_sq = { layers: [] }
    if (mutation === 'new layer') submitted.custom_600x800.layers.push({ ...text, id: 2 })
    if (mutation === 'board background') submitted.custom_600x800.bgColor = '#000'
    expect(() => assertScopedDesignSource(saved, submitted, scope)).toThrow(/saved|source/i)
  })
  it.each(['empty text', 'one-pixel clipping', 'occlusion', 'hidden by presence'])('rejects loss of visible wording: %s', (mutation) => {
    const saved = source(), after = structuredClone(saved)
    if (mutation === 'empty text') after.custom_600x800.layers[0]!.text = ''
    if (mutation === 'hidden by presence') Object.assign(after.custom_600x800.layers[0]!, { clipToPresence: true, startTime: 1 })
    if (mutation === 'one-pixel clipping') after.custom_600x800.layers[0]!.h = 1
    if (mutation === 'occlusion') after.custom_600x800.layers.push({ ...text, id: 2, type: 'rect', text: undefined, fillColor: '#fff', zIndex: 20 })
    expect(() => assertScopedDesignTransition(saved, after, scope)).toThrow()
  })
  it('rejects an incoming mask dependency', () => {
    const saved = source()
    saved.custom_600x800.layers.push({ ...text, id: 2, type: 'rect', isMask: true, maskTargetIds: [1] })
    expect(() => validateDesignScope(saved, scope)).toThrow(/mask/i)
  })
  it('allows layout only for persisted native body roles, retaining exact protected copy', () => {
    const saved = source(), board = saved.custom_600x800
    board.layers[0] = { ...text, name: 'letter Launch', text: 'Thursday 12 November: pizza, drinks and test drives.', copyLocked: true, w: 500, h: 80 }
    board.reconstruction = { schemaVersion: 1, source: { sha256: 'a'.repeat(64), width: 600, height: 800 }, physical: { width: 210, height: 297, unit: 'mm' }, background: { status: 'clean', reviewed: true, sha256: 'b'.repeat(64), method: 'repaired' }, warnings: [], elements: [{ layerId: 1, role: 'letterLaunch', provenance: 'approved-copy' }] }
    const after = structuredClone(saved)
    Object.assign(after.custom_600x800.layers[0]!, { y: 120, fontSize: 18 })
    expect(() => assertScopedDesignTransition(saved, after, scope)).not.toThrow()
    after.custom_600x800.layers[0]!.text = 'Thursday 12 November: free pizza.'
    expect(() => assertScopedDesignTransition(saved, after, { ...scope, approvedCopy: [after.custom_600x800.layers[0]!.text!] })).toThrow()
  })
  it('rejects native text stacked underneath the clean plate', () => {
    const saved = source(), board = saved.custom_600x800
    board.reconstruction = { schemaVersion: 1, source: { sha256: 'a'.repeat(64), width: 600, height: 800 }, physical: { width: 210, height: 297, unit: 'mm' }, background: { status: 'clean', reviewed: true, sha256: 'b'.repeat(64), method: 'repaired' }, warnings: [], elements: [{ layerId: 2, role: 'background', provenance: 'repair' }] }
    board.layers.unshift({ ...text, id: 2, type: 'image', src: '/api/public/banner-assets/clean', x: 0, y: 0, w: 600, h: 800, zIndex: 0 })
    const after = structuredClone(saved)
    after.custom_600x800.layers.find(layer => layer.id === 1)!.zIndex = -1
    expect(() => assertScopedDesignTransition(saved, after, scope)).toThrow(/obscures/i)
  })
  it('checks every full-frame raster after a reviewed clean plate', () => {
    const saved = source(), board = saved.custom_600x800
    board.reconstruction = { schemaVersion: 1, source: { sha256: 'a'.repeat(64), width: 600, height: 800 }, physical: { width: 210, height: 297, unit: 'mm' }, background: { status: 'clean', reviewed: true, sha256: 'b'.repeat(64), method: 'repaired' }, warnings: [], elements: [{ layerId: 2, role: 'background', provenance: 'repair' }] }
    board.layers.push({ ...text, id: 2, type: 'image', src: '/api/public/banner-assets/clean', x: 0, y: 0, w: 600, h: 800 }, { ...text, id: 3, type: 'bg', src: '/api/public/banner-assets/flat', x: 0, y: 0, w: 600, h: 800 })
    expect(() => validateDesignScope(saved, scope)).toThrow(/flat/i)
  })
})
