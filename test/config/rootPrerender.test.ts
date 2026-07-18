import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('root host routing prerender config', () => {
  it('keeps / out of prerender output so app.xeroflow.io can redirect through middleware', () => {
    const config = readFileSync('nuxt.config.ts', 'utf8')
    const prerenderIgnore = config.match(/prerender:\s*\{[\s\S]*?ignore:\s*\[([\s\S]*?)\]/)?.[1] || ''

    expect(prerenderIgnore).toMatch(/['"]\/['"]/)
  })

  it('prerenders the public Voice AI marketing page', () => {
    const config = readFileSync('nuxt.config.ts', 'utf8')

    expect(config).toMatch(/['"]\/voice-ai['"]:\s*\{\s*prerender:\s*true\s*\}/)
  })
})
