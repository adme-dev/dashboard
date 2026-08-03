import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Search Authority Google Business evidence UI', () => {
  it('labels provider evidence and unavailable states without offering an unapproved publish action', () => {
    const source = readFileSync(
      'app/components/search-authority/GoogleBusinessEvidenceCard.vue',
      'utf8'
    )
    const workspace = readFileSync('app/components/search-authority/Workspace.vue', 'utf8')
    expect(source).toContain('Google Business Profile evidence')
    expect(source).toContain('Unavailable')
    expect(source).toContain('Provider fetched')
    expect(source).toContain('Missing provider dates remain unavailable')
    expect(source).not.toMatch(/publish now|auto.?publish/i)
    expect(workspace).toContain('<SearchAuthorityGoogleBusinessEvidenceCard')
  })
})
