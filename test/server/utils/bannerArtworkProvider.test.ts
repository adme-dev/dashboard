import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'

const m = vi.hoisted(() => ({
  construct: vi.fn(),
  generate: vi.fn(),
  edit: vi.fn(),
  chat: vi.fn()
}))
vi.mock('../../../server/utils/banner/artworkTransport', () => ({
  default: class {
    images = { generate: m.generate, edit: m.edit }
    chat = { completions: { create: m.chat } }
    constructor(options: unknown) {
      m.construct(options)
    }
  },
  toFile: async (bytes: Buffer, name: string) => ({ bytes, name })
}))
const { artworkClient, generateArtworkImage, proposeNativeArtworkStyle }
  = await import('../../../server/utils/banner/artworkProvider')
let b64: string
beforeEach(() => {
  vi.resetAllMocks()
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  png.data[3] = 0
  b64 = PNG.sync.write(png).toString('base64')
  m.generate.mockResolvedValue({
    data: [{ b64_json: b64 }],
    _request_id: 'req_1'
  })
  m.edit.mockResolvedValue({ data: [{ b64_json: b64 }], _request_id: 'req_2' })
})
const event = {
  context: { cloudflare: { env: { OPENAI_API_KEY: 'test-request-key' } } }
}
afterEach(() => vi.unstubAllEnvs())
describe('real OpenAI image adapter protocol', () => {
  it.each([{}, { env: {} }, { env: { OPENAI_API_KEY: '' } }, { env: { OPENAI_API_KEY: 123 } }])('rejects missing or invalid hosted credentials without ambient fallback: %j', (cloudflare) => {
    vi.stubEnv('OPENAI_API_KEY', 'ambient-test-key')
    expect(() => artworkClient({ context: { cloudflare } } as unknown as import('h3').H3Event)).toThrow('OpenAI artwork credentials are unavailable')
    expect(m.construct).not.toHaveBeenCalled()
  })
  it('retains process credentials only for local execution without Cloudflare context', () => {
    vi.stubEnv('OPENAI_API_KEY', 'local-test-key')
    artworkClient({ context: {} } as import('h3').H3Event)
    expect(m.construct).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'local-test-key' }))
  })
  it('uses request scoped credentials and disables paid retries', () => {
    artworkClient(event)
    expect(m.construct).toHaveBeenCalledWith({
      apiKey: 'test-request-key',
      maxRetries: 0,
      timeout: 120000
    })
  })
  it('uses generation or reference edits with a single bounded PNG output', async () => {
    const result = await generateArtworkImage(event, {
      model: 'openai/gpt-image-1.5',
      prompt: 'test',
      references: [],
      transparent: false
    })
    expect(result).toMatchObject({ width: 2, requestId: 'req_1' })
    expect(m.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1.5',
        n: 1,
        size: '1024x1024',
        quality: 'medium',
        output_format: 'png'
      })
    )
    const lettering = new PNG({ width: 3, height: 3 })
    lettering.data.fill(0)
    lettering.data[4 * 4 + 3] = 255
    m.edit.mockResolvedValueOnce({
      data: [{ b64_json: PNG.sync.write(lettering).toString('base64') }],
      _request_id: 'req_2'
    })
    await generateArtworkImage(event, {
      model: 'openai/gpt-image-1.5',
      prompt: 'test',
      references: [Buffer.from('owned')],
      transparent: true
    })
    expect(m.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: [{ bytes: Buffer.from('owned'), name: 'reference-0.png' }],
        background: 'transparent'
      })
    )
  })
  it('rejects unsupported models, URL-only responses, oversized and malformed outputs', async () => {
    await expect(
      generateArtworkImage(event, {
        model: 'arbitrary',
        prompt: 'test',
        references: [],
        transparent: false
      })
    ).rejects.toMatchObject({ statusCode: 503 })
    m.generate.mockResolvedValueOnce({ data: [{ url: 'https://untrusted' }] })
    await expect(
      generateArtworkImage(event, {
        model: 'openai/gpt-image-1.5',
        prompt: 'test',
        references: [],
        transparent: false
      })
    ).rejects.toMatchObject({ statusCode: 502 })
    m.generate.mockRejectedValueOnce(new Error('secret customer prompt'))
    await expect(
      generateArtworkImage(event, {
        model: 'openai/gpt-image-1.5',
        prompt: 'test',
        references: [],
        transparent: false
      })
    ).rejects.toMatchObject({
      statusMessage: 'Artwork image provider failed or returned invalid output'
    })
  })
  it('rejects wrong generated wording and incomplete native proposals', async () => {
    m.chat.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              wording: 'WRONG',
              style: {},
              warnings: []
            })
          }
        }
      ]
    })
    await expect(
      proposeNativeArtworkStyle(event, {
        model: 'openai/gpt-4.1-mini',
        wording: 'EXACT',
        instruction: 'style',
        sourceStyle: {}
      })
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})
