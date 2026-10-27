import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import boundedInflateSync from '../../lib/pngjs-sync-inflate'
import { checkWorkerImports, discoverRouteChunks, staticImportClosure } from '../../scripts/check-worker-imports.mjs'
import { pngCodecInteropPlugin } from '../../scripts/png-codec-interop.mjs'

const expected = {
  signature: 'PNG',
  width: 2,
  height: 1,
  pixels: [255, 0, 0, 255, 0, 0, 0, 0],
  invalidCrcRejected: true,
  uncheckedCrcAccepted: true,
  excessInflationRejected: true
}

const route = `
import { PNG } from 'pngjs'
import { deflateSync } from 'node:zlib'
import { validateArtworkPng } from ${JSON.stringify(path.join(process.cwd(), 'server/utils/banner/artworkValidation.ts'))}

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
  validateArtworkPng(encoded, false)
  const corrupt = Buffer.from(encoded)
  corrupt[33 + encoded.readUInt32BE(33) + 8]! ^= 1 // IDAT CRC, not chunk type
  let invalidCrcRejected = false
  try {
    PNG.sync.read(corrupt, { checkCRC: true })
  } catch {
    invalidCrcRejected = true
  }
  const uncheckedCrcAccepted = PNG.sync.read(corrupt, { checkCRC: false }).width === 2

  // Exceed the fixed native allocation headroom as well as accepted image size.
  const compressed = deflateSync(Buffer.alloc(128 * 1024))
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
  } catch (error) {
    // Distinguish bounded zlib failure from pngjs rejecting trailing data only
    // after an unbounded inflate has already allocated all attacker input.
    excessInflationRejected = /Memory limit exceeded|Cannot create a Buffer larger than/.test(error.message)
  }
  return {
    signature: encoded.subarray(1, 4).toString(),
    width: decoded.width,
    height: decoded.height,
    pixels: Array.from(decoded.data),
    invalidCrcRejected,
    uncheckedCrcAccepted,
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

it.each(['routes', 'runtime'] as const)('preserves the shared PNG export with %s consumers through prerender and workerd', async (consumer) => {
  const { createNitro, build, prepare, prerender } = await import('nitropack')
  const fixture = await mkdtemp(path.join(tmpdir(), 'png-interop-test-'))
  let nitro: Awaited<ReturnType<typeof createNitro>> | undefined
  let worker: Miniflare | undefined
  let prerendered: unknown
  try {
    await mkdir(path.join(fixture, 'routes'))
    // All static consumers sit behind one shared helper, as they do after
    // raster exports leave Pages. Duplicating the helper in two route files
    // accidentally forces PNG exports and would mask the packaging regression.
    await writeFile(path.join(fixture, 'codec.ts'), route)
    await writeFile(path.join(fixture, 'routes', 'index.ts'), `export { default } from '../codec'`)
    await writeFile(path.join(fixture, 'routes', 'codec.get.ts'), `export { default } from '../codec'`)
    if (consumer === 'runtime') {
      // A startup plugin also reaches the helper, like queue consumers do in
      // Pages. Nitro can then absorb PNG into its manually grouped runtime.
      await mkdir(path.join(fixture, 'plugins'))
      await writeFile(path.join(fixture, 'plugins', 'codec.ts'), `
import handler from '../codec'
export default defineNitroPlugin(() => {
  if (typeof handler !== 'function') throw new Error('Missing shared route handler')
})
`)
    }
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

    const routes = await discoverRouteChunks(artifactRoot, '/codec')
    expect(routes).toHaveLength(1)
    const closure = await staticImportClosure(artifactRoot, routes.map(route => route.chunk!))
    const codecModules = modules.filter(module => closure.has(path.relative(artifactRoot, module.path))
      && module.contents.includes('bad png - invalid inflate data response'))
    expect(codecModules).toHaveLength(1)
    await worker.dispose()

    // This in-memory entry imports unchanged emitted modules, like the final
    // artifact gate. Only shape-checked codec methods and the standard Worker
    // fetch entry are called; no arbitrary module exports are invoked.
    const codecFile = `./${path.relative(artifactRoot, codecModules[0]!.path).split(path.sep).join('/')}`
    worker = new Miniflare({
      modules: [{
        type: 'ESModule',
        path: path.join(artifactRoot, '__png_identity_probe__.js'),
        contents: `
import app from './index.js'
import * as codecModule from ${JSON.stringify(codecFile)}
const own = (value, key) => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
export default {
  async fetch(request, env, ctx) {
    const codecs = [...new Set(Object.values(codecModule).flatMap(value => [value, own(value, 'PNG')])
      .filter(value => typeof value === 'function' && typeof own(own(value, 'sync'), 'read') === 'function' && typeof own(own(value, 'sync'), 'write') === 'function'))]
    if (codecs.length !== 1) return Response.json({ codecs: codecs.length })
    const PNG = codecs[0]
    const read = PNG.sync.read
    let reads = 0
    // Observe identity at the actual production validateArtworkPng call site,
    // as well as the fixture encoder/decoder, without changing artifact bytes.
    PNG.sync.read = (...args) => { reads++; return read(...args) }
    try {
      const response = await app.fetch(new Request('http://localhost/codec'), env, ctx)
      return Response.json({ codecs: codecs.length, reads, status: response.status, body: await response.json() })
    } finally {
      PNG.sync.read = read
    }
  }
}`
      }, ...modules],
      modulesRoot: artifactRoot,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      outboundService: () => { throw new Error('Unexpected outbound request') }
    })
    const probe = await worker.dispatchFetch('http://localhost/identity')
    expect(await probe.json()).toEqual({ codecs: 1, reads: 5, status: 200, body: expected })
  } finally {
    await worker?.dispose()
    await nitro?.close()
    await rm(fixture, { recursive: true, force: true })
  }
}, 60_000)
