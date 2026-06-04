import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import { createEmptyDocument } from '~~/app/types/edm'
import {
  EDM_SECTION_CATEGORIES,
  EDM_STARTER_TEMPLATES,
  buildSectionDocumentFragment,
  buildStarterTemplateDocument,
  findSectionPreset,
  findStarterTemplate
} from '~~/app/utils/edmPresets'

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildSectionPresetDocument(sectionPresetId: string) {
  const fragment = buildSectionDocumentFragment(sectionPresetId)
  const document = createEmptyDocument()

  document.root.data.childrenIds = [...fragment.rootChildrenIds]
  Object.assign(document, fragment.blocks)

  return document
}

const expectedContentByPresetId: Partial<Record<string, string[]>> = {
  'basic-heading': ['New Heading'],
  'basic-text': ['Enter your text here...'],
  'basic-button': ['Click Here'],
  'basic-image': ['Image'],
  'basic-html': ['Custom HTML content'],
  'header-logo-menu': ['Your brand', 'Work'],
  'header-dark-brand': ['postcards'],
  'content-editorial-intro': ['Weekly digest', 'Read the update'],
  'content-logo-grid': ['Microsoft'],
  'feature-icon-grid': ['Plan'],
  'cta-blue-banner': ['Ready to launch?', 'Start now'],
  'hero-dark-product': ['Limited-time offer'],
  'transactional-next-steps': ['Next Steps', 'Review the details'],
  'footer-legal': ['Unsubscribe']
}

const expectedStarterContentById: Record<string, string[]> = {
  'newsletter-digest': ['Weekly digest', 'Latest updates from the team', 'Read the update'],
  'product-offer': ['Limited-time offer', 'Claim offer'],
  'confirmation-update': ['Next Steps', 'Here is what happens next']
}

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

  it('renders every section preset and starter template without fallback markup', () => {
    for (const category of EDM_SECTION_CATEGORIES) {
      for (const preset of category.presets) {
        const document = buildSectionPresetDocument(preset.id)
        const html = renderTemplateDocument(document)

        expect(isFlyhubFormat(document)).toBe(true)
        expect(html).not.toContain('available in upcoming update')

        for (const snippet of expectedContentByPresetId[preset.id] ?? []) {
          expect(html).toContain(snippet)
        }

        const roundTripped = roundTrip(document)
        expect(roundTripped.root).toBeDefined()
        expect(roundTripped.root.data.childrenIds).toEqual(document.root.data.childrenIds)
      }
    }

    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      const html = renderTemplateDocument(document, {
        subjectLine: starter.subject,
        previewText: starter.previewText
      })

      expect(isFlyhubFormat(document)).toBe(true)
      expect(html).not.toContain('available in upcoming update')
      expect(html).toContain(starter.subject)
      expect(html).toContain(starter.previewText)

      for (const snippet of expectedStarterContentById[starter.id] ?? []) {
        expect(html).toContain(snippet)
      }

      const roundTripped = roundTrip(document)
      expect(roundTripped.root).toBeDefined()
      expect(roundTripped.root.data.childrenIds).toEqual(document.root.data.childrenIds)
    }
  })

  it('builds section fragments with unique ids and ordered root children', () => {
    const fragment = buildSectionDocumentFragment('header-logo-menu')
    expect(fragment.rootChildrenIds).toHaveLength(2)
    expect(new Set(fragment.rootChildrenIds).size).toBe(fragment.rootChildrenIds.length)
    expect(Object.keys(fragment.blocks).sort()).toEqual([...fragment.rootChildrenIds].sort())
    expect(fragment.blocks[fragment.rootChildrenIds[0]]?.type).toBe('header')
    expect(fragment.blocks[fragment.rootChildrenIds[1]]?.type).toBe('menu')
  })

  it('keeps section and starter ids unique and resolvable', () => {
    const sectionPresetIds = EDM_SECTION_CATEGORIES.flatMap(category => category.presets.map(preset => preset.id))
    const starterIds = EDM_STARTER_TEMPLATES.map(template => template.id)

    expect(new Set(sectionPresetIds).size).toBe(sectionPresetIds.length)
    expect(new Set(starterIds).size).toBe(starterIds.length)

    for (const starter of EDM_STARTER_TEMPLATES) {
      for (const sectionPresetId of starter.sectionPresetIds) {
        expect(findSectionPreset(sectionPresetId)).not.toBeNull()
      }
    }
  })

  it('round-trips catalog data and starter documents through JSON serialization', () => {
    const catalogRoundTrip = roundTrip({
      categories: EDM_SECTION_CATEGORIES,
      starters: EDM_STARTER_TEMPLATES
    })

    expect(catalogRoundTrip.categories.map((category: { id: string }) => category.id)).toEqual(
      EDM_SECTION_CATEGORIES.map(category => category.id)
    )
    expect(catalogRoundTrip.starters.map((starter: { id: string }) => starter.id)).toEqual(
      EDM_STARTER_TEMPLATES.map(starter => starter.id)
    )

    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      const roundTrippedDocument = roundTrip(document)

      expect(roundTrippedDocument.root).toBeDefined()
      expect(roundTrippedDocument.root.type).toBe('EmailLayout')
      expect(roundTrippedDocument.root.data.childrenIds).toEqual(document.root.data.childrenIds)
    }
  })

  it('returns null for missing starter and section ids', () => {
    expect(findSectionPreset('missing-section')).toBeNull()
    expect(findStarterTemplate('missing-starter')).toBeNull()
  })
})
