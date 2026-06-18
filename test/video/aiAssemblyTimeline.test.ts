import { describe, expect, it } from 'vitest'
import { assemblyPlanToTimelinePayloads, validateAssemblyPlanForTimeline } from '~~/app/utils/video/aiAssemblyTimeline'

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

  it('validates timeline-ready clips and explains skipped draft steps', () => {
    const validation = validateAssemblyPlanForTimeline({
      targetFormat: 'reels_9x16',
      steps: [
        { type: 'place-asset', assetId: 'a1', r2Key: 'hero.mp4', title: 'Hero', startSec: 0, durationSec: 5 },
        { type: 'caption', title: 'Hook', startSec: 1, durationSec: 2 },
        { type: 'place-voiceover', title: 'Voiceover placement', startSec: 0, durationSec: 5 },
        { type: 'place-overlay', title: 'Logo overlay', startSec: 2, durationSec: 3 },
        { type: 'place-asset', assetId: 'a2', r2Key: '', title: 'Missing media', startSec: 5, durationSec: 3 },
      ]
    })

    expect(validation).toEqual({
      canApply: true,
      timelineReadyCount: 1,
      skippedCount: 4,
      warnings: [
        '4 draft steps need manual placement or generation.',
      ],
      skippedSteps: [
        { index: 1, title: 'Hook', reason: 'caption requirements are reviewed before caption lane insertion' },
        { index: 2, title: 'Voiceover placement', reason: 'voiceover placement is reviewed before audio lane insertion' },
        { index: 3, title: 'Logo overlay', reason: 'overlay placement is reviewed before overlay lane insertion' },
        { index: 4, title: 'Missing media', reason: 'missing r2 key' },
      ],
    })
  })

  it('blocks apply when a plan has no usable visual timeline steps', () => {
    const validation = validateAssemblyPlanForTimeline({
      targetFormat: 'reels_9x16',
      steps: [
        { type: 'voiceover', title: 'Read script', startSec: 0, durationSec: 5 },
      ]
    })

    expect(validation.canApply).toBe(false)
    expect(validation.warnings).toContain('No visual clips are ready to add to the timeline.')
  })
})
