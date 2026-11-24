import { afterEach, expect, it, vi } from 'vitest'
import worker from '../../workers/thebrief-import/src/index'

afterEach(() => vi.unstubAllGlobals())

it('streams a ZIP through the bounded private container pool and returns preparation results', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 0, 255])
  const convert = vi.fn(async (request: Request) => {
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes)
    expect(request.headers.get('x-thebrief-filename')).toBe('Designs-HTML.zip')
    return Response.json({ sourceSha256: 'a'.repeat(64), packages: [], issues: [] })
  })
  const route = vi.fn((_namespace, name: string) => {
    expect(name).toMatch(/^import-[01]$/)
    return { fetch: convert }
  })
  vi.stubGlobal('__cloudflareContainersGetContainer', route)
  const response = await worker.fetch(new Request('https://private/prepare', { method: 'POST', body: bytes, headers: { 'x-thebrief-filename': 'Designs-HTML.zip' } }), { IMPORTER: {} } as never)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toMatchObject({ packages: [], issues: [] })
  expect(convert).toHaveBeenCalledTimes(1)
})

it('rejects other routes and large declared uploads before starting a container', async () => {
  const route = vi.fn()
  vi.stubGlobal('__cloudflareContainersGetContainer', route)
  expect((await worker.fetch(new Request('https://private/prepare'), {} as never)).status).toBe(404)
  expect((await worker.fetch(new Request('https://private/prepare', { method: 'POST', headers: { 'content-length': String(65 * 1024 * 1024) } }), {} as never)).status).toBe(413)
  expect(route).not.toHaveBeenCalled()
})

it('returns an actionable retry when conversion capacity is unavailable', async () => {
  vi.stubGlobal('__cloudflareContainersGetContainer', () => { throw new Error('Capacity exceeded') })
  const response = await worker.fetch(new Request('https://private/prepare', { method: 'POST', body: 'PK' }), {} as never)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ message: expect.stringContaining('try again') })
})
