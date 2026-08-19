import { describe, expect, it, vi } from 'vitest'
import {
  getCreativeGenerationModel,
  listSelectableCreativeGenerationModels,
} from '~~/server/utils/creative-generation/modelRegistry'
import {
  buildCreativeGenerationInputs,
  generateCreativeImage,
} from '~~/server/utils/creative-generation/aiGatewayProvider'

describe('governed creative generation models', () => {
  it('keeps Recraft non-vehicle-only and Pruna approved-source-only', () => {
    expect(getCreativeGenerationModel('aigateway/recraft-offer-card')).toMatchObject({
      cfModel: 'recraft/recraftv4-1',
      allowedSubjectTypes: ['non_vehicle'],
      requiresApprovedSourceAsset: false,
      safetyClass: 'non_vehicle_generative',
    })
    expect(getCreativeGenerationModel('aigateway/pruna-upscale')).toMatchObject({
      cfModel: 'pruna/p-image-upscale',
      allowedSubjectTypes: ['vehicle', 'non_vehicle'],
      requiresApprovedSourceAsset: true,
      safetyClass: 'vehicle_transform_safe',
    })
    expect(listSelectableCreativeGenerationModels()).toHaveLength(2)
  })

  it('blocks vehicle generation through Recraft', () => {
    expect(() => buildCreativeGenerationInputs({
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'vehicle',
      prompt: 'A dealer offer card',
    })).toThrow(/not approved for vehicle/)
  })

  it('blocks vehicle wording even when the caller falsely labels a Recraft prompt non-vehicle', () => {
    expect(() => buildCreativeGenerationInputs({
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'non_vehicle',
      prompt: 'A Ford SUV with the dealer logo',
    })).toThrow(/Vehicle generation is blocked/)
  })

  it('emits the exact safe Pruna transform payload', () => {
    expect(buildCreativeGenerationInputs({
      modelId: 'aigateway/pruna-upscale',
      subjectType: 'vehicle',
      sourceUrl: 'https://assets.example/master.png',
      targetMegapixels: 8,
      outputFormat: 'png',
      outputQuality: 95,
      enhanceDetails: false,
      enhanceRealism: false,
    })).toEqual({
      image: 'https://assets.example/master.png',
      target: 8,
      output_format: 'png',
      output_quality: 95,
      enhance_details: false,
      enhance_realism: false,
      disable_safety_checker: false,
    })
  })

  it('keeps vehicle upscaling pixel-preserving by rejecting generative enhancement flags', () => {
    expect(() => buildCreativeGenerationInputs({
      modelId: 'aigateway/pruna-upscale',
      subjectType: 'vehicle',
      sourceUrl: 'https://assets.example/master.png',
      enhanceDetails: true,
    })).toThrow(/cannot enable generative detail/)
  })

  it('routes through the binding with gateway metadata and downloads only image output', async () => {
    const run = vi.fn().mockResolvedValue({ state: 'Completed', result: { image: 'https://cdn.example/out.webp' } })
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/webp' },
    })) as any
    const result = await generateCreativeImage({ run }, {
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'non_vehicle',
      prompt: 'A typography-led EOFY offer card',
      aspectRatio: '1:1',
      metadata: { featureKey: 'banner_image_generation' },
    }, fetchImpl)
    expect(run).toHaveBeenCalledWith('recraft/recraftv4-1', {
      prompt: 'A typography-led EOFY offer card',
      size: '1024x1024',
    }, { gateway: { metadata: { featureKey: 'banner_image_generation' } } })
    expect(result).toMatchObject({ modelId: 'aigateway/recraft-offer-card', safetyClass: 'non_vehicle_generative' })
  })
})
