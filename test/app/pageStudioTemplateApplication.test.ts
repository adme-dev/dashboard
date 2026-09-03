import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const builder = readFileSync('app/components/page-studio/BuilderShell.client.vue', 'utf8')

describe('Page Studio template application', () => {
  it('keeps the component library permanently available in Studio', () => {
    expect(builder).toContain('label="Library"')
    expect(builder).toContain('<PageStudioTemplateLibrarySlideover')
    expect(builder).toContain('@apply-section="applySection"')
    expect(builder).toContain('@apply-site="applySite"')
  })

  it('applies presets only to the local draft', () => {
    expect(builder).toContain('instantiateSectionPreset(id, () => crypto.randomUUID())')
    expect(builder).toContain('selectedPage.value.blocks.splice')
    expect(builder).toContain('selectedPage.value.blocks = instantiatePagePreset')
    expect(builder).toContain('draft.value = next')
    const handlers = builder.slice(builder.indexOf('function applySection'), builder.indexOf('async function save'))
    expect(handlers).not.toContain('$fetch')
  })

  it('enforces page limits and passes shell state to the renderer', () => {
    expect(builder).toContain('next.pages.length > data.value.pageLimit')
    expect(builder).toContain(':shell="draft.shell"')
    expect(builder).toContain('selectedBlock.value.items.length >= 12')
  })
})
