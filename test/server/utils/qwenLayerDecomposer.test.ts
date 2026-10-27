import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deflateSync } from 'node:zlib'
import { decomposeImageLayers } from '~~/server/utils/qwenLayerDecomposer'

const SPACE = 'https://qwen-qwen-image-layered.hf.space'
const file = (name: string) => `${SPACE}/gradio_api/file=/tmp/${name}`

// Real, tiny RGBA PNGs: fixtures exercise binary validation without an image library.
function png(width = 2, height = 2, colorType = 6): Buffer {
  function chunk(type: string, data: Buffer) {
    const payload = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of payload) {
      crc ^= byte
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    const header = Buffer.alloc(4)
    header.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([header, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = colorType
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * (colorType === 6 ? 4 : 3) + 1) * height))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

let fetchMock: ReturnType<typeof vi.fn>
function prediction(gallery: unknown[], files: Array<Buffer | Response | Error> = [png(), png()], extras: unknown[] = []) {
  fetchMock.mockResolvedValueOnce(Response.json(['/tmp/input.png']))
    .mockResolvedValueOnce(Response.json({ event_id: 'job-123' }))
    .mockResolvedValueOnce(new Response(`event: complete\ndata: ${JSON.stringify([gallery, ...extras])}\n\n`))
  for (const value of files) {
    if (value instanceof Error) fetchMock.mockRejectedValueOnce(value)
    else fetchMock.mockResolvedValueOnce(value instanceof Response ? value : new Response(new Uint8Array(value)))
  }
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Qwen layered Space adapter', () => {
  it('imports the complete gallery including background, with common frame metadata and the public request contract', async () => {
    prediction([
      { image: { url: file('background.png') }, caption: null },
      { image: { path: '/tmp/front.png' }, caption: 'Foreground' },
      { url: file('third.png') }
    ], [png(), png(), png()], [{ path: '/tmp/art.pptx' }, { url: file('art.zip') }])
    const result = await decomposeImageLayers(png(), { numLayers: 2, hfToken: 'private-test-token', prompt: 'Overall scene' })
    expect(result?.layers.map(({ index, width, height }) => ({ index, width, height }))).toEqual([
      { index: 0, width: 2, height: 2 }, { index: 1, width: 2, height: 2 }, { index: 2, width: 2, height: 2 }
    ])
    expect(result?.pptxUrl).toBe(file('art.pptx'))
    expect(result?.zipUrl).toBe(file('art.zip'))
    expect(fetchMock.mock.calls[0][0]).toBe(`${SPACE}/gradio_api/upload`)
    expect(fetchMock.mock.calls[0][1].body.get('files').name).toBe('input.png')
    expect(fetchMock.mock.calls[1][0]).toBe(`${SPACE}/gradio_api/call/infer_1`)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).data).toEqual([
      { path: '/tmp/input.png' }, 0, true, 'Overall scene', ' ', 4, 50, 2, true, true
    ])
    expect(fetchMock.mock.calls[2][0]).toBe(`${SPACE}/gradio_api/call/infer_1/job-123`)
    for (const [url, options] of fetchMock.mock.calls) {
      expect(new URL(url).origin).toBe(SPACE)
      expect(options.redirect).toBe('error')
    }
  })

  it.each([
    ['failed HTTP response', new Response('private provider text', { status: 500 })],
    ['network failure', new Error('https://private.example/token=secret')],
    ['empty download', Buffer.alloc(0)],
    ['non-PNG bytes', Buffer.from('not png')],
    ['truncated PNG', png().subarray(0, 32)],
    ['header only PNG', png().subarray(0, 33)],
    ['RGB without alpha', png(2, 2, 2)],
    ['different frame dimensions', png(3, 2)],
    ['zero width', png(0, 2)]
  ] as const)('rejects the whole result on %s', async (_name, invalid) => {
    prediction([{ url: file('a.png') }, { url: file('b.png') }], [png(), invalid])
    expect(await decomposeImageLayers(png())).toBeNull()
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private provider|private.example|token=secret/)
  })

  it.each([
    { caption: 'missing file' },
    { image: null },
    { url: 'http://qwen-qwen-image-layered.hf.space/unsafe.png' },
    { url: 'https://other.hf.space/token=private' },
    { url: 'https://huggingface.co/private.png' },
    { url: 'https://user:pass@qwen-qwen-image-layered.hf.space/private.png' },
    { url: '//evil.example/private.png' }
  ])('rejects malformed or foreign gallery entries without downloading a subset: %j', async (entry) => {
    prediction([{ url: file('a.png') }, entry])
    expect(await decomposeImageLayers(png(), { hfToken: 'secret-token' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not return unsafe optional export URLs', async () => {
    prediction([{ url: file('a.png') }], [png()], [{ url: 'https://other.hf.space/export.pptx' }])
    expect((await decomposeImageLayers(png()))?.pptxUrl).toBeUndefined()
  })

  it.each(['upload', 'submit', 'stream'])('does not log raw %s errors', async (stage) => {
    if (stage !== 'upload') fetchMock.mockResolvedValueOnce(Response.json(['/tmp/input.png']))
    if (stage === 'stream') fetchMock.mockResolvedValueOnce(Response.json({ event_id: 'id' }))
    fetchMock.mockResolvedValueOnce(new Response('private-source token=secret', { status: 500 }))
    expect(await decomposeImageLayers(png())).toBeNull()
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-source|token=secret/)
  })

  it('does not log raw SSE error content', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(['/tmp/input.png']))
      .mockResolvedValueOnce(Response.json({ event_id: 'id' }))
      .mockResolvedValueOnce(new Response('event: error\ndata: private-source token=secret\n'))
    expect(await decomposeImageLayers(png())).toBeNull()
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-source|token=secret/)
  })
})
