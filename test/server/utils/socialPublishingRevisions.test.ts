import { describe, expect, it } from 'vitest'
import {
  buildSocialPostSnapshot,
  canonicalJson,
  revisionExpiry,
  socialSnapshotHash,
  socialWorkflowStatus,
  type SocialPostReviewRow
} from '~~/server/utils/socialPublishing/revisions'
import {
  buildSocialPublishingWorkflowInstanceId,
  normalizeSocialPublishingWorkflowPayload
} from '~~/server/utils/agencyWorkflows/socialPublishing'
import {
  buildSocialPublishingWorkflowInstanceId as buildWorkerInstanceId,
  normalizeSocialPublishingWorkflowPayload as normalizeWorkerPayload
} from '../../../workers/agency-workflows/src/contracts'

const POST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REVISION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function row(overrides: Partial<SocialPostReviewRow> = {}): SocialPostReviewRow {
  return {
    id: POST, client_id: CLIENT, created_by: 'staff', content: 'Copy', media_urls: null, link_url: 'https://dealer.example/offer',
    hashtags: ['launch'], first_comment: null, platforms: ['facebook', 'instagram'], account_ids: ['a1', 'a2'],
    publish_targets: [{ platform: 'facebook', accountId: 'a1' }, { platform: 'instagram', accountId: 'a2', options: { type: 'post' } }],
    platform_overrides: { instagram: { content: 'IG copy' } }, scheduled_at: '2030-01-01T10:00:00Z', timezone: 'Australia/Sydney',
    status: 'draft', metadata: { source: 'mcp_marketing_draft', socialPackageAssignmentId: 'pkg' }, campaign_id: null,
    review_policy: 'delegated_marketing', media_asset_refs: [], current_revision_id: null, approved_revision_id: null,
    client_approval_revision_id: null, client_approval_status: null, approved_by: null, approval_requested_by: null,
    ...overrides
  }
}
const media = [{ kind: 'banner_asset' as const, id: 'm1', mediaType: 'image' as const, mimeType: 'image/jpeg', byteSize: 10, etag: 'e1' }]

describe('canonical revision snapshots', () => {
  it('is deterministic regardless of key order and date representation', () => {
    const a = buildSocialPostSnapshot(row(), media)
    const b = buildSocialPostSnapshot(row({
      platform_overrides: JSON.parse(JSON.stringify({ instagram: { content: 'IG copy' } })),
      scheduled_at: new Date('2030-01-01T10:00:00.000Z') as never
    }), media)
    expect(socialSnapshotHash(a)).toBe(socialSnapshotHash(b))
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}')
  })

  it.each([
    ['content', { content: 'Edited' }],
    ['target account', { publish_targets: [{ platform: 'facebook', accountId: 'a9' }] }],
    ['target order', { publish_targets: [{ platform: 'instagram', accountId: 'a2', options: { type: 'post' } }, { platform: 'facebook', accountId: 'a1' }] }],
    ['provider option', { publish_targets: [{ platform: 'facebook', accountId: 'a1' }, { platform: 'instagram', accountId: 'a2', options: { type: 'reel' } }] }],
    ['override', { platform_overrides: { instagram: { content: 'Other' } } }],
    ['link', { link_url: 'https://dealer.example/other' }],
    ['hashtags', { hashtags: ['other'] }],
    ['first comment', { first_comment: 'First!' }],
    ['schedule', { scheduled_at: '2030-01-01T11:00:00Z' }],
    ['timezone', { timezone: 'Australia/Perth' }],
    ['campaign', { campaign_id: 'cmp' }],
    ['package', { metadata: { source: 'mcp_marketing_draft', socialPackageAssignmentId: 'other' } }]
  ])('changes the hash when %s changes', (_label, overrides) => {
    expect(socialSnapshotHash(buildSocialPostSnapshot(row(overrides as Partial<SocialPostReviewRow>), media)))
      .not.toBe(socialSnapshotHash(buildSocialPostSnapshot(row(), media)))
  })

  it('binds the reviewed media content identity, not just its id', () => {
    const base = socialSnapshotHash(buildSocialPostSnapshot(row(), media))
    expect(socialSnapshotHash(buildSocialPostSnapshot(row(), [{ ...media[0]!, etag: 'e2' }]))).not.toBe(base)
    expect(socialSnapshotHash(buildSocialPostSnapshot(row(), [{ ...media[0]!, byteSize: 11 }]))).not.toBe(base)
    // Delegated snapshots never carry raw media URLs.
    expect(buildSocialPostSnapshot(row({ media_urls: ['https://cdn.example/x.jpg'] }), media).mediaUrls).toEqual([])
  })

  it('expires immediate approvals after 24h and scheduled approvals one hour after the slot', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(revisionExpiry(null, now).toISOString()).toBe('2030-01-02T00:00:00.000Z')
    expect(revisionExpiry('2030-01-01T10:00:00Z', now).toISOString()).toBe('2030-01-01T11:00:00.000Z')
    expect(revisionExpiry('2029-12-31T10:00:00Z', now).toISOString()).toBe('2030-01-02T00:00:00.000Z')
  })

  it('distinguishes the review-facing workflow states', () => {
    expect(socialWorkflowStatus({ status: 'draft' }, null)).toBe('draft')
    expect(socialWorkflowStatus({ status: 'draft' }, { review_status: 'pending' })).toBe('awaiting_review')
    expect(socialWorkflowStatus({ status: 'draft', metadata: { source: 'mcp_news' }, client_approval_status: 'pending' }, { review_status: 'pending' })).toBe('awaiting_client')
    expect(socialWorkflowStatus({ status: 'draft' }, { review_status: 'rejected' })).toBe('rejected')
    for (const status of ['approved', 'scheduled', 'publishing', 'accepted', 'published', 'partially_published', 'failed', 'unknown']) {
      expect(socialWorkflowStatus({ status }, { review_status: 'dispatch_claimed' })).toBe(status)
    }
  })
})

describe('revision-bound workflow payloads (Pages and the agency-workflows Worker)', () => {
  const base = { kind: 'social.post.publish', postId: POST, clientId: CLIENT, trigger: 'schedule', scheduledAt: '2030-01-01T10:00:00Z' }

  it('forwards revisionId unchanged through both normalizers', () => {
    for (const normalize of [normalizeSocialPublishingWorkflowPayload, normalizeWorkerPayload]) {
      expect(normalize({ ...base, revisionId: REVISION.toUpperCase() })).toMatchObject({ revisionId: REVISION })
      expect(() => normalize({ ...base, revisionId: 'not-a-uuid' })).toThrow('revisionId must be a UUID')
      expect(normalize(base)).not.toHaveProperty('revisionId')
    }
  })

  it('derives identical, revision-specific instance ids on both sides', () => {
    const withRevision = { ...normalizeSocialPublishingWorkflowPayload({ ...base, revisionId: REVISION }) }
    const pagesId = buildSocialPublishingWorkflowInstanceId(withRevision)
    expect(pagesId).toBe(buildWorkerInstanceId(normalizeWorkerPayload({ ...base, revisionId: REVISION })))
    expect(pagesId).toContain(REVISION)
    const other = buildSocialPublishingWorkflowInstanceId({ ...withRevision, revisionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })
    expect(other).not.toBe(pagesId)
    // Legacy payloads keep their existing instance ids.
    expect(buildSocialPublishingWorkflowInstanceId(normalizeSocialPublishingWorkflowPayload(base)))
      .toBe(`social-publish-${CLIENT}-${POST}-2030-01-01T10-00-00-000Z`.slice(0, 100))
    expect(pagesId.length).toBeLessThanOrEqual(100)
  })
})
