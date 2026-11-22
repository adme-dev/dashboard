import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIDEO_RENDER_FORMATS,
  VIDEO_RENDER_FORMATS,
  normalizeVideoRenderFormats,
  retryVideoRenderFormats,
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


describe('retrying the recorded video outputs', () => {
  it('uses the stored output selection before progress is available', () => {
    expect(retryVideoRenderFormats({ channels: ['square_1x1', 'reels_9x16'], variants: {}, progress: null })).toEqual(['square_1x1', 'reels_9x16'])
    expect(retryVideoRenderFormats({ channels: ['radio', 'meta'], progress: null })).toBeNull()
  })
  it('retains a failed Reels-only request instead of expanding to all formats', () => {
    expect(retryVideoRenderFormats({ variants: {}, progress: { total: 1, formatKey: 'reels_9x16' } })).toEqual(['reels_9x16'])
  })
  it('recovers a known partial request from completed and current formats', () => {
    expect(retryVideoRenderFormats({ variants: { reels_9x16: 'output.mp4' }, progress: { total: 2, formatKey: 'square_1x1' } })).toEqual(['reels_9x16', 'square_1x1'])
  })
  it('requires an explicit selection for missing, unknown or incomplete request evidence', () => {
    for (const job of [undefined, { variants: {}, progress: null }, { variants: {}, progress: { total: 2, formatKey: 'reels_9x16' } }, { variants: {}, progress: { total: 1, formatKey: 'unknown' } }]) {
      expect(retryVideoRenderFormats(job)).toBeNull()
    }
  })
})
