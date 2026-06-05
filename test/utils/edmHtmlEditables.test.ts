// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  annotateHtmlEditables,
  getHtmlEditableSelection,
  updateHtmlEditable
} from '~~/app/utils/edmHtmlEditables'

const sampleHtml = `
  <table>
    <tr>
      <td>
        <div style="font-size:24px;color:#111111;">Drive smarter</div>
        <a href="https://example.com/offer" style="color:#000000;">Claim offer</a>
        <img src="/email/postcards/glidex/images/car.png" alt="Car">
      </td>
    </tr>
  </table>
`

describe('edmHtmlEditables', () => {
  it('discovers editor-safe text, link, and image editables from imported HTML', () => {
    const annotated = annotateHtmlEditables(sampleHtml, { editable: true })

    expect(annotated).toContain('data-edm-html-editable-kind="text"')
    expect(annotated).toContain('data-edm-html-editable-kind="link"')
    expect(annotated).toContain('data-edm-html-editable-kind="image"')
    expect(annotated).toContain('contenteditable="true"')
    expect(annotated).toContain('edm-html-editable')
  })

  it('returns selected editable details from a stable discovered id', () => {
    const annotated = annotateHtmlEditables(sampleHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const link = doc.querySelector('[data-edm-html-editable-kind="link"]') as HTMLElement

    const selection = getHtmlEditableSelection(sampleHtml, link.dataset.edmHtmlEditableId || '')

    expect(selection).toMatchObject({
      kind: 'link',
      text: 'Claim offer',
      href: 'https://example.com/offer'
    })
  })

  it('updates text editables with sanitized inline HTML', () => {
    const annotated = annotateHtmlEditables(sampleHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const text = doc.querySelector('[data-edm-html-editable-kind="text"]') as HTMLElement

    const updated = updateHtmlEditable(sampleHtml, text.dataset.edmHtmlEditableId || '', {
      kind: 'text',
      html: 'Drive <b>faster</b><script>alert(1)</script>'
    })

    expect(updated).toContain('Drive <b>faster</b>')
    expect(updated).not.toContain('<script>')
    expect(updated).not.toContain('data-edm-html-editable')
  })

  it('updates image and link editables while rejecting unsafe URLs', () => {
    const annotated = annotateHtmlEditables(sampleHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const image = doc.querySelector('[data-edm-html-editable-kind="image"]') as HTMLElement
    const link = doc.querySelector('[data-edm-html-editable-kind="link"]') as HTMLElement

    const imageUpdated = updateHtmlEditable(sampleHtml, image.dataset.edmHtmlEditableId || '', {
      kind: 'image',
      src: 'javascript:alert(1)',
      alt: 'Updated car',
      linkHref: '/offers'
    })
    expect(imageUpdated).not.toContain('javascript:alert')
    expect(imageUpdated).toContain('alt="Updated car"')
    expect(imageUpdated).toContain('href="/offers"')

    const linkUpdated = updateHtmlEditable(sampleHtml, link.dataset.edmHtmlEditableId || '', {
      kind: 'link',
      text: 'Reserve now',
      href: 'javascript:alert(1)'
    })
    expect(linkUpdated).toContain('Reserve now')
    expect(linkUpdated).not.toContain('javascript:alert')
  })
})
