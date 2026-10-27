import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { assessBridgeLayers, createBridgeSidecar, type NativeDocument } from '../../shared/bannerDocumentBridge'
import { proposePhotoCraftReturn } from '../../scripts/banner-studio/photocraft-bridge'
import { readPhotoCraftArchive } from '../../scripts/banner-studio/photocraft-control'

let root: string
beforeAll(async () => {
  const base = resolve('output/editable-artwork-bridge')
  await mkdir(base, { recursive: true })
  root = await mkdtemp(join(base, 'archive-tests-'))
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

async function archive(name: string, document: NativeDocument, payload = 'original compressed payload', entry = `tiles/${'a'.repeat(64)}.zst`) {
  const input = join(root, `${name}.json`), output = join(root, `${name}.pcraft`)
  await writeFile(input, JSON.stringify({ format_version: 1, generator: 'photocraft-format 0.16.0', document }))
  execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[2],"w"); z.write(sys.argv[1],"manifest.json"); z.writestr(sys.argv[3],sys.argv[4]); z.close()', input, output, entry, payload])
  return output
}

describe('bounded native archive adapter', () => {
  it('checks actual immutable raster bytes, not only tile names', async () => {
    const layer: Layer = { id: 1, name: 'Image', type: 'image', x: 0, y: 0, w: 10, h: 10, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, src: 'data:image/png;base64,AA==', fit: 'fill' }
    const project = { id: 'archive', canvasData: { square: { layers: [layer] } } } as BannerProject
    const document: NativeDocument = { layers: [{ id: 2, content: { kind: 'raster', surface: { tiles: [{ hash: 'a'.repeat(64) }] } } }] }
    const name = `tiles/${'a'.repeat(64)}.zst`
    const sealed = await createBridgeSidecar({ snapshot: project, revision: 1, boardKey: 'square', size: { width: 10, height: 10 }, mappings: [{ bannerId: 1, nativeId: 2 }], assessment: assessBridgeLayers([layer], []), nativeBaseline: document, nativePayloadHashes: { [name]: createHash('sha256').update('original compressed payload').digest('hex') } })
    const input = { sidecar: sealed.sidecar, expectedSidecarHash: sealed.sidecarHash, currentProject: project, currentRevision: 1, nativePath: await archive('original', document) }
    expect((await proposePhotoCraftReturn(input)).plan.changes).toEqual([])
    await expect(proposePhotoCraftReturn({ ...input, nativePath: await archive('tampered', document, 'different bytes under same hash name') })).rejects.toThrow('payload bytes')
    await expect(proposePhotoCraftReturn({ ...input, expectedSidecarHash: '0'.repeat(64) })).rejects.toThrow('sidecar')
  })
  it('rejects archive traversal without extracting any entries', async () => {
    const path = await archive('traversal', { layers: [] }, 'unsafe', '../outside')
    expect(() => readPhotoCraftArchive(path)).toThrow('Unsafe archive entry')
  })
  it('CLI refuses paths outside the explicitly owned output root', () => {
    expect(() => execFileSync('pnpm', ['exec', 'tsx', 'scripts/banner-studio/photocraft-bridge.ts', 'export', '--project', 'package.json', '--board', 'square', '--width', '10', '--height', '10', '--revision', '1', '--out', join(root, 'refused')], { encoding: 'utf8', stdio: 'pipe' })).toThrow('Paths must remain under workspace output/')
  })
})
