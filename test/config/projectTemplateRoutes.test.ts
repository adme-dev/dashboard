import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('project template routes', () => {
  it('keeps the catalog as an index sibling so details render independently', () => {
    const pages = new URL('../../app/pages/agency/', import.meta.url)
    expect(existsSync(new URL('templates/index.vue', pages))).toBe(true)
    expect(existsSync(new URL('templates.vue', pages))).toBe(false)
    expect(readFileSync(new URL('templates/[id].vue', pages), 'utf8')).toContain('<TemplatesTaskEditor')
  })
})
