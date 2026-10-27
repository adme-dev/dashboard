import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import boundedInflateSync from '../../lib/pngjs-sync-inflate'
import { checkWorkerImports } from '../../scripts/check-worker-imports.mjs'
import { pngCodecInteropPlugin } from '../../scripts/png-codec-interop.mjs'

const expected = {
  signature: 'PNG',
  width: 2,
  height: 1,
  pixels: [255, 0, 0, 255, 0, 0, 0, 0],
  invalidCrcRejected: true,
  excessInflationRejected: true
}

const route = `
import { PNG } from 'pngjs'
import { deflateSync } from 'node:zlib'

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

export default defineEventHandler(() => {
  const pixels = [255, 0, 0, 255, 0, 0, 0, 0]
  const png = new PNG({ width: 2, height: 1 })
  Buffer.from(pixels).copy(png.data)
  const encoded = PNG.sync.write(png)
  const decoded = PNG.sync.read(encoded, { checkCRC: true })
  const corrupt = Buffer.from(encoded)
  corrupt[corrupt.length - 5]! ^= 1
  let invalidCrcRejected = false
  try {
    PNG.sync.read(corrupt, { checkCRC: true })
  } catch {
    invalidCrcRejected = true
  }

  const compressed = deflateSync(Buffer.alloc(128))
  const idat = Buffer.alloc(compressed.length + 12)
  idat.writeUInt32BE(compressed.length, 0)
  idat.write('IDAT', 4)
  compressed.copy(idat, 8)
  idat.writeUInt32BE(crc32(idat.subarray(4, idat.length - 4)), idat.length - 4)
  const originalIdatLength = encoded.readUInt32BE(33)
  const oversized = Buffer.concat([
    encoded.subarray(0, 33),
    idat,
    encoded.subarray(33 + originalIdatLength + 12)
  ])
  let excessInflationRejected = false
  try {
    PNG.sync.read(oversized, { checkCRC: true })
  } catch {
    excessInflationRejected = true
  }
  return {
    signature: encoded.subarray(1, 4).toString(),
    width: decoded.width,
    height: decoded.height,
    pixels: Array.from(decoded.data),
    invalidCrcRejected,
    excessInflationRejected
  }
})
`

it('uses the sync codec resolver in the dashboard Nitro configuration', async () => {
  const config = await readFile(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  expect(config).toContain('plugins: [compactPublicAssetsPlugin(), workerProcessCompatibilityPlugin(), bannerEnginePagesGuardPlugin(), pngCodecInteropPlugin()]')
})

it('retains the sync inflater output bound', () => {
  const inflated = Buffer.alloc(128, 7)
  const compressed = deflateSync(inflated)
  expect(boundedInflateSync(compressed, { chunkSize: 1, maxLength: inflated.length })).toEqual(inflated)
  expect(() => boundedInflateSync(compressed, { maxLength: inflated.length - 1 })).toThrow()
})

it('prerenders, builds and executes the real sync PNG codec in a minimal Pages worker', async () => {
  const { createNitro, build, prepare, prerender } = await import('nitropack')
  const fixture = await mkdtemp(path.join(tmpdir(), 'png-interop-test-'))
  let nitro: Awaited<ReturnType<typeof createNitro>> | undefined
  let worker: Miniflare | undefined
  let prerendered: unknown
  try {
    await mkdir(path.join(fixture, 'routes'))
    await writeFile(path.join(fixture, 'routes', 'index.ts'), route)
    await writeFile(path.join(fixture, 'routes', 'codec.get.ts'), route)
    nitro = await createNitro({
      rootDir: fixture,
      preset: 'cloudflare_pages',
      compatibilityDate: '2024-12-01',
      prerender: { routes: ['/'] },
      nodeModulesDirs: [path.join(process.cwd(), 'node_modules')],
      cloudflare: { deployConfig: true, nodeCompat: true },
      sourceMap: false,
      externals: { inline: ['pngjs'] },
      esbuild: { options: { target: 'es2020' } },
      rollupConfig: { plugins: [pngCodecInteropPlugin()] }
    })
    nitro.hooks.hook('prerender:generate', (generated) => {
      if (generated.route !== '/') return
      expect(generated.error).toBeUndefined()
      prerendered = JSON.parse(generated.contents!)
    })
    await prepare(nitro)
    await prerender(nitro)
    expect(prerendered).toEqual(expected)
    await build(nitro)

    const artifactRoot = path.join(fixture, 'dist/_worker.js')
    const config = JSON.parse(await readFile(path.join(artifactRoot, 'wrangler.json'), 'utf8'))
    const files = (await readdir(artifactRoot, { recursive: true }))
      .filter(file => /\.(?:js|mjs)$/.test(file)).sort()
    const ordered = ['index.js', ...files.filter(file => file !== 'index.js')]
    const modules = await Promise.all(ordered.map(async file => ({
      type: 'ESModule' as const,
      path: path.join(artifactRoot, file),
      contents: await readFile(path.join(artifactRoot, file), 'utf8')
    })))
    expect((await checkWorkerImports(artifactRoot)).errors).toEqual([])
    expect(modules.every(module => !module.contents.includes('ChunkStream'))).toBe(true)
    worker = new Miniflare({
      modules,
      modulesRoot: artifactRoot,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      outboundService: () => {
        throw new Error('Unexpected outbound request')
      }
    })
    await worker.ready
    const response = await worker.dispatchFetch('http://localhost/codec')
    const body = await response.text()
    expect({ status: response.status, body }).toEqual({ status: 200, body: JSON.stringify(expected) })
  } finally {
    await worker?.dispose()
    await nitro?.close()
    await rm(fixture, { recursive: true, force: true })
  }
}, 60_000)
