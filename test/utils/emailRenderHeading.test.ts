// test/utils/emailRenderHeading.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

// A flyhub document is a flat keyed map with a `root` EmailLayout whose
// childrenIds reference other blocks. Block type strings are capitalized.
function docWithHeading(text: string, level = 'h1') {
  return {
    root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h1'] } },
    h1: { type: 'Heading', data: { props: { level, text }, style: {} } }
  }
}

describe('renderTemplateDocument — heading', () => {
  it('renders the heading text inside the requested tag', () => {
    const html = renderTemplateDocument(docWithHeading('Welcome aboard', 'h1'))
    expect(html).toContain('Welcome aboard')
    expect(html).toMatch(/<h1[^>]*>/)
  })
  it('escapes HTML in heading text', () => {
    const html = renderTemplateDocument(docWithHeading('<script>x</script>'))
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
  })
  it('wraps output in a full HTML email document', () => {
    const html = renderTemplateDocument(docWithHeading('Hi'))
    expect(html).toContain('<!DOCTYPE html>')
    expect(html.toLowerCase()).toContain('<body')
  })
})
