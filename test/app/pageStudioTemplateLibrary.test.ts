import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const library = readFileSync('app/components/page-studio/TemplateLibrarySlideover.vue', 'utf8')
const confirmation = readFileSync('app/components/page-studio/TemplateApplyModal.vue', 'utf8')

describe('Page Studio template library', () => {
  it('exposes all curated library categories', () => {
    for (const label of ['Sections', 'Pages', 'Shells', 'Sites']) expect(library).toContain(`label: '${label}'`)
    expect(library).toContain('<USlideover')
    expect(library).toContain('PAGE_STUDIO_SECTION_PRESETS')
    expect(library).toContain('PAGE_STUDIO_SITE_PRESETS')
  })

  it('enforces page entitlements before confirmation', () => {
    expect(library).toContain(':disabled="preset.pageCount > pageLimit"')
    expect(library).toContain('kind: \'site\'')
    expect(confirmation).toContain('Production is unchanged')
    expect(confirmation).toContain('<UModal')
  })

  it('uses Nuxt UI instead of native controls', () => {
    expect(library).not.toMatch(/<(?:button|input|select|dialog)\b/)
    expect(confirmation).not.toMatch(/<(?:button|input|select|dialog)\b/)
  })
})
