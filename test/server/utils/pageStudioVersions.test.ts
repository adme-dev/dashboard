import { describe, expect, it, vi } from 'vitest'
import {
  reviewPageStudioVersion,
  submitPageStudioVersion,
  type PageStudioVersionQueryClient
} from '~~/server/utils/pageStudio/versions'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const versionId = '33333333-3333-4333-8333-333333333333'
const digest = 'a'.repeat(64)

function database(respond: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({ rows: respond(sql, params) }))
  const client = { query } as PageStudioVersionQueryClient
  const runTransaction = vi.fn(async <T>(callback: (db: PageStudioVersionQueryClient) => Promise<T>) => callback(client))
  return { query, runTransaction }
}

describe('Page Studio version workflow', () => {
  it('submits only the current draft through an editor membership and audits the exact digest', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_site_memberships')) return [{ role: 'editor' }]
      if (sql.includes('FROM page_studio_versions') && sql.includes('FOR UPDATE')) {
        return [{ id: versionId, digest, status: 'draft', current_version_id: versionId }]
      }
      if (sql.includes('UPDATE page_studio_versions')) {
        return [{ id: versionId, digest, status: 'in_review', submitted_at: '2026-08-30T02:00:00.000Z' }]
      }
      return []
    })

    await expect(submitPageStudioVersion({
      ...scope,
      versionId,
      portalUserId: '44444444-4444-4444-8444-444444444444'
    }, { runTransaction: db.runTransaction })).resolves.toMatchObject({ status: 'in_review', digest })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['version.submitted', versionId, expect.stringContaining(digest)])
    )
  })

  it('denies a portal viewer before changing version state', async () => {
    const db = database(sql => sql.includes('FROM page_studio_site_memberships') ? [{ role: 'viewer' }] : [])

    await expect(submitPageStudioVersion({
      ...scope,
      versionId,
      portalUserId: '44444444-4444-4444-8444-444444444444'
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'VERSION_EDIT_DENIED',
      statusCode: 403
    })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE page_studio_versions'))).toBe(false)
  })

  it('creates an immutable approval for the locked submitted digest and audits it atomically', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_versions') && sql.includes('FOR UPDATE')) {
        return [{ id: versionId, digest, status: 'in_review', current_version_id: versionId }]
      }
      if (sql.includes('INSERT INTO page_studio_reviews')) {
        return [{ id: '55555555-5555-4555-8555-555555555555', decided_at: '2026-08-30T03:00:00.000Z' }]
      }
      return []
    })

    await expect(reviewPageStudioVersion({
      ...scope,
      versionId,
      reviewerId: '66666666-6666-4666-8666-666666666666',
      decision: 'approved',
      comment: 'Ready to publish'
    }, { runTransaction: db.runTransaction })).resolves.toMatchObject({
      decision: 'approved',
      versionDigest: digest
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_reviews'),
      expect.arrayContaining([versionId, digest, 'approved'])
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['version.approved', expect.stringContaining(digest)])
    )
  })

  it('cannot transfer an approval to a later draft or another client', async () => {
    const db = database(() => [])

    await expect(reviewPageStudioVersion({
      ...scope,
      clientId: '77777777-7777-4777-8777-777777777777',
      versionId,
      reviewerId: '66666666-6666-4666-8666-666666666666',
      decision: 'approved'
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'VERSION_NOT_FOUND',
      statusCode: 404
    })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_reviews'))).toBe(false)
  })
})
