import { describe, expect, it } from 'vitest'
import { buildCfVideoInputs, imageInputEncoding } from '~~/server/utils/video-generation/cfInputs'

// Schemas pulled from developers.cloudflare.com/ai/models/<model>/schema-input.json
// 2026-06-10. All declare additionalProperties:false, so each mapping must emit
// EXACTLY the fields the model accepts.

const base = {
  prompt: 'wheels turning, subtle drift',
  durationSeconds: 5,
  aspectRatio: '9:16',
  resolution: '720p',
  image: 'https://r2/still.jpeg' as string | null,
}

describe('buildCfVideoInputs', () => {
  it('seedance: generic shape passes through with clamped values', () => {
    expect(buildCfVideoInputs('bytedance/seedance-2.0-fast', base)).toEqual({
      prompt: base.prompt, duration: 5, aspect_ratio: '9:16', resolution: '720p', image: base.image,
    })
    // duration clamped into 4–12
    expect(buildCfVideoInputs('bytedance/seedance-2.0-fast', { ...base, durationSeconds: 20 }).duration).toBe(12)
  })

  it('wan: image + duration + resolution (720P capitalised), no aspect_ratio', () => {
    expect(buildCfVideoInputs('alibaba/wan-2.7-i2v', base)).toEqual({
      prompt: base.prompt, duration: 5, resolution: '720P', image: base.image,
    })
  })

  it('hailuo: first_frame_image, duration snapped to 6|10, resolution 768P, required booleans', () => {
    expect(buildCfVideoInputs('minimax/hailuo-2.3-fast', base)).toEqual({
      prompt: base.prompt, prompt_optimizer: true, fast_pretreatment: false,
      duration: 6, resolution: '768P', first_frame_image: base.image,
    })
    expect(buildCfVideoInputs('minimax/hailuo-2.3', { ...base, durationSeconds: 9, image: null })).toEqual({
      prompt: base.prompt, prompt_optimizer: true, fast_pretreatment: false,
      duration: 10, resolution: '768P',
    })
    // 1080p request maps onto the model's 1080P enum
    expect(buildCfVideoInputs('minimax/hailuo-2.3-fast', { ...base, resolution: '1080p' }).resolution).toBe('1080P')
  })

  it('runway: pixel ratio from aspect, duration clamped 2–10, image_input, prompt truncated to 1000', () => {
    const inputs = buildCfVideoInputs('runwayml/gen-4.5', { ...base, prompt: 'x'.repeat(1500) })
    expect(inputs).toEqual({ prompt: 'x'.repeat(1000), ratio: '720:1280', duration: 5, image_input: base.image })
    expect(buildCfVideoInputs('runwayml/gen-4.5', { ...base, aspectRatio: '16:9' }).ratio).toBe('1280:720')
    expect(buildCfVideoInputs('runwayml/gen-4.5', { ...base, aspectRatio: 'weird' }).ratio).toBe('1280:720')
  })

  it('vidu: start_image for i2v (no aspect_ratio); aspect_ratio only for t2v', () => {
    expect(buildCfVideoInputs('vidu/q3-pro', base)).toEqual({
      prompt: base.prompt, duration: 5, resolution: '720p', start_image: base.image,
    })
    expect(buildCfVideoInputs('vidu/q3-pro', { ...base, image: null })).toEqual({
      prompt: base.prompt, duration: 5, resolution: '720p', aspect_ratio: '9:16',
    })
  })

  it('pixverse: quality + generate_audio required, duration snapped to 5|8|10, image_input', () => {
    expect(buildCfVideoInputs('pixverse/v5.6', { ...base, durationSeconds: 7 })).toEqual({
      prompt: base.prompt, duration: 8, aspect_ratio: '9:16', quality: '720p',
      generate_audio: true, image_input: base.image,
    })
  })

  it('veo: STRING duration (4s|6s|8s), constrained aspect enum, generate_audio required', () => {
    expect(buildCfVideoInputs('google/veo-3.1-fast', { ...base, image: null })).toEqual({
      prompt: base.prompt, duration: '6s', aspect_ratio: '9:16', resolution: '720p', generate_audio: true,
    })
    expect(buildCfVideoInputs('google/veo-3.1-fast', { ...base, aspectRatio: '4:3', image: null }).aspect_ratio).toBe('16:9')
  })

  it('unknown model family falls back to the generic shape', () => {
    expect(buildCfVideoInputs('acme/new-model', base)).toEqual({
      prompt: base.prompt, duration: 5, aspect_ratio: '9:16', resolution: '720p', image: base.image,
    })
  })
})

describe('imageInputEncoding', () => {
  it('pixverse and veo need base64; everyone else takes URLs', () => {
    expect(imageInputEncoding('pixverse/v5.6')).toBe('base64')
    expect(imageInputEncoding('google/veo-3.1-fast')).toBe('base64')
    expect(imageInputEncoding('bytedance/seedance-2.0-fast')).toBe('url')
    expect(imageInputEncoding('minimax/hailuo-2.3-fast')).toBe('url')
    expect(imageInputEncoding('alibaba/wan-2.7-i2v')).toBe('url')
    expect(imageInputEncoding('runwayml/gen-4.5')).toBe('url')
    expect(imageInputEncoding('vidu/q3-pro')).toBe('url')
  })
})
