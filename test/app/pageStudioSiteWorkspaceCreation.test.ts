import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'app/components/page-studio/SiteWorkspace.vue'), 'utf8')

describe('Page Studio self-service creation surface', () => {
  it('keeps creation portal-only and uses the governed endpoint', () => {
    expect(source).toContain("v-if=\"audience === 'portal'\"")
    expect(source).toContain("$fetch('/api/portal/page-studio/sites'")
    expect(source).toContain('UFormField label="Website name"')
    expect(source).toContain('UFormField label="Starter template"')
  })

  it('offers the reusable industry starters', () => {
    for (const template of ['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1']) {
      expect(source).toContain(template)
    }
  })
})
