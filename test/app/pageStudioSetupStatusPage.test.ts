import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const page = readFileSync(resolve(process.cwd(), 'app/pages/portal/page-studio/[siteId]/setup.vue'), 'utf8')

describe('Page Studio setup status page', () => {
  it('maps the protocol complete phase to a completed progress state', () => {
    expect(page).toContain('phase === \'complete\'')
    expect(page).not.toContain('phase === \'completed\'')
  })
})
