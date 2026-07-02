import { beforeEach, describe, it, expect, vi } from 'vitest'
import { generateSocialPublishingPlanDrafts, parsePlanDrafts, spreadSchedule } from '~~/server/utils/socialPublishing/planGeneration'

const mockGenerate = vi.fn()

vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerate(...args)
}))

beforeEach(() => {
  mockGenerate.mockReset()
})

describe('parsePlanDrafts', () => {
  it('parses a clean JSON array of drafts', () => {
    const raw = JSON.stringify({ posts: [
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] }
    ] })
    expect(parsePlanDrafts(raw)).toEqual([
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] }
    ])
  })
  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"posts":[{"content":"Hi"}]}\n```'
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'Hi', variants: {}, hashtags: [] }])
  })
  it('returns [] for non-JSON garbage', () => {
    expect(parsePlanDrafts('the model rambled')).toEqual([])
  })
  it('drops entries without string content', () => {
    const raw = JSON.stringify({ posts: [{ content: 'ok' }, { variants: {} }, { content: 123 }] })
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'ok', variants: {}, hashtags: [] }])
  })
})

describe('spreadSchedule', () => {
  it('returns evenly spaced ISO timestamps within the window', () => {
    const out = spreadSchedule(3, '2026-07-01T00:00:00.000Z', '2026-07-04T00:00:00.000Z')
    expect(out).toEqual([
      '2026-07-01T18:00:00.000Z', '2026-07-02T12:00:00.000Z', '2026-07-03T06:00:00.000Z'
    ])
  })
  it('returns [] for count <= 0', () => {
    expect(spreadSchedule(0, '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z')).toEqual([])
  })
  it('clamps to the start when from === to', () => {
    expect(spreadSchedule(2, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'))
      .toEqual(['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'])
  })
})

describe('generateSocialPublishingPlanDrafts platform readiness', () => {
  it('falls back to facebook when platform inputs normalize empty', async () => {
    mockGenerate.mockResolvedValue(JSON.stringify({
      posts: [
        {
          content: 'Launch day',
          variants: { facebook: 'Launch day on Facebook' },
          hashtags: ['launch']
        }
      ]
    }))

    const drafts = await generateSocialPublishingPlanDrafts({
      brief: 'Launch plan',
      platforms: ['   ' as never]
    })

    expect(drafts).toEqual([
      expect.objectContaining({
        content: 'Launch day',
        platforms: ['facebook'],
        platform_overrides: { facebook: { content: 'Launch day on Facebook' } },
        hashtags: ['launch']
      })
    ])
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.stringContaining('Target platforms: facebook'),
      expect.objectContaining({
        metadata: expect.objectContaining({ platformCount: 1 })
      })
    )
  })

  it('rejects planned platforms before calling model generation', async () => {
    await expect(generateSocialPublishingPlanDrafts({
      brief: 'Launch plan',
      platforms: ['youtube']
    })).rejects.toThrow('YouTube publishing is not production-ready')
  })

  it('rejects unknown platforms before calling model generation', async () => {
    await expect(generateSocialPublishingPlanDrafts({
      brief: 'Launch plan',
      platforms: ['mastodon' as never]
    })).rejects.toThrow('Unsupported platform')
  })
})
