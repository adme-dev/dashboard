import { describe, expect, it, vi } from 'vitest'
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { buildCfVideoInputs } from '~~/server/utils/video-generation/cfInputs'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'

const request = {
  prompt: 'Robo, how about you get some toilet paper and get rid of that shit?',
  durationSeconds: 5,
  aspectRatio: '16:9',
  resolution: '720p',
  image: null
}

describe('Seedance 2.5 generation', () => {
  it('offers 2.5 first for new jobs while retaining historical 2.0 mappings', () => {
    const models = listSelectableVideoGenerationModels()
    expect(models.find(model => model.modes.includes('image-to-video'))?.id).toBe('aigateway/seedance-25-i2v')
    expect(models.find(model => model.modes.includes('text-to-video'))?.id).toBe('aigateway/seedance-25-t2v')
    expect(getVideoGenerationModel('aigateway/seedance-i2v')?.cfModel).toBe('bytedance/seedance-2.0-fast')
    expect(getVideoGenerationModel('aigateway/seedance-2-i2v')?.cfModel).toBe('bytedance/seedance-2.0')
    for (const id of ['aigateway/seedance-25-i2v', 'aigateway/seedance-25-t2v']) {
      const model = getVideoGenerationModel(id)!
      expect(model.cfModel).toBe('bytedance/seedance-2.5')
      expect(model.supportsNativeAudio).toBe(true)
      expect(model.durationsSeconds).toContain(5)
      expect(model.durationsSeconds).toContain(30)
      expect(model.resolutions).toEqual(['480p', '720p'])
      expect(model.maxPromptLength).toBe(2000)
    }
  })

  it('sends the published 2.5 required fields and native audio for a five-second text clip', () => {
    expect(buildCfVideoInputs('bytedance/seedance-2.5', request)).toEqual({
      prompt: request.prompt,
      duration: 5,
      aspect_ratio: '16:9',
      resolution: '720p',
      fps: 24,
      camera_fixed: false,
      watermark: false,
      output_format: 'mp4',
      use_virtual_avatar: false,
      generate_audio: true
    })
  })

  it('supports 30 seconds and the published 480p output option', () => {
    expect(buildCfVideoInputs('bytedance/seedance-2.5', {
      ...request, durationSeconds: 30, resolution: '480p',
      image: 'https://assets.example/start.png'
    })).toMatchObject({
      duration: 30, resolution: '480p', aspect_ratio: '16:9',
      image: 'https://assets.example/start.png'
    })
  })

  it('runs and retrieves a completed clip through the existing provider adapter', async () => {
    const run = vi.fn(async (_model: string, _inputs: Record<string, unknown>) => ({ state: 'Completed', result: { video: 'https://assets.example/robo.mp4' } }))
    const provider = makeAiGatewayProvider({ run })
    const submission = await provider.submit({
      ...request, jobId: 'robo-25', modelId: 'aigateway/seedance-25-t2v',
      mode: 'text-to-video', sourceAssetUrls: []
    })
    expect(run.mock.calls[0]?.[0]).toBe('bytedance/seedance-2.5')
    expect(run.mock.calls[0]?.[1]).toMatchObject({ duration: 5, generate_audio: true })
    expect(run.mock.calls[0]?.[1]).not.toHaveProperty('image')
    expect(await provider.poll(submission)).toMatchObject({ status: 'succeeded', outputUrl: 'https://assets.example/robo.mp4' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps vehicle text generation blocked while allowing the robot joke', () => {
    const model = getVideoGenerationModel('aigateway/seedance-25-t2v')!
    const input = {
      model, mode: 'text-to-video' as const, prompt: request.prompt, sourceAssets: [],
      requestedSubjectType: 'non_vehicle' as const,
      tenantPolicy: { enabled: true, monthlyCapCents: 1000 },
      provenance: { userId: 'owner', tenantId: 'agency', projectId: 'robo', idempotencyKey: 'robo-25' }
    }
    expect(evaluateVideoGenerationCompliance(input).allowed).toBe(true)
    expect(evaluateVideoGenerationCompliance({ ...input, prompt: 'A Toyota Hilux driving' })).toMatchObject({
      allowed: false, classification: 'blocked_vehicle_t2v'
    })
  })
})
