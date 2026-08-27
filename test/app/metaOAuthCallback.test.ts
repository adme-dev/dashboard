import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('app/pages/auth/oauth-callback.vue', 'utf8')
const callback = readFileSync('server/api/agency/social/meta/callback.get.ts', 'utf8')

describe('Meta OAuth catalog callback', () => {
  it('persists a profile connection when Business Login returns no ad accounts', () => {
    expect(callback).toContain('if (adAccounts.length === 0)')
    expect(callback).toContain('getMetaProfile(longToken.access_token)')
    expect(callback).toContain("catalogConnection: intent === 'catalog'")
  })

  it('describes catalog-only success without claiming an ad account was linked', () => {
    expect(source).toContain("result.value.platform === 'meta' && result.value.intent === 'catalog'")
    expect(source).toContain('Meta catalog access connected')
    expect(source).toContain('Business catalog access is ready.')
  })
})
