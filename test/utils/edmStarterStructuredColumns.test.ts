import { describe, expect, it } from 'vitest'
import { buildSectionDocumentFragment, buildStarterTemplateDocument, EDM_STARTER_TEMPLATES } from '../../app/utils/edmPresets'
import { MODERN_EDM_STARTER_TEMPLATES } from '../../app/utils/edmModernPresets'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'
import type { EdmFlyhubDocument } from '../../app/types/edm'

const typesOf = (document: EdmFlyhubDocument) => Object.values(document).map(block => block.type)

describe('structured split call-to-action starters', () => {
  it('instantiates nested column templates as ordinary child blocks', () => {
    const fragment = buildSectionDocumentFragment('modern-electric-cta')
    const [rootId] = fragment.rootChildrenIds
    const columns = fragment.blocks[rootId]!
    expect(columns.type).toBe('ColumnsContainer')
    expect(columns).not.toHaveProperty('columns')
    const children = (columns.data.props!.columns as { childrenIds: string[] }[]).map(column => column.childrenIds.map(id => fragment.blocks[id]!.type))
    expect(children).toEqual([['Image'], ['Heading', 'Text', 'Button']])
    expect(columns.data.props).toMatchObject({ columnsCount: 2, contentAlignment: 'middle', fixedWidths: [276, 324] })
    expect(fragment.rootChildrenIds).toHaveLength(1)
  })

  it('builds the Electric Drive starter without raw Html and with editable call-to-action fields', () => {
    const document = buildStarterTemplateDocument('modern-electric-drive')
    expect(typesOf(document)).not.toContain('Html')
    const design = composerToDesignDraft(document, null)
    const cta = Object.entries(document).filter(([, block]) => ['Heading', 'Text', 'Button'].includes(block.type) && /next drive|Choose a time|test drive/i.test(String(block.data.props?.text)))
    expect(cta.map(([, block]) => block.type)).toEqual(['Heading', 'Text', 'Button'])
    for (const [id] of cta) expect(design.policy.editableFields).toContain(`${id}.data.props.text`)
    const html = renderFlyhubDocumentToHtml(document)
    expect(html).toContain('Your next drive starts here.')
    expect(html).toMatch(/class="stack-column" style="width: 276px; vertical-align: middle;/)
  })

  it('keeps every modern starter admissible and free of the split Html section', () => {
    for (const starter of MODERN_EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      expect(() => composerToDesignDraft(document, null)).not.toThrow()
      expect(JSON.stringify(document)).not.toContain('data-edm-layout=\\"split-')
    }
    expect(EDM_STARTER_TEMPLATES.length).toBeGreaterThan(MODERN_EDM_STARTER_TEMPLATES.length - 1)
  })

  it('keeps the email renderer default top alignment for columns that do not ask for middle', () => {
    const html = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['cols'] } },
      cols: { type: 'ColumnsContainer', data: { props: { columnsCount: 1, columns: [{ childrenIds: ['t'] }] } } },
      t: { type: 'Text', data: { props: { text: 'Copy' } } }
    })
    expect(html).toContain('vertical-align: top;')
  })
})
