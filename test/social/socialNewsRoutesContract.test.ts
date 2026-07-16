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
})
