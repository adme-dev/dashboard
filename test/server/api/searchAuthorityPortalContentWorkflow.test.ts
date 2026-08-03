import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(
  `../../../server/api/portal/search-authority/content/${path}`,
  import.meta.url
), 'utf8')

describe('portal Search Authority content workflow', () => {
  it('scopes review reads to the authenticated portal client and safe statuses', () => {
    const route = read('[id].get.ts')
    expect(route).toContain('requirePortalSearchAuthorityAccess')
    expect(route).toContain('asset.client_id = $2')
    expect(route).toContain('asset.status IN (\'in_review\', \'approved\', \'published\')')
    expect(route).not.toMatch(/ai_metadata|query_text|provider_id|access_token/i)
  })

  it('requires portal approval permission and attributes the immutable decision', () => {
    const route = read('[id]/decision.post.ts')
    expect(route).toContain('user.permissions.canApproveWork')
    expect(route).toContain('actorType: \'portal\'')
    expect(route).toContain('asset.current_version_id !== body.data.versionId')
    expect(route).toContain('transaction(db =>')
  })
})
