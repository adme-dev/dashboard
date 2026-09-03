import { describe, expect, it } from 'vitest'

import { PageStudioDocumentSchema } from '../../shared/pageStudio/document'
import {
  PAGE_STUDIO_PAGE_PRESETS,
  PAGE_STUDIO_SECTION_PRESETS,
  PAGE_STUDIO_SHELL_PRESETS,
  PAGE_STUDIO_SITE_PRESETS,
  applyShellPreset,
  instantiateSectionPreset,
  instantiateSitePreset
} from '../../shared/pageStudio/presets'

function idFactory(offset = 0) {
  let value = offset
  return () => `10000000-0000-4000-8000-${String(++value).padStart(12, '0')}`
}

describe('Page Studio curated presets', () => {
  it('publishes the complete stable registry', () => {
    expect(PAGE_STUDIO_SECTION_PRESETS).toHaveLength(11)
    expect(PAGE_STUDIO_PAGE_PRESETS.map(item => item.id)).toEqual(['landing-page', 'service-page', 'contact-page', 'campaign-page', 'blog-index'])
    expect(PAGE_STUDIO_SHELL_PRESETS).toHaveLength(6)
    expect(PAGE_STUDIO_SITE_PRESETS.map(item => item.pageCount)).toEqual([4, 4, 2])
  })

  it('creates fresh canonical section identifiers', () => {
    const first = instantiateSectionPreset('service-feature-grid', idFactory())
    const second = instantiateSectionPreset('service-feature-grid', idFactory(20))
    expect(first.id).not.toBe(second.id)
    expect(first.type).toBe('features')
    expect(first.items).toHaveLength(3)
  })

  it('creates valid editable complete site documents', () => {
    const result = instantiateSitePreset('professional-services', idFactory())
    expect(result.schemaVersion).toBe(1)
    expect(result.pages.map(page => page.slug)).toEqual(['', 'services', 'about', 'contact'])
    expect(new Set(result.pages.flatMap(page => [page.id, ...page.blocks.map(block => block.id)])).size).toBeGreaterThan(20)
    expect(PageStudioDocumentSchema.safeParse(result).success).toBe(true)
  })

  it('keeps legacy documents valid and applies shell presets independently', () => {
    const legacy = {
      schemaVersion: 1 as const,
      pages: [{ id: idFactory()(), parentId: null, title: 'Home', slug: '', visibility: 'visible' as const, seoTitle: 'Home', seoDescription: '', blocks: [] }]
    }
    expect(PageStudioDocumentSchema.safeParse(legacy).success).toBe(true)
    const updated = applyShellPreset(legacy, 'standard-header', idFactory(30))
    expect(updated.shell?.headerPresetId).toBe('standard')
    expect(updated.pages).toEqual(legacy.pages)
  })
})
