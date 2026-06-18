import { describe, expect, it } from 'vitest'
import { buildAssemblyPrompt, parseAssemblyAiResponse, planFromAiAssembly, usableBucketItems, withProducerLaneSteps } from '~~/server/utils/video-asset-intelligence/aiAssembly'
import type { VideoBucketItem } from '~~/server/utils/video-asset-intelligence/buckets'

function item(over: Partial<VideoBucketItem>): VideoBucketItem {
  return {
    id: 'item-1',
    projectId: 'p1',
    bucketId: 'b1',
    assetId: 'asset-1',
    r2Key: 'key-1',
    title: 'Hero shot',
    role: 'hero',
    directive: {},
    status: 'ready',
    sortOrder: 0,
    createdAt: '2026-06-11T00:00:00Z',
    updatedAt: '2026-06-11T00:00:00Z',
    ...over
  } as VideoBucketItem
}

const ITEMS = [
  item({ id: 'a', title: 'Vehicle hero' }),
  item({ id: 'b', title: 'Detail shot', role: 'detail' }),
  item({ id: 'blocked', status: 'blocked' }),
  item({ id: 'empty', assetId: null, r2Key: null })
]

describe('usableBucketItems', () => {
  it('drops blocked items and items with no asset reference', () => {
    expect(usableBucketItems(ITEMS).map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('buildAssemblyPrompt', () => {
  it('includes the brief, format, asset ids, and the JSON contract', () => {
    const prompt = buildAssemblyPrompt({ brief: 'Punchy vertical edit', targetFormat: 'reels_9x16', items: usableBucketItems(ITEMS) })
    expect(prompt).toContain('Punchy vertical edit')
    expect(prompt).toContain('reels_9x16')
    expect(prompt).toContain('id=a')
    expect(prompt).toContain('id=b')
    expect(prompt).toContain('"bucketItemId"')
  })

  it('includes selected editor asset context when supplied', () => {
    const prompt = buildAssemblyPrompt({
      brief: 'Use the selected shot as the hero',
      targetFormat: 'reels_9x16',
      items: usableBucketItems(ITEMS),
      selectedAsset: {
        id: 'video:asset-1',
        title: 'Hero drive-by',
        type: 'video',
        source: 'generation',
        prompt: 'Slow smoke reveal',
        transcript: 'Drive away today',
      },
    })
    expect(prompt).toContain('Selected editor asset')
    expect(prompt).toContain('Hero drive-by')
    expect(prompt).toContain('Slow smoke reveal')
    expect(prompt).toContain('Drive away today')
  })
})

describe('parseAssemblyAiResponse', () => {
  it('parses a clean response and clamps durations', () => {
    const res = parseAssemblyAiResponse(
      '{"rationale":"Lead with the hero.","steps":[{"bucketItemId":"a","durationSec":99},{"bucketItemId":"b","durationSec":2}]}',
      ITEMS
    )
    expect(res).not.toBeNull()
    expect(res!.rationale).toBe('Lead with the hero.')
    expect(res!.steps).toEqual([
      { bucketItemId: 'a', durationSec: 10 },
      { bucketItemId: 'b', durationSec: 2 }
    ])
  })

  it('extracts JSON wrapped in model prose', () => {
    const res = parseAssemblyAiResponse(
      'Here is the plan:\n```json\n{"rationale":"r","steps":[{"bucketItemId":"a","durationSec":3}]}\n```\nDone.',
      ITEMS
    )
    expect(res?.steps).toHaveLength(1)
  })

  it('drops unknown, blocked, and duplicate ids', () => {
    const res = parseAssemblyAiResponse(
      '{"rationale":"r","steps":[{"bucketItemId":"nope","durationSec":3},{"bucketItemId":"blocked","durationSec":3},{"bucketItemId":"a","durationSec":3},{"bucketItemId":"a","durationSec":5}]}',
      ITEMS
    )
    expect(res?.steps).toEqual([{ bucketItemId: 'a', durationSec: 3 }])
  })

  it('returns null for garbage, missing steps, or all-invalid steps', () => {
    expect(parseAssemblyAiResponse('not json at all', ITEMS)).toBeNull()
    expect(parseAssemblyAiResponse('{"rationale":"r"}', ITEMS)).toBeNull()
    expect(parseAssemblyAiResponse('{"steps":[{"bucketItemId":"nope","durationSec":3}]}', ITEMS)).toBeNull()
  })

  it('defaults non-numeric durations to 3s', () => {
    const res = parseAssemblyAiResponse('{"steps":[{"bucketItemId":"a","durationSec":"fast"}]}', ITEMS)
    expect(res?.steps[0]!.durationSec).toBe(3)
  })
})

describe('planFromAiAssembly', () => {
  it('materialises sequential starts from AI durations', () => {
    const plan = planFromAiAssembly({
      projectId: 'p1',
      brief: 'brief',
      targetFormat: 'reels_9x16',
      items: ITEMS,
      ai: { rationale: 'Hero first.', steps: [{ bucketItemId: 'a', durationSec: 4 }, { bucketItemId: 'b', durationSec: 2 }] }
    })
    expect(plan.rationale).toBe('Hero first.')
    expect(plan.steps.map(s => ({ id: s.bucketItemId, start: s.startSec, dur: s.durationSec }))).toEqual([
      { id: 'a', start: 0, dur: 4 },
      { id: 'b', start: 4, dur: 2 }
    ])
  })
})

describe('withProducerLaneSteps', () => {
  it('adds review-only voiceover, overlay, and caption requirements after visual steps', () => {
    const plan = planFromAiAssembly({
      projectId: 'p1',
      brief: 'Add a voiceover with captions and a logo overlay.',
      targetFormat: 'reels_9x16',
      items: [
        item({ id: 'a', title: 'Hero footage', role: 'hero-footage' }),
        item({ id: 'logo', title: 'Dealer logo', role: 'hero-overlay', r2Key: 'logo.png' }),
      ],
      ai: { rationale: 'Hero first.', steps: [{ bucketItemId: 'a', durationSec: 4 }] }
    })

    const enriched = withProducerLaneSteps(plan, {
      brief: 'Add a voiceover with captions and a logo overlay.',
      items: [
        item({ id: 'a', title: 'Hero footage', role: 'hero-footage' }),
        item({ id: 'logo', title: 'Dealer logo', role: 'hero-overlay', r2Key: 'logo.png' }),
      ],
      selectedAsset: { transcript: 'Drive away today' },
    })

    expect(enriched.steps.map(step => step.type)).toEqual(['place-asset', 'place-voiceover', 'place-overlay', 'create-caption'])
    expect(enriched.steps[1]).toMatchObject({ title: 'Voiceover placement', startSec: 0, durationSec: 4 })
    expect(enriched.steps[2]).toMatchObject({ title: 'Dealer logo', bucketItemId: 'logo', r2Key: 'logo.png' })
    expect(enriched.steps[3]).toMatchObject({ title: 'Caption requirement', directive: { source: 'selected-asset-transcript' } })
  })

  it('does not add duplicate lane requirements when the brief does not ask for them', () => {
    const plan = planFromAiAssembly({
      projectId: 'p1',
      brief: 'Simple visual montage.',
      targetFormat: 'reels_9x16',
      items: [item({ id: 'a', title: 'Hero footage', role: 'hero-footage' })],
      ai: { rationale: 'Hero first.', steps: [{ bucketItemId: 'a', durationSec: 4 }] }
    })

    const enriched = withProducerLaneSteps(plan, {
      brief: 'Simple visual montage.',
      items: [item({ id: 'a', title: 'Hero footage', role: 'hero-footage' })],
      selectedAsset: null,
    })

    expect(enriched.steps.map(step => step.type)).toEqual(['place-asset'])
  })
})
