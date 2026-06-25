import { describe, expect, it } from 'vitest'
import {
  getAssetIntelligenceAction,
  getAssetIntelligenceModel,
  listAssetIntelligenceActions,
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

  it('only exposes deployed executable actions to tenants by default', () => {
    const actionIds = listAssetIntelligenceActions().map(action => action.id)
    expect(actionIds).toEqual(expect.arrayContaining([
      'asset-analysis',
      'erase-fill',
      'mask-only',
      'image-edit',
      'thumbnail-generation',
      'caption-generation',
      'timeline-assembly',
    ]))
    for (const hiddenAction of [
      'background-removal',
      'object-segmentation',
      'layer-decomposition',
      'mask-lift',
      'provider-test',
    ]) {
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
})
