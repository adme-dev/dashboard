import { describe, expect, it } from 'vitest'
import {
  getAssetIntelligenceAction,
  getAssetIntelligenceModel,
  listAssetIntelligenceActions,
  defaultModelForAction,
  isAssetIntelligenceActionMetered,
  listAssetIntelligenceModels,
  listAssetIntelligenceModelsForAction,
} from '~~/server/utils/video-asset-intelligence/registry'

describe('video asset intelligence registry', () => {
  it('exposes lift and erase actions for the editor highlighter tool', () => {
    expect(getAssetIntelligenceAction('mask-lift')).toMatchObject({
      id: 'mask-lift',
      outputKinds: ['foreground-png']
    })
    expect(getAssetIntelligenceAction('erase-fill')).toMatchObject({
      id: 'erase-fill',
      outputKinds: expect.arrayContaining(['edited-image'])
    })
  })

  it('maps specialist models to the actions they can perform', () => {
    expect(listAssetIntelligenceModelsForAction('layer-decomposition').map(model => model.id)).toEqual(['aigateway/seedream-5.5'])
    expect(listAssetIntelligenceModelsForAction('mask-lift').map(model => model.id)).toEqual(['aigateway/seedream-5.5'])
    expect(listAssetIntelligenceModelsForAction('object-segmentation').map(model => model.id)).toContain('replicate/sam-2')
    // Qwen Image Layered was replaced by Seedream and is no longer registered.
    expect(listAssetIntelligenceModels().map(model => model.id)).not.toContain('replicate/qwen-image-layered')
  })

  it('lists studio tools to tenants and keeps internal ones hidden', () => {
    const offers = listAssetIntelligenceActions()
    const actionIds = offers.map(action => action.id)
    expect(actionIds).toEqual(expect.arrayContaining([
      'asset-analysis',
      'erase-fill',
      'mask-only',
      'image-edit',
      'thumbnail-generation',
      'caption-generation',
      'timeline-assembly',
    ]))
    for (const layerTool of ['background-removal', 'layer-decomposition', 'mask-lift']) {
      expect(offers.find(action => action.id === layerTool)).toMatchObject({ available: true, unavailableReason: null })
    }
    for (const hiddenAction of ['object-segmentation', 'provider-test']) {
      expect(actionIds).not.toContain(hiddenAction)
    }
  })

  it('keeps model metadata explicit for Cloudflare Gateway routing', () => {
    expect(getAssetIntelligenceModel('aigateway/seedream-5.5')).toMatchObject({
      provider: 'aigateway',
      gatewayProvider: 'aigateway',
      cfModel: 'bytedance/seedream-5.5',
      meteredPerRun: true,
      defaultEnabled: true
    })
    expect(getAssetIntelligenceModel('workers-ai/kimi-planner')).toMatchObject({
      provider: 'workers-ai',
      gatewayProvider: 'workers-ai',
      defaultEnabled: true
    })
  })

  it('does not expose internal actions by default', () => {
    expect(listAssetIntelligenceActions().map(action => action.id)).not.toContain('provider-test')
  })

  it('tells the studio which tools can produce a result today', () => {
    const offers = Object.fromEntries(listAssetIntelligenceActions().map(action => [action.id, action]))
    for (const id of ['erase-fill', 'mask-only', 'asset-analysis', 'image-edit', 'mask-lift', 'background-removal', 'layer-decomposition']) {
      expect(offers[id]).toMatchObject({ available: true, unavailableReason: null })
    }
  })

  it('routes the layer tools to Seedream and marks them as billed per run', () => {
    for (const id of ['layer-decomposition', 'mask-lift', 'background-removal']) {
      expect(defaultModelForAction(id)?.id).toBe('aigateway/seedream-5.5')
      expect(isAssetIntelligenceActionMetered(id)).toBe(true)
    }
    for (const id of ['erase-fill', 'mask-only', 'asset-analysis']) {
      expect(isAssetIntelligenceActionMetered(id)).toBe(false)
    }
  })

  it('routes erase to an image-editing model, never a text-only or retired one', () => {
    const model = defaultModelForAction('erase-fill')
    expect(model?.cfModel).toBe('@cf/black-forest-labs/flux-2-klein-4b')
    const cfModels = listAssetIntelligenceModels().map(entry => entry.cfModel ?? '')
    expect(cfModels).not.toContain('@cf/black-forest-labs/flux-1-schnell')
    expect(cfModels.some(id => id.includes('inpainting'))).toBe(false)
  })
})
