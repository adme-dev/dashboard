import { afterEach, expect, it, vi } from 'vitest'
import OpenAI, { toFile } from 'openai'
import { build } from 'esbuild'
import path from 'node:path'

// Compare actual Request serialization with the pinned SDK, including multipart bytes.
const params = { model: 'gpt-image-1.5', prompt: 'Exact 🚘 wording', n: 1 as const, size: '1024x1024' as const, quality: 'medium' as const, output_format: 'png' as const, background: 'opaque' as const }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function wire(request: Request) {
  const body = request.headers.get('content-type')!.includes('multipart/form-data')
    ? await Promise.all(Array.from((await request.formData()).entries()).map(async ([key, value]) => [key, typeof value === 'string' ? value : { name: value.name, type: value.type, bytes: [...new Uint8Array(await value.arrayBuffer())] }]))
    : await request.json()
  return { url: request.url, method: request.method, authorization: request.headers.get('authorization'), body }
}

it('keeps the shipped provider dependency graph below 420 KB without the full SDK resource tree', async () => {
  const result = await build({ entryPoints: [path.resolve('server/utils/banner/artworkProvider.ts')], bundle: true, minify: true, platform: 'node', format: 'esm', write: false, metafile: true, external: ['h3'] })
  expect(result.outputFiles[0]!.contents.length).toBeLessThan(420000)
  expect(Object.keys(result.metafile!.inputs).filter(file => file.includes('/openai/'))).toEqual([])
})

it('matches SDK image generation, mixed-reference edits and native chat wire payloads', async () => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  const sent: unknown[] = []
  const fetcher = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    sent.push(await wire(request))
    return Response.json({ data: [{ b64_json: 'AQID' }], choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }, { headers: { 'x-request-id': 'req_wire' } })
  }, { Response })
  vi.stubGlobal('fetch', fetcher)
  const sdk = new OpenAI({ apiKey: 'wire-key', maxRetries: 0, timeout: 120000, fetch: fetcher })
  const transport = new ArtworkTransport({ apiKey: 'wire-key', maxRetries: 0, timeout: 120000 })
  const image = [await toFile(Buffer.from([1, 2, 3]), 'reference-0.png', { type: 'image/png' }), await toFile(Buffer.from([4, 5]), 'reference-1.jpg', { type: 'image/jpeg' })]
  const chat = { model: 'gpt-4.1-mini', max_tokens: 1200, temperature: 0.2, response_format: { type: 'json_object' as const }, messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Exact 🚘' }, { type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,AQID', detail: 'high' as const } }] }] }
  for (const client of [sdk, transport]) {
    expect((await client.images.generate(params))._request_id).toBe('req_wire')
    expect((await client.images.edit({ ...params, image }))._request_id).toBe('req_wire')
    expect((await client.chat.completions.create(chat))._request_id).toBe('req_wire')
  }
  expect(sent.slice(3)).toEqual(sent.slice(0, 3))
})

it.each([429, 500, 401])('makes exactly one paid request for HTTP %i and does not expose provider body', async (status) => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  const fetcher = vi.fn(async () => new Response('private-provider-body', { status }))
  vi.stubGlobal('fetch', fetcher)
  const client = new ArtworkTransport({ apiKey: 'key', maxRetries: 0, timeout: 120000 })
  await expect(client.images.generate(params)).rejects.toThrow('Artwork provider request failed')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('aborts the sole request at the configured timeout, including response body reading', async () => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const fetcher = vi.fn(async (_url, init) => {
    signal = init.signal
    return new Response(new ReadableStream({ start(controller) {
      signal!.addEventListener('abort', () => controller.error(new Error('aborted')))
    } }))
  })
  vi.stubGlobal('fetch', fetcher)
  const client = new ArtworkTransport({ apiKey: 'key', maxRetries: 0, timeout: 120000 })
  const result = client.images.generate(params)
  const rejection = expect(result).rejects.toThrow('Artwork provider request failed')
  await vi.advanceTimersByTimeAsync(120000)
  await rejection
  expect(signal!.aborted).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('sends PNG and JPEG files through the real workerd multipart implementation', async () => {
  const { Miniflare, Response: WorkerResponse } = await import('miniflare')
  const compiled = await build({ stdin: { contents: `import Transport, { toFile } from './server/utils/banner/artworkTransport';
export default { async fetch() { const client = new Transport({ apiKey: 'runtime-key', maxRetries: 0, timeout: 120000 });
return Response.json(await client.images.edit({ model: 'gpt-image-1.5', prompt: 'Exact 🚘', n: 1, image: [await toFile(new Uint8Array([1,2,3]), 'reference-0.png', { type: 'image/png' }), await toFile(new Uint8Array([4,5]), 'reference-1.jpg', { type: 'image/jpeg' })] })); } };`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', write: false })
  const sent: unknown[] = []
  const worker = new Miniflare({ modules: true, script: compiled.outputFiles[0]!.text, compatibilityDate: '2024-12-01', outboundService: async (request) => {
    sent.push(await wire(request as unknown as Request))
    return WorkerResponse.json({ data: [{ b64_json: 'AQID' }] }, { headers: { 'x-request-id': 'req_runtime' } })
  } })
  try {
    const response = await worker.dispatchFetch('https://worker.test/')
    expect(response.status, response.status === 200 ? '' : await response.text()).toBe(200)
    expect(await response.json()).toEqual({ data: [{ b64_json: 'AQID' }], _request_id: 'req_runtime' })
    expect(sent).toEqual([{ url: 'https://api.openai.com/v1/images/edits', method: 'POST', authorization: 'Bearer runtime-key', body: [
      ['model', 'gpt-image-1.5'], ['prompt', 'Exact 🚘'], ['n', '1'], ['image[]', { name: 'reference-0.png', type: 'image/png', bytes: [1, 2, 3] }], ['image[]', { name: 'reference-1.jpg', type: 'image/jpeg', bytes: [4, 5] }]
    ] }])
  } finally { await worker.dispose() }
}, 30000)

it.each(['declared', 'streamed', 'malformed'])('bounds or rejects %s provider responses with sanitized failure', async (kind) => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  const cancel = vi.fn()
  let pulls = 0
  const body = new ReadableStream({ pull(controller) {
    pulls++
    controller.enqueue(new Uint8Array(1024 * 1024).fill(32))
    if (pulls === 15) controller.close()
  }, cancel })
  const fetcher = vi.fn(async () => kind === 'malformed'
    ? new Response('private-bad-json', { headers: { 'content-type': 'application/json' } })
    : new Response(body, { headers: kind === 'declared' ? { 'content-length': '999999999' } : {} }))
  vi.stubGlobal('fetch', fetcher)
  const client = new ArtworkTransport({ apiKey: 'key', maxRetries: 0, timeout: 120000 })
  await expect(client.images.generate(params)).rejects.toThrow('Artwork provider request failed')
  expect(fetcher).toHaveBeenCalledTimes(1)
  if (kind !== 'malformed') {
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(pulls).toBeLessThanOrEqual(15)
  }
})

it('refuses redirects and ambient origin overrides', async () => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  const fetcher = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://other.test' } }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubEnv('OPENAI_BASE_URL', 'https://ambient.test/v1')
  try {
    const client = new ArtworkTransport({ apiKey: 'key', maxRetries: 0, timeout: 120000 })
    await expect(client.images.generate(params)).rejects.toThrow('Artwork provider request failed')
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://api.openai.com/v1/images/generations', expect.objectContaining({ redirect: 'manual' }))
  } finally { vi.unstubAllEnvs() }
})

it('aborts a hung connection without retrying and clears the deadline', async () => {
  const { default: ArtworkTransport } = await import('../../../server/utils/banner/artworkTransport')
  vi.useFakeTimers()
  const fetcher = vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('private-network-error')))
  }))
  vi.stubGlobal('fetch', fetcher)
  const client = new ArtworkTransport({ apiKey: 'key', maxRetries: 0, timeout: 120000 })
  const pending = expect(client.images.generate(params)).rejects.toThrow('Artwork provider request failed')
  await vi.advanceTimersByTimeAsync(120000)
  await pending
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
