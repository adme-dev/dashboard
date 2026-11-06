import { describe, it, expect, vi } from 'vitest'
import { pinStoryboardObject, verifyPinnedObject } from '../../shared/video-storyboard/renderManifest'

describe('immutable render bytes', () => {
  it('pins exact conditionally read bytes to an independent content-addressed key', async () => {
    const bytes = new TextEncoder().encode('approved')
    const bucket = { get: vi.fn().mockResolvedValue({ etag: 'v1', size: bytes.length, arrayBuffer: async () => bytes.buffer }), put: vi.fn().mockResolvedValue({}) }
    const pinned = await pinStoryboardObject(bucket, { key: 'source.mp4', etag: 'v1', size: bytes.length }, 'job1')
    expect(bucket.get).toHaveBeenCalledWith('source.mp4', { onlyIf: { etagMatches: 'v1' } })
    expect(pinned.key).toMatch(/^storyboard-render-inputs\/job1\/[a-f0-9]{64}$/)
    expect(pinned.sourceKey).toBe('source.mp4')
    await expect(verifyPinnedObject(bytes.buffer, pinned)).resolves.toBeUndefined()
    await expect(verifyPinnedObject(new TextEncoder().encode('tampered').buffer, pinned)).rejects.toThrow()
  })
  it('rejects a changed or oversized source before pinning', async () => {
    const bucket = { get: vi.fn().mockResolvedValue({ etag: 'v2', size: 4 }), put: vi.fn() }
    await expect(pinStoryboardObject(bucket, { key: 's', etag: 'v1', size: 4 }, 'j')).rejects.toThrow()
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
