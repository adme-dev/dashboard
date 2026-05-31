// test/utils/emailRenderDocument.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'

describe('renderTemplateDocument — multi-block document', () => {
  it('renders heading + text + button in order', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a', 'b', 'c'] } },
      a: { type: 'Heading', data: { props: { level: 'h2', text: 'Title' }, style: {} } },
      b: { type: 'Text', data: { props: { text: 'Body copy here' }, style: {} } },
      c: { type: 'Button', data: { props: { text: 'Click me', url: 'https://example.com' }, style: {} } }
    }
    const html = renderTemplateDocument(doc)
    expect(html).toContain('Title')
    expect(html).toContain('Body copy here')
    expect(html).toContain('Click me')
    expect(html).toContain('https://example.com')
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Click me'))
  })

  it('renders an empty EmailLayout without throwing', () => {
    const html = renderTemplateDocument({ root: { type: 'EmailLayout', data: { childrenIds: [] } } })
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('guards document format', () => {
    expect(() => renderTemplateDocument({ not: 'a doc' })).toThrow('invalid_flyhub_document')
    expect(isFlyhubFormat({ not: 'a doc' })).toBe(false)
    expect(isFlyhubFormat({ root: { type: 'EmailLayout', data: {} } })).toBe(true)
  })
})
