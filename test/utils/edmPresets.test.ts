import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import {
  EDM_SECTION_CATEGORIES,
  EDM_STARTER_TEMPLATES,
  buildSectionDocumentFragment,
  buildStarterTemplateDocument,
  findSectionPreset,
  findStarterTemplate
} from '~~/app/utils/edmPresets'

describe('edmPresets', () => {
  it('includes basic scratch blocks and Postcards-style section categories', () => {
    expect(EDM_SECTION_CATEGORIES.map(category => category.id)).toEqual([
      'basic',
      'header',
      'content',
      'feature',
      'call-to-action',
      'e-commerce',
      'transactional',
      'footer'
    ])
    expect(findSectionPreset('basic-heading')?.kind).toBe('block')
    expect(findSectionPreset('hero-dark-product')?.kind).toBe('section')
  })

  it('builds section fragments with unique ids and ordered root children', () => {
    const fragment = buildSectionDocumentFragment('header-logo-menu')
    expect(fragment.rootChildrenIds).toHaveLength(2)
    expect(new Set(fragment.rootChildrenIds).size).toBe(fragment.rootChildrenIds.length)
    expect(Object.keys(fragment.blocks).sort()).toEqual([...fragment.rootChildrenIds].sort())
    expect(fragment.blocks[fragment.rootChildrenIds[0]]?.type).toBe('header')
    expect(fragment.blocks[fragment.rootChildrenIds[1]]?.type).toBe('menu')
  })

  it('builds starter template documents in valid Flyhub format', () => {
    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      expect(isFlyhubFormat(document)).toBe(true)
      expect(document.root.data.childrenIds?.length).toBeGreaterThan(2)
      expect(Object.keys(document)).toContain('root')
    }
  })

  it('renders the newsletter digest starter without unknown block fallback markup', () => {
    const document = buildStarterTemplateDocument('newsletter-digest')
    const html = renderTemplateDocument(document, {
      subjectLine: 'Weekly digest',
      previewText: 'Latest updates from the team'
    })
    expect(html).toContain('Weekly digest')
    expect(html).toContain('Latest updates from the team')
    expect(html).toContain('Read the update')
    expect(html).not.toContain('available in upcoming update')
  })

  it('returns null for missing starter and section ids', () => {
    expect(findSectionPreset('missing-section')).toBeNull()
    expect(findStarterTemplate('missing-starter')).toBeNull()
  })
})
