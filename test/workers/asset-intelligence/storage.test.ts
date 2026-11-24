import { describe, expect, it, vi } from 'vitest'
import { fetchAssetPicture, fetchObjectBytes } from '~~/workers/asset-intelligence/src/storage'

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]
const MP4_HEAD = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]

function bucketWith(objects: Record<string, number[]>) {
  const get = vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
    const bytes = objects[key]
    if (!bytes) return null
    const slice = options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes
    return { arrayBuffer: async () => new Uint8Array(slice).buffer } as any
  })
  return { get, put: vi.fn() }
}

describe('asset intelligence storage', () => {
  it('uses a picture asset as it is', async () => {
    const bucket = bucketWith({ 'assets/still.png': [...PNG_HEAD, 1, 2, 3] })
    const picture = await fetchAssetPicture(bucket, 'asset-1', async () => ({ r2Key: 'assets/still.png', thumbnailKey: 'thumbs/still.jpg' }))
    expect(picture.source).toBe('picture')
    expect([...picture.bytes]).toEqual([...PNG_HEAD, 1, 2, 3])
  })

  it('uses the preview frame for a video, says so, and never loads the video itself', async () => {
    const bucket = bucketWith({ 'assets/clip.mp4': [...MP4_HEAD, ...new Array(64).fill(7)], 'thumbs/clip.jpg': [...JPEG_HEAD, 9, 9] })
    const picture = await fetchAssetPicture(bucket, 'asset-2', async () => ({ r2Key: 'assets/clip.mp4', thumbnailKey: 'thumbs/clip.jpg' }))
    expect(picture.source).toBe('video-frame')
    expect([...picture.bytes]).toEqual([...JPEG_HEAD, 9, 9])
    // Only the first bytes of the video were requested.
    const videoReads = bucket.get.mock.calls.filter(([key]) => key === 'assets/clip.mp4')
    expect(videoReads).toEqual([['assets/clip.mp4', { range: { offset: 0, length: 16 } }]])
  })

  it('fails clearly for a video with no preview frame', async () => {
    const bucket = bucketWith({ 'assets/clip.mp4': MP4_HEAD })
    await expect(fetchAssetPicture(bucket, 'asset-3', async () => ({ r2Key: 'assets/clip.mp4', thumbnailKey: null })))
      .rejects.toThrow('This video has no preview frame yet')
  })

  it('fails clearly when the preview frame is not a PNG or JPEG', async () => {
    const bucket = bucketWith({ 'assets/clip.mp4': MP4_HEAD, 'thumbs/clip.webp': [0x52, 0x49, 0x46, 0x46] })
    await expect(fetchAssetPicture(bucket, 'asset-4', async () => ({ r2Key: 'assets/clip.mp4', thumbnailKey: 'thumbs/clip.webp' })))
      .rejects.toThrow('not a PNG or JPEG picture')
  })

  it('reads a stored object such as the painted mask, and reports a missing one', async () => {
    const bucket = bucketWith({ 'masks/a.png': [...PNG_HEAD, 5] })
    expect([...await fetchObjectBytes(bucket, 'masks/a.png')]).toEqual([...PNG_HEAD, 5])
    await expect(fetchObjectBytes(bucket, 'masks/missing.png')).rejects.toThrow('R2 object masks/missing.png not found')
  })
})
