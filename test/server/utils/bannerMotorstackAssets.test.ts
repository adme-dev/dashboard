import { describe, expect, it, vi } from 'vitest'
import { prepareMotorstackBrand, validMotorstackIcon } from '~~/server/utils/banner/motorstackAssets'
import { motorstackBinding, motorstackBrandId, motorstackKitSchema, readMotorstackAsset, type MotorstackBinding, type MotorstackKit } from '~~/server/utils/banner/motorstackClient'

function fontBytes() {
  const bytes = Buffer.alloc(64)
  bytes.write('wOF2')
  bytes.writeUInt32BE(0x00010000, 4)
  bytes.writeUInt32BE(bytes.length, 8)
  bytes.writeUInt16BE(1, 12)
  bytes.writeUInt32BE(32, 16)
  return bytes
}
function metadata(): MotorstackKit {
  return { schemaVersion: 1, brand: { id: 'ford', name: 'Ford' }, fonts: [
    { role: 'heading', family: 'Ford', weight: 700, sourceWeight: 700, assetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', file: 'FordBold-400.woff2' },
    { role: 'medium', family: 'Ford', weight: 700, sourceWeight: '700', assetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', file: 'FordBold-400.woff2' }
  ], logos: [], colors: [{ name: 'primaryColor', value: '#123' }], assets: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'FordBold-400.woff2', type: 'font', mime: 'font/woff2' }], warnings: [] }
}
function binding(data = metadata(), bytes = fontBytes(), mime = 'font/woff2'): MotorstackBinding {
  return { listBrands: vi.fn(), getBrandKit: vi.fn().mockResolvedValue(data), getBrandAsset: vi.fn(async () => new Response(bytes, { headers: { 'content-type': mime } })) }
}

describe('MotorStack exact source asset preparation', () => {
  it('uses declared weight instead of misleading filename and retains repeated source roles', async () => {
    const service = binding()
    const result = await prepareMotorstackBrand(service, 'ford')
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]?.font).toEqual({ family: 'Ford', weight: 700, format: 'woff2' })
    expect(result.fonts.map(ref => result.metadata.fonts[ref.sourceIndex]?.role)).toEqual(['heading', 'medium'])
    expect(result.colors).toEqual([{ role: 'primary', hex: '#112233', label: 'primaryColor' }])
    expect(service.getBrandAsset).toHaveBeenCalledTimes(1)
  })
  it('preserves declared GWM regular weight even when the family says Bold', async () => {
    const data = metadata()
    data.fonts = [{ ...data.fonts[0]!, family: 'Helvetica Now Bold', weight: 400 }]
    expect((await prepareMotorstackBrand(binding(data), 'ford')).assets[0]?.font?.weight).toBe(400)
  })
  it('reports absent font files without creating a substitute face', async () => {
    const data = metadata()
    data.fonts = [{ ...data.fonts[0]!, family: 'Arial', assetId: null, file: null }]
    const result = await prepareMotorstackBrand(binding(data), 'ford')
    expect(result.fonts).toEqual([])
    expect(result.assets).toEqual([])
    expect(result.warnings.join(' ')).toContain('no substitute')
  })
  it('keeps logos/colours when no font metadata exists', async () => {
    const data = metadata()
    data.fonts = []
    const result = await prepareMotorstackBrand(binding(data), 'ford')
    expect(result.colors).toHaveLength(1)
    expect(result.warnings.join(' ')).toContain('no font metadata')
  })
  it('rejects font-disguised HTML before any managed import', async () => {
    await expect(prepareMotorstackBrand(binding(metadata(), Buffer.from('<html><script>evil()</script>'), 'font/woff2'), 'ford')).rejects.toMatchObject({ statusCode: 502 })
  })
  it.each(['<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/payload"/></svg>'])('rejects active/external SVG %s', async (svg) => {
    const data = metadata()
    data.fonts = []
    data.logos = [{ assetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', role: 'main', variant: 'Main logo', name: 'Ford.svg', mime: 'image/svg+xml', file: 'Ford.svg', onDark: false }]
    await expect(prepareMotorstackBrand(binding(data, Buffer.from(svg), 'image/svg+xml'), 'ford')).rejects.toMatchObject({ statusCode: 502 })
  })
  it('fails the whole preparation on a download failure; does not return a partial brand', async () => {
    const service = binding()
    vi.mocked(service.getBrandAsset).mockRejectedValue(new Error('upstream unavailable'))
    await expect(prepareMotorstackBrand(service, 'ford')).rejects.toThrow()
  })
  it('rejects source identity mismatch and duplicate asset identities', async () => {
    await expect(prepareMotorstackBrand(binding(), 'gwm')).rejects.toMatchObject({ statusCode: 502 })
    const data = metadata()
    data.assets.push(data.assets[0]!)
    await expect(prepareMotorstackBrand(binding(data), 'ford')).rejects.toMatchObject({ statusCode: 502 })
  })
  it('rejects over-limit sets rather than silently truncating', async () => {
    const data = metadata()
    data.fonts = Array.from({ length: 9 }, () => data.fonts[0]!)
    await expect(prepareMotorstackBrand(binding(data), 'ford')).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('MotorStack private binding and byte boundaries', () => {
  it('matches the named RPC identity contract exactly', () => {
    expect(motorstackBrandId.safeParse('ford').success).toBe(true)
    for (const id of ['Ford', 'ford_au', 'a'.repeat(41), '../ford']) expect(motorstackBrandId.safeParse(id).success).toBe(false)
    const data = metadata()
    data.fonts[0]!.assetId = 'arbitrary-file'
    expect(motorstackKitSchema.safeParse(data).success).toBe(false)
  })
  it('requires a deployed service binding; never falls back to arbitrary HTTP URLs or a local key', () => {
    expect(() => motorstackBinding({ context: {} } as Parameters<typeof motorstackBinding>[0])).toThrow('not configured')
  })
  it('bounds chunked streams without trusting Content-Length', async () => {
    const service = binding()
    vi.mocked(service.getBrandAsset).mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(32))
      controller.close()
    } }), { headers: { 'content-length': '1' } }))
    await expect(readMotorstackAsset(service, 'ford', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 16)).rejects.toMatchObject({ statusCode: 502 })
  })
  it('accepts only bounded ICO directory images, rejecting HTML and out-of-bounds offsets', () => {
    const bytes = Buffer.alloc(22 + 48)
    bytes.writeUInt16LE(1, 2)
    bytes.writeUInt16LE(1, 4)
    bytes[6] = 1
    bytes[7] = 1
    bytes.writeUInt32LE(48, 14)
    bytes.writeUInt32LE(22, 18)
    bytes.writeUInt32LE(40, 22)
    bytes.writeInt32LE(1, 26)
    bytes.writeInt32LE(2, 30)
    bytes.writeUInt16LE(1, 34)
    bytes.writeUInt16LE(32, 36)
    expect(validMotorstackIcon(bytes)).toBe(true)
    bytes.writeUInt32LE(1000, 18)
    expect(validMotorstackIcon(bytes)).toBe(false)
    expect(validMotorstackIcon(Buffer.from('<html>not an icon</html>'))).toBe(false)
  })
})
