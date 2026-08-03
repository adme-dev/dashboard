import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Search Authority Google Business evidence endpoint', () => {
  it('is tenant-scoped, returns normalized facts, and never selects credentials', () => {
    const source = readFileSync(
      'server/api/agency/search-authority/google-business/performance.get.ts',
      'utf8'
    )
    expect(source).toContain('requireAgencySearchAuthorityAccess')
    expect(source).toContain('WHERE account.client_id = $1')
    expect(source).toContain('metric.metric_date')
    expect(source).toContain('reason_code')
    expect(source).not.toMatch(/SELECT[^`]*(access_token|refresh_token)/i)
  })
})
