import { describe, expect, it } from 'vitest'
import { assemblyPlanToTimelinePayloads } from '~~/app/utils/video/aiAssemblyTimeline'

describe('AI assembly timeline payloads', () => {
  it('converts reviewable place-asset steps into timeline insert payloads', () => {
    const payloads = assemblyPlanToTimelinePayloads({
      targetFormat: 'reels_9x16',
      steps: [
        { type: 'place-asset', assetId: 'a1', r2Key: 'hero.mp4', title: 'Hero', startSec: 0, durationSec: 5 },
        { type: 'caption', title: 'Hook', startSec: 1, durationSec: 2 },
        { type: 'place-asset', assetId: null, r2Key: null, title: 'Missing', startSec: 5, durationSec: 3 },
        { type: 'place-asset', assetId: 'a2', r2Key: 'logo.png', title: null, startSec: 5, durationSec: null },
      ]
    })

    expect(payloads).toEqual([
      { assetId: 'a1', r2Key: 'hero.mp4', durationSec: 5, startSec: 0, title: 'Hero', format: 'reels_9x16' },
      { assetId: 'a2', r2Key: 'logo.png', durationSec: 5, startSec: 5, title: null, format: 'reels_9x16' },
    ])
  })
})
