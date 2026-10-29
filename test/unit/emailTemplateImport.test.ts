import { describe, it, expect } from 'vitest'
import { EDM_STARTER_TEMPLATES, buildStarterTemplateDocument } from '../../app/utils/edmPresets'
import { prepareTemplateImport, sanitizeImportedHtml, MAX_TEMPLATE_IMPORT_BYTES } from '../../server/utils/email-marketing/templateImport'

const root = { type: 'EmailLayout', data: { childrenIds: ['html'] } }
describe('email template import', () => {
  it('preserves tables, inline styles and public HTTPS images', () => {
    const doc = prepareTemplateImport('html', '<table><tr><td style="color:red"><img src="https://example.com/a.jpg">Hello</td></tr></table>')
    expect(doc.imported.data.props?.contents).toContain('<table>')
    expect(doc.imported.data.props?.contents).toContain('style="color:red"')
    expect(doc.imported.data.props?.contents).toContain('https://example.com/a.jpg')
  })
  it('preserves email inline layout without allowing hidden or positioned content', () => {
    const html = sanitizeImportedHtml('<table style="display:inline-table;margin:0 auto;background:#000"><tr><td>Social</td></tr></table><div style="display:inline-block;position:fixed">Icon</div>')
    expect(html).toContain('display:inline-table;margin:0 auto;background:#000')
    expect(html).toContain('display:inline-block')
    expect(html).not.toContain('position')
  })
  it('removes active markup, encoded schemes, handlers and unsafe CSS', () => {
    const html = sanitizeImportedHtml('<script>alert(1)</script><iframe src="https://example.com"></iframe><form>secret</form><img onerror="evil()" src="data:x"><a href="jav&#97;script:evil()">Go</a><p style="background:url(https://example.com)">Text</p>')
    for (const unsafe of ['script', 'iframe', 'form', 'onerror', 'data:x', 'javascript', 'url(']) expect(html).not.toContain(unsafe)
    expect(html).toContain('Text')
  })
  it('strips fixed overlays, hidden content styles and escaped CSS URLs', () => {
    const html = sanitizeImportedHtml('<p class="fixed inset-0 z-50" style="position:fixed;z-index:999999;display:none;opacity:0;color:red">Text</p><p style="background:u\\72l(https://example.com)">Other</p>')
    expect(html).toContain('style="color:red"')
    for (const unsafe of ['class=', 'fixed', 'z-index', 'display', 'opacity', 'example.com']) expect(html).not.toContain(unsafe)
  })
  it('accepts native JSON and sanitizes HTML blocks', () => {
    const doc = prepareTemplateImport('json', JSON.stringify({ root, html: { type: 'Html', data: { props: { contents: '<b onclick="evil()">Safe</b>' } } } }))
    expect(doc.html.data.props?.contents).toContain('<b>Safe</b>')
  })
  it('sanitizes native Text markup and mobile text before editor rendering', () => {
    const doc = prepareTemplateImport('json', JSON.stringify({
      root: { type: 'EmailLayout', data: { childrenIds: ['text'] } },
      text: { type: 'Text', data: {
        props: { text: '<b>Safe</b><img src=x onerror="evil()"><script>evil()</script>' },
        mobile: { props: { text: '<a href="javascript:evil()" onclick="evil()">Mobile</a>' } }
      } }
    }))
    expect(doc.text.data.props?.text).toBe('<b>Safe</b><img>')
    expect(doc.text.data.mobile?.props?.text).toBe('<a>Mobile</a>')
  })
  it('removes active and private native URLs, including nested and mobile overrides', () => {
    const doc = prepareTemplateImport('json', JSON.stringify({
      root: { type: 'EmailLayout', data: { childrenIds: ['image', 'menu', 'hero'] } },
      image: { type: 'Image', data: { props: { url: 'https://example.com/car.jpg', linkHref: 'javascript:evil()' }, mobile: { props: { url: 'data:image/svg+xml,<svg onload="evil()"/>', linkHref: 'https://example.com/offer' } } } },
      menu: { type: 'menu', data: { props: { items: [{ label: 'Bad', url: 'java\nscript:evil()' }, { label: 'Contact', url: 'mailto:sales@example.com' }] } } },
      hero: { type: 'hero-section', data: { props: { imageUrl: 'https://127.0.0.1/private', ctaUrl: 'https://example.com/register' }, style: { backgroundImage: 'javascript:evil()' }, mobile: { style: { backgroundImage: 'https://10.0.0.1/private' } } } }
    }))
    expect(doc.image.data.props).toMatchObject({ url: 'https://example.com/car.jpg', linkHref: '' })
    expect(doc.image.data.mobile?.props).toMatchObject({ url: '', linkHref: 'https://example.com/offer' })
    expect(doc.menu.data.props?.items).toEqual([{ label: 'Bad', url: '' }, { label: 'Contact', url: 'mailto:sales@example.com' }])
    expect(doc.hero.data.props).toMatchObject({ imageUrl: '', ctaUrl: 'https://example.com/register' })
    expect(doc.hero.data.style?.backgroundImage).toBe('')
    expect(doc.hero.data.mobile?.style?.backgroundImage).toBe('')
  })
  it('accepts every exported starter document, including numeric feature columns', () => {
    for (const template of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(template.id)
      expect(() => prepareTemplateImport('json', JSON.stringify(document)), template.id).not.toThrow()
    }
  })
  it('rejects malformed shape, dangling, cyclic and disconnected cyclic graphs', () => {
    for (const content of ['{', '{}', JSON.stringify({ root }), JSON.stringify({ root: { type: 'EmailLayout', data: { childrenIds: ['root'] } } }), JSON.stringify({ root: { type: 'EmailLayout', data: {} }, x: { type: 'Container', data: { childrenIds: ['x'] } } })]) expect(() => prepareTemplateImport('json', content)).toThrow()
  })
  it('bounds blank, oversized and deeply nested input', () => {
    expect(() => prepareTemplateImport('html', ' ')).toThrow()
    expect(() => prepareTemplateImport('html', 'x'.repeat(MAX_TEMPLATE_IMPORT_BYTES + 1))).toThrow()
    expect(() => prepareTemplateImport('html', '<div>'.repeat(110) + 'x')).toThrow()
  })
})
