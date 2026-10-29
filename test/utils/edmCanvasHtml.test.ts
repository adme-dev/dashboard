import { describe, expect, it } from 'vitest'
import { sanitizeEmailCanvasHtml } from '~~/app/utils/edmCanvasHtml'

describe('email canvas active markup boundary', () => {
  it('keeps responsive sheets, classes, layout and editable content without active elements', () => {
    const html = sanitizeEmailCanvasHtml('<style>@media(max-width:600px){.hero{width:100%}}</style><table class="hero"><tr><td><img src="https://example.com/car.jpg" onerror="alert(1)"><a href="java&#x73;cript:alert(1)" onclick="alert(1)">Launch</a></td></tr></table><script>alert(1)</script><iframe srcdoc="bad"></iframe>')
    expect(html).toContain('@media')
    expect(html).toContain('class="hero"')
    expect(html).toContain('Launch')
    expect(html).not.toMatch(/onerror|onclick|javascript|<script|<iframe|srcdoc/)
  })
  it('drops foreign content and encoded/control-obfuscated active URLs', () => {
    const html = sanitizeEmailCanvasHtml('<svg onload="alert(1)"></svg><a href="java\nscript:bad">Bad</a><img src="data:image/svg+xml,bad"><b>Safe</b>')
    expect(html).not.toMatch(/svg|href=|src=/)
    expect(html).toContain('<b>Safe</b>')
    expect(sanitizeEmailCanvasHtml('<style>.bad{color:red}</style><b>Text</b>', false)).toBe('<b>Text</b>')
  })
})
