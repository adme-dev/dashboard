import { describe, expect, it, vi } from 'vitest'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { checkEmailSendability } from '~~/server/utils/email-marketing/sendability'
import {
  prepareSendableHtml,
  prepareSendableHtmlWithMirroredAssets
} from '~~/server/utils/email-marketing/sendableHtml'

describe('prepareSendableHtml', () => {
  it('dedupes exact repeated style blocks to reduce imported template weight', () => {
    const html = [
      '<style>.pc-component{width:600px}</style>',
      '<table><tr><td>One</td></tr></table>',
      '<style>.pc-component{width:600px}</style>',
      '<table><tr><td>Two</td></tr></table>'
    ].join('')

    const prepared = prepareSendableHtml(html, 'https://app.example.com')

    expect(prepared.match(/<style>/g)).toHaveLength(1)
    expect(prepared).toContain('One')
    expect(prepared).toContain('Two')
  })

  it('turns relative media asset URLs into absolute app URLs', () => {
    const html = [
      '<img src="/email/postcards/glidex/car.png">',
      '<td background="/email/postcards/glidex/bg.jpg" style="background-image:url(\'/email/postcards/glidex/bg.jpg\')"></td>'
    ].join('')

    const prepared = prepareSendableHtml(html, 'https://app.example.com/base')

    expect(prepared).toContain('src="https://app.example.com/email/postcards/glidex/car.png"')
    expect(prepared).toContain('background="https://app.example.com/email/postcards/glidex/bg.jpg"')
    expect(prepared).toContain("url('https://app.example.com/email/postcards/glidex/bg.jpg')")
  })

  it('keeps the imported GlideX starter under the sendability clipping budget after send prep', () => {
    const document = buildStarterTemplateDocument('postcards-glidex')
    const html = renderTemplateDocument(document, {
      subjectLine: 'GlideX',
      previewText: 'Limited-time upgrade offer from GlideX'
    })
    const prepared = prepareSendableHtml(html, 'https://app.example.com')
    const report = checkEmailSendability({
      html: prepared,
      subject: 'GlideX',
      previewText: 'Limited-time upgrade offer from GlideX'
    })

    expect(Buffer.byteLength(prepared, 'utf8')).toBeLessThanOrEqual(102 * 1024)
    expect(report.warnings.map(warning => warning.code)).not.toContain('html_size')
    expect(report.warnings.map(warning => warning.code)).not.toContain('relative_media_url')
  })

  it('mirrors imported image URLs into email asset storage before sending', async () => {
    const html = [
      '<style>.pc-component{width:600px}</style>',
      '<style>.pc-component{width:600px}</style>',
      '<img src="/email/postcards/glidex/car hero.png">',
      '<td background="/email/postcards/glidex/bg.jpg" style="background-image:url(\'/email/postcards/glidex/bg.jpg\')"></td>'
    ].join('')
    const fetchAsset = vi.fn(async (url: string) => {
      const fileName = url.endsWith('bg.jpg') ? 'bg.jpg' : 'car hero.png'
      return {
        buffer: Buffer.from(fileName),
        mimeType: fileName.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
        fileName
      }
    })
    const uploadAsset = vi.fn(async ({ fileName }: { fileName: string }) => {
      return `https://email-assets.example.com/${encodeURIComponent(fileName)}`
    })

    const prepared = await prepareSendableHtmlWithMirroredAssets(html, {
      appUrl: 'http://localhost:3000',
      userId: 'user-1',
      fetchAsset,
      uploadAsset
    })

    expect(prepared.match(/<style>/g)).toHaveLength(1)
    expect(fetchAsset).toHaveBeenCalledTimes(2)
    expect(fetchAsset).toHaveBeenCalledWith('http://localhost:3000/email/postcards/glidex/car%20hero.png')
    expect(fetchAsset).toHaveBeenCalledWith('http://localhost:3000/email/postcards/glidex/bg.jpg')
    expect(uploadAsset).toHaveBeenCalledTimes(2)
    expect(prepared).toContain('src="https://email-assets.example.com/car%20hero.png"')
    expect(prepared).toContain('background="https://email-assets.example.com/bg.jpg"')
    expect(prepared).toContain("url('https://email-assets.example.com/bg.jpg')")
    expect(prepared).not.toContain('http://localhost:3000/email/postcards')
  })

  it('does not mirror inline or already-public R2 image URLs', async () => {
    const html = [
      '<img src="data:image/png;base64,abc">',
      '<img src="cid:hero-image">',
      '<img src="https://pub-123.r2.dev/banner-assets/hero.png">'
    ].join('')
    const fetchAsset = vi.fn()
    const uploadAsset = vi.fn()

    const prepared = await prepareSendableHtmlWithMirroredAssets(html, {
      appUrl: 'https://app.example.com',
      userId: 'user-1',
      fetchAsset,
      uploadAsset
    })

    expect(prepared).toBe(html)
    expect(fetchAsset).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
  })
})
