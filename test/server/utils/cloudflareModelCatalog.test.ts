import { describe, expect, it } from 'vitest'

import {
  normalizeCloudflareModelCatalog,
  recommendCloudflareModelsForFeature,
  type CloudflareCatalogModel
} from '~~/server/utils/ai/cloudflareModelCatalog'

const feature = {
  featureKey: 'banner_copy_suggest',
  label: 'Banner Studio copy suggestion',
  surface: '/agency/banner-studio',
  owner: 'Creative',
  provider: 'workers_ai',
  modelId: '@cf/meta/llama-3.1-8b-instruct',
  fallback: 'llama-3.1-8b-instant',
  modality: 'text',
  riskTier: 'medium',
  sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts',
  status: 'production',
  pricing: null,
  warnings: [],
  defaultProvider: 'workers_ai',
  defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
  defaultFallback: 'llama-3.1-8b-instant',
  assignedProvider: 'workers_ai',
  assignedModelId: '@cf/meta/llama-3.1-8b-instruct',
  assignedFallback: 'llama-3.1-8b-instant',
  assignmentSource: 'default',
  assignmentEditable: true,
  assignmentNotes: null,
  assignmentUpdatedBy: null,
  assignmentUpdatedAt: null,
  runtimeRoutingStatus: 'runtime_routed',
  runtimeRoutingLabel: 'Runtime routed',
  runtimeControlEnabled: true,
  runtimeSupportedProviders: ['workers_ai', 'groq'],
  runtimeNotes: null,
} as const

describe('Cloudflare model catalog', () => {
  it('normalizes Cloudflare model search payloads into stable picker rows', () => {
    const models = normalizeCloudflareModelCatalog({
      result: [
        {
          id: '@cf/meta/llama-3.1-8b-instruct',
          name: 'Llama 3.1 8B Instruct',
          task: { name: 'Text Generation' },
          author: { name: 'Meta' },
          provider: { name: 'Cloudflare' },
          capabilities: ['Function calling', 'Batch'],
          tags: ['Cloudflare-hosted'],
          description: 'Instruction-tuned text model.',
        },
        {
          id: 'claude-sonnet-4.6',
          name: 'Claude Sonnet 4.6',
          task: 'Text Generation',
          author: 'Anthropic',
          provider: 'Anthropic',
          capabilities: [{ name: 'Reasoning' }, { name: 'Zero data retention' }],
          tags: ['Third-party'],
        },
      ],
    })

    expect(models.find(model => model.id === '@cf/meta/llama-3.1-8b-instruct')).toMatchObject({
      label: 'Llama 3.1 8B Instruct',
      provider: 'workers_ai',
      providerLabel: 'Cloudflare',
      task: 'text_generation',
      source: 'cloudflare_hosted',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      capabilities: ['function_calling', 'batch'],
    })
    expect(models.find(model => model.id === 'claude-sonnet-4.6')).toMatchObject({
      provider: 'anthropic',
      source: 'third_party',
      capabilities: ['reasoning', 'zero_data_retention'],
    })
  })

  it('recommends compatible models with explainable reasons', () => {
    const catalog: CloudflareCatalogModel[] = [
      {
        id: '@cf/meta/llama-3.1-8b-instruct',
        label: 'Llama 3.1 8B Instruct',
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        provider: 'workers_ai',
        providerLabel: 'Cloudflare',
        task: 'text_generation',
        taskLabel: 'Text Generation',
        modality: 'text',
        author: 'Meta',
        capabilities: ['function_calling'],
        source: 'cloudflare_hosted',
        status: 'production',
        description: null,
        raw: {},
      },
      {
        id: 'flux-2-dev',
        label: 'FLUX.2 Dev',
        modelId: 'flux-2-dev',
        provider: 'aigateway',
        providerLabel: 'Black Forest Labs',
        task: 'text_to_image',
        taskLabel: 'Text-to-Image',
        modality: 'image',
        author: 'Black Forest Labs',
        capabilities: ['image_generation'],
        source: 'third_party',
        status: 'production',
        description: null,
        raw: {},
      },
    ]

    const recommended = recommendCloudflareModelsForFeature(feature, catalog)

    expect(recommended[0]).toMatchObject({
      id: '@cf/meta/llama-3.1-8b-instruct',
      assignable: true,
      recommendation: {
        level: 'recommended',
      },
    })
    expect(recommended[0].recommendation.reasons).toContain('Runtime provider is supported for this feature.')
    expect(recommended[1]).toMatchObject({
      id: 'flux-2-dev',
      assignable: false,
      recommendation: {
        level: 'incompatible',
      },
    })
  })
})
