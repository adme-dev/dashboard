import { describe, expect, it, vi } from 'vitest'
import { downloadToR2 } from '../../workers/video-generation/src/downloadToR2'

describe('downloadToR2', () => {
  it('fetches the url and puts the bytes into the bucket with a video content-type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer })
    const bucket = { put: vi.fn().mockResolvedValue(undefined) }
    await downloadToR2(bucket as any, fetchImpl as any, 'https://cf/out.mp4', 'video-generation/t/j/output.mp4')
    expect(fetchImpl).toHaveBeenCalledWith('https://cf/out.mp4')
    const [key, , opts] = bucket.put.mock.calls[0]
    expect(key).toBe('video-generation/t/j/output.mp4')
    expect(opts.httpMetadata.contentType).toBe('video/mp4')
  })

  it('throws on a non-ok download (so the job is marked failed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 })
    const bucket = { put: vi.fn() }
    await expect(downloadToR2(bucket as any, fetchImpl as any, 'https://cf/out.mp4', 'k')).rejects.toThrow(/download failed: 502/)
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
