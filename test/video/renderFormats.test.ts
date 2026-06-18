import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
} from '~~/app/utils/video/renderFormats'

describe('video render formats', () => {
  it('keeps frontend ids aligned with the render endpoint format keys', () => {
    expect(VIDEO_RENDER_FORMATS.map(format => format.id)).toEqual([
      'reels_9x16',
      'square_1x1',
      'youtube_16x9',
    ])
  })

  it('normalizes selected formats and removes unsupported ids', () => {
    expect(normalizeVideoRenderFormats(['square_1x1', 'bad', 'square_1x1'])).toEqual(['square_1x1'])
  })

  it('falls back to all render formats when selection is empty', () => {
    expect(normalizeVideoRenderFormats([])).toEqual(DEFAULT_VIDEO_RENDER_FORMATS)
    expect(normalizeVideoRenderFormats(null)).toEqual(DEFAULT_VIDEO_RENDER_FORMATS)
  })
})
