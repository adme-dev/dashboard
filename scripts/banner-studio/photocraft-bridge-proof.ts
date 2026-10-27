import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { planBridgeReturn, validateBridgeApply, hashBridgeValue, type NativeDocument } from '../../shared/bannerDocumentBridge'
import { startPhotoCraft, readPhotoCraftArchive } from './photocraft-control'
import { createPhotoCraftTextMeasurer, exportPhotoCraftProject, proposePhotoCraftReturn } from './photocraft-bridge'

// Deliberately fixed owned input. No user-supplied URL/path or external asset fetches.
const root = resolve('output/editable-artwork-bridge', `proof-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`)
await mkdir(root, { recursive: true })
const write = (name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2))
const original = JSON.parse(await readFile('output/editable-artwork-pilot/project.json', 'utf8')) as BannerProject
const source = structuredClone(original)
const boardKey = 'custom_2480x3508', size = { width: 2480, height: 3508 }
const originalLayers = original.canvasData[boardKey]!.layers
assert.equal(originalLayers.length, 124)
assert.equal(originalLayers.find(l => l.id === 5)!.fontWeight, 900)
// Explicit separate fixture addition, approved by coordinator. Original 124 layers are byte-for-byte retained.
const heading: Layer = {
  id: 125, name: 'Bridge proof: explicitly rebuilt supported heading', type: 'text',
  x: 141, y: 800, w: 2233, h: 140, zIndex: 125, opacity: 1,
  animIn: 'none', animInDur: 0, startTime: 0, endTime: 5,
  text: 'COME CELEBRATE OUR NEW HOME', fontFamily: 'Arial', fontWeight: 700,
  fontSize: 100, color: '#071e46', textAlign: 'left', lineHeight: 1.2, copyLocked: false
}
source.canvasData[boardKey]!.layers.push(heading)
await write('original-project.json', original)
await write('bridge-source-project.json', source)
const pc = await startPhotoCraft(root)
const checks: Record<string, boolean> = {}
try {
  const fonts = await pc.execute('type.fonts', { family: 'Arial' })
  await write('exact-font-faces.json', fonts)
  assert(!fonts.faces.some((f: { weight: number }) => f.weight === 900))
  const exportBoard = (project: BannerProject, key: string, dimensions: typeof size, prefix: string) => exportPhotoCraftProject({ pc, project, key, dimensions, prefix, root, revision: 1 })

  const lifestyle = await exportBoard(source, boardKey, size, 'lifestyle')
  checks.original124Unchanged = JSON.stringify(source.canvasData[boardKey]!.layers.slice(0, 124)) === JSON.stringify(originalLayers)
  checks.originalHeadingExplicitlyExcluded = lifestyle.sidecar.assessment.find(r => r.id === 5)?.kind === 'sidecar'
  checks.realBackgroundAndTextMapped = lifestyle.mappings.some(m => m.bannerId === 1) && lifestyle.mappings.some(m => m.bannerId < 125 && source.canvasData[boardKey]!.layers.find(l => l.id === m.bannerId)!.type === 'text')
  const nativeHeading = lifestyle.mappings.find(m => m.bannerId === 125)!.nativeId
  await pc.call('app.open', { path: 'lifestyle.pcraft' })
  await pc.call('app.save', { path: 'lifestyle-before.png' })
  const beforeInfo = await pc.execute('type.info', { layer: nativeHeading })
  assert.equal(beforeInfo.text, heading.text)
  await pc.execute('type.edit', { layer: nativeHeading, text: 'COME CELEBRATE WITH US' })
  const afterInfo = await pc.execute('type.info', { layer: nativeHeading })
  assert.equal(afterInfo.text, 'COME CELEBRATE WITH US')
  assert(afterInfo.lines[0].x1 - afterInfo.lines[0].x0 <= heading.w)
  await pc.call('app.save', { path: 'lifestyle-return.pcraft' })
  await pc.call('app.save', { path: 'lifestyle-after.png' })
  const returnedArchive = readPhotoCraftArchive(join(root, 'lifestyle-return.pcraft'))
  await write('lifestyle-return-archive.json', returnedArchive)
  // Native tile names are not trusted to describe actual bytes. Unchanged raster/mask payloads must match.
  type RasterLayer = { content: { kind: string, surface: { tiles: Array<{ hash: string }> } }, mask?: { surface: { tiles: Array<{ hash: string }> } } }
  const rasterTiles = lifestyle.archive.manifest.document.layers.filter((l: RasterLayer) => l.content.kind === 'raster').flatMap((l: RasterLayer) => [...l.content.surface.tiles, ...(l.mask?.surface.tiles ?? [])])
  checks.rasterPayloadsUnchanged = rasterTiles.every((t: { hash: string }) => lifestyle.archive.payloads[`tiles/${t.hash}.zst`] === returnedArchive.payloads[`tiles/${t.hash}.zst`])
  assert(checks.rasterPayloadsUnchanged)
  const input = { sidecar: lifestyle.sidecar, expectedSidecarHash: lifestyle.sidecarHash, currentProject: source, currentRevision: 1, returned: returnedArchive.manifest.document as NativeDocument, measureText: createPhotoCraftTextMeasurer(pc) }
  const { plan } = await proposePhotoCraftReturn({ ...input, nativePath: join(root, 'lifestyle-return.pcraft') })
  assert.deepEqual(plan.changes, [{ layerId: 125, before: heading.text, after: 'COME CELEBRATE WITH US' }])
  const applied = await validateBridgeApply(input, plan)
  await write('lifestyle-return-document.json', input.returned)
  await write('lifestyle-plan.json', plan)
  await write('lifestyle-applied-project.json', applied)
  checks.returnMapsOnlyRebuiltHeading = plan.changes.length === 1 && plan.changes[0]!.layerId === 125
  checks.original124UnchangedAfterReturn = JSON.stringify(applied.canvasData[boardKey]!.layers.slice(0, 124)) === JSON.stringify(originalLayers)
  checks.exactSupportedText = lifestyle.mappings.every((m) => {
    const layer = source.canvasData[boardKey]!.layers.find(l => l.id === m.bannerId)!
    return layer.type !== 'text' || lifestyle.sidecar.nativeBaseline.layers.find(l => l.id === m.nativeId)!.content.text === layer.text
  })
  await pc.execute('edit.undo')
  assert.equal((await pc.execute('type.info', { layer: nativeHeading })).text, heading.text)
  await pc.call('app.save', { path: 'lifestyle-undone.png' })
  const pixels = async (name: string) => sharp(join(root, name)).ensureAlpha().raw().toBuffer()
  checks.nativeUndoPixelExact = (await pixels('lifestyle-before.png')).equals(await pixels('lifestyle-undone.png'))
  const protectedMapping = lifestyle.mappings.find(m => m.bannerId !== 125 && source.canvasData[boardKey]!.layers.find(l => l.id === m.bannerId)!.type === 'text')!
  await pc.execute('type.edit', { layer: protectedMapping.nativeId, text: 'Altered protected wording' })
  await pc.call('app.save', { path: 'lifestyle-protected-rejected.pcraft' })
  await assert.rejects(planBridgeReturn({ ...input, returned: readPhotoCraftArchive(join(root, 'lifestyle-protected-rejected.pcraft')).manifest.document }), /Protected/)
  checks.actualProtectedReturnRejected = true
  await pc.execute('edit.undo')
  await pc.call('app.open', { path: 'lifestyle-return.pcraft' })
  checks.editedNativeReopenExact = (await pc.execute('type.info', { layer: nativeHeading })).text === 'COME CELEBRATE WITH US'
  await assert.rejects(planBridgeReturn({ ...input, currentRevision: 2 }), /Stale/)
  checks.staleRevisionRejected = true
  const overflowing = structuredClone(input.returned)
  const overflowText = 'WELCOME '.repeat(200).trim()
  const overflowingHeading = overflowing.layers.find(l => l.id === nativeHeading)!.content
  overflowingHeading.text = overflowText
  for (const collection of [overflowingHeading.runs, overflowingHeading.paragraphs]) {
    for (const run of collection as Array<{ len: number }>) run.len = new TextEncoder().encode(overflowText).length
  }
  await assert.rejects(planBridgeReturn({ ...input, returned: overflowing }), /does not fit/)
  checks.actualLongTextFitRejected = true

  const png = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 240, g: 80, b: 40, alpha: 128 / 255 } } }).png().toBuffer()
  const base = { x: 32, y: 96, w: 128, h: 128, zIndex: 1, opacity: 1, animIn: 'none' as const, animInDur: 0, startTime: 0, endTime: 5 }
  const synthetic: BannerProject = { ...structuredClone(original), id: 'bridge-synthetic-mask', name: 'Explicit synthetic alpha and mask fixture', canvasData: { square: { layers: [
    { ...base, id: 1, name: 'Unflattened source alpha', type: 'image', src: `data:image/png;base64,${png.toString('base64')}`, fit: 'fill' },
    { ...base, id: 2, name: 'Independent inverted rectangle', type: 'rect', x: 80, y: 128, w: 48, h: 48, zIndex: 2, isMask: true, maskShape: 'rect', maskTargetIds: [1], maskInvert: true }
  ] } } }
  const masks = await exportBoard(synthetic, 'square', { width: 256, height: 256 }, 'mask')
  await write('mask-source-project.json', synthetic)
  await pc.call('app.open', { path: 'mask.pcraft' })
  await pc.call('app.save', { path: 'mask-enabled.png' })
  const maskImage = masks.mappings[0]!.nativeId
  await pc.execute('layer.vectorMask.edit', { layer: maskImage, enabled: false })
  await pc.call('app.save', { path: 'mask-disabled.png' })
  await pc.call('app.save', { path: 'mask-change-rejected.pcraft' })
  await assert.rejects(planBridgeReturn({ sidecar: masks.sidecar, expectedSidecarHash: masks.sidecarHash, currentProject: synthetic, currentRevision: 1, returned: readPhotoCraftArchive(join(root, 'mask-change-rejected.pcraft')).manifest.document }), /Unsupported/)
  checks.actualMaskChangeRejected = true
  await pc.execute('edit.undo')
  await pc.call('app.save', { path: 'mask-restored.png' })
  const enabled = await pixels('mask-enabled.png'), disabled = await pixels('mask-disabled.png'), restored = await pixels('mask-restored.png')
  const sample = (buffer: Buffer, x: number, y: number) => [...buffer.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)]
  const samples = { outside: sample(enabled, 0, 0), interior: sample(enabled, 50, 150), maskedHole: sample(enabled, 100, 150), unmaskedHole: sample(disabled, 100, 150) }
  assert.deepEqual(samples.outside, [0, 0, 0, 0])
  assert.deepEqual(samples.interior, [240, 80, 40, 128])
  assert.deepEqual(samples.maskedHole, [0, 0, 0, 0])
  assert.deepEqual(samples.unmaskedHole, [240, 80, 40, 128])
  checks.alphaAndIndependentMask = true
  checks.maskUndoPixelExact = enabled.equals(restored)
  await write('alpha-mask-evidence.json', { samples, maskUndoPixelExact: checks.maskUndoPixelExact, nativeVectorMask: masks.sidecar.nativeBaseline.layers[0]!.vector_mask })
  for (const [name, value] of Object.entries(checks)) assert(value, name)
  const sourceFiles = ['shared/bannerDocumentBridge.ts', 'scripts/banner-studio/photocraft-bridge.ts', 'scripts/banner-studio/photocraft-bridge-proof.ts', 'scripts/banner-studio/photocraft-control.ts', 'scripts/banner-studio/photocraft-read-archive.py']
  const sourceHashes: Record<string, string> = {}
  for (const file of sourceFiles) sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
  await write('source-provenance.json', { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), originMain: execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(), sourceHashes })
  await write('acceptance.json', { checks, sourceHash: await hashBridgeValue(original), sourceFileSha256: createHash('sha256').update(await readFile('output/editable-artwork-pilot/project.json')).digest('hex'), originalLayerCount: 124, fixtureLayerCount: 125, mapped: lifestyle.mappings, excluded: lifestyle.sidecar.assessment.filter(r => r.kind === 'sidecar'), limitations: ['Partial supported subset, not complete artwork fidelity', 'Separate explicit rebuilt Arial Bold heading; original Arial 900 heading excluded', 'No production/editor integration or hosted execution claimed', 'Return supports wording only; masks/images remain immutable'] })
  await writeFile(resolve('output/editable-artwork-bridge/latest.json'), JSON.stringify({ root, accepted: true }, null, 2))
  console.log(JSON.stringify({ root, checks, mapped: lifestyle.mappings.length }, null, 2))
} finally {
  await pc.stop()
}
