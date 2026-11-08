import { describe, expect, it } from 'vitest'
import { generatedVideoOutputIdentity } from '~~/shared/video/generationOutput'

describe('canonical generated output identity', () => {
  it('pins identical bytes and isolates a late different output under another key', () => {
    const first = generatedVideoOutputIdentity(new Uint8Array([1, 2, 3]), 'video-generation/agency/job/output.mp4')
    expect(first.sha256).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81')
    expect(generatedVideoOutputIdentity(new Uint8Array([1, 2, 3]), 'video-generation/agency/job/output.mp4')).toEqual(first)
    expect(generatedVideoOutputIdentity(new Uint8Array([1, 2, 4]), 'video-generation/agency/job/output.mp4').r2Key).not.toBe(first.r2Key)
  })
  it('does not certify an empty response as a video artifact', () => {
    expect(() => generatedVideoOutputIdentity(new Uint8Array(), 'output.mp4')).toThrow('empty')
  })
})
