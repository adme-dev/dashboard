import { describe, expect, it } from 'vitest'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import type { FeedPreviewValidation } from '~~/server/utils/feeds/types'

describe('summarizeFeedReadiness', () => {
  it('marks a feed as blocked when matched vehicles all fail validation', () => {
    const validation: FeedPreviewValidation = {
      matchedTotal: 88,
      validatedTotal: 0,
      invalidTotal: 88,
      invalidSummaries: [
        { id: 'v1', issues: [{ field: 'url', message: 'url is required' }] },
        { id: 'v2', issues: [{ field: 'price', message: 'price is required' }] },
        { id: 'v3', issues: [{ field: 'image_link', message: 'Image is required' }] },
        { id: 'v4', issues: [{ field: 'condition', message: 'condition is required' }] }
      ]
    }

    const summary = summarizeFeedReadiness(validation)

    expect(summary.status).toBe('blocked')
    expect(summary.matchedTotal).toBe(88)
    expect(summary.validatedTotal).toBe(0)
    expect(summary.issueGroups.map(group => [group.key, group.count, group.fixMode])).toEqual([
      ['url', 1, 'source_required'],
      ['price', 1, 'source_required'],
      ['image', 1, 'source_required'],
      ['condition', 1, 'ai_assisted']
    ])
    expect(summary.sourceRequiredCount).toBe(3)
    expect(summary.aiAssistedCount).toBe(1)
  })

  it('separates AI-assisted descriptive gaps from commercial source-required gaps', () => {
    const summary = summarizeFeedReadiness({
      matchedTotal: 10,
      validatedTotal: 4,
      invalidTotal: 6,
      invalidSummaries: [
        { id: 'stock-1', issues: ['description is required'] },
        { id: 'stock-2', issues: ['title is required'] },
        { id: 'stock-3', issues: ['vehicle url is required'] }
      ]
    })

    expect(summary.status).toBe('partial')
    expect(summary.issueGroups.map(group => group.key)).toEqual(['description', 'title', 'url'])
    expect(summary.aiAssistedCount).toBe(2)
    expect(summary.sourceRequiredCount).toBe(1)
  })

  it('marks a fully valid validation result as ready', () => {
    const summary = summarizeFeedReadiness({
      matchedTotal: 12,
      validatedTotal: 12,
      invalidTotal: 0,
      invalidSummaries: []
    })

    expect(summary.status).toBe('ready')
    expect(summary.issueGroups).toEqual([])
  })
})
