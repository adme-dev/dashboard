import { describe, expect, it } from 'vitest'
import { buildCfVideoInputs } from '~~/server/utils/video-generation/cfInputs'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

describe('Seedance 2.5 source image generation', () => {
  it('keeps the source aspect and emits the documented required fields and end frame', () => {
    expect(buildCfVideoInputs('bytedance/seedance-2.5', {
      prompt: 'Subtle reflection movement', durationSeconds: 20, aspectRatio: '9:16', resolution: '720p',
      image: 'https://owned.example/start.png', endImage: 'https://owned.example/end.png'
    })).toEqual({ prompt: 'Subtle reflection movement', duration: 20, aspect_ratio: 'adaptive', resolution: '720p', fps: 24,
      camera_fixed: false, watermark: false, output_format: 'mp4', use_virtual_avatar: false, generate_audio: true,
      image: 'https://owned.example/start.png', last_frame_image: 'https://owned.example/end.png' })
  })
  it('offers only documented settings and approved source generation', () => {
    const model = getVideoGenerationModel('aigateway/seedance-25-i2v')!
    expect(model).toMatchObject({ cfModel: 'bytedance/seedance-2.5', modes: ['image-to-video'], requiresApprovedSourceAsset: true, defaultEnabled: true })
    expect(model.resolutions).toEqual(['480p', '720p'])
    expect(model.durationsSeconds).toContain(30)
  })
})
