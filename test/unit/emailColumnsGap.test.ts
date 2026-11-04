/* eslint-disable @typescript-eslint/no-explicit-any -- Renders raw synthetic block documents. */
import { describe, expect, it } from 'vitest'
import { buildSectionDocumentFragment } from '~~/app/utils/edmPresets'
import { createRenderBudget } from '~~/shared/emailRendering/bounds'
import { renderBlock } from '~~/workers/email-rendering/src/render/block-registry'
import { columnsGapOf } from '~~/workers/email-rendering/src/render/blocks/columns-container'
import { renderFlyhubDocumentToHtml } from '~~/workers/email-rendering/src/render/flyhub-html-renderer'

function render(gap: unknown) {
  const props: Record<string, unknown> = { columnsCount: 2, columns: [{ childrenIds: ['a'] }, { childrenIds: ['b'] }] }
  if (gap !== undefined) props.columnsGap = gap
  const doc: any = {
    root: { type: 'EmailLayout', data: { childrenIds: ['cols'], props: {} } },
    cols: { type: 'ColumnsContainer', data: { props } },
    a: { type: 'Text', data: { props: { text: 'Left' } } },
    b: { type: 'Text', data: { props: { text: 'Right' } } }
  }
  return {
    html: [...renderFlyhubDocumentToHtml(doc).matchAll(/<td class="stack-column" style="([^"]+)"/g)].map(match => match[1]),
    mjml: [...renderBlock(doc.cols, 'mjml', { fontFamily: 'Arial', _document: doc, renderBudget: createRenderBudget() } as any).matchAll(/<mj-column[^>]+>/g)].map(match => match[0])
  }
}

describe('columns gap in email output', () => {
  it.each([
    [0, 'padding: 0 0px;', 'padding="0px"'],
    [24, 'padding: 0 12px;', 'padding="12px"'],
    [undefined, 'padding: 0 8px;', 'padding="8px"']
  ])('gap %s renders the same spacing in HTML and MJML', (gap, cell, column) => {
    const { html, mjml } = render(gap)
    expect(html).toHaveLength(2)
    expect(mjml).toHaveLength(2)
    expect(html.every(style => style.includes(cell))).toBe(true)
    expect(mjml.every(tag => tag.includes(column))).toBe(true)
  })

  it('falls back to the default only for missing or invalid values', () => {
    expect([0, 7, undefined, null, Number.NaN, -4, '20'].map(columnsGapOf)).toEqual([0, 7, 16, 16, 16, 16, 16])
  })

  it('renders the structured split starter contiguously, as declared (review P2 target)', () => {
    const fragment = buildSectionDocumentFragment('modern-electric-cta')
    const root = fragment.blocks[fragment.rootChildrenIds[0]!]!
    expect(root.data.props!.columnsGap).toBe(0)
    const doc: any = { root: { type: 'EmailLayout', data: { childrenIds: fragment.rootChildrenIds, props: {} } }, ...fragment.blocks }
    const cells = [...renderFlyhubDocumentToHtml(doc).matchAll(/<td class="stack-column" style="([^"]+)"/g)].map(match => match[1])
    const columns = [...renderBlock(root as any, 'mjml', { fontFamily: 'Arial', _document: doc, renderBudget: createRenderBudget() } as any).matchAll(/<mj-column[^>]+>/g)].map(match => match[0])
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every(style => style.includes('padding: 0 0px;'))).toBe(true)
    expect(columns.every(tag => tag.includes('padding="0px"'))).toBe(true)
  })
})
