import { describe, expect, it, vi } from 'vitest'

import {
  approveContentVersion,
  createContentVersion
} from '~~/server/utils/searchAuthority/contentRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

describe('Search Authority governed content repository', () => {
  it('creates a new immutable version with claims and source interviews in one transaction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: ASSET_ID, status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ source_count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ next_version: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: VERSION_ID, version_number: 2 }] })
      .mockResolvedValue({ rows: [] })
    const result = await createContentVersion({ query }, {
      clientId: CLIENT_ID,
      assetId: ASSET_ID,
      actorId: ACTOR_ID,
      bodyMarkdown: '# Haval H6 Hybrid ownership\n\nVerified dealer guidance.',
      excerpt: 'Verified Haval H6 Hybrid ownership guidance.',
      disclaimer: 'Specifications and availability must be confirmed with Knox GWM.',
      schemaType: 'Article',
      sourceInterviewIds: ['55555555-5555-4555-8555-555555555555'],
      claims: [{
        claim: 'The H6 Hybrid is available for test drives at Knox GWM.',
        sourceType: 'sales_interview',
        sourceReference: 'Sales Manager interview 2026-08-03',
        expiresAt: null
      }]
    })

    expect(result).toEqual({ id: VERSION_ID, versionNumber: 2 })
    expect(query.mock.calls.some(call => String(call[0]).includes('INSERT INTO search_authority_version_claims'))).toBe(true)
    expect(query.mock.calls.some(call => String(call[0]).includes('INSERT INTO search_authority_content_audit_events'))).toBe(true)
  })

  it('blocks self-approval and approves a submitted version with an attributable decision', async () => {
    const selfQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ id: VERSION_ID, client_id: CLIENT_ID, asset_id: ASSET_ID, created_by: ACTOR_ID, status: 'in_review' }]
    })
    await expect(approveContentVersion({ query: selfQuery }, {
      clientId: CLIENT_ID,
      assetId: ASSET_ID,
      versionId: VERSION_ID,
      actorId: ACTOR_ID,
      rationale: 'Reviewed against source evidence.'
    })).rejects.toThrow(/cannot approve their own/i)

    const reviewerId = '66666666-6666-4666-8666-666666666666'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: VERSION_ID, client_id: CLIENT_ID, asset_id: ASSET_ID, created_by: ACTOR_ID, status: 'in_review' }] })
      .mockResolvedValue({ rows: [] })
    await approveContentVersion({ query }, {
      clientId: CLIENT_ID,
      assetId: ASSET_ID,
      versionId: VERSION_ID,
      actorId: reviewerId,
      rationale: 'Claims and disclaimer verified.'
    })
    expect(query.mock.calls.some(call => String(call[0]).includes('INSERT INTO search_authority_approval_decisions'))).toBe(true)
    expect(query.mock.calls.some(call => String(call[0]).includes(`status = 'approved'`))).toBe(true)
  })
})
