import { describe, expect, it } from 'vitest'
import { prepareTemplateImport } from '../../server/utils/email-marketing/templateImport'
import { sanitizeEmailCss, sanitizeImportedEmailDocument } from '../../server/utils/email-marketing/importedEmailDocument'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'
import type { FlyhubDocument } from '../../workers/email-rendering/src/render/blocks/types'

const source = `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body {margin:0;padding:0} .show-mobile-td {display:none} .hide-mobile {display:table-cell}
@media screen and (max-width:599px) {.hide-mobile {display:none!important}.show-mobile-td {display:table-cell!important}.container {width:100%!important}}
@font-face {font-family:brand;src:url('https://example.com/brand.woff2') format('woff2')}
</style></head><body id="body"><div class="preheader" style="display:none!important;max-height:0;overflow:hidden">Preview</div>
<table class="container" width="680"><tr><td class="hide-mobile"><img src="https://example.com/car.png" width="600" alt="Car"></td><td class="show-mobile-td" style="display:none"><img src="https://example.com/car.png" width="100%" alt="Car"></td></tr>
<tr><td background="https://example.com/bg.png" style="background-image:url('https://example.com/bg.png');padding:24px;color:#ffffff">Content</td></tr></table>
<!--[if mso]><v:roundrect href="https://example.com/offer" style="height:42px;width:226px;v-text-anchor:middle" fillcolor="#e5005c"><v:textbox><center><![endif]-->
<a href="https://example.com/offer" style="display:block;padding:8px 32px">Learn More</a>
<!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
</body></html>`

describe('full imported email document mode', () => {
  it('retains responsive visibility, font faces, background media and split Outlook fragments', () => {
    const result = sanitizeImportedEmailDocument(source)
    expect(result.width).toBe(680)
    expect(result.html).toContain('class="hide-mobile"')
    expect(result.html).toContain('class="show-mobile-td"')
    expect(result.html).toMatch(/display:\s*none\s*!important/)
    expect(result.html).toContain('@media screen and (max-width:599px)')
    expect(result.html).toContain('https://example.com/brand.woff2')
    expect(result.html).toContain('background="https://example.com/bg.png"')
    expect(result.html).toMatch(/background-image:\s*url\(/)
    expect(result.html).toContain('<v:roundrect href="https://example.com/offer"')
    expect(result.html).toContain('<v:textbox><center><![endif]-->')
    expect(result.html).toContain('<!--[if mso]></center></v:textbox></v:roundrect><![endif]-->')
  })

  it('compiles the complete email once without introducing a second 600px wrapper', () => {
    const document = prepareTemplateImport('html', source)
    expect(document.imported.data.props?.documentMode).toBe('email')
    expect(document.root.data.props?.contentWidth).toBe(680)
    const html = renderFlyhubDocumentToHtml(document as FlyhubDocument)
    expect(html).toBe(document.imported.data.props?.contents)
    expect(html.match(/<html\b/g)).toHaveLength(1)
    expect(html).not.toContain('class="email-container"')
  })

  it('revalidates full-document JSON backup content without stripping its visibility rules', () => {
    const first = prepareTemplateImport('html', source)
    const restored = prepareTemplateImport('json', JSON.stringify(first))
    expect(restored.imported.data.props?.documentMode).toBe('email')
    expect(restored.imported.data.props?.contents).toContain('class="show-mobile-td"')
    expect(restored.imported.data.props?.contents).toMatch(/display:\s*none/)
  })

  it('preserves downlevel-revealed Outlook markers while rejecting active conditional content', () => {
    const result = sanitizeImportedEmailDocument(`<!DOCTYPE html><html><head></head><body><!--[if !mso]><!--><p>Visible</p><!--<![endif]--><!--[if mso]><script>bad()</script><![endif]--><!--[if mso]><a onclick="bad()" href="javascript:bad()">Link</a><![endif]--></body></html>`).html
    expect(result).toContain('<!--[if !mso]><!-->')
    expect(result).toContain('<!--<![endif]-->')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('javascript:')
  })

  it('retains independent safe declarations when an unsafe CSS URL is removed', () => {
    const css = sanitizeEmailCss('color:red;background-image:url("https://127.0.0.1/private");padding:20px;position:fixed;z-index:99999', true)
    expect(css).toMatch(/color:\s*red/)
    expect(css).toMatch(/padding:\s*20px/)
    expect(css).not.toMatch(/127|position|z-index/)
    for (const unsafe of [
      '@import "https://example.com/unreviewed.css";p{color:red}',
      'p{background:u\\72l(https://example.com)}',
      'p{background-image:image-set("https://127.0.0.1/private" 1x)}',
      'p{background-image:url("data:image/svg+xml,bad")}',
      'p{behavior:url(https://example.com/bad)}'
    ]) expect(sanitizeEmailCss(unsafe)).not.toMatch(/@import|127|data:|behavior|u\\72l/)
  })

  it('removes handlers, frames, forms, refresh/base and unknown external stylesheets', () => {
    const result = sanitizeImportedEmailDocument(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://example.com"><link rel="stylesheet" href="https://example.com/untrusted.css"></head><body onload="bad()"><iframe src="https://example.com"></iframe><form><input></form><img src="data:x" onerror="bad()"><a href="jav&#97;script:bad()">Text</a></body></html>`).html
    expect(result).not.toMatch(/refresh|<base|<link|<iframe|<form|<input|onload|onerror|javascript:|data:x/)
    expect(result).toContain('Text')
  })

  it('rejects full-document graphs with additional blocks at import and render boundaries', () => {
    const mixed = prepareTemplateImport('html', source)
    mixed.root.data.childrenIds!.push('extra')
    mixed.extra = { type: 'Text', data: { props: { text: 'Extra' } } }
    expect(() => prepareTemplateImport('json', JSON.stringify(mixed))).toThrow(/single document/)
    expect(() => renderFlyhubDocumentToHtml(mixed as FlyhubDocument)).toThrow(/single document/)
  })

  it('retains safe CSS child selectors and the complete downlevel comment opener', () => {
    const input = '<!DOCTYPE html><html><head><style>div>u~div{width:100%} @media(max-width:599px){.hide{display:none!important}}</style></head><body><!--[if !mso]><!-- --><p>Alternate</p><!--<![endif]--></body></html>'
    const result = sanitizeImportedEmailDocument(input).html
    expect(result).toContain('div>u~div')
    expect(result).toContain('<!--[if !mso]><!-- -->')
    expect(result).toContain('<!--<![endif]-->')
  })

  it('bounds parsing and does not change the conservative fragment import policy', () => {
    expect(() => sanitizeImportedEmailDocument('<div>'.repeat(110) + 'x')).toThrow()
    const fragment = prepareTemplateImport('html', '<p class="hide" style="display:none;position:fixed;color:red">Text</p>')
    expect(fragment.imported.data.props?.documentMode).toBeUndefined()
    expect(fragment.imported.data.props?.contents).not.toMatch(/class=|display|position/)
    expect(fragment.imported.data.props?.contents).toContain('color:red')
  })
})
