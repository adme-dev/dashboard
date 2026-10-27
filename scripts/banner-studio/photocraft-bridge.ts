import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { BannerProject } from '../../app/types/banner-studio'
import { assessBridgeLayers, createBridgeSidecar, planBridgeReturn, hashBridgeValue, type BridgeSidecar, type NativeDocument, type BridgeMapping, type BridgeTextMeasurer } from '../../shared/bannerDocumentBridge'
import { startPhotoCraft, readPhotoCraftArchive } from './photocraft-control'

type PhotoCraft = Awaited<ReturnType<typeof startPhotoCraft>>
/** Reconstruct approved style in a scratch document. Returned native caches are never fit evidence. */
export function createPhotoCraftTextMeasurer(pc: PhotoCraft): BridgeTextMeasurer {
  return async (layer, text) => {
    assert(text.length * layer.fontSize! ** 2 <= 16_777_216, 'Text measurement exceeds local resource budget')
    const fonts = await pc.execute('type.fonts', { family: layer.fontFamily })
    const exact = fonts.faces.find((f: { family: string, weight: number, italic: boolean }) => f.family === layer.fontFamily && f.weight === (layer.fontWeight ?? 400) && !f.italic)
    assert(exact, 'Exact font face unavailable during return measurement')
    await pc.execute('file.new', { width: 4096, height: 4096, background: 'transparent', resolution: 72, name: 'Bridge return fit measurement' })
    try {
      await pc.execute('type.create', { x: 0, y: 0, text, font: layer.fontFamily, weight: layer.fontWeight ?? 400, size: layer.fontSize, color: layer.color })
      const info = await pc.execute('type.info')
      assert.equal(info.lines.length, 1, 'Return text must remain one line')
      assert.equal(info.runs.length, 1, 'Return text must have one style run')
      assert.equal(info.runs[0].style.postscript_name, exact.postscriptName, 'Font fallback during fit measurement')
      assert.equal(info.runs[0].style.faux_bold, false)
      assert.equal(info.runs[0].style.faux_italic, false)
      const line = info.lines[0], lineHeight = layer.fontSize! * (layer.lineHeight ?? 1.2)
      const baseline = (lineHeight - line.ascent - line.descent) / 2 + line.ascent
      return { left: Math.min(line.x0, info.bounds[0]), top: Math.min(0, baseline + info.bounds[1]), right: Math.max(line.x1, info.bounds[2]), bottom: Math.max(lineHeight, baseline + info.bounds[3]) }
    } finally { await pc.execute('file.close') }
  }
}

export async function exportPhotoCraftProject(options: {
  pc: PhotoCraft
  project: BannerProject
  key: string
  dimensions: { width: number, height: number }
  prefix: string
  root: string
  revision: number
}) {
  const { pc, project, key, dimensions, prefix, root, revision } = options
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(prefix), 'Unsafe output prefix')
  assert(Object.hasOwn(project.canvasData, key), 'Unknown artboard')
  assert(project.canvasData[key]!.layers.length <= 500, 'Too many layers')
  assert([dimensions.width, dimensions.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096), 'Canvas exceeds 4096 pixels')
  const families = [...new Set(project.canvasData[key]!.layers.filter(l => l.type === 'text').map(l => l.fontFamily).filter((f): f is string => typeof f === 'string'))]
  assert(families.length <= 32 && families.every(f => f.length <= 128), 'Too many or invalid font families')
  const fonts: { faces: Array<{ family: string, weight: number, italic: boolean, postscriptName: string }> } = { faces: [] }
  for (const family of families) fonts.faces.push(...(await pc.execute('type.fonts', { family })).faces)
  const write = (name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2), { flag: 'wx' })
  const layers = project.canvasData[key]!.layers
  const assessment = assessBridgeLayers(layers, fonts.faces)
  const mappings: BridgeMapping[] = []
  const commands = await pc.call('engine.commands')
  if (commands.find((c: { id: string, enabled: boolean }) => c.id === 'file.closeAll')?.enabled) await pc.execute('file.closeAll')
  await pc.execute('file.new', { ...dimensions, background: 'transparent', resolution: 72, name: prefix })
  const initial = await pc.execute('document.inspect')
  for (const layer of [...layers].sort((a, b) => a.zIndex - b.zIndex)) {
    const report = assessment.find(r => r.id === layer.id)!
    if (!['text', 'image'].includes(report.kind)) continue
    let nativeId: number
    if (report.kind === 'text') {
      await pc.execute('type.create', { x: layer.x, y: 0, text: layer.text, font: layer.fontFamily, size: layer.fontSize, weight: layer.fontWeight ?? 400, color: layer.color, name: `banner:${layer.id}:${layer.name}` })
      const info = await pc.execute('type.info')
      nativeId = info.layer
      const line = info.lines[0]
      const face = info.runs[0]?.style
      const exactFace = fonts.faces.find((f: { family: string, weight: number, italic: boolean }) => f.family === layer.fontFamily && f.weight === (layer.fontWeight ?? 400) && !f.italic)
      assert.equal(face.font_family, layer.fontFamily)
      assert.equal(face.postscript_name, exactFace.postscriptName)
      assert.equal(face.weight, layer.fontWeight ?? 400)
      assert.equal(face.faux_bold, false)
      assert.equal(face.faux_italic, false)
      const lineHeight = layer.fontSize! * (layer.lineHeight ?? 1.2)
      const fits = info.lines.length === 1 && line.x1 - line.x0 <= layer.w && Math.max(lineHeight, line.ascent + line.descent) <= layer.h
      if (!fits) {
        await pc.execute('layer.delete', { layer: nativeId })
        report.kind = 'sidecar'
        report.reasons.push('Measured point text does not fit; paragraph wrapping is unsupported')
        continue
      }
      const baseline = layer.y + (lineHeight - line.ascent - line.descent) / 2 + line.ascent
      await pc.execute('type.edit', { layer: nativeId, move: [0, baseline] })
    } else {
      const bytes = Buffer.from(layer.src!.split(',')[1]!, 'base64')
      const meta = await sharp(bytes, { limitInputPixels: 16_777_216 }).metadata()
      assert.equal(meta.format, 'png')
      assert(meta.width && meta.height && meta.width <= 4096 && meta.height <= 4096 && (meta.pages ?? 1) === 1)
      assert(layer.x >= 0 && layer.y >= 0 && layer.x + layer.w <= dimensions.width && layer.y + layer.h <= dimensions.height, 'Image placement outside bounded canvas')
      const placed = await sharp(bytes, { limitInputPixels: 16_777_216 }).ensureAlpha().resize(layer.w, layer.h, { fit: 'fill' }).extend({ left: layer.x, top: layer.y, right: dimensions.width - layer.x - layer.w, bottom: dimensions.height - layer.y - layer.h, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      const asset = `${prefix}-asset-${layer.id}.png`
      await writeFile(join(root, asset), placed)
      await pc.call('app.open', { path: asset })
      await pc.execute('select.all')
      await pc.execute('edit.copy')
      await pc.execute('document.activate', { document: 0 })
      // Clipboard retains document coordinates. A centre argument centres the tight
      // nontransparent bounds and would move an asset with transparent margins.
      await pc.execute('edit.paste', { clampToCanvas: false })
      const state = await pc.execute('document.inspect')
      nativeId = state.activeLayer
      await pc.execute('layer.setProps', { layer: nativeId, name: `banner:${layer.id}:${layer.name}` })
      await pc.execute('file.close', { document: 1 })
      const mask = layers.find(m => m.isMask && m.maskTargetIds?.includes(layer.id))
      if (mask) {
        await pc.execute('layer.vectorMask.add', { layer: nativeId, path: { subpaths: [{ closed: true, op: 'combine', knots: [[mask.x, mask.y], [mask.x + mask.w, mask.y], [mask.x + mask.w, mask.y + mask.h], [mask.x, mask.y + mask.h]] }], fillRule: 'evenodd', inverted: !!mask.maskInvert } })
      }
    }
    await pc.execute('layer.setProps', { layer: nativeId, visible: !layer.hidden, opacity: layer.opacity })
    mappings.push({ bannerId: layer.id, nativeId })
  }
  assert(mappings.length, 'No representable layers')
  for (const l of initial.layers) await pc.execute('layer.delete', { layer: l.id })
  const saved = await pc.call('app.save', { path: `${prefix}.pcraft` })
  assert.deepEqual(saved.warnings, [])
  const archive = readPhotoCraftArchive(join(root, `${prefix}.pcraft`))
  const nativeBaseline = archive.manifest.document as NativeDocument
  const nativePayloadHashes = rasterPayloadHashes(archive)
  const sealed = await createBridgeSidecar({ revision, snapshot: project, boardKey: key, size: dimensions, mappings, assessment, nativeBaseline, nativePayloadHashes })
  await write(`${prefix}-sidecar.json`, sealed.sidecar)
  await write(`${prefix}-binding.json`, { sidecarHash: sealed.sidecarHash, sourceHash: sealed.sidecar.sourceHash, revision })
  await write(`${prefix}-archive.json`, archive)
  await write(`${prefix}-assessment.json`, assessment)
  return { ...sealed, archive, mappings }
}

type Archive = ReturnType<typeof readPhotoCraftArchive>
function rasterPayloadHashes(archive: Archive): Record<string, string> {
  const hashes: Record<string, string> = {}
  type Surface = { tiles: Array<{ hash: string }> }
  for (const layer of archive.manifest.document.layers) {
    const surfaces: Surface[] = []
    if (layer.content.kind === 'raster') surfaces.push(layer.content.surface)
    if (layer.mask) surfaces.push(layer.mask.surface)
    for (const surface of surfaces) {
      for (const tile of surface.tiles) {
        assert(/^[a-f0-9]{64}$/.test(tile.hash), 'Invalid native tile name')
        const name = `tiles/${tile.hash}.zst`
        assert(typeof archive.payloads[name] === 'string', 'Missing native tile payload')
        hashes[name] = archive.payloads[name]
      }
    }
  }
  return hashes
}

/** Local archive import emits a proposal only; it never overwrites a project. */
export async function proposePhotoCraftReturn(options: {
  sidecar: BridgeSidecar
  expectedSidecarHash: string
  currentProject: BannerProject
  currentRevision: number
  nativePath: string
  measureText?: BridgeTextMeasurer
}) {
  assert.equal(await hashBridgeValue(options.sidecar), options.expectedSidecarHash, 'Untrusted or changed sidecar')
  assert(options.sidecar.nativePayloadHashes, 'Sidecar lacks archive payload binding')
  const archive = readPhotoCraftArchive(options.nativePath)
  assert.deepEqual(rasterPayloadHashes(archive), options.sidecar.nativePayloadHashes, 'Changed raster or mask payload bytes')
  const returned = archive.manifest.document as NativeDocument
  const plan = await planBridgeReturn({ ...options, returned })
  return { plan, returned }
}

/** CLI path authority comes only from explicit operator arguments under workspace output/. */
async function ownedPath(value: string, mustExist = true) {
  assert(value && !value.includes('\0') && !value.includes('://'), 'Expected an explicit local owned path')
  const root = await realpath(resolve('output'))
  const path = resolve(value)
  const resolved = mustExist ? await realpath(path) : join(await realpath(resolve(path, '..')), path.split('/').at(-1)!)
  const rel = relative(root, resolved)
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Paths must remain under workspace output/')
  if (mustExist) assert((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink(), 'Expected an owned regular file')
  return resolved
}

async function boundedJson(path: string, maxBytes = 64 * 1024 * 1024) {
  const info = await lstat(path)
  assert(info.size <= maxBytes, 'JSON exceeds bridge size limit')
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const [command, ...argv] = process.argv.slice(2)
  if (!['export', 'import'].includes(command || '')) {
    console.log('PhotoCraft local bridge (installed 0.16.0 required for export)\nexport --project output/project.json --board key --width 256 --height 256 --revision 1 --out output/new-directory\nimport --sidecar output/export/document-sidecar.json --sidecar-sha256 TRUSTED_EXPORT_DIGEST --project output/current.json --revision 1 --native output/edited.pcraft --out output/new-proposal-directory\nAll paths must be explicit owned files/directories under workspace output/. Outputs must be new directories. Import emits proposal.json and returned-document.json only; human review and guarded editor application remain required.')
    if (command && command !== '--help') process.exitCode = 1
    return
  }
  const args: Record<string, string> = {}
  const allowed = new Set(command === 'export' ? ['project', 'board', 'width', 'height', 'revision', 'out'] : ['project', 'sidecar', 'sidecar-sha256', 'revision', 'native', 'out'])
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    assert(key && argv[i]!.startsWith('--') && allowed.has(key) && !Object.hasOwn(args, key) && argv[i + 1], 'Unknown, duplicate or missing CLI argument')
    args[key] = argv[i + 1]!
  }
  for (const key of allowed) assert(args[key], `Missing --${key}`)
  const revision = Number(args.revision)
  assert(Number.isSafeInteger(revision) && revision >= 0, 'Revision must be a nonnegative integer')
  const projectPath = await ownedPath(args.project!), out = await ownedPath(args.out!, false)
  const project = await boundedJson(projectPath) as BannerProject
  if (command === 'export') {
    const dimensions = { width: Number(args.width), height: Number(args.height) }
    assert(Object.hasOwn(project.canvasData, args.board!), 'Unknown artboard')
    assert([dimensions.width, dimensions.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096), 'Canvas exceeds 4096 pixels')
    await mkdir(out, { mode: 0o700 })
    const pc = await startPhotoCraft(out)
    try {
      const result = await exportPhotoCraftProject({ pc, project, key: args.board!, dimensions, prefix: 'document', root: out, revision })
      console.log(JSON.stringify({ out, sourceHash: result.sidecar.sourceHash, sidecarHash: result.sidecarHash, mapped: result.mappings.length, excluded: result.sidecar.assessment.filter(a => a.kind === 'sidecar').length }, null, 2))
    } finally { await pc.stop() }
  } else {
    assert(/^[a-f0-9]{64}$/.test(args['sidecar-sha256']!), 'Supply the trusted digest retained at export, not one from the returned file')
    const sidecar = await boundedJson(await ownedPath(args.sidecar!)) as BridgeSidecar
    const nativePath = await ownedPath(args.native!)
    await mkdir(out, { mode: 0o700 })
    const pc = await startPhotoCraft(out)
    try {
      const result = await proposePhotoCraftReturn({ sidecar, expectedSidecarHash: args['sidecar-sha256']!, currentProject: project, currentRevision: revision, nativePath, measureText: createPhotoCraftTextMeasurer(pc) })
      await writeFile(join(out, 'proposal.json'), JSON.stringify(result.plan, null, 2), { flag: 'wx' })
      await writeFile(join(out, 'returned-document.json'), JSON.stringify(result.returned, null, 2), { flag: 'wx' })
      console.log(JSON.stringify({ out, changes: result.plan.changes, requiresReview: true }, null, 2))
    } finally { await pc.stop() }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
