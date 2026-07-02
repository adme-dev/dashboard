import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

describe('social publishing theme browser smoke script', () => {
  it('is exposed as an explicit package script and does not hardcode auth tokens', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    const script = readFileSync(resolve(ROOT, 'scripts/social-publishing-theme-smoke.mjs'), 'utf8')

    expect(pkg.scripts['smoke:social-publishing-theme']).toBe('node scripts/social-publishing-theme-smoke.mjs')
    expect(script).toContain('SOCIAL_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_SMOKE_STORAGE_STATE')
    expect(script).toContain('SOCIAL_PUBLISHING_SMOKE_STORAGE_STATE')
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_%.-]+/)
  })

  it('keeps generic screenshot capture authenticated by environment only', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/capture-screenshots.mjs'), 'utf8')

    expect(script).toContain('SCREENSHOT_AUTH_TOKEN')
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_%.-]+/)
    expect(script).not.toContain('auth_token\', value: \'')
  })
})
