import { describe, expect, it, vi } from 'vitest'
import { recomposeImageWithGateway } from '../../../server/utils/socialPublishing/imageGateway'
const url = 'https://ai-gateway-outputs.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/output.png'
const input = { buffer: Buffer.from('source'), mime: 'image/png', prompt: 'Keep the logo', aspectRatio: '4:5', gatewayId: 'default', metadata: { clientId: 'client' } }
describe('social image gateway', () => {
  it('sends the original image with the requested ratio through the configured gateway', async () => {
    const run = vi.fn().mockResolvedValue({ state: 'Completed', result: { image: url } })
    const download = vi.fn().mockResolvedValue(new Response('image'))
    const result = await recomposeImageWithGateway({ run }, input, download)
    expect(result.buffer.toString()).toBe('image')
    expect(run).toHaveBeenCalledWith('google/nano-banana-2', expect.objectContaining({
      image_input: ['data:image/png;base64,c291cmNl'], aspect_ratio: '4:5', resolution: '2K'
    }), { gateway: { id: 'default', skipCache: true, metadata: { clientId: 'client' } } })
    expect(download).toHaveBeenCalledWith(new URL(url), expect.objectContaining({ redirect: 'error' }))
  })
  it.each(['https://evil.example/image', 'http://ai-gateway-outputs.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/image', 'https://user:password@ai-gateway-outputs.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/image'])('rejects untrusted provider output %s', async (image) => {
    const download = vi.fn()
    await expect(recomposeImageWithGateway({ run: vi.fn().mockResolvedValue({ result: { image } }) }, input, download)).rejects.toThrow('unsupported output')
    expect(download).not.toHaveBeenCalled()
  })
  it('rejects a failed job without fetching anything', async () => {
    await expect(recomposeImageWithGateway({ run: vi.fn().mockResolvedValue({ state: 'Failed' }) }, input)).rejects.toThrow('no image')
  })
  it('rejects an oversized download', async () => {
    await expect(recomposeImageWithGateway({ run: vi.fn().mockResolvedValue({ result: { image: url } }) }, input,
      vi.fn().mockResolvedValue(new Response('image', { headers: { 'content-length': String(21 * 1024 * 1024) } })))).rejects.toThrow('could not be downloaded')
  })
})
