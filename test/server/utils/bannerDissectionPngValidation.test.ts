import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { deflateSync, deflateRawSync, gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { PNG } from 'pngjs'
import { validateDissectionPng } from '../../../server/utils/banner/dissectionPngValidation'

const require = createRequire(import.meta.url)
const crc32 = require('pngjs/lib/crc').crc32 as (data: Buffer) => number

const signature = Buffer.from('89504e470d0a1a0a', 'hex')
function chunk(type: string, data: Buffer = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length)
  result.write(type, 4, 4, 'ascii')
  data.copy(result, 8)
  result.writeInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
  return result
}
function header(width = 2, height = 1, color = 6, depth = 8, interlace = 0) {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width)
  data.writeUInt32BE(height, 4)
  data[8] = depth
  data[9] = color
  data[12] = interlace
  return chunk('IHDR', data)
}
function png(parts: Buffer[]) {
  return Buffer.concat([signature, ...parts])
}
function basic(raw: Buffer = Buffer.alloc(9), compressed: Buffer = deflateSync(raw)) {
  return png([header(), chunk('IDAT', compressed), chunk('IEND')])
}
function independentFixture(width: number, height: number, colorType: 0 | 2 | 4 | 6, filterType = -1) {
  const image = new PNG({ width, height })
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 251
    data[i + 1] = colorType === 0 || colorType === 4 ? data[i]! : 67
    data[i + 2] = colorType === 0 || colorType === 4 ? data[i]! : 192
    data[i + 3] = colorType === 4 || colorType === 6 ? 137 : 255
  }
  return { bytes: PNG.sync.write(image, { colorType, inputColorType: 6, bitDepth: 8, filterType }), data }
}
function uints(...values: number[]) {
  const data = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => data.writeUInt32BE(value, index * 4))
  return data
}
const metadata: [string, Buffer][] = [
  ['gAMA', uints(45455)], ['cHRM', uints(31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000)],
  ['sRGB', Buffer.from([0])], ['pHYs', Buffer.concat([uints(11811, 11811), Buffer.from([1])])]
]
function withMetadata(bytes: Buffer) {
  return Buffer.concat([bytes.subarray(0, 33), ...metadata.map(([type, data]) => chunk(type, data)), bytes.subarray(33)])
}
const palette = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255])
// Independently encoded 3x2 indexed rows for each predictor; pngjs checks our pixels.
function indexed(filter: number, invalid = false) {
  const first = [0, 1, 2], second = [2, 1, invalid ? 3 : 0]
  const filtered = second.map((value, x) => {
    const left = x ? second[x - 1]! : 0, up = first[x]!, upperLeft = x ? first[x - 1]! : 0
    const p = left + up - upperLeft
    const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upperLeft) ? left : Math.abs(p - up) <= Math.abs(p - upperLeft) ? up : upperLeft
    return (value - [0, left, up, Math.floor((left + up) / 2), paeth][filter]!) & 255
  })
  return png([header(3, 2, 3), chunk('PLTE', palette), chunk('tRNS', Buffer.from([255, 127, 0])), chunk('IDAT', deflateSync(Buffer.from([0, ...first, filter, ...filtered]))), chunk('IEND')])
}
function largeIndexed(filter: number) {
  const width = 4096, height = 5
  const gray = independentFixture(width, height, 0, filter)
  const colors = Buffer.alloc(256 * 3)
  for (let x = 0; x < 256; x++) {
    colors[x * 3] = x
    colors[x * 3 + 1] = 255 - x
    colors[x * 3 + 2] = x >>> 1
  }
  const bytes = Buffer.concat([signature, header(width, height, 3), chunk('PLTE', colors), gray.bytes.subarray(33)])
  const expected = Buffer.from(gray.data)
  for (let i = 0; i < expected.length; i += 4) {
    expected[i + 1] = 255 - expected[i]!
    expected[i + 2] = expected[i]! >>> 1
  }
  return { bytes, expected }
}
function fragmented() {
  const compressed = deflateSync(Buffer.alloc(8001), { level: 0 })
  return png([header(2000, 1), ...[...compressed].map(value => chunk('IDAT', Buffer.from([value]))), chunk('IEND')])
}
const idat = chunk('IDAT', deflateSync(Buffer.alloc(9)))
const end = chunk('IEND')
const badCrc = basic()
badCrc[badCrc.length - 1] ^= 1
const badAdler = deflateSync(Buffer.alloc(9))
badAdler[badAdler.length - 1] ^= 1
const invalid: [string, Buffer][] = [
  ...metadata.flatMap(([type, data]) => [
    [`${type} length`, png([header(), chunk(type, data.subarray(1)), idat, end])],
    [`${type} duplicate`, png([header(), chunk(type, data), chunk(type, data), idat, end])],
    [`${type} after IDAT`, png([header(), idat, chunk(type, data), end])],
    ...(type === 'pHYs' ? [] : [[`${type} after PLTE`, png([header(), chunk('PLTE', palette), chunk(type, data), idat, end])]])
  ] as [string, Buffer][]),
  ['sRGB rendering intent', png([header(), chunk('sRGB', Buffer.from([4])), idat, end])],
  ['gAMA zero', png([header(), chunk('gAMA', uints(0)), idat, end])],
  ['gAMA high bit', png([header(), chunk('gAMA', uints(0x80000000)), idat, end])],
  ['cHRM high bit', png([header(), chunk('cHRM', uints(0x80000000, 0, 0, 0, 0, 0, 0, 0)), idat, end])],
  ['pHYs high bit', png([header(), chunk('pHYs', Buffer.concat([uints(0x80000000, 1), Buffer.from([0])])), idat, end])],
  ['pHYs unknown unit', png([header(), chunk('pHYs', Buffer.concat([uints(1, 1), Buffer.from([2])])), idat, end])],
  ['sRGB gamma conflict', png([header(), chunk('sRGB', Buffer.from([0])), chunk('gAMA', uints(100000)), idat, end])],
  ['sRGB chromaticity conflict', png([header(), chunk('cHRM', Buffer.alloc(32)), chunk('sRGB', Buffer.from([0])), idat, end])],
  ...[10, 11].map((field) => {
    const ihdr = Buffer.from(header().subarray(8, -4))
    ihdr[field] = 1
    return [`IHDR method ${field}`, png([chunk('IHDR', ihdr), idat, end])] as [string, Buffer]
  }),
  ...(() => {
    const bytes = withMetadata(indexed(4)), cases: [string, Buffer][] = []
    for (let offset = 8; offset < bytes.length;) {
      const size = bytes.readUInt32BE(offset), copy = Buffer.from(bytes)
      copy[offset + size + 8] ^= 1
      cases.push([`CRC ${bytes.toString('ascii', offset + 4, offset + 8)}`, copy])
      offset += size + 12
    }
    return cases
  })(),
  ['tail beyond feed boundary', basic(undefined, Buffer.concat([deflateSync(Buffer.alloc(9)), Buffer.alloc(20000)]))],
  ['raw deflate', basic(undefined, deflateRawSync(Buffer.alloc(9)))],
  ['gzip', basic(undefined, gzipSync(Buffer.alloc(9)))],
  ['preset dictionary', basic(undefined, deflateSync(Buffer.alloc(9), { dictionary: Buffer.alloc(32) }))],
  ['gray tRNS length', png([header(2, 1, 0), chunk('tRNS', Buffer.alloc(1)), idat, end])],
  ['RGB tRNS sample range', png([header(2, 1, 2), chunk('tRNS', Buffer.from([1, 0, 0, 0, 0, 0])), idat, end])],
  ['too many chunks', png([header(), ...Array.from({ length: 9998 }, () => chunk('IDAT')), idat, end])],
  ['signature', Buffer.from(basic()).fill(0, 0, 8)], ['short signature', signature.subarray(0, 7)],
  ['chunk bounds', Buffer.concat([signature, Buffer.from('7fffffff49484452', 'hex')])],
  ['CRC', badCrc], ['IHDR missing', png([idat, end])], ['IHDR duplicate', png([header(), header(), idat, end])],
  ['IHDR size', png([chunk('IHDR', Buffer.alloc(12)), idat, end])],
  ['zero width', png([header(0), idat, end])], ['edge limit', png([header(4097), idat, end])],
  ['pixel limit', png([header(4000, 2501), idat, end])], ['16 MP', png([header(4000, 4000), idat, end])],
  ['bit depth', png([header(2, 1, 6, 16), idat, end])], ['interlace', png([header(2, 1, 6, 8, 1), idat, end])],
  ['colour type', png([header(2, 1, 1), idat, end])],
  ['IEND missing', png([header(), idat])], ['IEND size', png([header(), idat, chunk('IEND', Buffer.from([0]))])],
  ['EOF suffix', Buffer.concat([basic(), Buffer.from([0])])], ['IDAT missing', png([header(), end])],
  ['empty IDAT', png([header(), chunk('IDAT'), end])],
  ['nonconsecutive IDAT', png([header(), idat, chunk('tEXt', Buffer.from('a\0b')), idat, end])],
  ['unknown critical', png([header(), chunk('ABCD'), idat, end])],
  ['reserved type bit', png([header(), chunk('abca'), idat, end])], ['nonletter type', png([header(), chunk('a1Ca'), idat, end])],
  ...['acTL', 'fcTL', 'fdAT', 'eXIf', 'iCCP', 'zTXt', 'iTXt'].map(type => [type, png([header(), chunk(type), idat, end])] as [string, Buffer]),
  ['palette missing', png([header(2, 1, 3), chunk('IDAT', deflateSync(Buffer.from([0, 0, 1]))), end])],
  ['palette duplicate', png([header(), chunk('PLTE', palette), chunk('PLTE', palette), idat, end])],
  ['palette malformed', png([header(), chunk('PLTE', Buffer.alloc(4)), idat, end])],
  ['palette empty', png([header(), chunk('PLTE'), idat, end])],
  ['palette oversized', png([header(), chunk('PLTE', Buffer.alloc(771)), idat, end])],
  ['grayscale palette', png([header(2, 1, 0), chunk('PLTE', palette), idat, end])],
  ['palette after data', png([header(), idat, chunk('PLTE', palette), end])],
  ['alpha tRNS', png([header(), chunk('tRNS', Buffer.alloc(6)), idat, end])],
  ['indexed tRNS too long', png([header(2, 1, 3), chunk('PLTE', palette), chunk('tRNS', Buffer.alloc(4)), idat, end])],
  ['indexed tRNS before palette', png([header(2, 1, 3), chunk('tRNS', Buffer.from([0])), chunk('PLTE', palette), idat, end])],
  ['tRNS duplicate', png([header(2, 1, 2), chunk('tRNS', Buffer.alloc(6)), chunk('tRNS', Buffer.alloc(6)), idat, end])],
  ['tRNS after data', png([header(2, 1, 2), idat, chunk('tRNS', Buffer.alloc(6)), end])],
  ['illegal filter', basic(Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 0]))],
  ['short scanline', basic(Buffer.alloc(8))], ['excess scanline', basic(Buffer.alloc(10))],
  ['compressed bomb', basic(Buffer.alloc(8 * 1024 * 1024))],
  ['compressed truncation', basic(undefined, deflateSync(Buffer.alloc(9)).subarray(0, -1))],
  ['adler checksum', basic(undefined, badAdler)],
  ['trailing garbage', basic(undefined, Buffer.concat([deflateSync(Buffer.alloc(9)), Buffer.from([0])]))],
  ['concatenated zlib', basic(undefined, Buffer.concat([deflateSync(Buffer.alloc(9)), deflateSync(Buffer.alloc(9))]))],
  ['tail in separate IDAT', png([header(), idat, chunk('IDAT', deflateSync(Buffer.alloc(9))), end])],
  ['over 10MiB', Buffer.alloc(10 * 1024 * 1024 + 1)],
  ...[0, 1, 2, 3, 4].map(filter => [`palette index after filter ${filter}`, indexed(filter, true)] as [string, Buffer])
]

describe('validateDissectionPng', () => {
  it.each([2, 6] as const)('preserves A4 pixels and original bytes with common metadata colour type %i', async (color) => {
    const fixture = independentFixture(2480, 3508, color)
    const bytes = withMetadata(fixture.bytes), original = Buffer.from(bytes)
    expect(PNG.sync.read(bytes).data.equals(fixture.data)).toBe(true)
    await expect(validateDissectionPng(bytes)).resolves.toEqual({ width: 2480, height: 3508 })
    expect(bytes.equals(original)).toBe(true)
  }, 20000)
  it('accepts metadata before palette and pHYs after palette without inferring physical dimensions', async () => {
    const bytes = png([header(2, 1, 2), ...metadata.slice(0, 3).map(([type, data]) => chunk(type, data)), chunk('PLTE', palette), chunk('pHYs', Buffer.concat([uints(0, 0), Buffer.from([0])])), chunk('IDAT', deflateSync(Buffer.alloc(7))), end])
    await expect(validateDissectionPng(bytes)).resolves.toEqual({ width: 2, height: 1 })
  })
  it.each([0, 2])('accepts tRNS sample transparency for colour type %i', async (color) => {
    const bytes = png([header(2, 1, color), chunk('tRNS', Buffer.alloc(color === 0 ? 2 : 6)), chunk('IDAT', deflateSync(Buffer.alloc(color === 0 ? 3 : 7))), end])
    expect([...PNG.sync.read(bytes).data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    await expect(validateDissectionPng(bytes)).resolves.toEqual({ width: 2, height: 1 })
  })
  it.each([0, 1, 2, 3, 4])('checks indexed first rows and output chunk boundaries for filter %i', async (filter) => {
    const fixture = largeIndexed(filter)
    expect(PNG.sync.read(fixture.bytes).data.equals(fixture.expected)).toBe(true)
    await expect(validateDissectionPng(fixture.bytes)).resolves.toEqual({ width: 4096, height: 5 })
  })
  it('handles thousands of one-byte IDAT writes', async () => {
    await expect(validateDissectionPng(fragmented())).resolves.toEqual({ width: 2000, height: 1 })
  })
  it.each([0, 2, 4, 6] as const)('accepts independent 8-bit colour type %i with exact pixels', async (color) => {
    for (const filter of [0, 1, 2, 3, 4]) {
      const fixture = independentFixture(37, 13, color, filter)
      expect(PNG.sync.read(fixture.bytes).data).toEqual(fixture.data)
      await expect(validateDissectionPng(fixture.bytes)).resolves.toEqual({ width: 37, height: 13 })
    }
  })
  it.each([0, 1, 2, 3, 4])('accepts indexed filter %i and independent RGBA pixel oracle', async (filter) => {
    const bytes = indexed(filter)
    expect([...PNG.sync.read(bytes).data]).toEqual([255, 0, 0, 255, 0, 255, 0, 127, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 127, 255, 0, 0, 255])
    await expect(validateDissectionPng(bytes)).resolves.toEqual({ width: 3, height: 2 })
  })
  it.each([2, 6] as const)('accepts A4 colour type %i', async (color) => {
    const fixture = independentFixture(2480, 3508, color)
    expect(PNG.sync.read(fixture.bytes).data.equals(fixture.data)).toBe(true)
    await expect(validateDissectionPng(fixture.bytes)).resolves.toEqual({ width: 2480, height: 3508 })
  }, 20000)
  it('accepts exactly 10 million pixels and 4096px edges', async () => {
    for (const [width, height] of [[4000, 2500], [4096, 1], [1, 4096]]) {
      const bytes = png([header(width, height, 0), chunk('IDAT', deflateSync(Buffer.alloc((width! + 1) * height!))), end])
      await expect(validateDissectionPng(bytes)).resolves.toEqual({ width, height })
    }
  })
  it('accepts exactly 10000 chunks', async () => {
    await expect(validateDissectionPng(png([header(), ...Array.from({ length: 9997 }, () => chunk('IDAT')), idat, end]))).resolves.toEqual({ width: 2, height: 1 })
  })
  it('accepts IDAT split at every byte including empty chunks', async () => {
    const compressed = deflateSync(Buffer.alloc(9))
    const chunks = [...compressed].flatMap(value => [chunk('IDAT'), chunk('IDAT', Buffer.from([value]))])
    await expect(validateDissectionPng(png([header(), ...chunks, chunk('IDAT'), end]))).resolves.toEqual({ width: 2, height: 1 })
  })
  it.each(invalid)('rejects %s', async (_name, bytes) => {
    await expect(validateDissectionPng(bytes)).rejects.toThrow(/PNG/i)
  })
  it('validates pixels and consumed compressed input in actual workerd with current application flags', async () => {
    const config = readFileSync('wrangler.toml', 'utf8')
    expect(config).toContain('compatibility_date = "2024-12-01"')
    expect(config).toContain('compatibility_flags = ["nodejs_compat", "no_handle_cross_request_promise_resolution"]')
    const compiled = await build({ stdin: { contents: `
      import { Buffer } from 'node:buffer';
      import { createInflate } from 'node:zlib';
      import { validateDissectionPng } from './server/utils/banner/dissectionPngValidation';
      export default { async fetch(request) {
        const bytes = Buffer.from(await request.arrayBuffer());
        if (new URL(request.url).pathname === '/consumption') {
          const stream = createInflate({ chunkSize: 1024 }); let output = 0;
          return new Promise((resolve, reject) => {
            stream.on('data', data => { output += data.length }); stream.on('error', reject);
            stream.on('end', () => resolve(Response.json({ consumed: stream.bytesWritten, supplied: bytes.length, output })));
            stream.end(bytes);
          });
        }
        try { return Response.json(await validateDissectionPng(bytes)) }
        catch (error) { return Response.json({ error: error.message }, { status: 400 }) }
      } };`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, metafile: true })
    expect(Object.keys(compiled.metafile!.inputs).some(file => file.includes('pngjs'))).toBe(false)
    const worker = new Miniflare({ modules: true, script: compiled.outputFiles[0]!.text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat', 'no_handle_cross_request_promise_resolution'] })
    try {
      const stream = deflateSync(Buffer.alloc(9))
      for (const suffix of [Buffer.from([0]), deflateSync(Buffer.alloc(9))]) {
        const response = await worker.dispatchFetch('https://png.test/consumption', { method: 'POST', body: Buffer.concat([stream, suffix]) })
        expect(await response.json()).toEqual({ consumed: stream.length, supplied: stream.length + suffix.length, output: 9 })
      }
      for (const bytes of [basic(), indexed(4), fragmented(), ...[0, 1, 2, 3, 4].map(filter => largeIndexed(filter).bytes), ...[2, 6].map(color => withMetadata(independentFixture(2480, 3508, color as 2 | 6).bytes))]) {
        const response = await worker.dispatchFetch('https://png.test/', { method: 'POST', body: bytes })
        expect(response.status, await response.text()).toBe(200)
      }
      for (const [name, bytes] of invalid) {
        const response = await worker.dispatchFetch('https://png.test/', { method: 'POST', body: bytes })
        expect(response.status, name).toBe(400)
      }
    } finally { await worker.dispose() }
  }, 60000)
})
