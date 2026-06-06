import { describe, expect, it } from 'vitest'
import { buildCampaignPreflight } from '~~/server/utils/email-marketing/campaignSend'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import { createEmptyDocument } from '~~/app/types/edm'
import { POSTCARDS_IMPORTED_HTML } from '~~/app/utils/edmImportedPostcardsHtml.js'
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

const sectionPresets = EDM_SECTION_CATEGORIES.flatMap(category => category.presets).filter(
  preset => preset.kind === 'section'
)

const nonBasicCategories = EDM_SECTION_CATEGORIES.filter(category => category.id !== 'basic')

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
  'postcards-glidex': ['Drive smarter, safer, and more efficiently', 'Claim Your Offer Now'],
  'postcards-futurax': ['Reserve your FuturaX', 'TurboNexus Motor'],
  'postcards-aviro': ['Fresh bicycle models now in stock and ready', 'In the shopping cart']
}

describe('edmPresets', () => {
  it('includes basic scratch blocks and Postcards-style section categories', () => {
    expect(EDM_SECTION_CATEGORIES.map(category => category.id)).toEqual([
      'basic',
      'imported',
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

  it('builds starter template HTML that passes campaign identity preflight', () => {
    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      const html = renderTemplateDocument(document, {
        subjectLine: starter.subject,
        previewText: starter.previewText
      })
      const preflight = buildCampaignPreflight({
        campaign: {
          subject: starter.subject,
          from_email: 'news@example.com',
          body_html: html
        },
        toSend: 1,
        sendingConfigured: true,
        senderDomainAuthenticated: true
      })

      expect(
        preflight.checks.find(check => check.code === 'footer_identity'),
        `starter ${starter.id} should include a physical sender identity footer`
      ).toEqual(expect.objectContaining({ status: 'pass' }))
    }
  })

  it('exposes a rich section library with at least six presets per non-basic category', () => {
    for (const category of nonBasicCategories) {
      const categorySectionPresets = category.presets.filter(preset => preset.kind === 'section')
      expect(
        categorySectionPresets.length,
        `category ${category.id} should have >= 6 section presets`
      ).toBeGreaterThanOrEqual(6)
    }
  })

  it('builds every section preset fragment with unique ids that render without fallback markup', () => {
    expect(sectionPresets.length).toBeGreaterThan(0)

    for (const preset of sectionPresets) {
      const fragment = buildSectionDocumentFragment(preset.id)

      expect(fragment.rootChildrenIds.length, `preset ${preset.id} produced no blocks`).toBe(
        preset.blocks.length
      )
      expect(
        new Set(fragment.rootChildrenIds).size,
        `preset ${preset.id} has duplicate root ids`
      ).toBe(fragment.rootChildrenIds.length)
      expect(Object.keys(fragment.blocks).sort()).toEqual([...fragment.rootChildrenIds].sort())

      const document = createEmptyDocument()
      document.root.data.childrenIds = [...fragment.rootChildrenIds]
      Object.assign(document, fragment.blocks)

      const html = renderTemplateDocument(document, {
        subjectLine: 'Section preview',
        previewText: 'Section preview text'
      })

      expect(isFlyhubFormat(document)).toBe(true)
      expect(
        html,
        `preset ${preset.id} rendered fallback markup`
      ).not.toContain('available in upcoming update')
    }
  })

  it('resolves every referenced section preset id', () => {
    const referencedIds = [
      'header-logo-menu',
      'header-dark-brand',
      'content-editorial-intro',
      'content-logo-grid',
      'feature-icon-grid',
      'cta-blue-banner',
      'hero-dark-product',
      'transactional-next-steps',
      'footer-legal'
    ]

    for (const id of referencedIds) {
      expect(findSectionPreset(id), `expected ${id} to resolve`).not.toBeNull()
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

  it('keeps the existing starter library and appends imported Postcards templates', () => {
    const starterIds = EDM_STARTER_TEMPLATES.map(starter => starter.id)

    for (const id of ['newsletter-digest', 'product-offer', 'confirmation-update', 'flash-sale']) {
      expect(starterIds, `expected existing starter ${id} to remain`).toContain(id)
    }
    for (const id of ['postcards-glidex', 'postcards-futurax', 'postcards-aviro']) {
      expect(starterIds, `expected imported starter ${id} to be added`).toContain(id)
    }
    expect(starterIds).not.toContain('postcards-metahome')
  })

  it('excludes the problematic MetaHome import from starters and sections', () => {
    const starterIds = EDM_STARTER_TEMPLATES.map(starter => starter.id)
    const sectionPresetIds = EDM_SECTION_CATEGORIES.flatMap(category => category.presets.map(preset => preset.id))

    expect(starterIds).not.toContain('postcards-metahome')
    expect(sectionPresetIds.some(id => id.startsWith('postcards-metahome'))).toBe(false)
  })

  it('keeps imported and existing starter ids unique', () => {
    const starterIds = EDM_STARTER_TEMPLATES.map(starter => starter.id)

    expect(new Set(starterIds).size).toBe(starterIds.length)
  })

  it('builds imported sections from the scripted Postcards exports', () => {
    const hero = findSectionPreset('postcards-glidex-02-hero')
    const importedHtmlIds = Object.keys(POSTCARDS_IMPORTED_HTML)

    expect(hero?.blocks.map(block => block.type)).toEqual(['Html'])
    expect(importedHtmlIds).toHaveLength(19)
    expect(importedHtmlIds.some(id => id.startsWith('postcards-metahome'))).toBe(false)
    expect(POSTCARDS_IMPORTED_HTML['postcards-glidex-02-hero']).toContain('pc-component')
    expect(POSTCARDS_IMPORTED_HTML['postcards-glidex-02-hero']).toContain('Drive smarter')
    expect(JSON.stringify(POSTCARDS_IMPORTED_HTML)).not.toContain('designmodo.com/postcards')
  })

  it('resolves every section preset id referenced by every starter', () => {
    for (const starter of EDM_STARTER_TEMPLATES) {
      for (const sectionPresetId of starter.sectionPresetIds) {
        expect(
          findSectionPreset(sectionPresetId),
          `starter ${starter.id} references unknown section ${sectionPresetId}`
        ).not.toBeNull()
      }
    }
  })

  it('builds a valid full document for every starter that renders without fallback markup', () => {
    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)

      expect(isFlyhubFormat(document), `starter ${starter.id} is not flyhub format`).toBe(true)
      expect(
        document.root.data.childrenIds.length,
        `starter ${starter.id} should have >= 3 root children`
      ).toBeGreaterThanOrEqual(3)

      const html = renderTemplateDocument(document, {
        subjectLine: starter.subject,
        previewText: starter.previewText
      })

      expect(
        html,
        `starter ${starter.id} rendered fallback markup`
      ).not.toContain('available in upcoming update')
    }
  })
})
