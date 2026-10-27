import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { createBridgeSidecar, hashBridgeValue, type NativeDocument } from '../../shared/bannerDocumentBridge'
import { FONT_FACE, FONT_PIN } from '../../workers/banner-engine/fonts/runtime.mjs'
import { assessLinuxLayers, createLinuxTextMeasurer, editLinuxWording, exportLinuxProject, proposeLinuxReturn, readLinuxArchive, type LinuxSidecar } from '../../workers/banner-engine/native/photocraft'

const engine = vi.hoisted(() => ({ calls: [] as string[][], bounds: [3, -67, 700, 3], logs: undefined as string | undefined, mutate: undefined as undefined | (() => void) }))
vi.mock('../../workers/banner-engine/fonts/runtime.mjs', async (original) => {
  const actual = await original<typeof import('../../workers/banner-engine/fonts/runtime.mjs')>()
  return {
    ...actual,
    loadFontRuntime: async () => ({ imageId: `sha256:${'1'.repeat(64)}`, font: { ...actual.FONT_PIN, coverage: Array.from({ length: 95 }, (_, i) => i + 32) }, capability: { capabilityProofSha256: '2'.repeat(64) } }),
    executeFontContainer: async (_runtime: unknown, options: { command: string[] }) => {
      engine.calls.push(options.command)
      engine.mutate?.()
      return { logs: engine.logs ?? JSON.stringify({ command: 'type.info', result: { lines: [{ ascent: 100, descent: 32.6, x0: 0, x1: 700 }], bounds: engine.bounds, runs: [{ style: { font_family: actual.FONT_FACE.family, postscript_name: actual.FONT_FACE.postscriptName, weight: 700, faux_bold: false, faux_italic: false } }] } }) }
    }
  }
})

const font = { ...FONT_PIN, coverage: Array.from({ length: 95 }, (_, i) => i + 32) }
const layer = (patch: Partial<Layer> = {}): Layer => ({ id: 7, name: 'Linux heading', type: 'text', x: 20, y: 30, w: 1600, h: 140, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, text: 'DISCOVER SOMETHING NEW', fontFamily: FONT_FACE.family, fontWeight: 700, fontSize: 100, color: '#003399', ...patch })
const dirs: string[] = []
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'banner-linux-test-'))
  dirs.push(root)
  return root
}
function native(text: string): NativeDocument {
  return { name: 'document.pcraft', layers: [{ id: 3, name: 'banner:7', content: { kind: 'text', text, runs: [{ len: Buffer.byteLength(text), style: { font_family: FONT_FACE.family, weight: 700 } }], paragraphs: [{ len: Buffer.byteLength(text), style: {} }] }, mask: null, vector_mask: null }] }
}
async function archive(root: string, document: NativeDocument) {
  const path = join(root, 'source.pcraft')
  execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("manifest.json",sys.stdin.read()); z.close()', path], { input: JSON.stringify({ format_version: 1, generator: 'photocraft-format 0.16.0', document }), timeout: 5000 })
  return path
}
async function fixture(patch: Partial<Layer> = {}) {
  const source = layer(patch)
  const project = { id: 'test', name: 'Exact original', canvasData: { board: { layers: [source, { id: 8, type: 'rect', name: 'Original unsupported', x: 0, y: 0, w: 20, h: 20, zIndex: 0, opacity: 1 }] } } } as BannerProject
  const sealed = await createBridgeSidecar({ snapshot: project, revision: 1, boardKey: 'board', size: { width: 2000, height: 500 }, mappings: [{ bannerId: 7, nativeId: 3 }], assessment: assessLinuxLayers(project.canvasData.board!.layers, font), nativeBaseline: native(source.text!), nativePayloadHashes: {} })
  const baseline = await archive(await directory(), native(source.text!))
  const sidecar: LinuxSidecar = { ...sealed.sidecar, nativeArchiveHash: createHash('sha256').update(await readFile(baseline)).digest('hex'), linuxBinding: { version: 'linux-text-v1', imageId: `sha256:${'1'.repeat(64)}`, font, capabilityProofSha256: '2'.repeat(64) } }
  return { sidecar, expectedSidecarHash: await hashBridgeValue(sidecar), currentProject: project, currentRevision: 1, nativePath: await archive(await directory(), native('COME CELEBRATE WITH US')), root: await directory() }
}
beforeEach(() => {
  engine.calls = []
  engine.bounds = [3, -67, 700, 3]
  engine.logs = undefined
  engine.mutate = undefined
})
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Linux supported text bridge', () => {
  it.each([{ error: 'failed' }, { warnings: ['fallback'] }, { result: { warnings: ['fallback'] } }, { result: { errors: ['failed'] } }, { result: { error: 'failed' } }])('rejects native warning/error envelope %j', async (envelope) => {
    engine.logs = JSON.stringify(envelope)
    await expect(createLinuxTextMeasurer({ root: await directory() })(layer(), 'COME CELEBRATE WITH US')).rejects.toThrow('Native warning, error or font substitution')
  })
  it('returns the existing reversible plan and preserves original unsupported layers', async () => {
    const input = await fixture(), result = await proposeLinuxReturn(input)
    expect(result.plan.changes).toEqual([{ layerId: 7, before: 'DISCOVER SOMETHING NEW', after: 'COME CELEBRATE WITH US' }])
    expect(result.plan.after.canvasData.board!.layers[1]).toEqual(input.currentProject.canvasData.board!.layers[1])
    expect(engine.calls).toHaveLength(1)
    expect(engine.calls[0]).toContain('--new')
    expect(engine.calls[0]).not.toContain('/input/document.pcraft')
    expect(JSON.parse(await readFile(join(input.root, 'proposal.json'), 'utf8'))).toEqual(result.plan)
  })
  it.each([{ fontFamily: 'Arial' }, { fontWeight: 400 }, { fontStyle: 'italic' }, { text: 'Hello 🎉' }, { text: 'Hello\u007f' }, { text: 'Hello\u0080' }, { letterSpacing: '1px' }, { rotation: 10 }])('excludes unsupported font/glyph/style %j', (patch) => {
    expect(assessLinuxLayers([layer(patch)], font)[0]!.kind).toBe('sidecar')
  })
  it('retains image/mask/QR original state in sidecar without exporting it', () => {
    const image = { id: 1, type: 'image', name: 'Asset', x: 0, y: 0, w: 10, h: 10, zIndex: 0, opacity: 1, src: 'data:image/png;base64,AA==', fit: 'fill' } as Layer
    expect(assessLinuxLayers([image], font)[0]!.reasons).toContain('Linux text-only subset preserves images and masks in the original sidecar')
    expect(assessLinuxLayers([layer({ platformQr: {} } as Partial<Layer>)], font)[0]!.kind).toBe('sidecar')
  })
  it.each(['revision', 'source', 'sidecar', 'binding', 'style', 'mask', 'raster', 'add'])('rejects %s changes before native measurement', async (change) => {
    const input = await fixture()
    if (change === 'revision') input.currentRevision++
    if (change === 'source') input.currentProject.name = 'changed'
    if (change === 'sidecar') input.sidecar.revision++
    if (change === 'binding') {
      input.sidecar.linuxBinding.imageId = `sha256:${'9'.repeat(64)}`
      input.expectedSidecarHash = await hashBridgeValue(input.sidecar)
    }
    if (['style', 'mask', 'raster', 'add'].includes(change)) {
      const document = native('COME CELEBRATE WITH US')
      if (change === 'style') document.layers[0]!.content.runs = [{ len: 22, style: { font_family: 'Arial' } }]
      if (change === 'mask') document.layers[0]!.mask = { enabled: false }
      if (change === 'raster') document.layers[0]!.content = { kind: 'raster' }
      if (change === 'add') document.layers.push({ id: 4, content: { kind: 'raster' } })
      input.nativePath = await archive(await directory(), document)
    }
    await expect(proposeLinuxReturn(input)).rejects.toThrow()
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects protected copy and overflowing fresh measurements', async () => {
    await expect(proposeLinuxReturn(await fixture({ copyLocked: true }))).rejects.toThrow('Protected')
    expect(engine.calls).toHaveLength(0)
    engine.bounds = [0, -67, 4000, 3]
    await expect(proposeLinuxReturn(await fixture())).rejects.toThrow('does not fit')
  })
  it('rejects concurrent project mutation outside the planner await boundary', async () => {
    const input = await fixture()
    engine.mutate = () => {
      input.currentProject.name = 'raced'
    }
    await expect(proposeLinuxReturn(input)).rejects.toThrow('inputs changed')
  })
  it('refuses reused output roots before another native invocation', async () => {
    const input = await fixture()
    await proposeLinuxReturn(input)
    engine.calls = []
    await expect(proposeLinuxReturn(input)).rejects.toThrow('EEXIST')
    expect(engine.calls).toHaveLength(0)
  })
  it('checks the export candidate budget before measuring any text', async () => {
    const project = { canvasData: { board: { layers: Array.from({ length: 33 }, (_, i) => layer({ id: i })) } } } as BannerProject
    await expect(exportLinuxProject({ project, key: 'board', dimensions: { width: 2000, height: 500 }, revision: 1, root: await directory() })).rejects.toThrow('32 text candidates')
    expect(engine.calls).toHaveLength(0)
  })
  it('narrows native candidates to the explicit heading before measurement without changing the source', async () => {
    const project = { canvasData: { board: { layers: Array.from({ length: 40 }, (_, i) => layer({ id: i + 1, text: `HEADING ${String.fromCharCode(65 + i % 26)}` })) } } } as BannerProject
    const original = structuredClone(project)
    engine.logs = JSON.stringify({ error: 'measurement sentinel' })
    await expect(exportLinuxProject({ project, key: 'board', layerIds: [35], dimensions: { width: 2000, height: 500 }, revision: 1, root: await directory() })).rejects.toThrow('Native warning')
    expect(engine.calls).toHaveLength(1)
    expect(engine.calls[0]!.join(' ')).toContain('HEADING I')
    expect(project).toEqual(original)
  })
  it.each([[], [7, 7], [99], [-1], [7.5]].map(layerIds => ({ layerIds })))('rejects invalid explicit native selection $layerIds before engine execution', async ({ layerIds }) => {
    const project = { canvasData: { board: { layers: [layer()] } } } as BannerProject
    await expect(exportLinuxProject({ project, key: 'board', layerIds, dimensions: { width: 2000, height: 500 }, revision: 1, root: await directory() })).rejects.toThrow('Invalid selected layer IDs')
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects an unsupported explicit heading rather than silently omitting it', async () => {
    const project = { canvasData: { board: { layers: [layer({ fontFamily: 'Arial' })] } } } as BannerProject
    await expect(exportLinuxProject({ project, key: 'board', layerIds: [7], dimensions: { width: 2000, height: 500 }, revision: 1, root: await directory() })).rejects.toThrow('Selected layer is unsupported')
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects protected selected edits before the edit command executes', async () => {
    const input = await fixture({ copyLocked: true })
    input.nativePath = await archive(await directory(), native('DISCOVER SOMETHING NEW'))
    input.sidecar.nativeArchiveHash = createHash('sha256').update(await readFile(input.nativePath)).digest('hex')
    input.expectedSidecarHash = await hashBridgeValue(input.sidecar)
    await expect(editLinuxWording({ ...input, layerId: 7, text: 'COME CELEBRATE WITH US' })).rejects.toThrow('Protected')
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects altered archive bytes before selected native edit even when native structure is unchanged', async () => {
    const input = await fixture()
    input.nativePath = await archive(await directory(), native('DISCOVER SOMETHING NEW'))
    input.sidecar.nativeArchiveHash = createHash('sha256').update(await readFile(input.nativePath)).digest('hex')
    input.expectedSidecarHash = await hashBridgeValue(input.sidecar)
    // ZIP comments do not change inspected native content but do change exact bytes.
    execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"a"); z.comment=b"altered"; z.close()', input.nativePath], { timeout: 5000 })
    await expect(editLinuxWording({ ...input, layerId: 7, text: 'COME CELEBRATE WITH US' })).rejects.toThrow('exact exported archive bytes')
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects unreferenced payloads and unknown archive entries', async () => {
    for (const entry of ['tiles/' + '1'.repeat(64) + '.zst', 'unreferenced.txt']) {
      const input = await fixture()
      execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"a"); z.writestr(sys.argv[2],"data"); z.close()', input.nativePath, entry], { timeout: 5000 })
      await expect(proposeLinuxReturn(input)).rejects.toThrow('Unexpected or missing archive payload')
    }
    expect(engine.calls).toHaveLength(0)
  })
  it('rejects malformed archives without native execution', async () => {
    const root = await directory(), path = join(root, 'bad.pcraft')
    await writeFile(path, 'not a zip')
    expect(() => readLinuxArchive(path)).toThrow()
    execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("../escape","x"); z.close()', path], { timeout: 5000 })
    expect(() => readLinuxArchive(path)).toThrow('Unsafe archive entry')
    execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w",compression=zipfile.ZIP_DEFLATED); z.writestr("manifest.json"," "*(8*1024*1024+1)); z.close()', path], { timeout: 5000 })
    expect(() => readLinuxArchive(path)).toThrow('Oversize native manifest')
    expect(engine.calls).toHaveLength(0)
  })
})
