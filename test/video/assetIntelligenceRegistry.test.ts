import { describe, expect, it } from 'vitest'
import {
  getAssetIntelligenceAction,
  getAssetIntelligenceModel,
  listAssetIntelligenceActions,
  defaultModelForAction,
  listAssetIntelligenceModels,
  listAssetIntelligenceModelsForAction,
} from '~~/server/utils/video-asset-intelligence/registry'

describe('video asset intelligence registry', () => {
  it('exposes lift and erase actions for the editor highlighter tool', () => {
    expect(getAssetIntelligenceAction('mask-lift')).toMatchObject({
      id: 'mask-lift',
      outputKinds: expect.arrayContaining(['foreground-png', 'mask-png'])
    })
    expect(getAssetIntelligenceAction('erase-fill')).toMatchObject({
      id: 'erase-fill',
      outputKinds: expect.arrayContaining(['edited-image'])
    })
  })

  it('maps specialist models to the actions they can perform', () => {
    expect(listAssetIntelligenceModelsForAction('layer-decomposition').map(model => model.id)).toContain('replicate/qwen-image-layered')
    expect(listAssetIntelligenceModelsForAction('object-segmentation').map(model => model.id)).toContain('replicate/sam-2')
    expect(listAssetIntelligenceModelsForAction('mask-lift').map(model => model.id)).toContain('replicate/sam-2')
  })

  it('lists studio tools to tenants, marking the ones that cannot run yet, and keeps internal ones hidden', () => {
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
    // Shown so people know they exist, but never offered as runnable.
    for (const pending of ['background-removal', 'layer-decomposition', 'mask-lift']) {
      expect(offers.find(action => action.id === pending)).toMatchObject({ available: false })
    }
    for (const hiddenAction of ['object-segmentation', 'provider-test']) {
      expect(actionIds).not.toContain(hiddenAction)
    }
  })

  it('keeps model metadata explicit for Cloudflare Gateway routing', () => {
    expect(getAssetIntelligenceModel('replicate/qwen-image-layered')).toMatchObject({
      provider: 'replicate',
      gatewayProvider: 'replicate',
      defaultEnabled: false
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
    for (const id of ['erase-fill', 'mask-only', 'asset-analysis', 'image-edit']) {
      expect(offers[id]).toMatchObject({ available: true, unavailableReason: null })
    }
    expect(offers['mask-lift']).toMatchObject({ available: false, unavailableReason: 'Lift highlighted area is not available yet.' })
    expect(offers['background-removal']).toMatchObject({ available: false, unavailableReason: 'Remove background is not available yet.' })
    expect(offers['layer-decomposition']).toMatchObject({ available: false, unavailableReason: 'Separate layers is not available yet.' })
  })

  it('routes erase to an image-editing model, never a text-only or retired one', () => {
    const model = defaultModelForAction('erase-fill')
    expect(model?.cfModel).toBe('@cf/black-forest-labs/flux-2-klein-4b')
    const cfModels = listAssetIntelligenceModels().map(entry => entry.cfModel ?? '')
    expect(cfModels).not.toContain('@cf/black-forest-labs/flux-1-schnell')
    expect(cfModels.some(id => id.includes('inpainting'))).toBe(false)
  })
})
