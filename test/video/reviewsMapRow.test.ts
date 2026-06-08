import { describe, it, expect } from 'vitest'
import { mapReviewRow } from '~~/server/utils/video/reviews'

describe('mapReviewRow', () => {
  it('maps snake_case db row to camelCase VideoReview', () => {
    const row = {
      id: 'r1', client_id: 'c1', media_project_id: 'p1', job_id: 'j1', format: 'reels_9x16',
      r2_key: 'media/x.mp4', title: 'Spot', status: 'pending', response_notes: null,
      responded_by: null, responded_at: null, created_by: 'u1',
      created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z'
    }
    expect(mapReviewRow(row)).toMatchObject({
      id: 'r1', clientId: 'c1', mediaProjectId: 'p1', jobId: 'j1', format: 'reels_9x16',
      r2Key: 'media/x.mp4', title: 'Spot', status: 'pending', respondedBy: null
    })
  })
})
