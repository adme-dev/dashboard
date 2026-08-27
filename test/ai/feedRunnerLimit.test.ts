import { describe, expect, it } from 'vitest'
import {
  FEED_PREVIEW_LIMIT,
  resolveFeedPreviewEvidence
} from '~~/server/utils/ai/mcp/feedRunner'

describe('inventory feed health preview limit', () => {
  it('stays within the Social Dashboard preview API maximum', () => {
    expect(FEED_PREVIEW_LIMIT).toBeGreaterThan(0)
    expect(FEED_PREVIEW_LIMIT).toBeLessThanOrEqual(100)
  })

  it('uses provider validation to distinguish excluded items from pagination truncation', () => {
    const evidence = resolveFeedPreviewEvidence({
      total: 88,
      items: Array.from({ length: 75 }, () => ({ condition: 'new' })),
      validation: {
        matchedTotal: 88,
        validatedTotal: 75,
        invalidTotal: 13,
        invalidSummaries: []
      }
    })

    expect(evidence.readiness).toMatchObject({
      matchedTotal: 88,
      validatedTotal: 75,
      invalidTotal: 13
    })
    expect(evidence.matchedTotal).toBe(88)
    expect(evidence.validatedTotal).toBe(75)
    expect(evidence.previewTruncated).toBe(false)
  })
})
