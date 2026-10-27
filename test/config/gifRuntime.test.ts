import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare } from 'miniflare'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { checkWorkerImports } from '../../scripts/check-worker-imports.mjs'

// Three 4 x 2 frames of pure colours. Pure channel values survive gifenc's
// rgb565 quantisation exactly, so decoded pixels can be compared byte-for-byte.
const W = 4
const H = 2
const FPS = 10
const FRAMES = [
  [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0], [255, 255, 0], [0, 255, 255], [255, 0, 255]],
  [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0], [255, 255, 0], [0, 255, 255]],
  [[255, 255, 255], [255, 255, 255], [0, 0, 0], [0, 0, 0], [255, 0, 0], [255, 0, 0], [0, 0, 255], [0, 0, 255]]
]

// Mirrors server/api/agency/banner-studio/export-gif.post.ts: the same bare
// dynamic import, the same quantize/applyPalette/writeFrame calls and options,
// and the same frame delay derivation. Browser capture, pngjs decode, R2 and
// the database are deliberately outside this fixture.
const route = `
const W = ${W}
const H = ${H}
const FPS = ${FPS}
const FRAMES = ${JSON.stringify(FRAMES)}

function rgba(frame, alpha = 255) {
  const pixels = new Uint8Array(W * H * 4)
  frame.forEach(([r, g, b], i) => pixels.set([r, g, b, alpha], i * 4))
  return pixels
}

export default defineEventHandler(async () => {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc' as string)

  const frameDelay = Math.round(1000 / FPS)
  const gif = GIFEncoder()
  for (const frame of FRAMES) {
    const pixels = rgba(frame)
    const palette = quantize(pixels, 256)
    const index = applyPalette(pixels, palette)
    gif.writeFrame(index, W, H, { palette, delay: frameDelay })
  }
  gif.finish()

  // Not used by the export route: proves the emitted encoder's transparency
  // path is real code rather than a no-op shim.
  const probe = GIFEncoder()
  const probePalette = [[0, 0, 0], [255, 0, 0]]
  const probeIndex = new Uint8Array(W * H).map((_, i) => i % 2)
  probe.writeFrame(probeIndex, W, H, { palette: probePalette, transparent: true, transparentIndex: 0 })
  probe.finish()

  return {
    gif: Buffer.from(gif.bytes()).toString('base64'),
    transparentProbe: Buffer.from(probe.bytes()).toString('base64')
  }
})
`

// Independent structural reader (does not use gifenc).
function readGifStructure(bytes: Buffer) {
  const header = bytes.subarray(0, 6).toString('latin1')
  const width = bytes.readUInt16LE(6)
  const height = bytes.readUInt16LE(8)
  const packed = bytes[10]!
  let offset = 13
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1))
  const skipSubBlocks = () => {
    while (bytes[offset] !== 0) offset += bytes[offset]! + 1
    offset += 1
  }
  const controls: Array<{ delayMs: number, transparent: boolean, transparentIndex: number }> = []
  let images = 0
  let loop: number | null = null
  let trailer = false
  while (offset < bytes.length) {
    const introducer = bytes[offset++]
    if (introducer === 0x3b) {
      trailer = true
      break
    }
    if (introducer === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9) {
        const flags = bytes[offset + 1]!
        controls.push({
          delayMs: bytes.readUInt16LE(offset + 2) * 10,
          transparent: (flags & 1) === 1,
          transparentIndex: bytes[offset + 4]!
        })
      } else if (label === 0xff && bytes.subarray(offset + 1, offset + 12).toString('latin1') === 'NETSCAPE2.0') {
        loop = bytes.readUInt16LE(offset + 14)
      }
      skipSubBlocks()
    } else if (introducer === 0x2c) {
      images += 1
      const imagePacked = bytes[offset + 8]!
      offset += 9
      if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 7) + 1))
      offset += 1 // LZW minimum code size
      skipSubBlocks()
    } else {
      throw new Error(`Unexpected GIF block 0x${introducer?.toString(16)} at ${offset - 1}`)
    }
  }
  return { header, width, height, images, controls, loop, trailer }
}

async function buildPagesFixture(rollupExternal: string[], inline: string[]) {
  const { createNitro, build, prepare } = await import('nitropack')
  const fixture = await mkdtemp(path.join(tmpdir(), 'gif-runtime-test-'))
  await mkdir(path.join(fixture, 'routes'))
  await writeFile(path.join(fixture, 'routes', 'gif.get.ts'), route)
  const nitro = await createNitro({
    rootDir: fixture,
    preset: 'cloudflare_pages',
    compatibilityDate: '2024-12-01',
    nodeModulesDirs: [path.join(process.cwd(), 'node_modules')],
    cloudflare: { deployConfig: true, nodeCompat: true },
    sourceMap: false,
    externals: { inline },
    esbuild: { options: { target: 'es2020' } },
    rollupConfig: { external: rollupExternal }
  })
  try {
    await prepare(nitro)
    await build(nitro)
  } catch (error) {
    await rm(fixture, { recursive: true, force: true })
    throw error
  } finally {
    await nitro.close()
  }
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
  const outbound: string[] = []
  const runtimeOutput: string[] = []
  const worker = new Miniflare({
    handleRuntimeStdio: (stdout, stderr) => {
      for (const stream of [stdout, stderr]) stream.on('data', chunk => runtimeOutput.push(String(chunk)))
    },
    modules,
    modulesRoot: artifactRoot,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    outboundService: (request) => {
      outbound.push(request.url)
      throw new Error('Unexpected outbound request')
    }
  })
  const bytes = modules.reduce((sum, module) => sum + Buffer.byteLength(module.contents), 0)
  return {
    fixture,
    artifactRoot,
    modules,
    bytes,
    worker,
    outbound,
    runtimeOutput,
    dispose: async () => {
      await worker.dispose()
      await rm(fixture, { recursive: true, force: true })
    }
  }
}

it('inlines gifenc and keeps it out of Rollup externals in the dashboard Nitro configuration', async () => {
  const config = await readFile(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  const inline = config.match(/^\s*inline:\s*\[(.*)\],?\s*$/m)?.[1] ?? ''
  const external = config.match(/^\s*external:\s*\[(.*)\],?\s*$/m)?.[1] ?? ''
  expect(inline).toContain('\'gifenc\'')
  expect(external).not.toContain('gifenc')
  // The other deferred optional packages are not part of this repair.
  expect(external).toContain('\'@cloudflare/puppeteer\'')
  expect(external).toContain('\'puppeteer\'')
})

it('builds and executes the real gifenc encoder in a minimal Pages worker, and fails when gifenc is external', async () => {
  // Red: the pre-repair configuration leaves a bare import('gifenc') that
  // workerd cannot resolve. Node prerender would mask this via node_modules.
  const red = await buildPagesFixture(['gifenc'], [])
  let redBytes: number
  try {
    redBytes = red.bytes
    const { errors, deferredOptionalImports } = await checkWorkerImports(red.artifactRoot)
    expect(errors).toEqual([expect.objectContaining({ specifier: 'gifenc', reason: 'unresolved bare import' })])
    expect(deferredOptionalImports).toEqual([])
    await red.worker.ready
    const response = await red.worker.dispatchFetch('http://localhost/gif')
    expect(response.status).toBe(500)
    await response.text()
    await expect.poll(() => red.runtimeOutput.join('')).toMatch(/No such module "[^"]*gifenc"/)
    expect(red.outbound).toEqual([])
  } finally {
    await red.dispose()
  }

  // Green: the repaired configuration bundles the real emitted gifenc code.
  const green = await buildPagesFixture([], ['gifenc'])
  try {
    const { errors, deferredOptionalImports } = await checkWorkerImports(green.artifactRoot)
    expect(errors).toEqual([])
    expect(deferredOptionalImports).toEqual([])
    const combined = green.modules.map(module => module.contents).join('\n')
    expect(combined).not.toMatch(/import\(\s*["']gifenc["']\s*\)/)
    expect(combined).toContain('NETSCAPE2.0')

    await green.worker.ready
    const response = await green.worker.dispatchFetch('http://localhost/gif')
    const body = await response.text()
    expect(response.status, body).toBe(200)
    expect(green.outbound).toEqual([])
    const { gif: gifBase64, transparentProbe } = JSON.parse(body)
    const gif = Buffer.from(gifBase64, 'base64')

    const structure = readGifStructure(gif)
    expect(structure).toEqual({
      header: 'GIF89a',
      width: W,
      height: H,
      images: FRAMES.length,
      controls: FRAMES.map(() => ({ delayMs: 100, transparent: false, transparentIndex: 0 })),
      loop: 0,
      trailer: true
    })

    const metadata = await sharp(gif, { animated: true }).metadata()
    expect({
      format: metadata.format,
      width: metadata.width,
      pageHeight: metadata.pageHeight,
      pages: metadata.pages,
      delay: metadata.delay,
      loop: metadata.loop
    }).toEqual({ format: 'gif', width: W, pageHeight: H, pages: FRAMES.length, delay: [100, 100, 100], loop: 0 })
    const decoded = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer()
    expect(decoded.length).toBe(FRAMES.length * W * H * 4)
    const expectedPixels = FRAMES.flatMap(frame => frame.flatMap(([r, g, b]) => [r, g, b, 255]))
    expect(Array.from(decoded)).toEqual(expectedPixels)

    const probe = Buffer.from(transparentProbe, 'base64')
    expect(readGifStructure(probe).controls).toEqual([{ delayMs: 0, transparent: true, transparentIndex: 0 }])
    const probePixels = await sharp(probe).ensureAlpha().raw().toBuffer()
    const alpha = Array.from({ length: W * H }, (_, i) => probePixels[i * 4 + 3])
    expect(alpha).toEqual([0, 255, 0, 255, 0, 255, 0, 255])

    // Emitted bundle growth attributable to inlining gifenc (fixture scale).
    const delta = green.bytes - redBytes
    console.info(`[gif-runtime] fixture worker bytes red=${redBytes} green=${green.bytes} delta=${delta}`)
    expect(delta).toBeGreaterThan(0)
  } finally {
    await green.dispose()
  }
}, 180_000)
