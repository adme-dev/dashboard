import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  normalizeMondayEvidenceImportInput,
  normalizeMondayEvidenceListQuery,
  normalizeMondayEvidencePreviewQuery,
} from '~~/server/utils/socialNewsMondayEvidence'

describe('Monday client evidence transition', () => {
  it('bounds previews and defaults to both plans and discussions', () => {
    expect(normalizeMondayEvidencePreviewQuery({ limit: '500' })).toEqual({
      limit: 100,
      includePlans: true,
      includeDiscussions: true,
    })
    expect(normalizeMondayEvidencePreviewQuery({ limit: '0', includePlans: 'false' })).toEqual({
      limit: 1,
      includePlans: false,
      includeDiscussions: true,
    })
  })

  it('accepts only bounded, distinct server source identifiers for import', () => {
    const sourceIds = Array.from({ length: 120 }, (_, index) => `item:${index + 1}`)
    expect(normalizeMondayEvidenceImportInput({
      sourceIds: ['discussion:42', 'discussion:42', 'not-a-source', ...sourceIds],
    }).sourceIds).toEqual(['discussion:42', ...sourceIds.slice(0, 99)])
    expect(normalizeMondayEvidenceImportInput(null as any)).toEqual({ sourceIds: [] })
  })

  it('normalizes the evidence review list without exposing unbounded reads', () => {
    expect(normalizeMondayEvidenceListQuery({ reviewStatus: 'pending', page: '-2', pageSize: '900' })).toEqual({
      reviewStatus: 'pending',
      page: 1,
      pageSize: 100,
    })
    expect(normalizeMondayEvidenceListQuery({ reviewStatus: 'unknown' }).reviewStatus).toBe('pending')
  })

  it('keeps Monday routes client-scoped, admin-only, and approval-safe', () => {
    const preview = readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence/imports/monday/preview.get.ts', 'utf8')
    const importer = readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence/imports/monday/index.post.ts', 'utf8')
    const reviewList = readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence.get.ts', 'utf8')
    const candidateQuery = readFileSync('server/utils/socialNewsMondayEvidence.ts', 'utf8')

    for (const source of [preview, importer, reviewList]) {
      expect(source).toContain('requireRole(event, PERMISSIONS.ADMIN)')
      expect(source).toContain('requireSocialClientAccess(event, clientId)')
    }
    expect(importer).toContain("'pending'")
    expect(importer).toContain("existing.review_status <> 'approved'")
    expect(candidateQuery).toContain('source_mapping.monday_item_id = item.monday_item_id')
  })

})
