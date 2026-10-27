import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBoundedBannerObjectBody } from '../../../server/utils/banner/boundedObjectBody'
afterEach(() => vi.useRealTimers())
describe('bounded private object reader', () => {
  it('returns exact bytes across chunks', async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(Uint8Array.of(1, 2)); controller.enqueue(Uint8Array.of(3)); controller.close()
    } })
    expect(await readBoundedBannerObjectBody(stream, 3, 4)).toEqual(Uint8Array.of(1, 2, 3))
  })
  it.each([0, -1, 5, NaN, Infinity])('rejects size %s before allocation or pulls', async size => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ cancel })
    await expect(readBoundedBannerObjectBody(stream, size, 4)).rejects.toThrow('size')
    expect(cancel).toHaveBeenCalledOnce()
  })
  it.each([1, 3])('rejects truncated or overlong declared size %s', async size => {
    await expect(readBoundedBannerObjectBody(new Blob([Uint8Array.of(1, 2)]).stream(), size, 4)).rejects.toThrow()
  })
  it('bounds empty chunks and cancels a source that makes no byte progress', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()) }, cancel })
    await expect(readBoundedBannerObjectBody(stream, 1, 4)).rejects.toThrow('limit')
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('times out a stalled read without awaiting stalled cancellation', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const pending = readBoundedBannerObjectBody(new ReadableStream({ cancel }), 1, 4, 50)
    const assertion = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(cancel).toHaveBeenCalledOnce()
  })
})
