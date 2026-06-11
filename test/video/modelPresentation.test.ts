import { describe, expect, it } from 'vitest'
import { modelLabelFor, selectableVideoModelOptions, videoModelPresentation } from '~~/app/utils/video/modelPresentation'
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

describe('video model presentation', () => {
  it('maps model ids to display labels', () => {
    expect(modelLabelFor('aigateway/seedance-i2v')).toBe('Seedance (image-to-video)')
    expect(modelLabelFor('missing/model')).toBe('missing/model')
  })

  it('returns tenant-safe selectable options with capabilities', () => {
    const options = selectableVideoModelOptions(listSelectableVideoGenerationModels())
    const seedance = options.find(option => option.id === 'aigateway/seedance-i2v')
    expect(seedance).toMatchObject({
      id: 'aigateway/seedance-i2v',
      label: getVideoGenerationModel('aigateway/seedance-i2v')!.displayName,
      modes: ['image-to-video'],
      provider: 'aigateway',
      supportsNativeAudio: false
    })
    expect(options.some(option => option.id === 'aigateway/veo-t2v-internal')).toBe(false)
  })
})

describe('videoModelPresentation', () => {
  it('builds a rich row for an i2v model: icon, capability sublabel, cost chip', () => {
    const model = getVideoGenerationModel('aigateway/seedance-i2v')!
    const p = videoModelPresentation(model)
    expect(p.icon).toBe('i-lucide-cloud')
    expect(p.sublabel).toContain('Image → video')
    expect(p.sublabel).toContain('5')
    expect(p.costLabel).toMatch(/^~\$\d+\.\d{2}/)
  })

  it('marks native-audio models and per-second pricing', () => {
    const p = videoModelPresentation({
      id: 'x', provider: 'muapi', displayName: 'X', modes: ['text-to-video'],
      allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false,
      supportsNativeAudio: true, durationsSeconds: [5, 10], aspectRatios: [], resolutions: [],
      estimatedCostCents: 25, costUnit: 'second', safetyClass: 'experimental', defaultEnabled: true
    })
    expect(p.icon).toBe('i-lucide-zap')
    expect(p.sublabel).toContain('Text → video')
    expect(p.sublabel).toContain('Audio')
    expect(p.sublabel).toContain('5–10s')
    expect(p.costLabel).toBe('~$0.25/s')
  })

  it('falls back to a generic icon and per-clip pricing', () => {
    const p = videoModelPresentation({
      id: 'x', provider: 'other', displayName: 'X', modes: ['image-to-video', 'text-to-video'],
      allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false,
      supportsNativeAudio: false, durationsSeconds: [8], aspectRatios: [], resolutions: [],
      estimatedCostCents: 120, costUnit: 'clip', safetyClass: 'experimental', defaultEnabled: true
    })
    expect(p.icon).toBe('i-lucide-box')
    expect(p.sublabel).toContain('8s')
    expect(p.costLabel).toBe('~$1.20/clip')
  })
})
