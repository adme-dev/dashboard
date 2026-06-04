// test/utils/emailRenderRichStyle.test.ts
// Phase 3a: verify the rich per-element style props round-trip into the server
// HTML render, and — critically — that absent props leave output unchanged
// (no regression to the production send path).
import { describe, it, expect } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

function doc(blockType: string, props: Record<string, unknown>, style: Record<string, unknown>) {
  return {
    root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['b'] } },
    b: { type: blockType, data: { props, style } }
  }
}

describe('rich style — backwards compatibility (absent props ⇒ unchanged)', () => {
  it('Heading with empty style emits none of the new CSS props', () => {
    const html = renderTemplateDocument(doc('Heading', { level: 'h1', text: 'Hi' }, {}))
    expect(html).not.toContain('letter-spacing')
    expect(html).not.toContain('text-transform')
    expect(html).not.toContain('box-shadow')
    expect(html).not.toContain('background-image')
    // baseline still renders
    expect(html).toContain('Hi')
  })

  it('Text with empty style emits no new props', () => {
    const html = renderTemplateDocument(doc('Text', { text: 'Body' }, {}))
    expect(html).not.toContain('letter-spacing')
    expect(html).not.toContain('text-transform')
    expect(html).toContain('Body')
  })
})

describe('rich style — emission into HTML', () => {
  it('Heading honors lineHeight / letterSpacing / textTransform (overriding defaults)', () => {
    const html = renderTemplateDocument(doc('Heading', { level: 'h1', text: 'Hi' }, {
      lineHeight: 2, letterSpacing: 3, textTransform: 'uppercase'
    }))
    expect(html).toContain('line-height: 2;')
    expect(html).toContain('letter-spacing: 3px;')
    expect(html).toContain('text-transform: uppercase;')
    // the user value comes AFTER the hardcoded line-height:1.3 so it wins
    const h1 = html.slice(html.indexOf('<h1'))
    expect(h1.indexOf('line-height: 1.3;')).toBeLessThan(h1.indexOf('line-height: 2;'))
  })

  it('Text honors opacity, border and box-shadow', () => {
    const html = renderTemplateDocument(doc('Text', { text: 'Body' }, {
      opacity: 0.5, borderWidth: 2, borderStyle: 'solid', borderColor: '#ff0000', boxShadow: 'md'
    }))
    expect(html).toContain('opacity: 0.5;')
    expect(html).toContain('border: 2px solid #ff0000;')
    expect(html).toContain('box-shadow: 0 4px 8px rgba(0,0,0,0.10);')
  })

  it('Button honors a safe background-image and rejects an unsafe one', () => {
    const ok = renderTemplateDocument(doc('Button', { text: 'Go', url: 'https://x.com' }, {
      backgroundImage: 'https://cdn.example.com/bg.png'
    }))
    expect(ok).toContain('background-image: url(https://cdn.example.com/bg.png);')

    const bad = renderTemplateDocument(doc('Button', { text: 'Go', url: 'https://x.com' }, {
      backgroundImage: 'javascript:alert(1)'
    }))
    expect(bad).not.toContain('javascript:')
    expect(bad).not.toContain('background-image:')
  })

  it('Container honors borderRadius via the rich props', () => {
    const html = renderTemplateDocument(doc('Container', {}, { borderRadius: 12 }))
    expect(html).toContain('border-radius: 12px;')
  })
})
