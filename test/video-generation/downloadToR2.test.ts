const validMp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
import { describe, expect, it, vi } from 'vitest'
import { downloadToR2 } from '../../workers/video-generation/src/downloadToR2'

describe('downloadToR2', () => {
  it('fetches the url and puts the bytes into the bucket with a video content-type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } }))
    const bucket = { put: vi.fn().mockResolvedValue(undefined) }
    await downloadToR2(bucket as any, fetchImpl as any, 'https://8.8.8.8/out.mp4', 'video-generation/t/j/output.mp4')
    expect(fetchImpl).toHaveBeenCalledWith('https://8.8.8.8/out.mp4', expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }))
    const [key, , opts] = bucket.put.mock.calls[0]
    expect(key).toBe('video-generation/t/j/output.mp4')
    expect(opts.httpMetadata.contentType).toBe('video/mp4')
  })

  it('returns the actual content hash and stores immutable output bytes when requested', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } }))
    const bucket = { put: vi.fn().mockResolvedValue(undefined) }
    const output = await downloadToR2(bucket, fetchImpl, 'https://8.8.8.8/out.mp4', 'output.mp4', { contentAddressed: true })
    expect(output.sha256).toBe('aeca4ec81179e906402b14b4a58f8f3c8fbf2d71356cd3f116b43d72555e7208')
    expect(output.r2Key).toBe(`output-${output.sha256}.mp4`)
    expect(bucket.put).toHaveBeenCalledWith(output.r2Key, expect.any(Uint8Array), expect.objectContaining({ customMetadata: { sha256: output.sha256 } }))
  })

  it('throws on a non-ok download (so uncertain liability is retained)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 502 }))
    const bucket = { put: vi.fn() }
    await expect(downloadToR2(bucket as any, fetchImpl as any, 'https://8.8.8.8/out.mp4', 'k')).rejects.toThrow(/safely downloaded/)
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
