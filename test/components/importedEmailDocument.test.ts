// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import Frame from '../../app/components/email/builder/EdmImportedDocument.client.vue'
import { annotateHtmlEditables, getHtmlEditableSelection, updateHtmlEditable } from '../../app/utils/edmHtmlEditables'

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
})
const source = '<!DOCTYPE html><html lang="en"><head><title>Ford</title><style>.mobile{display:none}@media(max-width:599px){.mobile{display:block}}</style></head><body id="body" style="margin:0"><table><tbody><tr><td><p style="color:#066fef">Original text</p><a href="https://example.com">Book a visit</a></td></tr></tbody></table></body></html>'

describe('isolated full-email editor', () => {
  it('contains styles/scripts/navigation without granting scripts, forms or application connections', async () => {
    const host = document.createElement('div')
    const app = createApp({ render: () => h(Frame, { contents: source.replace('</head>', '<script>bad()</script><meta http-equiv="refresh" content="0;url=https://example.com"></head>').replace('</body>', '<form><input></form><iframe src="about:blank"></iframe></body>') }) })
    app.mount(host)
    dispose = () => app.unmount()
    await nextTick()
    const frame = host.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    const parsed = new DOMParser().parseFromString(frame.getAttribute('srcdoc')!, 'text/html')
    expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')).toContain('script-src \'none\'; connect-src \'none\'')
    expect(parsed.querySelector('script, form, input, iframe, meta[http-equiv="refresh"]')).toBeNull()
    expect(parsed.querySelector('style')!.textContent).toContain('@media')
    expect(parsed.querySelector('body')!.id).toBe('body')
    expect(host.querySelector('style')).toBeNull()
  })

  it('preserves the full document/head/body and responsive CSS through text editing', () => {
    const annotated = annotateHtmlEditables(source, { editable: true })
    const doc = new DOMParser().parseFromString(annotated, 'text/html')
    const element = Array.from(doc.querySelectorAll('[data-edm-html-editable-id]')).find(el => el.textContent === 'Original text')!
    const id = element.getAttribute('data-edm-html-editable-id')!
    expect(getHtmlEditableSelection(source, id)?.kind).toBe('text')
    const changed = updateHtmlEditable(source, id, { kind: 'text', text: 'Changed text' })
    const next = new DOMParser().parseFromString(changed, 'text/html')
    expect(next.title).toBe('Ford')
    expect(next.head.querySelector('style')!.textContent).toBe('.mobile{display:none}@media(max-width:599px){.mobile{display:block}}')
    expect(next.body.id).toBe('body')
    expect(next.body.getAttribute('style')).toBe('margin:0')
    expect(next.body.textContent).toContain('Changed text')
    expect(next.querySelector('a')!.getAttribute('href')).toBe('https://example.com')
    expect(changed).not.toContain('data-edm-html-editable')
    expect(changed).toContain('<!DOCTYPE html>')
  })
  it('rejects insecure image and link edits only for full-document mode', () => {
    const input = source.replace('</td>', '<img src="https://example.com/old.png" alt="Car"></td>')
    const parsed = new DOMParser().parseFromString(annotateHtmlEditables(input, { editable: true }), 'text/html')
    const imageId = parsed.querySelector('img')!.getAttribute('data-edm-html-editable-id')!
    const linkId = parsed.querySelector('a')!.getAttribute('data-edm-html-editable-id')!
    for (const src of ['http://example.com/x.png', '/x.png', 'data:image/png;base64,YQ==', 'https://127.0.0.1/x']) {
      expect(updateHtmlEditable(input, imageId, { kind: 'image', src })).toBe(input)
    }
    expect(updateHtmlEditable(input, linkId, { kind: 'link', href: 'http://example.com' })).toBe(input)
    const changed = updateHtmlEditable(input, imageId, { kind: 'image', src: 'https://example.com/new.png' })
    expect(changed).toContain('https://example.com/new.png')
    expect(changed).toContain('<title>Ford</title>')
    expect(changed).toContain('@media')
  })
})
