import { expect, it, vi } from 'vitest'
import { readCmsJsonBody, readPlacedCmsObjects } from '../../../server/utils/pageStudio/cmsObjectTransport'

const bytes = new TextEncoder().encode('"雪"')
const stream = (chunks: Uint8Array[], cancel = vi.fn()) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(chunk)
  controller.close()
}, cancel })
it('decodes split multibyte UTF8 and exact observed limit', async () => {
  expect(await readCmsJsonBody(new Response(stream([bytes.slice(0, 2), bytes.slice(2)])), bytes.length)).toBe('雪')
  await expect(readCmsJsonBody(new Response(bytes), bytes.length - 1)).rejects.toThrow('Managed CMS object transport unavailable')
})
it.each([new Uint8Array([0xff]), new Uint8Array([0x22, 0xe9, 0x9b]), new TextEncoder().encode('{bad'), new Uint8Array()])('rejects invalid UTF8/JSON', async (body) => {
  await expect(readCmsJsonBody(new Response(body), 16384)).rejects.toThrow('Managed CMS object transport unavailable')
})
it.each([true, false])('cancels overflow and releases lock (wait=%s)', async (wait) => {
  const cancel = vi.fn().mockRejectedValue(new Error('synthetic-secret'))
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(5))
  }, cancel })
  await expect(readCmsJsonBody(new Response(body), 4, wait)).rejects.toThrow('Managed CMS object transport unavailable')
  expect(cancel).toHaveBeenCalledOnce()
  expect(body.locked).toBe(false)
})
it('coordinator overflow does not await unresolved tee cancellation', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(5))
  }, cancel })
  await expect(readCmsJsonBody(new Response(body), 4, false)).rejects.toThrow('Managed CMS object transport unavailable')
  expect(cancel).toHaveBeenCalledOnce()
  expect(body.locked).toBe(false)
})
it('existing object parser still waits for cancellation before rejecting', async () => {
  let release!: () => void
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(5))
  }, cancel() {
    return new Promise<void>((resolve) => {
      release = resolve
    })
  } })
  let settled = false
  const pending = readCmsJsonBody(new Response(body), 4).catch(() => {
    settled = true
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(settled).toBe(false)
  release()
  await pending
  expect(settled).toBe(true)
  expect(body.locked).toBe(false)
})
it('existing object transport keeps fixed target, eight-second signal, two-MB limit and no retry', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  const call = vi.fn(async (_request: Request) => new Response(JSON.stringify('a'.repeat(1_999_998))))
  expect((await readPlacedCmsObjects(call, { safe: true }) as string).length).toBe(1_999_998)
  expect(timeout).toHaveBeenCalledWith(8000)
  const request = call.mock.calls[0]?.[0] as unknown as Request
  expect(request.url).toBe('https://cms-objects.internal/read')
  expect(request.redirect).toBe('manual')
  call.mockImplementationOnce(async () => new Response(JSON.stringify('a'.repeat(1_999_999))))
  await expect(readPlacedCmsObjects(call, {})).rejects.toThrow('Managed CMS object transport unavailable')
  expect(call).toHaveBeenCalledTimes(2)
  timeout.mockRestore()
})
