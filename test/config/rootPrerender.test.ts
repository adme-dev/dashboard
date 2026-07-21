import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shouldIgnorePrerenderRoute } from '../../lib/prerender-ignore'

describe('root host routing prerender config', () => {
  it('keeps / out of prerender output so app.xeroflow.io can redirect through middleware', () => {
    const config = readFileSync('nuxt.config.ts', 'utf8')

    expect(config).toMatch(/ignore:\s*\[shouldIgnorePrerenderRoute\]/)
    expect(shouldIgnorePrerenderRoute('/')).toBe(true)
  })

  it('prerenders the public Voice AI marketing page', () => {
    const config = readFileSync('nuxt.config.ts', 'utf8')

    expect(config).toMatch(/['"]\/voice-ai['"]:\s*\{\s*prerender:\s*true\s*\}/)
  })
})
