import { describe, expect, it } from 'vitest'
import { modelLabelFor, selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

describe('video model presentation', () => {
  it('maps model ids to display labels', () => {
    expect(modelLabelFor('aigateway/seedance-i2v')).toBe('Seedance (image-to-video)')
    expect(modelLabelFor('missing/model')).toBe('missing/model')
  })

  it('returns tenant-safe selectable options with capabilities', () => {
    const options = selectableVideoModelOptions(listSelectableVideoGenerationModels())
    const seedance = options.find((option) => option.id === 'aigateway/seedance-i2v')
    expect(seedance).toMatchObject({
      id: 'aigateway/seedance-i2v',
      label: getVideoGenerationModel('aigateway/seedance-i2v')!.displayName,
      modes: ['image-to-video'],
      provider: 'aigateway',
      supportsNativeAudio: false,
    })
    expect(options.some((option) => option.id === 'aigateway/veo-t2v-internal')).toBe(false)
  })
})
