import { describe, expect, it } from 'vitest'
import { getModelCapabilities } from '~~/server/utils/ai/tools/modelCapabilities'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

describe('get_model_capabilities', () => {
  it('returns capability-driven choices from multiple providers and modalities', async () => {
    const result = await getModelCapabilities({ modality: 'all', limit: 50 }, ctx as any, {
      list: () => [
        { featureKey: 'copy', label: 'Copy', provider: 'anthropic', modelId: 'claude', fallback: 'llama', modality: 'text', riskTier: 'low', status: 'production', warnings: [] },
        { featureKey: 'video', label: 'Video', provider: 'workers_ai', modelId: 'wan', fallback: null, modality: 'video', riskTier: 'high', status: 'production', warnings: [] },
        { featureKey: 'voice', label: 'Voice', provider: 'workers_ai', modelId: 'tts', fallback: null, modality: 'audio', riskTier: 'medium', status: 'production', warnings: [] },
      ] as any,
    })
    const data = (result as any).data
    expect(data.selectionPolicy).toBe('capability_driven')
    expect(data.providers).toEqual(['anthropic', 'workers_ai'])
    expect(data.models.map((m: any) => m.modality)).toEqual(['text', 'video', 'audio'])
  })

  it('surfaces the production Banner Studio image runtimes', async () => {
    const result = await getModelCapabilities({ modality: 'image', productionOnly: true, limit: 25 }, ctx as any)
    const data = (result as any).data
    expect(data.models.map((model: any) => model.featureKey)).toEqual(expect.arrayContaining([
      'banner_image_generation',
      'banner_image_edit',
      'banner_image_layer_decomposition',
    ]))
  })
})
