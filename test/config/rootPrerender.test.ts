import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('root host routing prerender config', () => {
  it('keeps / out of prerender output so app.xeroflow.io can redirect through middleware', () => {
    const config = readFileSync('nuxt.config.ts', 'utf8')
    const prerenderIgnore = config.match(/prerender:\s*\{[\s\S]*?ignore:\s*\[([\s\S]*?)\]/)?.[1] || ''

    expect(prerenderIgnore).toMatch(/['"]\/['"]/)
  })
})
