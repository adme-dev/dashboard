import { describe, expect, it } from 'vitest'
import { resolveEmailContentWidth } from '../../shared/emailRendering/layout'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'

describe('canonical email content width', () => {
  it.each([320, 600, 620, 680, 960])('uses %ipx in compiled structured layout', (width) => {
    const html = renderFlyhubDocumentToHtml({ root: { type: 'EmailLayout', data: { childrenIds: [], props: { contentWidth: width } } } })
    expect(html).toContain(`width="${width}" class="email-container"`)
    expect(html).toContain(`max-width: ${width}px`)
    expect(resolveEmailContentWidth(width)).toBe(width)
  })
  it('accepts numeric legacy width strings without allowing markup or object coercion', () => {
    expect(resolveEmailContentWidth('680')).toBe(680)
    for (const value of [undefined, null, false, 0, 319, 961, 680.5, NaN, Infinity, '680px', '680" onclick="bad()', { toString: 'bad', valueOf: 'bad' }]) {
      expect(resolveEmailContentWidth(value)).toBe(600)
    }
  })
})
