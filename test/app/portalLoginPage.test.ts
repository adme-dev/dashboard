import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/portal/login.vue', 'utf8')

describe('portal login page', () => {
  it('uses the shared form controls and provides a working support route', () => {
    expect(source).toContain('<UFormField label="Email"')
    expect(source).toContain('<UFormField label="Password"')
    expect(source).toContain('<UInput')
    expect(source).toContain('<UButton')
    expect(source).toContain('to="/support"')

    expect(source).not.toMatch(/<input[\s>]/)
    expect(source).not.toMatch(/<button[\s>]/)
    expect(source).not.toContain('href="#"')
  })
})
