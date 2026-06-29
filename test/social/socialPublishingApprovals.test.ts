import { describe, expect, it } from 'vitest'
import {
  approvalPrimaryContent,
  approvalReviewSummary,
  formatApprovalDate,
} from '~/app/utils/socialPublishingApprovals'
import type { SocialPost } from '~/types'

function post(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'post-1',
    client_id: 'client-1',
    created_by: 'user-1',
    content: 'Base caption',
    media_urls: ['https://cdn.example.com/a.png'],
    link_url: 'https://example.com',
    hashtags: ['launch', 'sale'],
    first_comment: 'First comment',
    platforms: ['facebook', 'instagram'],
    account_ids: ['account-1'],
    platform_overrides: {},
    tags: ['campaign'],
    scheduled_at: '2026-07-01T03:00:00.000Z',
    timezone: 'Australia/Melbourne',
    status: 'draft',
    platform_results: {},
    publish_attempts: 0,
    published_at: null,
    last_attempt_at: null,
    approval_requested_at: '2026-06-29T02:00:00.000Z',
    approval_requested_by: 'requester-1',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    queue_position: null,
    campaign_id: 'campaign-1',
    assigned_to: 'reviewer-1',
    due_at: '2026-06-30T02:00:00.000Z',
    metadata: {},
    created_at: '2026-06-28T02:00:00.000Z',
    updated_at: '2026-06-29T02:00:00.000Z',
    ...overrides,
  }
}

describe('approvalPrimaryContent', () => {
  it('uses the selected platform override content when present', () => {
    expect(approvalPrimaryContent(post({
      platform_overrides: {
        instagram: { content: 'Instagram caption' },
      },
    }), 'instagram')).toBe('Instagram caption')
  })

  it('falls back to base content and then a no-copy label', () => {
    expect(approvalPrimaryContent(post(), 'linkedin')).toBe('Base caption')
    expect(approvalPrimaryContent(post({ content: '' }), 'linkedin')).toBe('(no copy)')
  })
})

describe('approvalReviewSummary', () => {
  it('counts review assets and flags platform overrides', () => {
    expect(approvalReviewSummary(post({
      platform_overrides: {
        facebook: { content: 'Facebook copy' },
      },
    }))).toEqual({
      platforms: 2,
      media: 1,
      hashtags: 2,
      tags: 1,
      hasFirstComment: true,
      hasLink: true,
      hasOverrides: true,
    })
  })

  it('normalizes missing arrays and empty override content', () => {
    expect(approvalReviewSummary(post({
      media_urls: null,
      hashtags: null,
      tags: null,
      link_url: '',
      first_comment: '',
      platform_overrides: {
        facebook: {},
      },
    }))).toEqual({
      platforms: 2,
      media: 0,
      hashtags: 0,
      tags: 0,
      hasFirstComment: false,
      hasLink: false,
      hasOverrides: false,
    })
  })
})

describe('formatApprovalDate', () => {
  it('formats dates in the post timezone', () => {
    expect(formatApprovalDate('2026-07-01T03:00:00.000Z', 'Australia/Melbourne'))
      .toMatch(/1 July 2026/)
  })

  it('returns a placeholder for missing dates', () => {
    expect(formatApprovalDate(null, 'Australia/Melbourne')).toBe('-')
  })
})
