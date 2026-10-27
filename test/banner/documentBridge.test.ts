import { describe, expect, it } from 'vitest'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { assessBridgeLayers, createBridgeSidecar, hashBridgeValue, planBridgeReturn, validateBridgeApply, type NativeDocument } from '../../shared/bannerDocumentBridge'

const faces = [{ family: 'Arial', weight: 400, italic: false }]
const layer = (patch: Partial<Layer> = {}): Layer => ({ id: 7, name: 'Heading', type: 'text', x: 10, y: 20, w: 200, h: 40, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, text: 'Welcome home', fontFamily: 'Arial', fontWeight: 400, fontSize: 20, color: '#003399', ...patch })
function native(text = 'Welcome home'): NativeDocument {
  return { name: 'source.pcraft', size: { width: 256, height: 256 }, layers: [{ id: 3, name: 'banner:7', content: { kind: 'text', text, font_family: 'Arial', cache: { tiles: [] }, psd_raw: null, transform: { m: [1, 0, 0, 1, 10, 40] }, runs: [{ len: new TextEncoder().encode(text).length, style: { weight: 400 } }], paragraphs: [{ len: new TextEncoder().encode(text).length, style: { align: 'Left' } }] }, mask: null, vector_mask: null }] }
}
async function fixture(patch: Partial<Layer> = {}) {
  const snapshot = { id: 'local', name: 'Project', canvasData: { square: { layers: [layer(patch), layer({ id: 8, type: 'rect', name: 'Untouched map', fillColor: '#ffffff', rotation: 42 })] } }, clientId: null, thumbnailUrl: null, status: 'draft', tags: [], createdBy: 'local', createdAt: 'now', updatedAt: 'now' } as BannerProject
  const baseline = native(snapshot.canvasData.square!.layers[0]!.text)
  const { sidecar, sidecarHash } = await createBridgeSidecar({ snapshot, revision: 12, boardKey: 'square', size: { width: 256, height: 256 }, mappings: [{ bannerId: 7, nativeId: 3 }], assessment: assessBridgeLayers(snapshot.canvasData.square!.layers, faces), nativeBaseline: baseline })
  // Explicit deterministic renderer fixture, not evidence of actual glyph metrics.
  return { sidecar, expectedSidecarHash: sidecarHash, currentProject: snapshot, currentRevision: 12, returned: native('Come say hello'), measureText: (_layer: Layer, text: string) => ({ left: 0, top: 0, right: text.length * 8, bottom: 24 }) }
}

describe('bounded PhotoCraft bridge', () => {
  it('produces one reversible project patch and preserves unsupported layers and metadata', async () => {
    const input = await fixture()
    const plan = await planBridgeReturn(input)
    expect(plan.changes).toEqual([{ layerId: 7, before: 'Welcome home', after: 'Come say hello' }])
    expect(plan.after.canvasData.square!.layers[1]).toEqual(input.currentProject.canvasData.square!.layers[1])
    expect(JSON.stringify(plan.after.canvasData.square!.layers[1])).toBe(JSON.stringify(input.currentProject.canvasData.square!.layers[1]))
    expect(plan.before).toEqual(input.currentProject)
    expect(await validateBridgeApply(input, plan)).toEqual(plan.after)
    expect(input.currentProject.canvasData.square!.layers[0]!.text).toBe('Welcome home')
  })
  it('accepts unchanged native document as a no-op', async () => {
    const input = await fixture()
    input.returned = native()
    expect((await planBridgeReturn(input)).changes).toEqual([])
  })
  it('rejects stale revision even after undo returns identical content', async () => {
    const input = await fixture()
    input.currentRevision++
    await expect(planBridgeReturn(input)).rejects.toThrow('Stale')
  })
  it('rejects source changes outside the mapped layer', async () => {
    const input = await fixture()
    input.currentProject.canvasData.square!.layers[1]!.x++
    await expect(planBridgeReturn(input)).rejects.toThrow('Stale')
  })
  it('rejects tampered sidecar and apply plan', async () => {
    const input = await fixture()
    const plan = await planBridgeReturn(input)
    plan.after.name = 'Injected'
    await expect(validateBridgeApply(input, plan)).rejects.toThrow('preview changed')
    input.sidecar.assessment[0]!.readOnly = true
    await expect(planBridgeReturn(input)).rejects.toThrow('sidecar')
  })
  it.each([{ copyLocked: true }, { locked: true }, { text: 'Terms apply' }, { text: 'Visit Main Street' }])('rejects protected text edits: %j', async (patch) => {
    await expect(planBridgeReturn(await fixture(patch))).rejects.toThrow('Protected')
  })
  it.each(['Save $500', 'Come\nvisit', 'New Subaru', '', 'Hello 🎉', 'שלום'])('rejects unsupported replacement %j', async (text) => {
    const input = await fixture()
    input.returned = native(text)
    await expect(planBridgeReturn(input)).rejects.toThrow('Unsupported or unsafe')
  })
  it.each(['font', 'transform', 'mask', 'image', 'add', 'delete', 'reorder', 'unknown'])('rejects native %s changes', async (change) => {
    const input = await fixture(), n = input.returned.layers[0]!
    if (change === 'font') n.content.font_family = 'Helvetica'
    if (change === 'transform') n.content.transform = { m: [2, 0, 0, 1, 10, 40] }
    if (change === 'mask') n.vector_mask = { inverted: true }
    if (change === 'image') n.content.kind = 'raster'
    if (change === 'add') input.returned.layers.push({ ...structuredClone(n), id: 4 })
    if (change === 'delete') input.returned.layers = []
    if (change === 'reorder') n.id = 99
    if (change === 'unknown') n.unrecognized_effect = true
    await expect(planBridgeReturn(input)).rejects.toThrow('Unsupported')
  })
  it('rejects duplicate identities and malformed run coverage', async () => {
    const input = await fixture()
    input.returned.layers.push(structuredClone(input.returned.layers[0]!))
    await expect(planBridgeReturn(input)).rejects.toThrow('identity')
    input.returned = native()
    input.returned.layers[0]!.content.runs = [{ len: 100, style: {} }]
    await expect(planBridgeReturn(input)).rejects.toThrow('run coverage')
    expect(() => assessBridgeLayers([layer(), layer()], faces)).toThrow('identity')
  })
  it.each([{ fontWeight: 900 }, { fontFamily: 'Unavailable' }, { text: 'Two\nlines' }, { rotation: 1 }, { textRuns: [{ text: 'Welcome home' }] }, { letterSpacing: '-3px' }, { textAlign: 'center' }, { textTexture: 'anything' }, { textShadow: '1px 1px black' }, { animIn: 'fadeIn' }, { platformQr: {} }, { isLogo: true }])('reports unsupported export %j without flattening', (patch) => {
    const result = assessBridgeLayers([layer(patch as Partial<Layer>)], faces)[0]!
    expect(result.kind).toBe('sidecar')
    expect(result.reasons.length).toBeGreaterThan(0)
  })
  it('supports embedded PNG and independent rect mask; rejects arbitrary paths and URLs', () => {
    const image = layer({ type: 'image', id: 1, src: 'data:image/png;base64,AA==', fit: 'fill' })
    // Build actual image shape without text-only properties.
    delete image.text
    delete image.fontFamily
    delete image.fontWeight
    delete image.fontSize
    delete image.color
    const mask = { id: 2, name: 'mask', type: 'rect', x: 20, y: 20, w: 30, h: 30, zIndex: 2, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, isMask: true, maskShape: 'rect', maskTargetIds: [1], maskInvert: true } as Layer
    expect(assessBridgeLayers([image, mask], faces).map(r => r.kind)).toEqual(['image', 'mask'])
    for (const src of ['https://example.com/image.png', 'file:///etc/passwd', '../secret', 'data:image/svg+xml;base64,AA==']) {
      expect(assessBridgeLayers([{ ...image, src }], faces)[0]!.kind).toBe('sidecar')
    }
    expect(assessBridgeLayers([image, { ...mask, maskShape: 'ellipse' }], faces).map(r => r.kind)).toEqual(['sidecar', 'sidecar'])
    expect(assessBridgeLayers([image, mask, { ...mask, id: 3 }], faces)[0]!.kind).toBe('sidecar')
  })
  it('uses deterministic SHA-256 and rejects non-JSON numbers', async () => {
    expect(await hashBridgeValue({ b: 2, a: 1 })).toBe(await hashBridgeValue({ a: 1, b: 2 }))
    await expect(hashBridgeValue({ a: Number.NaN })).rejects.toThrow('finite JSON')
  })
  it('accepts UTF-8 byte run lengths and ignores only the reopened native session ID', async () => {
    const input = await fixture({ text: 'You’re welcome' })
    input.returned = native('You’re invited')
    input.returned.id = 987
    expect((await planBridgeReturn(input)).changes[0]!.after).toBe('You’re invited')
    input.returned.layers[0]!.id = 987
    await expect(planBridgeReturn(input)).rejects.toThrow('Unsupported')
  })
  it('requires independent fit measurement and rejects a long otherwise-safe rewrite', async () => {
    const input = await fixture()
    await expect(planBridgeReturn({ ...input, measureText: undefined })).rejects.toThrow('measurement required')
    input.returned = native('WELCOME '.repeat(200).trim())
    await expect(planBridgeReturn(input)).rejects.toThrow('does not fit')
  })
  it.each([
    { left: -1, top: 0, right: 100, bottom: 24 },
    { left: 0, top: -1, right: 100, bottom: 24 },
    { left: 0, top: 0, right: 100, bottom: 41 },
    { left: 0, top: 0, right: Number.NaN, bottom: 24 }
  ])('rejects bad measured glyph bounds %j', async (bounds) => {
    await expect(planBridgeReturn({ ...await fixture(), measureText: () => bounds })).rejects.toThrow('does not fit')
  })
  it('rechecks renderer measurements at apply and rejects changed metrics', async () => {
    const input = await fixture(), plan = await planBridgeReturn(input)
    await expect(validateBridgeApply({ ...input, measureText: () => ({ left: 0, top: 0, right: 150, bottom: 25 }) }, plan)).rejects.toThrow('preview changed')
  })
  it.each(['project', 'returned', 'sidecar', 'revision'])('rejects %s mutation during async measurement', async (target) => {
    const input = await fixture()
    const measure = input.measureText
    const raced = { ...input, measureText: async (l: Layer, text: string) => {
      await Promise.resolve()
      if (target === 'project') raced.currentProject.name = 'Changed'
      if (target === 'returned') raced.returned.layers[0]!.content.font_family = 'Changed'
      if (target === 'sidecar') raced.sidecar.boardKey = 'Changed'
      if (target === 'revision') raced.currentRevision++
      return measure(l, text)
    } }
    await expect(planBridgeReturn(raced)).rejects.toThrow('changed during')
  })
})
