import { describe, expect, it, vi } from 'vitest'
import {
  listPortalSocialNewsDrafts,
  respondToPortalSocialNewsDraft,
  type PortalSocialNewsDb
} from '~~/server/utils/socialNewsPortal'

function portalDb(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryRows = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return rows
  })
  return { calls, queryRows } as unknown as PortalSocialNewsDb & {
    calls: Array<{ sql: string, params: unknown[] }>
  }
}

describe('portal social news draft projection', () => {
  it('scopes the projection to the authenticated client and exposes only portal-safe fields', async () => {
    const db = portalDb([{
      id: 'post-1',
      client_approval_status: 'pending',
      content: 'Base copy',
      media_urls: ['https://cdn.example.test/image.jpg'],
      platforms: ['facebook', 'linkedin'],
      platform_overrides: { linkedin: { content: 'LinkedIn copy' } },
      scheduled_at: '2026-07-20T01:00:00.000Z',
      timezone: 'Australia/Melbourne',
      approval_requested_at: '2026-07-17T01:00:00.000Z',
      due_at: '2026-07-18T01:00:00.000Z',
      client_approval_responded_at: null,
      client_approval_feedback: null,
      source_title: 'Immutable source title',
      source_url: 'https://news.example.test/story',
      source_author: 'Reporter',
      source_published_at: '2026-07-16T01:00:00.000Z',
      is_ai_rewrite: true,
      target_accounts: [{ id: 'account-1', platform: 'facebook', name: 'Dealer Facebook' }],
      package_name: 'Standard Social',
      package_version: 3,
      commercial_scope: {
        includedPostVolumes: { facebook: 8, linkedin: 4 },
        approvalSlaHours: 24,
        overagePolicy: 'warn'
      },
      package_usage: { facebook: 3, linkedin: 1 },
      package_warnings: ['facebook: 9/8 posts'],
      audit_events: [{ action: 'approval_requested', createdAt: '2026-07-17T01:00:00.000Z' }]
    }])

    const result = await listPortalSocialNewsDrafts(db, 'client-a', { status: 'pending' })

    expect(db.calls[0].sql).toMatch(/p\.client_id\s*=\s*\$1/i)
    expect(db.calls[0].params[0]).toBe('client-a')
    expect(result.drafts[0]).toMatchObject({
      id: 'post-1',
      approval: { status: 'pending' },
      source: {
        title: 'Immutable source title',
        url: 'https://news.example.test/story',
        attributionLocked: true
      },
      platformPreviews: [
        { platform: 'facebook', content: 'Base copy', isAiRewrite: false },
        { platform: 'linkedin', content: 'LinkedIn copy', isAiRewrite: true }
      ],
      targetAccounts: [{ id: 'account-1', platform: 'facebook', name: 'Dealer Facebook' }],
      package: {
        name: 'Standard Social',
        version: 3,
        usageByPlatform: { facebook: 3, linkedin: 1 },
        approvalSlaHours: 24
      }
    })
    expect(result.drafts[0]).not.toHaveProperty('metadata')
    expect(result.drafts[0].targetAccounts[0]).not.toHaveProperty('platformAccountId')
    expect(result.drafts[0].targetAccounts[0]).not.toHaveProperty('accessToken')
  })

  it('never returns another client draft even when a post id is known', async () => {
    const db = portalDb([])
    const result = await listPortalSocialNewsDrafts(db, 'client-b', { postId: 'post-from-client-a' })

    expect(result.drafts).toEqual([])
    expect(db.calls[0].sql).toMatch(/p\.id\s*=\s*\$2/i)
    expect(db.calls[0].params).toEqual(['client-b', 'post-from-client-a', 50])
  })

  it('drops non-http source attribution URLs from untrusted news data', async () => {
    const db = portalDb([{
      id: 'post-unsafe-url',
      client_approval_status: 'pending',
      platforms: [],
      source_title: 'Unsafe source',
      source_url: 'javascript:alert(1)',
      target_accounts: [],
      audit_events: []
    }])

    const result = await listPortalSocialNewsDrafts(db, 'client-a')
    expect(result.drafts[0].source.url).toBeNull()
  })
})

describe('portal social news approval actions', () => {
  function actionDb(options: {
    owned?: boolean
    validAccounts?: boolean
    packageActive?: boolean
    validProvenance?: boolean
    packagePolicy?: string
    packageUsed?: number
    accountLastError?: string | null
  } = {}) {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const tx = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (/SELECT[\s\S]*FROM social_posts p[\s\S]*FOR UPDATE/i.test(sql)) {
          return { rows: options.owned === false
            ? []
            : [{
                id: 'post-1',
                client_id: 'client-a',
                status: 'draft',
                approved_at: null,
                client_approval_status: 'pending',
                account_ids: ['account-1'],
                platforms: ['facebook'],
                metadata: {
                  source: 'mcp_news',
                  newsItemId: options.validProvenance === false ? 'not-a-uuid' : '11111111-1111-4111-8111-111111111111',
                  socialPackageAssignmentId: '22222222-2222-4222-8222-222222222222'
                }
              }] }
        }
        if (/FROM social_accounts/i.test(sql)) {
          return { rows: options.validAccounts === false
            ? []
            : [{ id: 'account-1', platform: 'facebook', is_active: true, last_error: options.accountLastError || null }] }
        }
        if (/FROM social_content_package_assignments/i.test(sql)) {
          return { rows: options.packageActive === false
            ? []
            : [{
                id: '22222222-2222-4222-8222-222222222222',
                commercial_scope_snapshot: { includedPostVolumes: { facebook: 8 }, overagePolicy: options.packagePolicy || 'warn' }
              }] }
        }
        if (/FROM unnest/i.test(sql)) {
          return { rows: [{ platform: 'facebook', used: options.packageUsed || 0 }] }
        }
        if (/UPDATE social_posts/i.test(sql)) return { rows: [{ id: 'post-1', client_approval_status: params[0] }] }
        return { rows: [] }
      })
    }
    const db = {
      queryRows: vi.fn(),
      transaction: vi.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx))
    } as unknown as PortalSocialNewsDb
    return { db, calls }
  }

  it.each([
    ['approve', 'approved'],
    ['reject', 'rejected'],
    ['request_changes', 'revision_requested']
  ] as const)('records %s through the approval, publishing-audit, feedback, and portal-activity spines', async (action, status) => {
    const { db, calls } = actionDb()

    const result = await respondToPortalSocialNewsDraft(db, {
      clientId: 'client-a',
      clientUserId: 'portal-user-1',
      postId: 'post-1',
      action,
      feedback: action === 'approve' ? null : 'Please revise the opening line.'
    })

    expect(result).toEqual({ ok: true, status })
    const ownership = calls.find(call => /FROM social_posts p[\s\S]*FOR UPDATE/i.test(call.sql))!
    expect(ownership.sql).toMatch(/p\.id\s*=\s*\$1[\s\S]*p\.client_id\s*=\s*\$2/i)
    expect(ownership.params).toEqual(['post-1', 'client-a'])
    expect(calls.some(call => /INSERT INTO social_publishing_audit_events/i.test(call.sql))).toBe(true)
    expect(calls.some(call => /INSERT INTO social_news_feedback_events/i.test(call.sql))).toBe(true)
    expect(calls.some(call => /INSERT INTO client_activity_log/i.test(call.sql))).toBe(true)
    const update = calls.find(call => /UPDATE social_posts/i.test(call.sql))!
    expect(update.sql).toContain('client_approval_status')
    expect(update.sql).not.toMatch(/SET\s+status\s*=\s*'(approved|scheduled|publishing|published)'/i)
  })

  it('returns not found for a cross-client post id', async () => {
    const { db } = actionDb({ owned: false })
    await expect(respondToPortalSocialNewsDraft(db, {
      clientId: 'client-b',
      clientUserId: 'portal-user-2',
      postId: 'post-1',
      action: 'approve',
      feedback: null
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('enforces target-account and package gates before recording a decision', async () => {
    const invalidAccounts = actionDb({ validAccounts: false })
    await expect(respondToPortalSocialNewsDraft(invalidAccounts.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).rejects.toMatchObject({ statusCode: 409 })

    const inactivePackage = actionDb({ packageActive: false })
    await expect(respondToPortalSocialNewsDraft(inactivePackage.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).rejects.toMatchObject({ statusCode: 409 })

    const blockedVolume = actionDb({ packagePolicy: 'block', packageUsed: 9 })
    await expect(respondToPortalSocialNewsDraft(blockedVolume.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('allows non-publishing account warnings that do not require reconnect', async () => {
    const warningOnly = actionDb({ accountLastError: 'webhook subscribe failed: timeout' })
    await expect(respondToPortalSocialNewsDraft(warningOnly.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).resolves.toEqual({ ok: true, status: 'approved' })
    const accountQuery = warningOnly.calls.find(call => /FROM social_accounts/i.test(call.sql))!
    expect(accountQuery.sql).not.toContain('COALESCE(last_error, \'\') = \'\'')
  })

  it('blocks account errors that require reconnect', async () => {
    const reconnectRequired = actionDb({ accountLastError: 'OAuth token revoked' })
    await expect(respondToPortalSocialNewsDraft(reconnectRequired.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refuses to record a decision when immutable news provenance is invalid', async () => {
    const invalidProvenance = actionDb({ validProvenance: false })
    await expect(respondToPortalSocialNewsDraft(invalidProvenance.db, {
      clientId: 'client-a', clientUserId: 'portal-user-1', postId: 'post-1', action: 'approve', feedback: null
    })).rejects.toMatchObject({ statusCode: 409 })
  })
})
