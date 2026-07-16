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
})
