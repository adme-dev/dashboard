import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'

describe('MCP news inbox contract', () => {
  it('accepts the common MCP item shape used by ingestion', () => {
    expect(normalizeMcpNewsItem({ externalId: 'x', title: 'Story', url: 'https://example.test' })).toMatchObject({ externalId: 'x' })
  })

  it('aligns inbox access with Compose and reserves source mutation for admins', () => {
    for (const route of ['index.get.ts', 'refresh.post.ts', 'sources.get.ts']) {
      expect(readFileSync(`server/api/agency/social/news/${route}`, 'utf8')).toContain('requireRole(event, PERMISSIONS.CREATIVE)')
    }
    expect(readFileSync('server/api/agency/social/news/ingest.post.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(readFileSync('server/api/agency/social/news/sources/[sourceKey].patch.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
  })

  it('scopes client content profiles and reserves profile mutation for admins', () => {
    const getRoute = readFileSync('server/api/agency/social/news/profiles/[clientId].get.ts', 'utf8')
    const putRoute = readFileSync('server/api/agency/social/news/profiles/[clientId].put.ts', 'utf8')
    expect(getRoute).toContain('requireRole(event, PERMISSIONS.CREATIVE)')
    expect(getRoute).toContain('requireSocialClientAccess(event, clientId)')
    expect(putRoute).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(putRoute).toContain('requireSocialClientAccess(event, clientId)')
  })

  it('keeps package and evidence governance client-scoped and admin-controlled', () => {
    for (const route of [
      'profiles/[clientId]/context.get.ts',
      'profiles/[clientId]/package.put.ts',
      'profiles/[clientId]/package-options.get.ts',
      'profiles/[clientId]/evidence.post.ts',
    ]) {
      const source = readFileSync(`server/api/agency/social/news/${route}`, 'utf8')
      expect(source).toContain('requireSocialClientAccess(event, clientId)')
    }
    expect(readFileSync('server/api/agency/social/news/packages/index.post.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(readFileSync('server/api/agency/social/news/packages/[packageId]/versions.post.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(readFileSync('server/api/agency/social/news/profiles/[clientId]/package.put.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence.post.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence/[evidenceId].patch.ts', 'utf8')).toContain('requireRole(event, PERMISSIONS.ADMIN)')
  })

  it('stores news inbox state per client so one shared story can be reused', () => {
    const indexRoute = readFileSync('server/api/agency/social/news/index.get.ts', 'utf8')
    const draftsRoute = readFileSync('server/api/agency/social/news/drafts.post.ts', 'utf8')
    expect(indexRoute).toContain('social_news_client_item_states')
    expect(draftsRoute).toContain('INSERT INTO social_news_client_item_states')
    expect(draftsRoute).not.toContain("UPDATE social_news_items SET status = 'used'")
  })

  it('enforces active package volume policy before creating news drafts', () => {
    const source = readFileSync('server/api/agency/social/news/drafts.post.ts', 'utf8')
    expect(source).toContain('commercial_scope_snapshot')
    expect(source).toContain('volume limit reached')
    expect(source).toContain('packageUsageWarnings')
  })

  it('applies package approval SLA when approval is requested', () => {
    const source = readFileSync('server/api/agency/social/publishing/posts/[id]/request-approval.post.ts', 'utf8')
    expect(source).toContain('approvalSlaHours')
    expect(source).toContain('due_at = (')
  })

  it('imports Slack exports as pending client-scoped evidence', () => {
    const source = readFileSync('server/api/agency/social/news/profiles/[clientId]/evidence/imports/slack.post.ts', 'utf8')
    expect(source).toContain('requireRole(event, PERMISSIONS.ADMIN)')
    expect(source).toContain("sourceSystem: 'slack'")
    expect(source).toContain("reviewStatus: 'pending'")
    expect(source).toContain('client_operational_evidence')
  })

  it('records append-only, client-scoped feedback tied to immutable news stories', () => {
    const source = readFileSync('server/api/agency/social/news/feedback.post.ts', 'utf8')
    expect(source).toContain('requireRole(event, PERMISSIONS.CREATIVE)')
    expect(source).toContain('requireSocialClientAccess(event, clientId)')
    expect(source).toContain('social_news_items')
    expect(source).toContain('recordSocialNewsFeedback')
    expect(readFileSync('server/utils/socialNewsFeedback.ts', 'utf8')).toContain('social_news_feedback_events')
  })

  it('snapshots immutable source attribution onto every news-backed draft', () => {
    const source = readFileSync('server/api/agency/social/news/drafts.post.ts', 'utf8')
    expect(source).toContain('newsAttribution')
    expect(source).toContain('item.title')
    expect(source).toContain('item.author')
    expect(source).toContain('item.published_at')
  })

  it('requires a portal decision before internal approval of a news-backed draft', () => {
    const request = readFileSync('server/api/agency/social/publishing/posts/[id]/request-approval.post.ts', 'utf8')
    const approve = readFileSync('server/api/agency/social/publishing/posts/[id]/approve.post.ts', 'utf8')
    expect(request).toContain("client_approval_status = CASE")
    expect(request).toContain('client_approval_responded_at = NULL')
    expect(approve).toContain("existing.metadata?.source === 'mcp_news'")
    expect(approve).toContain("existing.client_approval_status !== 'approved'")
  })
})
