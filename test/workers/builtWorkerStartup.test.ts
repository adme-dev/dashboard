import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { Miniflare } from 'miniflare'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverRouteChunks, staticImportClosure } from '../../scripts/check-worker-imports.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Pinned: `pnpm build` must start the artifact it just built, never an ambient one.
const artifactRoot = path.join(repositoryRoot, 'dist/_worker.js')
const probeFile = '__xeroflow_codec_probe__.js'
const bannerRoutePrefix = '/api/agency/banner-studio/'
// Unique to pngjs/lib/parser-sync.js: locates the emitted synchronous decoder.
const codecMarker = 'bad png - invalid inflate data response'

type Module = { type: 'ESModule', path: string, contents: string }
type WorkerConfig = { compatibility_date: string, compatibility_flags?: string[] }
type Fixtures = Record<'valid' | 'corrupt' | 'inflated' | 'oneByteExcess' | 'fullSize', string>
type RouteHandler = { chunk: string, exportName?: string }

async function artifactModules(root: string) {
  // Missing artifacts fail rather than silently skipping this release gate.
  const config: WorkerConfig = JSON.parse(await readFile(path.join(root, 'wrangler.json'), 'utf8'))
  expect(config.compatibility_date).toBeTruthy()
  const files = (await readdir(root, { recursive: true }))
    .filter(file => /\.(?:js|mjs)$/.test(file)).sort()
  expect(files).toContain('index.js')
  expect(files).not.toContain(probeFile)
  // Explicit module definitions avoid Miniflare's discovery/rebundling path.
  // Every byte comes from the final artifact; no optional module or PNG stubs.
  const ordered = ['index.js', ...files.filter(file => file !== 'index.js')]
  const digest = createHash('sha256')
  const modules: Module[] = await Promise.all(ordered.map(async (file) => {
    const contents = await readFile(path.join(root, file), 'utf8')
    return { type: 'ESModule' as const, path: path.join(root, file), contents }
  }))
  for (const module of modules) digest.update(path.relative(root, module.path)).update('\0').update(module.contents).update('\0')
  return { config, modules, files, digest: digest.digest('hex') }
}

async function dispatch(root: string, config: WorkerConfig, modules: Module[], url: string) {
  let outboundCalls = 0
  const worker = new Miniflare({
    modules,
    modulesRoot: root,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: { APP_URL: 'https://startup.xeroflow.test' },
    outboundService: () => {
      outboundCalls++
      throw new Error('Startup proof forbids provider/database/network requests')
    }
  })
  try {
    await worker.ready
    const response = await worker.dispatchFetch(url)
    const body = await response.text()
    // Give post-response waitUntil work a moment to attempt outbound calls.
    await new Promise(resolve => setTimeout(resolve, 250))
    return { status: response.status, body, outboundCalls }
  } finally {
    await worker.dispose()
  }
}

// Test-only entry, never written to disk or digested. It imports the exact
// emitted Banner route chunks, then finds the real emitted PNG codec among the
// exports of closure modules containing the pngjs decoder, by shape (export
// names are minified), and runs it in workerd. Closure modules are already
// evaluated by the route imports, so the scan evaluates nothing new.
function probeEntrySource(plan: { nitroEntry: boolean, handlers: RouteHandler[], codecModules: string[], fixtures: Fixtures }) {
  const load = (file: string) => `() => import(${JSON.stringify(`./${file.split(path.sep).join('/')}`)})`
  const loaders = (files: string[]) => files.map(file => `[${JSON.stringify(file)}, ${load(file)}]`).join(',\n')
  const handlers = plan.handlers.map(({ chunk, exportName }) => `[${JSON.stringify(chunk)}, ${JSON.stringify(exportName ?? null)}, ${load(chunk)}]`).join(',\n')
  return `
import { Buffer } from 'node:buffer'
const fixtures = ${JSON.stringify(plan.fixtures)}
// Real call sites pass Buffers (validateArtworkPng uses Buffer.from).
const bytes = value => Buffer.from(value, 'base64')
const own = (value, key) => {
  try {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor && 'value' in descriptor ? descriptor.value : undefined
  } catch { return undefined }
}
const isCodec = value => typeof value === 'function'
  && typeof own(own(value, 'sync'), 'read') === 'function' && typeof own(own(value, 'sync'), 'write') === 'function'
const rejection = run => {
  try { run(); return { rejected: false } } catch (error) { return { rejected: true, message: String(error?.message) } }
}
export default {
  async fetch() {
    try {
      ${plan.nitroEntry ? 'await import("./_nitro.js")' : ''}
      const routes = []
      for (const [file, exportName, load] of [${handlers}]) {
        // Same resolution as h3 lazyEventHandler: picked export, then .default.
        const loaded = exportName === null ? await load() : (await load())[exportName]
        routes.push([file, exportName, typeof (loaded?.default || loaded)])
      }
      const found = new Map()
      for (const [file, load] of [${loaders(plan.codecModules)}]) {
        const namespace = await load()
        for (const name of Object.keys(namespace)) {
          let value
          try { value = namespace[name] } catch { continue }
          for (const candidate of [value, own(value, 'PNG')]) {
            if (!isCodec(candidate)) continue
            if (!found.has(candidate)) found.set(candidate, [])
            found.get(candidate).push(file + '#' + name)
          }
        }
      }
      const codecs = [...found.values()]
      if (codecs.length !== 1) return Response.json({ routes, codecs })
      const PNG = [...found.keys()][0]
      const decoded = PNG.sync.read(bytes(fixtures.valid), { checkCRC: true })
      const fullSize = PNG.sync.read(bytes(fixtures.fullSize), { checkCRC: true })
      const fullSizeHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(fullSize.data)))].map(n => n.toString(16).padStart(2, '0')).join('')
      const image = new PNG({ width: 2, height: 1 })
      image.data.set([255, 0, 0, 255, 0, 0, 0, 0])
      const encoded = PNG.sync.write(image)
      const roundTrip = PNG.sync.read(encoded, { checkCRC: true })
      return Response.json({
        routes,
        codecs,
        decoded: { width: decoded.width, height: decoded.height, data: [...decoded.data] },
        fullSize: { width: fullSize.width, height: fullSize.height, byteLength: fullSize.data.length, sha256: fullSizeHash },
        roundTrip: { signature: [...encoded.subarray(0, 8)], width: roundTrip.width, height: roundTrip.height, data: [...roundTrip.data] },
        corrupt: rejection(() => PNG.sync.read(bytes(fixtures.corrupt), { checkCRC: true })),
        corruptUnchecked: rejection(() => PNG.sync.read(bytes(fixtures.corrupt), { checkCRC: false })),
        inflated: rejection(() => PNG.sync.read(bytes(fixtures.inflated), { checkCRC: true })),
        oneByteExcess: rejection(() => PNG.sync.read(bytes(fixtures.oneByteExcess), { checkCRC: true }))
      })
    } catch (error) {
      return new Response(String(error?.stack || error), { status: 500 })
    }
  }
}`
}

async function runCodecProbe(root: string, config: WorkerConfig, modules: Module[], files: string[], fixtures: Fixtures) {
  const routes = await discoverRouteChunks(root, bannerRoutePrefix)
  expect(routes.length).toBeGreaterThan(0)
  expect(routes.filter(route => !route.chunk || !files.includes(route.chunk))).toEqual([])
  const handlers: RouteHandler[] = [...new Map(routes.map(({ chunk, exportName }) => [`${chunk}#${exportName}`, { chunk: chunk as string, exportName }])).values()]
  const routeChunks = [...new Set(handlers.map(handler => handler.chunk))].sort()
  const closure = [...await staticImportClosure(root, routeChunks)].sort()
  // Only closure modules holding the real decoder; the Banner routes load them.
  const codecModules = (await Promise.all(closure.map(async file => (await readFile(path.join(root, file), 'utf8')).includes(codecMarker) ? file : null))).filter(file => file !== null)
  expect(codecModules.length, `a Banner route closure module containing "${codecMarker}"`).toBeGreaterThan(0)
  const entry = { type: 'ESModule' as const, path: path.join(root, probeFile), contents: probeEntrySource({ nitroEntry: files.includes('_nitro.js'), handlers, codecModules, fixtures }) }
  const result = await dispatch(root, config, [entry, ...modules], 'https://startup.xeroflow.test/codec-probe')
  return { ...result, routes, handlers, routeChunks, closure, codecModules }
}

function chunk(type: string, data: Buffer) {
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  output.write(type, 4, 'ascii')
  data.copy(output, 8)
  output.writeUInt32BE(crc32(output.subarray(4, data.length + 8)), data.length + 8)
  return output
}

// 3x3 RGBA, transparent except one opaque centre pixel; built without pngjs.
const centrePixel = [200, 20, 10, 255]
// Chrome screenshots are RGB PNGs. This compressible 640x360 fixture expands
// to 691560 scanline bytes: the real-size boundary the old tiny gate missed.
function fullSizePngFixture() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(640, 0)
  header.writeUInt32BE(360, 4)
  header[8] = 8
  header[9] = 2
  const scanlines = Buffer.alloc(360 * (1 + 640 * 3))
  const rgba = Buffer.alloc(640 * 360 * 4)
  for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
    const rgb = x > 40 && x < 600 && y > 80 && y < 140 ? [255, 255, 255] : y < 180 ? [32, 80, 160] : [224, 96, 64]
    scanlines.set(rgb, y * 1921 + 1 + x * 3)
    rgba.set([...rgb, 255], (y * 640 + x) * 4)
  }
  return {
    png: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]),
    sha256: createHash('sha256').update(rgba).digest('hex')
  }
}
function pngFixtures(): Fixtures {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(3, 0)
  header.writeUInt32BE(3, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc(3 * (1 + 3 * 4))
  Buffer.from(centrePixel).copy(scanlines, 13 + 1 + 4)
  const png = (pixels: Buffer) => Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ])
  const valid = png(scanlines)
  const corrupt = Buffer.from(valid)
  corrupt[valid.length - 13]! ^= 1 // IDAT CRC
  // CRC-valid IDAT inflating far beyond the image size. pngjs rejects excess
  // data after an unbounded inflate too, so the proof is which error fires.
  const inflated = png(Buffer.concat([scanlines, Buffer.alloc(128 * 1024)]))
  const oneByteExcess = png(Buffer.concat([scanlines, Buffer.alloc(1)]))
  return { valid: valid.toString('base64'), corrupt: corrupt.toString('base64'), inflated: inflated.toString('base64'),
    oneByteExcess: oneByteExcess.toString('base64'), fullSize: fullSizePngFixture().png.toString('base64') }
}

it('starts the exact final Pages modules and reaches real auth rejection without outbound calls', async () => {
  const configured = process.env.WORKER_ARTIFACT_DIR
  if (configured && path.resolve(configured) !== artifactRoot) throw new Error(`WORKER_ARTIFACT_DIR is not supported; this gate only starts ${artifactRoot}`)
  const { config, modules, digest } = await artifactModules(artifactRoot)
  console.info(`[built-worker-startup] ${modules.length} unchanged modules sha256=${digest}`)
  // The dispatcher's lazy Nitro import, plugins and global middleware up to the
  // auth rejection. Lazy route chunks are proven by the codec probe below.
  const result = await dispatch(artifactRoot, config, modules, 'https://startup.xeroflow.test/api/agency/banner-studio/projects')
  expect(result).toMatchObject({ status: 401, body: expect.stringMatching(/unauthori|authentication|login/i), outboundCalls: 0 })
}, 60_000)

it('loads the exact Banner route chunks and runs their emitted PNG codec in workerd', async () => {
  const { config, modules, files, digest } = await artifactModules(artifactRoot)
  const result = await runCodecProbe(artifactRoot, config, modules, files, pngFixtures())
  expect(result.status, result.body).toBe(200)
  const report = JSON.parse(result.body)
  console.info(`[built-worker-startup] codec probe sha256=${digest} routes=${result.routes.length} handlers=${result.handlers.length} routeChunks=${result.routeChunks.length} closure=${result.closure.length} codecModules=${JSON.stringify(result.codecModules)} codec=${JSON.stringify(report.codecs)}`)
  expect(report.routes).toEqual(result.handlers.map(({ chunk, exportName }) => [chunk, exportName ?? null, 'function']))
  // One real codec, reached through the Banner routes' own module graph. If
  // this export disappears, give the PNG adapter a stable shared export.
  expect(report.codecs).toHaveLength(1)
  const pixels = Array.from({ length: 9 }, (_, index) => index === 4 ? centrePixel : [0, 0, 0, 0]).flat()
  expect(report.decoded).toEqual({ width: 3, height: 3, data: pixels })
  expect(report.fullSize).toEqual({ width: 640, height: 360, byteLength: 921600, sha256: fullSizePngFixture().sha256 })
  expect(report.roundTrip).toEqual({ signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 2, height: 1, data: [255, 0, 0, 255, 0, 0, 0, 0] })
  // Rejected only because of the flipped CRC byte.
  expect(report.corrupt).toMatchObject({ rejected: true })
  expect(report.corruptUnchecked).toEqual({ rejected: false })
  // Native allocation remains capped at image size plus fixed headroom; the
  // adapter separately rejects even one excess byte before pngjs parses it.
  expect(report.inflated).toEqual({ rejected: true, message: expect.stringMatching(/Memory limit exceeded|Cannot create a Buffer larger than/) })
  expect(report.oneByteExcess).toEqual({ rejected: true, message: 'Inflated data exceeds output limit' })
  expect(result.outboundCalls).toBe(0)
}, 180_000)

describe('codec probe harness', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  async function fixtureArtifact(sharedChunk: string) {
    const root = await mkdtemp(path.join(tmpdir(), 'built-worker-probe-'))
    directories.push(root)
    const files: Record<string, string> = {
      'wrangler.json': JSON.stringify({ compatibility_date: '2024-12-01', compatibility_flags: ['nodejs_compat'] }),
      'index.js': 'export default{async fetch(e){return(await import("./_nitro.js")).default.fetch(e)}}',
      '_nitro.js': 'import"./chunks/m/0.js";var s=(e,t)=>Object.defineProperty(e,"name",{value:t,configurable:!0});const a=()=>import("./chunks/m/1.js"),b=()=>import("./chunks/m/1.js").then(e=>e.default);export const h=[{route:"/api/agency/banner-studio/projects",handler:a,lazy:!0,method:"get"},{route:"/api/agency/banner-studio/projects",handler:b,lazy:!0,method:"post"},{route:"/api/agency/banner-studio/projects/:id",handler:s(()=>import("./chunks/m/1.js"),"handler"),lazy:!0,method:"get"},{route:"/api/agency/banner-studio/videos/:id",handler:s(()=>import("./chunks/m/1.js").then(function(e){return e.d}),"handler"),lazy:!0,method:"get"},{route:"/api/other",handler:a}];export default{fetch(){return new Response("Unauthorized",{status:401})}}',
      'chunks/m/0.js': 'export const n=1',
      'chunks/m/1.js': 'import{v as e}from"./2.js";function h(){return e}const d=Object.freeze({__proto__:null,default:h});export{h as default,d};',
      'chunks/m/2.js': sharedChunk
    }
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await writeFile(path.join(root, name), contents)
    }
    return root
  }

  // Shape-only stand-in: exported as a frozen `{ PNG }` namespace like Rollup's.
  const codec = `const m="${codecMarker}";class P{constructor(e={}){this.width=e.width|0;this.height=e.height|0;this.data=new Uint8Array(4*this.width*this.height)}}P.sync={read(e){if(e.length>200||e[1]!==80)throw Error("bad");return{width:e.length,height:1,data:[]}},write(){return Uint8Array.from([137,80,78,71,13,10,26,10])}};const N=Object.freeze({__proto__:null,PNG:P});export const v=1;export{N as x,P as y};`

  it('resolves compacted route chunks and finds one codec by shape among aliased exports', async () => {
    const root = await fixtureArtifact(codec)
    const { config, modules, files } = await artifactModules(root)
    const oversized = Buffer.alloc(300)
    oversized[1] = 80
    const fixtures = pngFixtures()
    const result = await runCodecProbe(root, config, modules, files, { ...fixtures, fullSize: fixtures.valid, corrupt: Buffer.from('xx').toString('base64'), inflated: oversized.toString('base64') })
    const routeChunk = path.join('chunks', 'm', '1.js')
    expect(result.routes.map(route => [route.method, route.chunk, route.exportName])).toEqual([
      ['get', routeChunk, undefined],
      ['post', routeChunk, 'default'],
      ['get', routeChunk, undefined],
      ['get', routeChunk, 'd']
    ])
    expect(result.closure).toEqual([path.join('chunks', 'm', '1.js'), path.join('chunks', 'm', '2.js')])
    expect(result.status, result.body).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({
      routes: [[routeChunk, null, 'function'], [routeChunk, 'default', 'function'], [routeChunk, 'd', 'function']],
      codecs: [[`${path.join('chunks', 'm', '2.js')}#x`, `${path.join('chunks', 'm', '2.js')}#y`]],
      corrupt: { rejected: true, message: 'bad' },
      corruptUnchecked: { rejected: true },
      inflated: { rejected: true }
    })
  }, 60_000)

  it('reports a missing codec export instead of passing', async () => {
    const root = await fixtureArtifact(`const m="${codecMarker}";export const v=1`)
    const { config, modules, files } = await artifactModules(root)
    const result = await runCodecProbe(root, config, modules, files, pngFixtures())
    expect(JSON.parse(result.body)).toMatchObject({ codecs: [] })
  }, 60_000)

  it('requires the decoder to sit in the Banner route closure', async () => {
    const root = await fixtureArtifact(codec.replace(codecMarker, 'other'))
    const { config, modules, files } = await artifactModules(root)
    await expect(runCodecProbe(root, config, modules, files, pngFixtures())).rejects.toThrow(/Banner route closure module/)
  }, 60_000)

  it('fails on a lazily evaluated codec chunk even though auth startup still returns 401', async () => {
    const root = await fixtureArtifact(`import*as n from"node:stream";class C extends n{};${codec}`)
    const { config, modules, files } = await artifactModules(root)
    expect((await dispatch(root, config, modules, 'https://startup.xeroflow.test/api/agency/banner-studio/projects')).status).toBe(401)
    const result = await runCodecProbe(root, config, modules, files, pngFixtures())
    expect(result.status).toBe(500)
    expect(result.body).toMatch(/Class extends value|not a constructor/)
  }, 60_000)
})
