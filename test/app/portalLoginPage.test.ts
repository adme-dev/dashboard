import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/portal/login.vue', 'utf8')

describe('portal login page', () => {
  it('uses an email-only Nuxt UI magic-link form and provides a working support route', () => {
    expect(source).toContain('<UFormField label="Email"')
    expect(source).toContain('<UInput')
    expect(source).toContain('<UButton')
    expect(source).toContain('Email me a sign-in link')
    expect(source).toContain('Check your inbox')
    expect(source).toContain('requestMagicLink')
    expect(source).toContain('to="/support"')

    expect(source).not.toContain('type="password"')
    expect(source).not.toMatch(/v-model="password/i)
    expect(source).not.toMatch(/<input[\s>]/)
    expect(source).not.toMatch(/<button[\s>]/)
    expect(source).not.toContain('href="#"')
  })
})
