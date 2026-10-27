import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
const { readLetteringRepairImage } = await import('../../app/composables/useBannerLetteringRepair')
afterEach(() => vi.unstubAllGlobals())
describe('repair image download boundary', () => {
  it('rejects oversized declared bytes before reading a body', async () => {
    const cancel = vi.fn(), getReader = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': String(33 * 1024 * 1024) }), body: { cancel, getReader } }))
    await expect(readLetteringRepairImage('/source.png', new AbortController().signal)).rejects.toThrow('too large')
    expect(getReader).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('cancels an unbounded stream once its decoded transfer exceeds the byte limit', async () => {
    const cancel = vi.fn(), releaseLock = vi.fn()
    const read = vi.fn().mockResolvedValue({ done: false, value: new Uint8Array(1024 * 1024) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock }) } }))
    await expect(readLetteringRepairImage('/source.png', new AbortController().signal)).rejects.toThrow('too large')
    expect(read).toHaveBeenCalledTimes(33)
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
  })
  it('rejects empty responses and unsupported URLs without image decode', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null))
    vi.stubGlobal('fetch', request)
    await expect(readLetteringRepairImage('data:image/png;base64,AA', new AbortController().signal)).rejects.toThrow('Invalid image URL')
    expect(request).not.toHaveBeenCalled()
    await expect(readLetteringRepairImage('/source.png', new AbortController().signal)).rejects.toThrow('empty')
  })
})
