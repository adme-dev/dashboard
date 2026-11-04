import type { StoryboardPlan } from '../../../shared/video/storyboard'

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Hand-timed 30-second, six-shot fixture; repeated media is intentional. */
export function storyboardFixture(): StoryboardPlan {
  return {
    schemaVersion: 1 as const,
    id: id(1), projectId: id(2), revision: id(3), fps: 30, durationFrames: 900,
    targetFormat: 'reels_9x16' as const,
    inputMode: 'approved_script' as const,
    copyRevisionId: id(4), referenceSetRevisionId: id(5),
    copy: {
      id: id(4), revision: 1, contentHash: 'a'.repeat(64),
      scriptSegments: [
        { id: 'intro', text: 'Meet the café edition.\nBuilt for you.' },
        { id: 'close', text: 'Visit today — don’t miss out.' }
      ],
      cues: [{ id: 'offer', text: '$39,990 drive away*\n*T&Cs apply.  ', required: true }],
      approval: { actorId: id(6), approvedAt: '2026-11-04T00:00:00.000Z', contentHash: 'a'.repeat(64) }
    },
    shots: Array.from({ length: 6 }, (_, i) => ({
      id: id(10 + i), purpose: 'Product detail', durationFrames: 150,
      visualDirection: 'Natural daylight.', referenceRoles: ['product' as const],
      spokenSegmentIds: i === 0 ? ['intro'] : i === 5 ? ['close'] : [],
      copyCueIds: i === 5 ? ['offer'] : [],
      visual: { status: 'bound' as const, sourceKind: 'video_asset' as const, assetId: id(20), contentHash: 'b'.repeat(64) },
      audioCues: [{ id: `music-${i}`, kind: 'music' as const, required: false, startFrame: 0, durationFrames: 150, timing: 'proposed' as const, asset: { status: 'omitted' as const, reason: 'Producer selected silence.' } }],
      captionCues: [], overlayCues: []
    }))
  }
}
