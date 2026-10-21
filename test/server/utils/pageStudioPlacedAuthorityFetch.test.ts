import { expect, it, vi } from 'vitest'
import { placedAuthorityFetch } from '../../../server/utils/pageStudio/placedAuthorityFetch'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'

const url = 'https://page-studio-management.internal/customer-editor-authority'
const message = 'Fixed failure'
it.each([16384, 16385])('bounds observed reply bytes at %s without waiting for tee cancellation', async (length) => {
  const input = { nonce: 'original' }
  const digest = await collectionDigest(input)
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify('ok').padEnd(length, ' ')))
    if (length === 16384) controller.close()
  }, cancel })
  const response = new Response(stream, { headers: { 'x-request-digest': digest } })
  const binding = { fetch: vi.fn(async () => response) }
  const result = placedAuthorityFetch(binding, url, input, message)
  if (length === 16384) expect(await result).toEqual({ request: input, value: 'ok' })
  else {
    await expect(result).rejects.toMatchObject({ statusCode: 503, statusMessage: message })
    expect(cancel).toHaveBeenCalledOnce()
  }
  expect(binding.fetch).toHaveBeenCalledOnce()
})
it('captures the receiver, detached body and digest before awaits, with no timeout or retry', async () => {
  const input = { nonce: 'original' }
  const binding = { fetch: vi.fn(async function (this: unknown, request: Request) {
    expect(this).toBe(binding)
    expect(request.redirect).toBe('manual')
    const body = await request.json()
    expect(body).toEqual({ nonce: 'original' })
    return Response.json('ok', { headers: { 'x-request-digest': await collectionDigest(body) } })
  }) }
  const result = placedAuthorityFetch(binding, url, input, message)
  input.nonce = 'changed'
  expect(await result).toEqual({ request: { nonce: 'original' }, value: 'ok' })
  expect(binding.fetch).toHaveBeenCalledOnce()
})
it.each(['foreign error', 'redirect', 'non-response'])('rejects %s without leaking details', async (mode) => {
  const input = { nonce: 'original' }
  const binding = { fetch: vi.fn(async () => mode === 'non-response' ? {} as Response : Response.json('foreign error', { status: mode === 'redirect' ? 302 : 403, headers: { 'x-request-digest': await collectionDigest(input) } })) }
  await expect(placedAuthorityFetch(binding, url, input, message)).rejects.toMatchObject({ statusCode: 503, statusMessage: message })
  expect(binding.fetch).toHaveBeenCalledOnce()
})
