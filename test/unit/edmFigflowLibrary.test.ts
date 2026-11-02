import { describe, expect, it } from 'vitest'
import { figflowTemplateCapability, figflowComposerQuery } from '../../app/utils/edmFigflowLibrary'
import { EDM_STARTER_TEMPLATES, buildStarterTemplateDocument } from '../../app/utils/edmPresets'

describe('FigFlow template library source capabilities', () => {
  it('labels all six HTML-only starters honestly while permitting supported structured content', () => {
    const zero = ['postcards-glidex', 'postcards-futurax', 'postcards-aviro', 'oem-launch-interest', 'oem-sale-weekend', 'oem-launch-rsvp']
    expect(EDM_STARTER_TEMPLATES).toHaveLength(11)
    for (const starter of EDM_STARTER_TEMPLATES) {
      const source = buildStarterTemplateDocument(starter.id)
      const before = JSON.stringify(source)
      const result = figflowTemplateCapability(source)
      expect(result.canOpen, starter.id).toBe(!zero.includes(starter.id))
      expect(result.editableFields === 0, starter.id).toBe(zero.includes(starter.id))
      expect(result.document).toEqual(source)
      expect(JSON.stringify(source)).toBe(before)
    }
  })
  it('does not advertise malformed, native-envelope or rich-text-only sources as editable', () => {
    for (const source of [null, '{broken', { kind: 'template', source: { editor: 'figflow' } }, { root: { type: 'EmailLayout', data: { childrenIds: ['copy'] } }, copy: { type: 'Text', data: { props: { text: '<strong>Locked</strong>' } } } }]) {
      expect(figflowTemplateCapability(source).canOpen).toBe(false)
    }
  })
  it('opens an already saved draft without copy or starter mutation parameters', () => {
    expect(figflowComposerQuery('owned-draft')).toEqual({ id: 'owned-draft', workspace: 'figflow', openDesign: '1' })
  })
})
