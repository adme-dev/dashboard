// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  annotateHtmlEditables,
  deleteHtmlEditable,
  duplicateHtmlEditable,
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

const backgroundHtml = `
  <table>
    <tr>
      <td background="/email/postcards/glidex/images/hero-bg.jpg" style="background-image:url('/email/postcards/glidex/images/hero-bg.jpg');background-size:cover;">
        <div style="font-size:32px;color:#ffffff;">Drive smarter</div>
      </td>
    </tr>
  </table>
`

const repeatedOfferHtml = `
  <table>
    <tbody>
      <tr>
        <td><img src="/check-1.png" alt=""></td>
        <td><span>20% off your first upgrade</span></td>
      </tr>
      <tr>
        <td><img src="/check-2.png" alt=""></td>
        <td><span>Get 30% off on your setup</span></td>
      </tr>
    </tbody>
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

  it('discovers and updates background images without hiding nested text editables', () => {
    const annotated = annotateHtmlEditables(backgroundHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const background = doc.querySelector('[data-edm-html-editable-mode="background"]') as HTMLElement
    const text = doc.querySelector('[data-edm-html-editable-kind="text"]') as HTMLElement

    expect(background).toBeTruthy()
    expect(text).toBeTruthy()

    const selection = getHtmlEditableSelection(backgroundHtml, background.dataset.edmHtmlEditableId || '')
    expect(selection).toMatchObject({
      kind: 'image',
      imageMode: 'background',
      src: '/email/postcards/glidex/images/hero-bg.jpg'
    })

    const updated = updateHtmlEditable(backgroundHtml, background.dataset.edmHtmlEditableId || '', {
      kind: 'image',
      src: '/email/postcards/glidex/images/new-hero.jpg'
    })

    expect(updated).toContain('background="/email/postcards/glidex/images/new-hero.jpg"')
    expect(updated).toContain('/email/postcards/glidex/images/new-hero.jpg')
    expect(updated).not.toContain('/email/postcards/glidex/images/hero-bg.jpg')
    expect(updated).not.toContain('data-edm-html-editable')
  })

  it('duplicates the nearest repeated imported HTML item for a selected nested text region', () => {
    const annotated = annotateHtmlEditables(repeatedOfferHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const text = Array.from(doc.querySelectorAll('[data-edm-html-editable-kind="text"]'))
      .find(el => el.textContent?.includes('20% off')) as HTMLElement

    const duplicated = duplicateHtmlEditable(repeatedOfferHtml, text.dataset.edmHtmlEditableId || '')

    expect(duplicated.contents.match(/20% off your first upgrade/g)).toHaveLength(2)
    expect(duplicated.contents.match(/check-1\.png/g)).toHaveLength(2)
    expect(duplicated.contents).toContain('Get 30% off on your setup')
    expect(duplicated.contents).not.toContain('data-edm-html-editable')
    expect(duplicated.selection).toMatchObject({
      kind: 'text',
      text: '20% off your first upgrade'
    })
  })

  it('deletes the nearest repeated imported HTML item for a selected nested text region', () => {
    const annotated = annotateHtmlEditables(repeatedOfferHtml, { editable: true })
    const doc = document.createElement('div')
    doc.innerHTML = annotated
    const text = Array.from(doc.querySelectorAll('[data-edm-html-editable-kind="text"]'))
      .find(el => el.textContent?.includes('20% off')) as HTMLElement

    const deleted = deleteHtmlEditable(repeatedOfferHtml, text.dataset.edmHtmlEditableId || '')

    expect(deleted.contents).not.toContain('20% off your first upgrade')
    expect(deleted.contents).not.toContain('check-1.png')
    expect(deleted.contents).toContain('Get 30% off on your setup')
    expect(deleted.contents).toContain('check-2.png')
    expect(deleted.contents).not.toContain('data-edm-html-editable')
    expect(deleted.selection).toBeNull()
  })
})
