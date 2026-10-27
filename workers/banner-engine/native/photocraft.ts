import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, lstat, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { BannerProject, Layer } from '../../../app/types/banner-studio'
import { assessBridgeLayers, canonicalBridgeJson, createBridgeSidecar, hashBridgeValue, planBridgeReturn, type BridgeSidecar, type BridgeTextMeasurer, type BridgeTextMeasurement, type NativeDocument } from '../../../shared/bannerDocumentBridge'
import { FONT_FACE, assertSupportedText, loadFontRuntime, executeFontContainer } from '../fonts/runtime.mjs'

type Runtime = Awaited<ReturnType<typeof loadFontRuntime>>
type Options = { root: string, manifestPath?: string }
export type LinuxSidecar = BridgeSidecar & { linuxBinding: ReturnType<typeof binding>, nativeArchiveHash: string }
export type LinuxReturnOptions = Options & { sidecar: LinuxSidecar, expectedSidecarHash: string, currentProject: BannerProject, currentRevision: number, nativePath: string }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const writeJson = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const binding = (runtime: Runtime) => ({ version: 'linux-text-v1', imageId: runtime.imageId, font: runtime.font, capabilityProofSha256: runtime.capability.capabilityProofSha256 })

/** Reuse the bounded no-extraction archive reader, with a hard subprocess deadline. */
export function readLinuxArchive(path: string): { manifest: { document: NativeDocument }, payloads: Record<string, string> } {
  return JSON.parse(execFileSync('python3', [resolve('workers/banner-engine/native/inspect_archive.py'), resolve(path)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] }))
}

export function assessLinuxLayers(layers: Layer[], font: Runtime['font']) {
  return assessBridgeLayers(layers, [FONT_FACE]).map((report) => {
    if (report.kind === 'image' || report.kind === 'mask') {
      report.kind = 'sidecar'
      report.reasons.push('Linux text-only subset preserves images and masks in the original sidecar')
    }
    if (report.kind === 'text') {
      try {
        const layer = layers.find(l => l.id === report.id)!
        assertSupportedText(layer, layer.text!, font)
      } catch (error) {
        report.kind = 'sidecar'
        report.reasons.push(String(error))
      }
    }
    return report
  })
}

function fits(bounds: BridgeTextMeasurement, layer: Layer) {
  return [bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) && bounds.left >= 0 && bounds.top >= 0 && bounds.right > bounds.left && bounds.bottom > bounds.top && bounds.right <= layer.w && bounds.bottom <= layer.h
}

function outputs(logs: string) {
  return logs.trim().split('\n').filter(Boolean).map((line) => {
    // A warning, including fallback stderr, is never quietly skipped.
    const value = JSON.parse(line)
    assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid native command envelope')
    const diagnostics = [value.warnings, value.errors, value.error, value.result?.warnings, value.result?.errors, value.result?.error]
    assert(diagnostics.every(d => d === undefined || d === null || (Array.isArray(d) && d.length === 0)), 'Native warning, error or font substitution')
    return value
  })
}

async function sentinel(root: string) {
  const path = join(root, `mount-${randomUUID()}.bin`)
  await writeFile(path, 'Linux bridge inert mount\n', { flag: 'wx', mode: 0o444 })
  return path
}

async function receipt(root: string, operation: string, value: unknown) {
  await writeJson(join(root, `${operation}-${randomUUID()}.json`), value)
}

async function reserve(root: string, operation: string) {
  // A durable exclusive intent is written before any container can run. A failed
  // operation owns this root permanently; callers must use a new root, never retry it.
  const file = await open(join(root, 'operation-intent.json'), 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify({ operation, createdAt: new Date().toISOString() }) + '\n')
    await file.sync()
  } finally { await file.close() }
  const directory = await open(root, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

export async function measureFontText(runtime: Runtime, layer: Layer, text: string, options: { inputPath: string }) {
  assertSupportedText(layer, text, runtime.font)
  assert(text.length * layer.fontSize! ** 2 <= 16_777_216, 'Text measurement exceeds resource budget')
  const executed = await executeFontContainer(runtime, { inputPath: options.inputPath, command: ['run', '--new', '{"width":4096,"height":4096,"background":"transparent","resolution":72}', '--cmd', 'type.create', '--params', JSON.stringify({ x: 0, y: 0, text, font: layer.fontFamily, weight: layer.fontWeight ?? 400, size: layer.fontSize, color: layer.color }), '--cmd', 'type.info'] })
  const info = outputs(executed.logs).find(r => r.command === 'type.info')?.result
  assert(info && info.lines?.length === 1 && info.runs?.length === 1, 'Unsupported native text measurement')
  const style = info.runs[0].style
  assert.equal(style.font_family, FONT_FACE.family, 'Font family substitution')
  assert.equal(style.postscript_name, FONT_FACE.postscriptName, 'PostScript font substitution')
  assert.equal(style.weight, FONT_FACE.weight, 'Font weight substitution')
  assert.equal(style.faux_bold, false, 'Synthetic bold rejected')
  assert.equal(style.faux_italic, false, 'Synthetic italic rejected')
  const line = info.lines[0], lineHeight = layer.fontSize! * (layer.lineHeight ?? 1.2)
  assert([line.ascent, line.descent, line.x0, line.x1, ...info.bounds].every(Number.isFinite), 'Invalid font measurements')
  const baseline = (lineHeight - line.ascent - line.descent) / 2 + line.ascent
  return { bounds: { left: Math.min(line.x0, info.bounds[0]), top: Math.min(0, baseline + info.bounds[1]), right: Math.max(line.x1, info.bounds[2]), bottom: Math.max(lineHeight, baseline + info.bounds[3]) }, baseline, ascent: line.ascent, descent: line.descent, info, receipt: executed }
}

/** Reconstruct text in a fresh Linux process for every call; never trust returned cache metrics. */
export function createLinuxTextMeasurer(options: Options & { expectedBinding?: LinuxSidecar['linuxBinding'] }): BridgeTextMeasurer {
  const owned = structuredClone(options)
  return async (layer, text) => {
    const original = structuredClone(layer)
    const runtime = await loadFontRuntime('photocraft', owned.manifestPath)
    if (owned.expectedBinding) assert.equal(canonicalBridgeJson(binding(runtime)), canonicalBridgeJson(owned.expectedBinding), 'Measurement runtime binding changed')
    const result = await measureFontText(runtime, original, text, { inputPath: await sentinel(owned.root) })
    await receipt(owned.root, 'measurement', result)
    return result.bounds
  }
}

/** Only the fixed text constructor is exposed; callers cannot supply engine commands. */
export async function exportLinuxProject(options: Options & { project: BannerProject, key: string, dimensions: { width: number, height: number }, revision: number, layerIds?: number[] }) {
  const originalOptions = options, initial = canonicalBridgeJson(options)
  options = structuredClone(options)
  const project = structuredClone(options.project), dimensions = structuredClone(options.dimensions), key = options.key, revision = options.revision
  const layers = project.canvasData[key]?.layers
  assert(layers && layers.length <= 500, 'Unknown or oversized artboard')
  assert([dimensions.width, dimensions.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096), 'Canvas exceeds 4096 pixels')
  assert(Number.isSafeInteger(revision) && revision >= 0, 'Invalid revision')
  const requested = options.layerIds === undefined ? null : new Set(options.layerIds)
  if (requested) assert(Array.isArray(options.layerIds) && requested.size > 0 && requested.size <= 32 && requested.size === options.layerIds!.length && [...requested].every(id => Number.isSafeInteger(id) && id > 0 && layers.filter(layer => layer.id === id).length === 1), 'Invalid selected layer IDs')
  await reserve(options.root, 'export')
  const runtime = await loadFontRuntime('photocraft', options.manifestPath)
  const inputPath = await sentinel(options.root)
  const assessment = assessLinuxLayers(layers, runtime.font)
  // Assess dependencies against the complete board before narrowing native work.
  for (const report of assessment) {
    if (requested?.has(report.id)) assert(report.kind === 'text' && !report.readOnly, 'Selected layer is unsupported or protected')
    else if (requested) {
      report.kind = 'sidecar'
      report.reasons.push('Not selected for native export')
    }
  }
  assert(assessment.filter(a => a.kind === 'text').length <= 32, 'Linux export supports at most 32 text candidates')
  const selected: Array<{ layer: Layer, baseline: number }> = []
  for (const layer of [...layers].sort((a, b) => a.zIndex - b.zIndex)) {
    const report = assessment.find(a => a.id === layer.id)!
    if (report.kind !== 'text') continue
    const measurement = await measureFontText(runtime, layer, layer.text!, { inputPath })
    await receipt(options.root, 'export-measurement', measurement)
    if (!fits(measurement.bounds, layer) || layer.x < 0 || layer.y < 0 || layer.x + layer.w > dimensions.width || layer.y + layer.h > dimensions.height) {
      assert(!requested, 'Selected layer does not fit the unchanged canvas/box')
      report.kind = 'sidecar'
      report.reasons.push('Fresh exact-font text bounds or placement exceed the unchanged canvas/box')
      continue
    }
    selected.push({ layer, baseline: measurement.baseline })
  }
  assert(selected.length > 0 && selected.length <= 32, 'Linux export requires 1 to 32 supported text layers')
  const command = ['run', '--new', JSON.stringify({ ...dimensions, background: 'transparent', resolution: 72, name: 'Banner Linux text subset' })]
  for (const { layer, baseline } of selected) {
    command.push('--cmd', 'type.create', '--params', JSON.stringify({ x: layer.x, y: layer.y + baseline, text: layer.text, font: layer.fontFamily, weight: layer.fontWeight ?? 400, size: layer.fontSize, color: layer.color, name: `banner:${layer.id}` }))
    command.push('--cmd', 'layer.setProps', '--params', JSON.stringify({ visible: !layer.hidden, opacity: layer.opacity }))
  }
  // The native CLI allocates IDs per process; its initial layer has a stable
  // name distinct from our namespaced headings. The final mapping is inspected.
  command.push('--cmd', 'layer.delete', '--params', '{"layer":"Layer 1"}', '--out', '/output/document.pcraft')
  const nativePath = join(options.root, 'document.pcraft')
  const executed = await executeFontContainer(runtime, { inputPath, command, collect: '/output/document.pcraft', outputPath: nativePath })
  outputs(executed.logs)
  await receipt(options.root, 'export', executed)
  const archive = readLinuxArchive(nativePath)
  const nativeBaseline = archive.manifest.document
  assert.equal(nativeBaseline.layers.length, selected.length, 'Native constructor layer count changed')
  const mappings = selected.map(({ layer }) => {
    const native = nativeBaseline.layers.find(n => n.name === `banner:${layer.id}`)
    assert(native && native.content.kind === 'text' && native.content.text === layer.text, 'Native constructor mapping changed')
    const runs = native.content.runs as Array<{ style: Record<string, unknown> }>
    assert(runs.length === 1, 'Unsupported exported native style runs')
    const style = runs[0]!.style
    assert.equal(style.font_family, FONT_FACE.family, 'Exported font family substitution')
    assert.equal(style.postscript_name, FONT_FACE.postscriptName, 'Exported PostScript font substitution')
    assert.equal(style.weight, FONT_FACE.weight, 'Exported font weight substitution')
    assert.equal(style.faux_bold, false)
    assert.equal(style.faux_italic, false)
    return { bannerId: layer.id, nativeId: native.id }
  })
  const sealed = await createBridgeSidecar({ revision, snapshot: project, boardKey: key, size: dimensions, mappings, assessment, nativeBaseline, nativePayloadHashes: {} })
  const sidecar: LinuxSidecar = { ...sealed.sidecar, linuxBinding: binding(runtime), nativeArchiveHash: sha(await readFile(nativePath)) }
  const sidecarHash = await hashBridgeValue(sidecar)
  assert.equal(canonicalBridgeJson(originalOptions), initial, 'Export inputs changed during execution')
  await writeJson(join(options.root, 'document-sidecar.json'), sidecar)
  await writeJson(join(options.root, 'document-binding.json'), { sidecarHash, sourceHash: sidecar.sourceHash, revision, linuxBinding: sidecar.linuxBinding })
  await writeJson(join(options.root, 'document-assessment.json'), assessment)
  return { sidecar, sidecarHash, mappings, nativePath }
}

async function stageNative(nativePath: string, root: string) {
  const stat = await lstat(nativePath)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024 * 1024, 'Native input must be a regular file up to 64 MiB')
  const bytes = await readFile(nativePath)
  assert(bytes.length <= 64 * 1024 * 1024, 'Native input grew beyond limit')
  const staged = join(root, `input-${randomUUID()}.pcraft`)
  await writeFile(staged, bytes, { flag: 'wx', mode: 0o444 })
  return { staged, originalHash: sha(bytes) }
}

async function validateReturn(options: LinuxReturnOptions, staged: string, runtime: Runtime) {
  assert.equal(await hashBridgeValue(options.sidecar), options.expectedSidecarHash, 'Untrusted or changed sidecar')
  assert.equal(canonicalBridgeJson(options.sidecar.linuxBinding), canonicalBridgeJson(binding(runtime)), 'Altered Linux font/runtime binding')
  assert.deepEqual(options.sidecar.nativePayloadHashes, {}, 'Only text-only Linux sidecars are accepted')
  const returned = readLinuxArchive(staged).manifest.document
  const plan = await planBridgeReturn({ ...options, returned, measureText: createLinuxTextMeasurer({ ...options, expectedBinding: options.sidecar.linuxBinding }) })
  return { returned, plan }
}

/** Archive import inspects data only; external archive caches never execute for measurement. */
export async function proposeLinuxReturn(options: LinuxReturnOptions) {
  const initial = canonicalBridgeJson(options)
  const owned = structuredClone(options)
  await reserve(owned.root, 'import')
  const runtime = await loadFontRuntime('photocraft', owned.manifestPath)
  const { staged, originalHash } = await stageNative(owned.nativePath, owned.root)
  const result = await validateReturn(owned, staged, runtime)
  assert.equal(sha(await readFile(owned.nativePath)), originalHash, 'Native source changed during inspection')
  assert.equal(canonicalBridgeJson(options), initial, 'Return inputs changed during execution')
  await writeJson(join(owned.root, 'returned-document.json'), result.returned)
  await writeJson(join(owned.root, 'proposal.json'), result.plan)
  return result
}

/** A selected wording edit is validated before native execution and after save/reopen. */
export async function editLinuxWording(options: LinuxReturnOptions & { layerId: number, text: string }) {
  const initial = canonicalBridgeJson(options), owned = structuredClone(options)
  await reserve(owned.root, 'edit')
  const runtime = await loadFontRuntime('photocraft', owned.manifestPath)
  const { staged, originalHash } = await stageNative(owned.nativePath, owned.root)
  assert.equal(await hashBridgeValue(owned.sidecar), owned.expectedSidecarHash, 'Untrusted or changed sidecar')
  assert(/^[a-f0-9]{64}$/.test(owned.sidecar.nativeArchiveHash), 'Missing exact exported archive binding')
  assert.equal(originalHash, owned.sidecar.nativeArchiveHash, 'Selected edit requires exact exported archive bytes')
  const current = await validateReturn(owned, staged, runtime)
  assert.equal(current.plan.changes.length, 0, 'Selected edit requires unchanged exported native baseline')
  const mapping = owned.sidecar.mappings.find(m => m.bannerId === owned.layerId)
  assert(mapping && typeof owned.text === 'string', 'Selected layer is not mapped')
  const candidate = structuredClone(current.returned), native = candidate.layers.find(l => l.id === mapping.nativeId)!
  assert(native.content.kind === 'text', 'Only selected text can change')
  native.content.text = owned.text
  for (const field of ['runs', 'paragraphs'] as const) {
    const records = native.content[field] as Array<{ len: number }>
    assert(Array.isArray(records) && records.length === 1, 'Unsupported text structure')
    records[0]!.len = new TextEncoder().encode(owned.text).length
  }
  await planBridgeReturn({ ...owned, returned: candidate, measureText: createLinuxTextMeasurer({ ...owned, expectedBinding: owned.sidecar.linuxBinding }) })
  const editedPath = join(owned.root, 'edited.pcraft')
  const edit = await executeFontContainer(runtime, { inputPath: staged, command: ['run', '/input/document.pcraft', '--cmd', 'type.edit', '--params', JSON.stringify({ layer: mapping.nativeId, text: owned.text }), '--out', '/output/edited.pcraft'], collect: '/output/edited.pcraft', outputPath: editedPath })
  outputs(edit.logs)
  await receipt(owned.root, 'edit', edit)
  await validateReturn(owned, editedPath, runtime)
  const nativePath = join(owned.root, 'document.pcraft')
  const reopen = await executeFontContainer(runtime, { inputPath: editedPath, command: ['convert', '/input/document.pcraft', '/output/document.pcraft'], collect: '/output/document.pcraft', outputPath: nativePath })
  outputs(reopen.logs)
  await receipt(owned.root, 'reopen', reopen)
  const result = await validateReturn(owned, nativePath, runtime)
  assert.deepEqual(result.plan.changes, [{ layerId: owned.layerId, before: owned.currentProject.canvasData[owned.sidecar.boardKey]!.layers.find(l => l.id === owned.layerId)!.text, after: owned.text }], 'Native edit did not produce exactly the selected wording change')
  assert.equal(sha(await readFile(owned.nativePath)), originalHash, 'Native source changed during edit')
  assert.equal(canonicalBridgeJson(options), initial, 'Edit inputs changed during execution')
  await writeJson(join(owned.root, 'returned-document.json'), result.returned)
  await writeJson(join(owned.root, 'proposal.json'), result.plan)
  return { ...result, nativePath }
}
