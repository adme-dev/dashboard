import { describe, expect, it, vi } from 'vitest'
import { waitForBannerAssets } from '../../workers/audio-jobs/container/frameRuntime.mjs'

describe('banner container asset readiness', () => {
  it('accepts ready media without waiting for unrelated network requests', async () => {
    const page = {
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({
        fontsReady: true,
        images: [{ index: 0, ready: true, failed: false }],
        videos: [{ index: 0, ready: true, failed: false }]
      })
    }

    await expect(waitForBannerAssets(page)).resolves.toBeUndefined()
    expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), { polling: 100, timeout: 30000 })
  })

  it('stops when a media asset fails instead of exporting a blank video', async () => {
    const page = {
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({
        fontsReady: true,
        images: [{ index: 0, ready: true, failed: false }],
        videos: [{ index: 0, ready: false, failed: true }]
      })
    }

    await expect(waitForBannerAssets(page)).rejects.toThrow('videos=0')
  })

  it('identifies the still-pending asset when readiness times out', async () => {
    const page = {
      waitForFunction: vi.fn().mockRejectedValue(new Error('Timed out')),
      evaluate: vi.fn().mockResolvedValue({
        fontsReady: true,
        images: [],
        videos: [{ index: 0, ready: false, failed: false }]
      })
    }

    await expect(waitForBannerAssets(page, 1000)).rejects.toThrow('videos=0')
  })
})
