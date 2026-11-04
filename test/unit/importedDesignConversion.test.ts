import { describe, expect, it } from 'vitest'
import { convertImportedEmailDocument, ImportedConversionError } from '../../server/utils/email-marketing/importedDesignConversion'
import { sanitizeImportedEmailDocument } from '../../server/utils/email-marketing/importedEmailDocument'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'
import type { EdmFlyhubDocument } from '../../app/types/edm'

const IMG = 'https://cdn.example.com/hero-desktop.png'
const IMG_M = 'https://cdn.example.com/hero-mobile.png'
const BG = 'https://cdn.example.com/sand.jpg'

function imported(body: string, head = '', width = 600): EdmFlyhubDocument {
  const { html } = sanitizeImportedEmailDocument(`<!doctype html><html><head><style>${head}</style></head><body style="margin:0;background-color:#eeeeee">${body}</body></html>`)
  return { root: { type: 'EmailLayout', data: { props: { contentWidth: width }, childrenIds: ['imported'] } }, imported: { type: 'Html', data: { props: { contents: html, documentMode: 'email' } } } }
}
const band = (rows: string, attrs = '') => `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ${attrs}><tbody>${rows}</tbody></table>`
const blocksOf = (document: EdmFlyhubDocument) => document.root.data.childrenIds!.map(id => ({ id, ...document[id] }))

describe('explicit imported-email conversion', () => {
  it('refuses anything that is not one complete imported email and never mutates the source', () => {
    expect(() => convertImportedEmailDocument({ root: { type: 'EmailLayout', data: { childrenIds: [] } } })).toThrow(ImportedConversionError)
    const fragment = { root: { type: 'EmailLayout', data: { childrenIds: ['a'] } }, a: { type: 'Html', data: { props: { contents: '<p>x</p>' } } } }
    expect(() => convertImportedEmailDocument(fragment)).toThrow(ImportedConversionError)
    const source = imported(band(`<tr><td><img src="${IMG}" width="600" alt="Hero"></td></tr>`))
    const before = JSON.stringify(source)
    const first = convertImportedEmailDocument(source)
    expect(JSON.stringify(source)).toBe(before)
    expect(JSON.stringify(convertImportedEmailDocument(source))).toBe(JSON.stringify(first))
  })

  it('maps full-width images, plain text and spacers natively with source padding and fills', () => {
    const { document, report } = convertImportedEmailDocument(imported(band(`
      <tr><td><a href="https://example.com/offer"><img src="${IMG}" width="600" alt="Hero"></a></td></tr>
      <tr><td height="24" style="height:24px;line-height:24px;font-size:0">&nbsp;</td></tr>
      <tr><td style="padding:10px 20px;color:#ffffff;font-size:18px;font-family:Arial,sans-serif">Book your service today</td></tr>
    `, 'bgcolor="#066FEF"')))
    const [image, spacer, text] = blocksOf(document)
    expect(image).toMatchObject({ type: 'Image', data: { props: { url: IMG, alt: 'Hero', linkHref: 'https://example.com/offer' }, style: { backgroundColor: '#066fef' } } })
    expect(spacer).toMatchObject({ type: 'Spacer', data: { props: { height: 24 } } })
    expect(text).toMatchObject({ type: 'Text', data: { props: { text: 'Book your service today' }, style: { color: '#ffffff', fontSize: 18, backgroundColor: '#066fef', padding: { top: 10, right: 20, bottom: 10, left: 20 } } } })
    expect(report).toMatchObject({ native: 3, protected: 0, responsivePairs: 0 })
    // The copy is admissible to the canonical FigFlow conversion with editable fields.
    const design = composerToDesignDraft(document, null)
    expect(design.policy.editableFields).toEqual(expect.arrayContaining([`${image.id}.data.props.url`, `${text.id}.data.props.text`]))
  })

  it('pairs desktop/mobile alternatives instead of duplicating them, and merges style-only differences', () => {
    const head = '.mob{display:none}@media screen and (max-width:599px){.desk{display:none !important}.mob{display:block !important}.pad{padding:0 8px !important}}'
    const { document, report } = convertImportedEmailDocument(imported(band(`
      <tr><td class="desk"><img src="${IMG}" width="600" alt="Desktop hero"></td></tr>
      <tr><td class="mob"><img src="${IMG_M}" width="600" alt="Mobile hero"></td></tr>
      <tr><td class="pad" style="padding:0 30px">Same copy on both</td></tr>
    `), head))
    const blocks = blocksOf(document)
    // Image alternates become ONE layer with a mobile source (no stacked copies in FigFlow).
    const images = blocks.filter(block => block.type === 'Image')
    expect(images).toHaveLength(1)
    expect(images[0].data).toMatchObject({ props: { url: IMG, alt: 'Desktop hero' }, mobile: { props: { url: IMG_M, alt: 'Mobile hero' } } })
    expect(images[0].data.hideOnMobile ?? false).toBe(false)
    const copy = blocks.find(block => block.type === 'Text')!
    expect(copy.data.hideOnMobile ?? false).toBe(false)
    expect(copy.data.mobile).toEqual({ style: { padding: { top: 0, right: 8, bottom: 0, left: 8 } } })
    expect(report.sections.filter(section => section.label.includes('Same copy'))).toHaveLength(1)
    const html = renderFlyhubDocumentToHtml(document)
    expect(html.split('hero-desktop.png').length - 1).toBe(1)
    expect(html.split('hero-mobile.png').length - 1).toBe(1)
    // Desktop image is the default; the mobile image is hidden until the breakpoint.
    expect(html).toMatch(/<img class="edm-img-mobile"[^>]*display: none; max-height: 0; overflow: hidden;[^>]*mso-hide: all;/)
    const media = html.slice(html.indexOf('@media only screen and (max-width: 620px)'))
    expect(media).toContain('.edm-img-desktop { display: none !important;')
    expect(media).toContain('.edm-img-mobile { display: block !important;')
  })

  it('defines dark-mode precedence over a mobile image source and only sets root-level device flags', () => {
    const source = { root: { type: 'EmailLayout', data: { props: { darkMode: true }, childrenIds: ['hero'] } }, hero: { type: 'Image', data: { props: { url: IMG, alt: 'Hero', darkSrc: 'https://cdn.example.com/dark.png' }, mobile: { props: { url: IMG_M } } } } }
    const html = renderFlyhubDocumentToHtml(source)
    expect(html).toContain('edm-dark-image')
    expect(html).not.toContain('hero-mobile.png')
    expect(html).not.toContain('class="edm-img-mobile"')
    const head = '.mob{display:none}@media screen and (max-width:599px){.desk{display:none !important}.mob{display:block !important}}'
    const { document } = convertImportedEmailDocument(imported(band(`<tr><td class="desk"><table width="100%"><tr><td>Desktop note</td></tr><tr><td><a href="https://example.com" style="background-color:#000;padding:4px">Go</a></td></tr></table></td></tr><tr><td class="mob">Mobile note</td></tr>`), head))
    const flagged = Object.entries(document).filter(([, block]) => block.data.hideOnDesktop || block.data.hideOnMobile).map(([id]) => id)
    expect(flagged.length).toBeGreaterThan(0)
    // Nested Container/Columns children ignore device flags in the renderer, so the converter never nests them.
    expect(flagged.every(id => document.root.data.childrenIds!.includes(id))).toBe(true)
  })

  it('keeps unsupported layouts as protected Html under the fragment policy and reports why', () => {
    const { document, report } = convertImportedEmailDocument(imported(band(`
      <tr><td><table width="100%"><tr><td width="50%">Left column</td><td width="50%"><a href="https://example.com" style="background-color:#c30e29;color:#fff;padding:10px 20px;border-radius:24px">Book now</a></td></tr></table></td></tr>
    `)))
    const [block] = blocksOf(document)
    expect(block.type).toBe('Html')
    const contents = String(block.data.props?.contents)
    expect(contents).toContain('Left column')
    expect(contents).toContain('href="https://example.com"')
    expect(contents).not.toMatch(/class=|<style|url\(/i)
    expect(report.sections[0]).toMatchObject({ kind: 'Html', reason: 'Side-by-side columns' })
    expect(report.protected).toBe(1)
  })

  it('carries a section background image as structured block style instead of dropping it', () => {
    const { document, report } = convertImportedEmailDocument(imported(band(`
      <tr><td background="${BG}" style="background-color:#000000;background-image:url('${BG}');padding:0"><table width="100%"><tr><td>Hi there</td></tr><tr><td><a href="https://example.com" style="background-color:#c30e29;padding:8px">Book</a></td></tr></table></td></tr>
    `)))
    const [block] = blocksOf(document)
    expect(block.data.style?.backgroundImage).toBe(BG)
    expect(String(block.data.props?.contents ?? block.data.props?.text)).not.toContain('url(')
    expect(report.limitations.join(' ')).toMatch(/cover\/centre/)
    expect(report.limitations.join(' ')).not.toMatch(/cannot be shown/)
    expect(renderFlyhubDocumentToHtml(document)).toContain(`background-image: url(${BG})`)
  })

  it('applies text-transform to copy but never to merge tokens, and resolves class typography', () => {
    const head = '.headline{text-transform:uppercase;font-size:28px;color:#111111}'
    const { document } = convertImportedEmailDocument(imported(band(`<tr><td class="headline" style="font-family:Arial">hello {{first_name}} and *|FNAME|*</td></tr>`), head))
    const [text] = blocksOf(document)
    expect(text.data.props?.text).toBe('HELLO {{first_name}} AND *|FNAME|*')
    expect(text.data.style).toMatchObject({ fontSize: 28, color: '#111111' })
  })

  it('keeps named and rgb text colours in the compiled copy instead of renderer defaults', () => {
    const { document } = convertImportedEmailDocument(imported(band(`
      <tr><td style="background-color:#000000;color:white;font-family:Arial">Required terms and unsubscribe details</td></tr>
      <tr><td style="background-color:rgb(0, 0, 0);color:rgb(255, 204, 0);font-family:Arial">Rgb copy</td></tr>
    `)))
    const html = renderFlyhubDocumentToHtml(document)
    const cell = (text: string) => html.slice(html.lastIndexOf('<td', html.indexOf(text)), html.indexOf(text))
    expect(cell('Required terms')).toMatch(/color: #ffffff/)
    expect(cell('Required terms')).toMatch(/background-color: #000000/)
    expect(cell('Required terms')).not.toMatch(/#374151/)
    expect(cell('Rgb copy')).toMatch(/color: #ffcc00/)
  })

  it('never promotes copy whose colour or fill cannot be represented; it stays protected and visible', () => {
    const { document, report } = convertImportedEmailDocument(imported(band(`
      <tr><td style="color:rgba(255,255,255,0.6);font-family:Arial">Faded legal line</td></tr>
      <tr><td style="background-color:rgba(0,0,0,0.9);color:#ffffff;font-family:Arial">Translucent card</td></tr>
    `)))
    const blocks = blocksOf(document)
    expect(blocks.map(block => block.type)).toEqual(['Html', 'Html'])
    expect(String(blocks[0].data.props?.contents)).toContain('rgba(255,255,255,0.6)')
    expect(String(blocks[1].data.props?.contents)).toContain('rgba(0,0,0,0.9)')
    expect(report.native).toBe(0)
  })

  it('keeps a lifted background image section on its own fill, not an ancestor fill', () => {
    const { document } = convertImportedEmailDocument(imported(band(`
      <tr><td background="${BG}" style="background-color:#000000;background-image:url(${BG})"><table width="100%"><tr><td style="color:#ffffff">Required terms</td></tr><tr><td><a href="https://example.com" style="background-color:#ff0000;padding:8px">Go</a></td></tr></table></td></tr>
    `)))
    const [block] = blocksOf(document)
    expect(block.data.style).toMatchObject({ backgroundImage: BG, backgroundColor: '#000000' })
    const html = renderFlyhubDocumentToHtml(document)
    const cell = html.slice(html.lastIndexOf('<td', html.indexOf('background-image: url(')), html.indexOf('background-image: url('))
    expect(cell).toContain('background-color: #000000')
    expect(cell).not.toContain('#eeeeee')
  })

  it('does not fold away text decoration: underlined copy stays underlined', () => {
    const { document } = convertImportedEmailDocument(imported(band('<tr><td style="font-family:Arial"><span style="text-decoration:underline">Underlined offer condition</span></td></tr>')))
    const html = renderFlyhubDocumentToHtml(document)
    expect(html).toMatch(/text-decoration:underline">Underlined offer condition/)
  })

  it('omits client-hidden content, Outlook-only branches and non-content elements', () => {
    const { document, report } = convertImportedEmailDocument(imported(`<div style="display:none;max-height:0;overflow:hidden">Preheader text</div><!--[if mso]><table><tr><td>Outlook only</td></tr></table><![endif]-->${band('<tr><td>Visible</td></tr>')}`))
    const html = renderFlyhubDocumentToHtml(document)
    expect(html).toContain('Visible')
    expect(html).not.toContain('Preheader text')
    expect(html).not.toContain('Outlook only')
    expect(report.limitations.join(' ')).toMatch(/Outlook-only/)
  })
})
