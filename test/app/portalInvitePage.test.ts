import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/portal/accept-invite.vue', 'utf8')

describe('portal invitation page', () => {
  it('uses an explicit passwordless confirmation action', () => {
    expect(source).toContain('Continue to portal')
    expect(source).toContain('window.location.hash')
    expect(source).toContain('window.history.replaceState')
    expect(source).toContain('<UAlert')
    expect(source).toContain('<UButton')
    expect(source).toContain('body: { token: token.value }')
    expect(source).not.toContain('type="password"')
    expect(source).not.toMatch(/v-model="password/i)
    expect(source).not.toMatch(/<input[\s>]/)
    expect(source).not.toMatch(/<button[\s>]/)
  })
})
