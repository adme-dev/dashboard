import { describe, expect, it } from 'vitest'
import { mockVideoGenerationProvider } from '~~/server/utils/video-generation/providers/mockProvider'

describe('mock video generation provider', () => {
  it('submits and polls through the provider contract', async () => {
    const submission = await mockVideoGenerationProvider.submit({
      jobId: 'job-1',
      modelId: 'mock/i2v-safe',
      mode: 'image-to-video',
      prompt: 'subtle reveal',
      sourceAssetUrls: ['https://example.com/source.png'],
      durationSeconds: 5,
      aspectRatio: '16:9',
      resolution: '720p',
    })

    expect(submission.providerRequestId).toBe('mock-job-1')

    const result = await mockVideoGenerationProvider.poll(submission)

    expect(result.status).toBe('succeeded')
    expect(result.outputUrl).toContain('mock-job-1.mp4')
    expect(result.actualCostCents).toBe(0)
  })
})
